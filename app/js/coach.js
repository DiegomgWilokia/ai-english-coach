/* The teaching logic: levels, memory of mistakes, sessions and lessons.
 * Port of level_service.py, memory_service.py, exercise_service.py,
 * lesson_service.py and recommendation_service.py.
 */
import * as store from './store.js';
import * as G from './gemini.js';
import { lang } from './i18n.js';
import { PHOTO_PAIRS, buildPhotoComparePrompt } from './prompts.js';

export const LEVELS = store.LEVELS;

/* CEFR level -> rank (LoL-style ladder the UI renders as shields) */
export const RANKS = { A1: 'bronze', A2: 'silver', B1: 'gold', B2: 'platinum', C1: 'obsidian', C2: 'diamond' };
export const rankOf = level => RANKS[level] || 'bronze';

// ---------------------------------------------------------------------------
// Level system (level_service.py)
// ---------------------------------------------------------------------------
export const levelIndex = level => (LEVELS.indexOf(level) === -1 ? 2 : LEVELS.indexOf(level));
export const nextLevel = level => LEVELS[Math.min(levelIndex(level) + 1, LEVELS.length - 1)];
export const prevLevel = level => LEVELS[Math.max(levelIndex(level) - 1, 0)];

export function scoreCaps(recentScores) {
  const clean = (recentScores || []).filter(s => s !== null && s !== undefined)
    .map(s => Math.max(0, Math.min(100, Number(s) || 0)));
  const avg = clean.length ? clean.reduce((a, b) => a + b, 0) / clean.length : 50;
  const gainCap = Math.round(10 + (avg / 100) * 20);
  return {
    recent_average: Math.round(avg * 10) / 10,
    recent_count: clean.length,
    gain_cap: gainCap,
    loss_cap: 40 - gainCap,
  };
}

export function updateLevelScore(currentLevel, currentScore, exerciseScore, recentScores) {
  const score = Math.max(0, Math.min(100, Number(exerciseScore) || 0));
  const caps = scoreCaps(recentScores && recentScores.length ? recentScores : [score]);
  const delta = score >= 50
    ? Math.round(((score - 50) / 50) * caps.gain_cap)
    : -Math.round(((50 - score) / 50) * caps.loss_cap);

  let newScore = currentScore + delta;
  let newLevel = currentLevel, up = false, down = false;

  if (newScore >= 100) {
    newLevel = nextLevel(currentLevel);
    up = newLevel !== currentLevel;
    newScore = up ? 25 : 100;
  } else if (newScore <= 0) {
    newLevel = prevLevel(currentLevel);
    down = newLevel !== currentLevel;
    newScore = down ? 70 : 0;
  }
  return { newLevel, newScore, up, down, meta: { ...caps, delta } };
}

export function difficultyFor(level, recentScore) {
  if (recentScore >= 85) return nextLevel(level);
  if (recentScore < 45) return prevLevel(level);
  return level;
}

// ---------------------------------------------------------------------------
// Memory: weaknesses, streak, study log (memory_service.py)
// ---------------------------------------------------------------------------
const ALIASES = [
  [['time marker', 'time markers', 'time expression', 'time expressions', 'signal word', 'signal words'], 'time markers'],
  [['present perfect vs past simple', 'past simple vs present perfect'], 'present perfect vs past simple'],
  [['present perfect'], 'present perfect'],
  [['present simple'], 'present simple'],
  [['past simple'], 'past simple'],
  [['phrasal verb', 'phrasal verbs'], 'phrasal verbs'],
  [['reported speech', 'indirect speech'], 'reported speech'],
  [['passive voice', 'passive'], 'passive voice'],
  [['modal verb', 'modal verbs', 'modals'], 'modal verbs'],
  [['relative clause', 'relative clauses'], 'relative clauses'],
  [['conditional', 'conditionals', 'if clause', 'if clauses'], 'conditionals'],
  [['article', 'articles', 'a an the'], 'articles'],
  [['preposition', 'prepositions'], 'prepositions'],
  [['word order'], 'word order'],
  [['subject verb agreement', 'subject agreement'], 'subject-verb agreement'],
  [['gerund', 'gerunds', 'infinitive', 'infinitives'], 'gerunds and infinitives'],
  [['comparative', 'comparatives', 'superlative', 'superlatives'], 'comparatives and superlatives'],
  [['quantifier', 'quantifiers'], 'quantifiers'],
  [['spelling'], 'spelling'],
  [['pronunciation'], 'pronunciation'],
  [['vocabulary'], 'vocabulary'],
];

/* Collapse small Gemini wording differences into one weakness category. */
export function canonicalTopic(topic) {
  let text = String(topic || 'general').trim().toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(errors?|mistakes?|weakness|weaknesses|grammar|english|use of)\b/g, ' ')
    .split(/\s+/).filter(Boolean).join(' ');
  if (!text) return 'general';
  for (const [needles, canonical] of ALIASES) {
    if (needles.some(n => text.includes(n))) return canonical;
  }
  return text.slice(0, 120);
}

const STATUS_RANK = { active: 3, improving: 2, mastered: 1 };

export function dedupedWeaknesses(limit) {
  const s = store.load();
  const grouped = new Map();
  for (const w of s.weaknesses) {
    if (w.improvement_status === 'mastered') continue;
    const topic = canonicalTopic(w.topic);
    const cur = grouped.get(topic) || { topic, severity: 0, times_failed: 0, status: w.improvement_status };
    cur.severity = Math.max(cur.severity, w.severity || 1);
    cur.times_failed += w.times_failed || 0;
    if ((STATUS_RANK[w.improvement_status] || 0) > (STATUS_RANK[cur.status] || 0)) cur.status = w.improvement_status;
    grouped.set(topic, cur);
  }
  const out = [...grouped.values()].sort((a, b) =>
    b.severity - a.severity || b.times_failed - a.times_failed || a.topic.localeCompare(b.topic));
  return limit ? out.slice(0, limit) : out;
}

/* The user object the prompts expect. */
export function userForPrompt() {
  const s = store.load();
  if (!s.user) return null;
  return {
    ...s.user,
    ui_lang: s.settings.lang || 'en',
    weaknesses: dedupedWeaknesses().map(w => w.topic),
    strengths: s.user.strengths || [],
  };
}

export function touchLogin() {
  const s = store.load();
  if (!s.user) return;
  const today = new Date();
  const last = s.user.last_login ? new Date(s.user.last_login) : null;
  if (last) {
    const days = Math.floor((dateOnly(today) - dateOnly(last)) / 86400000);
    if (days === 1) {
      s.user.streak_days += 1;
      s.user.days_without_login = 0;
    } else if (days > 1) {
      s.user.streak_days = 1;
      s.user.days_without_login = days;
    }
  } else {
    s.user.streak_days = 1;
    s.user.days_without_login = 0;
  }
  s.user.last_login = today.toISOString();
  store.save();
}

const dateOnly = d => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const todayKey = () => new Date().toISOString().slice(0, 10);

export function logStudy(minutes, completed) {
  const s = store.load();
  const log = s.study_logs[todayKey()] || { minutes: 0, exercises: 0 };
  log.minutes += minutes;
  log.exercises += completed;
  s.study_logs[todayKey()] = log;
  store.save();
}

export function recordWeaknesses(mistakes) {
  const s = store.load();
  for (const m of mistakes || []) {
    const topic = canonicalTopic(m.topic || 'general');
    const severity = Math.max(1, Math.min(5, parseInt(m.severity, 10) || 2));
    const match = s.weaknesses.find(w => canonicalTopic(w.topic) === topic);
    if (match) {
      match.topic = topic;
      match.times_failed = (match.times_failed || 0) + 1;
      match.severity = Math.min(5, Math.max(match.severity || 1, severity));
      match.last_failed_at = new Date().toISOString();
      match.improvement_status = 'active';
    } else {
      s.weaknesses.push({
        topic, severity, times_failed: 1,
        last_failed_at: new Date().toISOString(),
        improvement_status: 'active',
      });
    }
  }
  store.save();
}

export function markImprovements(improvedTopics, newStrengths) {
  const s = store.load();
  for (const t of improvedTopics || []) {
    const topic = canonicalTopic(t);
    for (const w of s.weaknesses.filter(w => canonicalTopic(w.topic) === topic)) {
      w.topic = topic;
      w.improvement_status = 'improving';
      if (w.severity > 1) w.severity -= 1;
    }
  }
  if (newStrengths && newStrengths.length) {
    const current = [...(s.user.strengths || [])];
    for (const str of newStrengths) if (str && !current.includes(str)) current.push(str);
    s.user.strengths = current.slice(0, 20);
  }
  store.save();
}

// ---------------------------------------------------------------------------
// Vocabulary notebook: words the grader flags as misused/unknown
// ---------------------------------------------------------------------------
export function recordVocab(entries) {
  const s = store.load();
  let changed = false;
  for (const e of entries || []) {
    const word = String(e.word || '').trim();
    if (!word || word.split(/\s+/).length > 3) continue;   // words/short phrases only
    const key = word.toLowerCase();
    const match = s.vocab.find(v => v.word.toLowerCase() === key);
    if (match) {
      match.times_failed += 1;
      match.status = 'learning';
      if (e.meaning) match.meaning = e.meaning;
      if (e.example) match.example = e.example;
    } else {
      s.vocab.push({
        word, meaning: e.meaning || '', example: e.example || '',
        times_failed: 1, status: 'learning', added_at: new Date().toISOString(),
      });
    }
    changed = true;
  }
  if (changed) store.save();
}

export function vocabList() {
  return [...store.load().vocab].sort((a, b) =>
    (a.status === 'mastered') - (b.status === 'mastered') || b.times_failed - a.times_failed);
}

export function markVocabResult(word, ok) {
  const s = store.load();
  const v = s.vocab.find(x => x.word.toLowerCase() === String(word).toLowerCase());
  if (!v) return;
  if (ok) v.status = v.status === 'learning' ? 'mastered' : v.status;
  else { v.times_failed += 1; v.status = 'learning'; }
  store.save();
}

/* Practice = a normal use_of_english exercise pinned to these exact words. */
export async function generateVocabPractice(words) {
  const list = words.slice(0, 8).map(w => w.word);
  const topic = `vocabulary practice using EXACTLY these words (one item per word, fill_blank sentences where the word is the answer): ${list.join(', ')}`;
  return generateExercise('use_of_english', topic, list.length);
}

/* Two generated photos to compare - a classic speaking/writing exam task. */
export async function generatePhotoExercise() {
  const [sceneA, sceneB] = PHOTO_PAIRS[Math.floor(Math.random() * PHOTO_PAIRS.length)];
  const [imgA, imgB] = await Promise.all([G.generateImage(sceneA), G.generateImage(sceneB)]);
  const user = userForPrompt();
  return {
    scene_a: sceneA, scene_b: sceneB, images: [imgA, imgB],
    prompt: buildPhotoComparePrompt(user, sceneA, sceneB),
  };
}

export function applyPlacement(level) {
  const s = store.load();
  s.user.current_level = LEVELS.includes(level) ? level : 'B1';
  s.user.level_score = 50;
  store.save();
  return s.user.current_level;
}

export function recentEvaluableScores(limit = 20) {
  const s = store.load();
  const rows = [
    ...s.exercises.filter(r => r.feedback != null).map(r => ({
      score: Number(r.score || 0), type: r.exercise_type, level: r.level,
      topic: r.topic, created_at: r.created_at, source: 'exercise',
    })),
    ...s.conversations.filter(r => r.finished && r.score != null).map(r => ({
      score: Number(r.score || 0),
      type: (r.role || '').startsWith('Live Audio - ') ? 'live_audio' : 'conversation',
      level: r.estimated_level,
      topic: (r.role || 'conversation').replace('Live Audio - ', ''),
      created_at: r.created_at, source: 'conversation',
    })),
  ];
  rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  return rows.slice(0, limit);
}

export function applyLevelChange(exerciseScore) {
  const s = store.load();
  const recent = recentEvaluableScores(20).map(r => r.score);
  const { newLevel, newScore, up, down, meta } = updateLevelScore(
    s.user.current_level, s.user.level_score, exerciseScore, recent.length ? recent : [exerciseScore]);
  if (up) {
    // Reaching 100 unlocks the certification exam; the promotion happens when you PASS it.
    s.user.level_score = 100;
    s.user.pending_exam = true;
    store.save();
    return { new_level: s.user.current_level, new_score: 100, leveled_up: false, leveled_down: false, exam_ready: true, ...meta };
  }
  s.user.current_level = newLevel;
  s.user.level_score = newScore;
  store.save();
  return { new_level: newLevel, new_score: newScore, leveled_up: false, leveled_down: down, ...meta };
}

export const CERT_PASS = 70;

/* Pass (score >= CERT_PASS): promote + diploma. Fail: back to 85, exam stays available. */
export function resolveCertExam(score) {
  const s = store.load();
  const level = s.user.current_level;
  if (score >= CERT_PASS) {
    const to = nextLevel(level);
    s.diplomas.push({ level, score: Math.round(score), date: new Date().toISOString(),
      name: `${s.user.name} ${s.user.last_name || ''}`.trim() });
    s.user.current_level = to;
    s.user.level_score = 25;
    s.user.pending_exam = false;
    store.save();
    return { passed: true, from: level, to };
  }
  s.user.level_score = 85;
  store.save();
  return { passed: false, from: level, to: level };
}

const TYPE_LABELS = {
  use_of_english: 'Use of English',
  reading: 'Reading',
  listening: 'Listening',
  writing: 'Writing',
  conversation: 'Conversation',
  live_audio: 'Live Audio',
};

export function performanceByType() {
  const grouped = Object.fromEntries(Object.keys(TYPE_LABELS).map(k => [k, []]));
  for (const row of recentEvaluableScores(200)) {
    if (grouped[row.type]) grouped[row.type].push(Number(row.score));
  }
  return Object.entries(grouped).map(([type, scores]) => scores.length ? {
    type, label: TYPE_LABELS[type], count: scores.length,
    average: Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10,
    best: Math.round(Math.max(...scores) * 10) / 10,
    last: Math.round(scores[0] * 10) / 10,
  } : { type, label: TYPE_LABELS[type], count: 0, average: null, best: null, last: null });
}

export function studyHistory(days = 14) {
  const s = store.load();
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const row = s.study_logs[key];
    out.push({ date: key, minutes: row ? row.minutes : 0, exercises: row ? row.exercises : 0 });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Conversation roles (recommendation_service.py)
// ---------------------------------------------------------------------------
export const GOAL_ROLES = {
  'Viajar al extranjero': [
    { role: 'Hotel receptionist', scenario: 'Check the student in for a 3-night stay.' },
    { role: 'Waiter at a restaurant', scenario: "Take the student's order at a busy café." },
    { role: 'Person giving directions', scenario: 'The student is lost and asks for directions to the museum.' },
    { role: 'Airport check-in agent', scenario: 'Help the student check in for an international flight.' },
    { role: 'Tour guide', scenario: 'Give the student a short tour of a famous landmark.' },
  ],
  'Erasmus o estudios internacionales': [
    { role: 'Flatmate', scenario: 'First day in a shared flat in London — small talk and house rules.' },
    { role: 'University professor', scenario: 'Office hours: discuss an upcoming essay.' },
    { role: 'International classmate', scenario: 'Meeting at the cafeteria, organising a study group.' },
    { role: 'Party host', scenario: 'Casual chat at a flat party with new friends.' },
    { role: 'University admin', scenario: 'Asking how to enroll in extra modules.' },
  ],
  'Trabajo y entrevistas laborales': [
    { role: 'Job interviewer', scenario: 'A 5-question structured job interview.' },
    { role: 'Manager', scenario: "1:1 meeting: discuss this week's priorities." },
    { role: 'Client', scenario: 'Demo call for a product the student is offering.' },
    { role: 'Team-mate', scenario: 'Stand-up meeting: blockers and plans.' },
    { role: 'Recruiter', scenario: 'Initial screening call.' },
  ],
  'Mejorar el currículum': [
    { role: 'Career coach', scenario: "Reviewing the student's CV and asking about achievements." },
    { role: 'LinkedIn recruiter', scenario: 'Cold message turned into a chat.' },
  ],
  'Inglés para programación o tecnología': [
    { role: 'Tech recruiter', scenario: 'Initial screening for a backend developer role.' },
    { role: 'Project manager', scenario: 'Sprint planning: estimate two tickets.' },
    { role: 'Non-technical client', scenario: 'Explain a bug fix in plain English.' },
    { role: 'Senior developer', scenario: 'Code review conversation on a pull request.' },
    { role: 'Tech support', scenario: 'The student is the customer reporting a bug.' },
  ],
  'Certificación oficial': [
    { role: 'Cambridge oral examiner', scenario: 'Part 2 of a B2 First exam: long turn from a picture.' },
    { role: 'IELTS interviewer', scenario: 'Speaking part 1: short questions about familiar topics.' },
    { role: 'TOEFL examiner', scenario: 'Independent speaking task on a familiar topic.' },
  ],
  'Conversación diaria': [
    { role: 'New neighbour', scenario: 'Casual chat at the lift.' },
    { role: 'Coffee-shop friend', scenario: 'Catching up after a long time.' },
    { role: 'Stranger on a train', scenario: 'Friendly small talk.' },
  ],
  'Hobby o crecimiento personal': [
    { role: 'Book club host', scenario: "Discussing the student's favourite book." },
    { role: 'Podcast guest', scenario: "A short interview about the student's hobby." },
  ],
  'Negocios y clientes internacionales': [
    { role: 'International client', scenario: 'Negotiating prices and delivery times.' },
    { role: 'Vendor', scenario: 'Closing a deal over email-style call.' },
  ],
};

export const GOALS = Object.keys(GOAL_ROLES);
export const listRoles = goal => GOAL_ROLES[goal] || GOAL_ROLES['Conversación diaria'];
export const pickRole = (goal, preferred) => {
  const pool = listRoles(goal);
  return (preferred && pool.find(r => r.role.toLowerCase() === preferred.toLowerCase()))
    || pool[Math.floor(Math.random() * pool.length)];
};

export function nextRecommendations(lastScore) {
  const es = lang() === 'es';
  const recs = [];
  if (lastScore < 50) recs.push(es ? 'Repite los ejercicios de Use of English en tu nivel actual.' : 'Repeat Use of English exercises at your current level.');
  else if (lastScore < 75) recs.push(es ? 'Prueba un ejercicio de Reading de tu nivel.' : 'Try a Reading exercise at your level.');
  else recs.push(es ? 'Lánzate a una conversación con un rol nuevo.' : 'Jump into a Speaking session with a new role.');
  const weak = dedupedWeaknesses(3).map(w => w.topic);
  if (weak.length) recs.push(`${es ? 'Refuerza' : 'Focus on'}: ${weak.join(', ')}.`);
  return recs;
}

// ---------------------------------------------------------------------------
// Sessions (exercise_service.py)
// ---------------------------------------------------------------------------
export async function generateExercise(exerciseType, topic, n = 10) {
  const s = store.load();
  const user = userForPrompt();
  const recent = recentEvaluableScores(20);
  const avg = recent.length ? recent.reduce((a, r) => a + r.score, 0) / recent.length : 70;
  const targetLevel = difficultyFor(s.user.current_level, avg);

  const recentTopics = [...s.exercises.filter(e => e.exercise_type === exerciseType).slice(-6).map(e => e.topic)].filter(Boolean);
  const payload = await G.generateExercises({ ...user, current_level: targetLevel }, exerciseType, topic, n, recentTopics);
  const session = {
    id: store.nextId(s.exercises),
    exercise_type: exerciseType,
    topic: payload.topic || topic,
    level: payload.level || targetLevel,
    total_questions: exerciseType === 'writing' ? 1 : (payload.items || []).length,
    correct_answers: 0,
    score: 0,
    mistakes: [],
    feedback: null,
    payload,
    created_at: new Date().toISOString(),
  };
  s.exercises.push(session);
  store.save();
  return session;
}

async function updateMemoryAfterSession(session, grade) {
  const user = userForPrompt();
  const mem = await G.analyzeMemoryUpdate(user, {
    exercise_type: session.exercise_type,
    score: session.score,
    level: session.level,
    mistakes: session.mistakes,
    estimated_level: grade.estimated_level,
  });
  recordWeaknesses([...(mem.new_weaknesses || []), ...(session.mistakes || [])]);
  markImprovements(mem.improved_weaknesses || [], mem.new_strengths || []);
  grade.level_change = applyLevelChange(session.score);
  grade.coach_note = mem.coach_note;
  grade.recommended_exercises = mem.recommended_exercises || [];
  return grade;
}

export async function gradeExercise(sessionId, answers) {
  const s = store.load();
  const session = s.exercises.find(e => e.id === sessionId);
  if (!session) throw new Error('No se encuentra ese ejercicio.');

  const grade = await G.gradeExercises(userForPrompt(), session.payload, answers);
  session.score = Number(grade.score || 0);
  session.correct_answers = parseInt(grade.correct_answers, 10) || 0;
  session.total_questions = parseInt(grade.total_questions, 10) || session.total_questions;
  session.mistakes = grade.mistakes || [];
  session.feedback = grade.feedback || '';
  session.payload = { ...session.payload, answers, grade };
  store.save();

  recordVocab(grade.vocab || []);
  await updateMemoryAfterSession(session, grade);
  logStudy(10, 1);
  return grade;
}

export async function gradeWriting(prompt, text, topic) {
  const s = store.load();
  const grade = await G.gradeWriting(userForPrompt(), prompt, text);
  const session = {
    id: store.nextId(s.exercises),
    exercise_type: 'writing',
    topic: topic || 'writing',
    level: s.user.current_level,
    total_questions: 1,
    correct_answers: Number(grade.score || 0) >= 60 ? 1 : 0,
    score: Number(grade.score || 0),
    mistakes: grade.mistakes || [],
    feedback: grade.feedback || '',
    payload: { prompt, text, grade },
    created_at: new Date().toISOString(),
  };
  s.exercises.push(session);
  store.save();

  recordVocab(grade.vocab || []);
  await updateMemoryAfterSession(session, grade);
  logStudy(15, 1);
  return grade;
}

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------
export function startConversation(role, scenario) {
  const s = store.load();
  const session = {
    id: store.nextId(s.conversations),
    role, scenario, messages: [], feedback: null, score: null,
    estimated_level: null, finished: 0, created_at: new Date().toISOString(),
  };
  s.conversations.push(session);
  store.save();
  return session;
}

/* The coach opens the roleplay - the student should not have to speak first. */
export async function conversationGreeting(sessionId) {
  const s = store.load();
  const session = s.conversations.find(c => c.id === sessionId);
  if (!session || session.messages.length) return null;
  const reply = await G.chatTurn(userForPrompt(), session.role, session.scenario, [],
    '(Start the roleplay now: greet me and set the scene in 1-2 sentences.)');
  session.messages.push({ role: 'assistant', content: reply });
  store.save();
  return reply;
}

export async function conversationTurn(sessionId, message) {
  const s = store.load();
  const session = s.conversations.find(c => c.id === sessionId);
  if (!session) throw new Error('No se encuentra esa conversación.');
  const reply = await G.chatTurn(userForPrompt(), session.role, session.scenario, session.messages, message);
  session.messages.push({ role: 'user', content: message }, { role: 'assistant', content: reply });
  store.save();
  return reply;
}

export async function endConversation(sessionId) {
  const s = store.load();
  const session = s.conversations.find(c => c.id === sessionId);
  if (!session) throw new Error('No se encuentra esa conversación.');
  if (!session.messages.length) {
    session.finished = 1;
    store.save();
    return null;
  }
  const evaluation = await G.evaluateConversation(userForPrompt(), session.messages, session.role);
  session.feedback = evaluation;
  session.score = Number(evaluation.score || 0);
  session.estimated_level = evaluation.estimated_level;
  session.finished = 1;
  store.save();

  recordWeaknesses(evaluation.mistakes || []);
  recordVocab(evaluation.vocab || []);
  evaluation.level_change = applyLevelChange(session.score);
  logStudy(10, 1);
  return evaluation;
}

/* Store a finished voice session so it is evaluated like a written one. */
export function saveLiveConversation(role, scenario, messages) {
  const s = store.load();
  const session = {
    id: store.nextId(s.conversations),
    role: `Live Audio - ${role}`,
    scenario,
    messages,
    feedback: null, score: null, estimated_level: null, finished: 0,
    created_at: new Date().toISOString(),
  };
  s.conversations.push(session);
  store.save();
  return session;
}

// ---------------------------------------------------------------------------
// Lessons (lesson_service.py)
// ---------------------------------------------------------------------------
export function suggestedTopics(limit = 6) {
  return dedupedWeaknesses(limit);
}

export function listLessons(limit = 30) {
  const seen = new Set();
  const out = [];
  for (const lesson of [...store.load().lessons].reverse()) {
    const topic = canonicalTopic(lesson.topic);
    if (seen.has(topic)) continue;
    seen.add(topic);
    out.push(lesson);
    if (out.length >= limit) break;
  }
  return out;
}

export async function generateLesson(topic) {
  const s = store.load();
  const user = userForPrompt();
  const topicKey = canonicalTopic(topic);
  const recentMistakes = s.exercises
    .flatMap(e => e.mistakes || [])
    .filter(m => canonicalTopic(m.topic) === topicKey)
    .slice(-5)
    .map(m => ({ topic: m.topic, explanation: m.explanation }));

  const content = await G.generateLesson(user, topic, recentMistakes);
  const lesson = {
    id: store.nextId(s.lessons),
    topic,
    level: s.user.current_level,
    title: content.title || `Lección: ${topic}`,
    content,
    based_on_mistakes: recentMistakes.map(m => m.topic),
    created_at: new Date().toISOString(),
  };
  s.lessons.push(lesson);
  store.save();
  return lesson;
}

/* Mini-exercise result feeds back into the weakness list. */
export function markLessonImprovement(lessonTopic, correct, total) {
  if (total <= 0) return { updated: [], score_percent: 0 };
  const s = store.load();
  const pct = Math.round((100 * correct) / total);
  const topic = canonicalTopic(lessonTopic);
  const matches = s.weaknesses.filter(w => canonicalTopic(w.topic) === topic);
  const updated = [];

  for (const w of matches) {
    const before = w.severity;
    if (pct >= 100) {
      w.improvement_status = 'mastered';
      w.severity = Math.max(0, w.severity - 2);
    } else if (pct >= 80) {
      w.improvement_status = 'improving';
      w.severity = Math.max(1, w.severity - 1);
    }
    if (pct >= 80) updated.push({ topic: w.topic, from_severity: before, to_severity: w.severity, status: w.improvement_status });
  }

  if (pct >= 100) {
    const mastered = [...(s.user.mastered_topics || [])];
    for (const w of matches.filter(w => w.severity <= 0)) {
      if (!mastered.includes(w.topic)) mastered.push(w.topic);
      s.weaknesses.splice(s.weaknesses.indexOf(w), 1);
    }
    s.user.mastered_topics = mastered.slice(0, 30);
  }
  store.save();
  logStudy(5, 1);
  return { updated, score_percent: pct, mastered: pct >= 100 };
}
