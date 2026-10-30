/* The lesson engine: builds a session (generated items + due reviews), checks each
 * answer, re-queues misses so they are fixed before the end, and on finish turns
 * the result into XP, LP, streak, quests, spaced-repetition cards and path progress.
 */
import * as store from './store.js';
import * as C from './coach.js';
import * as G from './gemini.js';
import * as srs from './srs.js';
import * as gm from './gamify.js';
import * as P from './path.js';
import { cleanItems, gradable } from './items.js';
import { matchAnswer, OPEN_TYPES, shuffle } from './check.js';
import { findUnit, levelOfUnit, ROUNDS } from './syllabus.js';
import { QuotaExhausted } from './ladder.js';

export const KIND_WEIGHT = { learn: 0.3, words: 0.3, listen: 0.3, speak: 0.3, practice: 0.35, check: 0.8 };
export const PASS = { lesson: 50, check: 80 };

// ---------------------------------------------------------------------------
// Prefetch cache: the next lesson is generated in the background, so "Start" is instant
// ---------------------------------------------------------------------------
const CACHE_KEY = 'aec.lessoncache';
const cacheAll = () => { try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || {}; } catch { return {}; } };
function cachePut(key, data) {
  const all = cacheAll();
  all[key] = { data, at: Date.now() };
  const keys = Object.keys(all).sort((a, b) => all[b].at - all[a].at);
  for (const k of keys.slice(4)) delete all[k];
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(all)); } catch { /* full: skip cache */ }
}
function cacheTake(key) {
  const all = cacheAll();
  const hit = all[key];
  if (!hit) return null;
  delete all[key];
  localStorage.setItem(CACHE_KEY, JSON.stringify(all));
  return Date.now() - hit.at < 7 * 86400000 ? hit.data : null;
}
export const isCached = key => !!cacheAll()[key];

export const roundFor = (unitId, kind) => (kind === 'check' ? 1 : Math.min(ROUNDS, P.roundsOf(unitId, kind) + 1));
export const lessonKey = (unitId, kind) => `${unitId}:${kind}:${roundFor(unitId, kind)}`;

function recentSamples(unitId, kind) {
  return store.load().sessions.filter(r => r.unit === unitId && r.kind === kind)
    .slice(-2).flatMap(r => r.sample || []).slice(0, 8);
}

async function generate(unitId, kind) {
  const unit = findUnit(unitId);
  if (!unit) throw new Error('Unidad desconocida.');
  const level = levelOfUnit(unitId);
  const data = await G.generateMicroLesson(C.userForPrompt(), unit, kind, roundFor(unitId, kind), level, recentSamples(unitId, kind));
  const items = cleanItems(data.items);
  if (gradable(items).length < 5) throw new Error('La lección salió incompleta. Vuelve a intentarlo.');
  return { title: data.title, items };
}

let prefetching = null;
export function prefetchNext() {
  if (prefetching || !G.hasKey() || !store.load().user) return;
  if (!G.ladder.currentModel('text')) return;            // out of quota: don't burn a retry
  const node = P.nextNode();
  if (!node) return;
  const key = lessonKey(node.unitId, node.kind);
  if (isCached(key)) return;
  prefetching = generate(node.unitId, node.kind)
    .then(data => cachePut(key, data))
    .catch(err => console.warn('prefetch', err.message))
    .finally(() => { prefetching = null; });
}

// ---------------------------------------------------------------------------
// Building a session
// ---------------------------------------------------------------------------
function blank(mode, extra) {
  return {
    mode, items: [], queue: [], pos: 0, results: {}, requeued: new Set(),
    combo: 0, maxCombo: 0, xp: 0, started: Date.now(), noSpeak: false, ...extra,
  };
}

/* Reviews are mixed into new lessons (except checkpoints) so old mistakes keep coming back. */
function withReviews(items, max) {
  const due = srs.dueCards(store.load().review).filter(c => c.item.type !== 'flash').slice(0, max);
  if (!due.length) return items;
  const out = [...items];
  const start = out[0]?.type === 'teach' ? 2 : 1;
  for (const card of due) {
    const at = start + Math.floor(Math.random() * Math.max(1, out.length - start));
    out.splice(at, 0, { ...card.item, review: true, cardKey: card.key });
  }
  return out;
}

export async function startLesson(unitId, kind) {
  const key = lessonKey(unitId, kind);
  const data = cacheTake(key) || await generate(unitId, kind);
  const items = kind === 'check' ? data.items : withReviews(data.items, 2);
  const s = blank('lesson', {
    unitId, kind, round: roundFor(unitId, kind), level: levelOfUnit(unitId),
    title: data.title || findUnit(unitId)?.title?.es || '',
  });
  s.items = items;
  s.queue = items.map((_, i) => i);
  return s;
}

/* Flash cards (words) become multiple choice when there are enough meanings to mix. */
function flashToItem(card, meanings) {
  const it = card.item;
  const others = shuffle(meanings.filter(m => m !== it.es)).slice(0, 3);
  if (others.length >= 2) {
    return { type: 'choice', prompt: `What does “${it.en}” mean?`, options: shuffle([it.es, ...others]), answer: it.es,
      explain: it.example ? `Ejemplo: ${it.example}` : '', review: true, cardKey: card.key, topic: 'vocabulary' };
  }
  return { type: 'cloze', prompt: `${it.es} → ___`, answer: it.en, accept: [it.en], explain: it.example || '',
    review: true, cardKey: card.key, noAI: true, topic: 'vocabulary' };
}

export function startReview(max = 20) {
  const deck = store.load().review;
  let cards = srs.dueCards(deck).slice(0, max);
  const ahead = !cards.length;
  if (ahead) cards = [...deck].sort((a, b) => a.due.localeCompare(b.due)).slice(0, 10);
  if (!cards.length) return null;
  const meanings = [...new Set(deck.filter(c => c.item.type === 'flash').map(c => c.item.es))];
  const s = blank('review', { title: 'Repaso', ahead });
  s.items = cards.map(c => (c.item.type === 'flash' ? flashToItem(c, meanings) : { ...c.item, review: true, cardKey: c.key }));
  s.queue = s.items.map((_, i) => i);
  return s;
}

// ---------------------------------------------------------------------------
// Answer checking
// ---------------------------------------------------------------------------
const sentenceKind = item => (/\s/.test(String(item.answer || '').trim()) ? 'sentence' : 'word');

/* Returns {ok, typo, expected, explain, feedback?, better?, aiFailed?}. */
export async function checkAnswer(item, given) {
  const base = { expected: item.answer, explain: item.explain || '' };
  switch (item.type) {
    case 'choice':
    case 'listen':
      return { ...base, ok: given === item.answer, typo: false };
    case 'dictation': {
      const m = matchAnswer(given, [item.audio], 'sentence');
      return { ...base, expected: item.audio, ok: m.ok, typo: m.typo };
    }
    default: {
      const kind = ['order', 'translate', 'transform'].includes(item.type) ? 'sentence' : sentenceKind(item);
      const m = matchAnswer(given, item.accept?.length ? item.accept : [item.answer], kind);
      if (m.ok || !OPEN_TYPES.has(item.type) || item.noAI || !String(given).trim()) {
        return { ...base, ok: m.ok, typo: m.typo };
      }
      try {
        const ai = await G.checkOpenAnswer(C.userForPrompt(), item, given);
        return { ...base, ok: ai.correct, typo: false, feedback: ai.feedback, better: ai.better, ai: true };
      } catch (err) {
        console.warn('open check', err);
        return { ...base, ok: false, typo: false, aiFailed: true, quota: err instanceof QuotaExhausted };
      }
    }
  }
}

export async function checkSpoken(item, wavBase64) {
  return G.checkSpeech(C.userForPrompt(), item, wavBase64);
}

// ---------------------------------------------------------------------------
// Session progress
// ---------------------------------------------------------------------------
export const currentItem = s => s.items[s.queue[s.pos]];
export const isDone = s => s.pos >= s.queue.length;

export function progress(s) {
  const total = s.items.filter(i => i.type !== 'teach').length || 1;
  const fixed = Object.values(s.results).filter(r => r.solved).length;
  return Math.min(1, fixed / total);
}

/* Record the answer to the current item. Returns {combo, milestone}. */
export function record(s, result) {
  const idx = s.queue[s.pos];
  const item = s.items[idx];
  const r = s.results[idx] || { attempts: 0 };
  if (result.skipped) {
    s.results[idx] = { ...r, skipped: true, solved: true };
    return { combo: s.combo, milestone: false };
  }
  r.attempts += 1;
  if (r.attempts === 1) r.firstTry = !!result.ok;
  if (result.ok) {
    r.solved = true;
    s.combo += 1;
    s.maxCombo = Math.max(s.maxCombo, s.combo);
    s.xp += r.attempts === 1 ? gm.XP.item + (s.combo >= 5 ? gm.XP.combo : 0) : 4;
  } else {
    s.combo = 0;
    if (!s.requeued.has(idx) && item.type !== 'speak' && item.type !== 'speak_free') {
      s.requeued.add(idx);
      s.queue.push(idx);                // comes back at the end of the lesson
    } else {
      r.solved = true;                  // second miss: move on, it goes to the review deck
    }
  }
  s.results[idx] = r;
  return { combo: s.combo, milestone: result.ok && [5, 10, 15, 20].includes(s.combo) };
}

export function advance(s) {
  s.pos += 1;
  // "Can't speak now": drop the remaining speaking items of this session
  while (!isDone(s) && s.noSpeak && ['speak', 'speak_free'].includes(currentItem(s).type)) {
    s.results[s.queue[s.pos]] = { skipped: true, solved: true };
    s.pos += 1;
  }
}

/* Score = first-try accuracy over graded items (skipped and teach cards excluded). */
export function scoreOf(s) {
  const graded = s.items.map((it, i) => ({ it, r: s.results[i] }))
    .filter(({ it, r }) => it.type !== 'teach' && r && !r.skipped && r.firstTry !== undefined);
  if (!graded.length) return { score: 0, correct: 0, total: 0 };
  const correct = graded.filter(g => g.r.firstTry).length;
  return { score: Math.round((100 * correct) / graded.length), correct, total: graded.length };
}

// ---------------------------------------------------------------------------
// Finish: persist everything and return the summary for the end screen
// ---------------------------------------------------------------------------
export function finish(s) {
  const st = store.load();
  const { score, correct, total } = scoreOf(s);
  const minutes = Math.max(1, Math.round(Math.min(Date.now() - s.started, 45 * 60000) / 60000));
  const missed = s.items.filter((it, i) => s.results[i] && !s.results[i].skipped && s.results[i].firstTry === false);
  const summary = { mode: s.mode, score, correct, total, minutes, maxCombo: s.maxCombo, quests: [], xp: s.xp };

  // spaced repetition: review answers move cards, new misses become cards
  let deck = st.review;
  s.items.forEach((it, i) => {
    if (it.review && it.cardKey && s.results[i] && !s.results[i].skipped) deck = srs.review(deck, it.cardKey, !!s.results[i].firstTry);
  });
  deck = srs.addMissed(deck, missed.filter(it => !it.review).map(({ review, cardKey, ...it }) => it), { unit: s.unitId });
  const teach = s.items.find(it => it.type === 'teach');
  if (s.kind === 'words' && teach?.words?.length) deck = srs.addWords(deck, teach.words, { unit: s.unitId });
  st.review = deck;

  // weaknesses come from the topics of what was missed
  C.recordWeaknesses(missed.map(it => ({ topic: it.topic || findUnit(s.unitId)?.grammar || 'general', severity: 2, explanation: it.explain })));

  if (s.mode === 'lesson') {
    const pass = score >= (s.kind === 'check' ? PASS.check : PASS.lesson);
    summary.passed = pass;
    const p = st.path[s.unitId] || (st.path[s.unitId] = {});
    if (pass && s.kind === 'check') {
      p.check = true;
      for (const k of ['learn', 'words', 'listen', 'speak', 'practice']) p[k] = Math.max(p[k] || 0, 1);
    } else if (pass) {
      p[s.kind] = s.round === 1 && score >= 90 ? ROUNDS : Math.min(ROUNDS, (p[s.kind] || 0) + 1);
      summary.fastTrack = s.round === 1 && score >= 90;
    }
    // a student who started from zero "has" A1 once every A1 unit is done
    if (st.user.from_zero && P.levelComplete('A1')) st.user.from_zero = false;
    summary.levelChange = C.applyLevelChange(score, KIND_WEIGHT[s.kind] || 0.3);
    if (pass) summary.xp += gm.XP.lesson + (score === 100 && total >= 5 ? gm.XP.perfect : 0);
  } else {
    summary.xp = correct * gm.XP.review;
  }

  st.sessions.push({
    type: s.mode, unit: s.unitId || null, kind: s.kind || 'review', level: s.level || st.user.current_level,
    title: s.title, score, minutes, xp: summary.xp, created_at: new Date().toISOString(),
    sample: s.items.filter(i => i.type !== 'teach').slice(0, 4).map(i => String(i.prompt || i.es || i.audio || i.say || '').slice(0, 60)),
  });
  store.save();
  C.logStudy(minutes, 1);

  const before = gm.streak();
  summary.streak = gm.markActive();
  summary.streakBefore = before;
  const q = summary.quests;
  if (s.mode === 'lesson') q.push(...gm.track('lessons'));
  if (s.mode === 'lesson' && score >= 90) q.push(...gm.track('perfect'));
  if (s.mode === 'review') q.push(...gm.track('review', total));
  q.push(...gm.track('combo', s.maxCombo));
  const spoken = s.items.filter((it, i) => ['speak', 'speak_free'].includes(it.type) && s.results[i]?.firstTry !== undefined && !s.results[i]?.skipped).length;
  if (spoken) q.push(...gm.track('speak', spoken));
  const heard = s.items.filter((it, i) => ['listen', 'dictation'].includes(it.type) && s.results[i]?.firstTry).length;
  if (heard) q.push(...gm.track('listen', heard));
  summary.xp += q.length * gm.XP.quest;
  const earned = gm.earn(summary.xp);
  q.push(...earned.quests);
  summary.xp += earned.bonus;
  summary.goalReached = earned.goalReached;
  summary.xpToday = earned.today;
  return summary;
}
