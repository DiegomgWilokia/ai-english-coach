/* All of the student's data, on the device. Nothing is ever uploaded anywhere.
 *
 * ponytail: one JSON document in localStorage instead of IndexedDB. It is text
 * only (photo is a 144px dataURL), and history is pruned, so it stays far below
 * the ~5 MB cap. Move to IndexedDB if a user ever needs unlimited history.
 */
const KEY = 'aec.state';
const KEEP = { exercises: 60, conversations: 40, lessons: 40, vocab: 200, diplomas: 30, sessions: 400, review: 500, coach_chat: 60 };

const EMPTY = {
  user: null,
  weaknesses: [],
  exercises: [],
  conversations: [],
  lessons: [],
  vocab: [],            // [{word, meaning, example, times_failed, status, added_at}]
  diplomas: [],         // [{level, score, date, name}]
  study_logs: {},
  sessions: [],         // [{type, score, unit, kind, minutes, xp, created_at}] — one row per micro-lesson/review
  review: [],           // spaced-repetition cards (srs.js)
  path: {},             // path[unitId] = {learn: rounds, ..., check: true}
  xp: { total: 0, days: {} },
  quests: { day: '', list: [] },
  coach_chat: [],       // [{role: 'user'|'model', text}]
  settings: { reminder_hour: 19, reminders_on: false, lang: 'es', sound: true },
};

let state = null;

export function load() {
  if (state) return state;
  let raw = {};
  try { raw = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { /* fresh start */ }
  state = { ...structuredClone(EMPTY), ...raw };
  // settings is nested: merge so new keys (lang) appear for existing installs
  state.settings = { ...EMPTY.settings, ...(raw.settings || {}) };
  state.xp = { ...EMPTY.xp, ...(raw.xp || {}) };
  return state;
}

export function save() {
  const s = load();
  for (const [k, max] of Object.entries(KEEP)) {
    if (s[k].length > max) s[k] = s[k].slice(-max);
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch (err) {
    // Out of room: drop the oldest half of the history rather than losing the profile.
    console.warn('storage full, pruning history', err);
    for (const k of Object.keys(KEEP)) s[k] = s[k].slice(-Math.floor(KEEP[k] / 2));
    localStorage.setItem(KEY, JSON.stringify(s));
  }
  return s;
}

export function reset() {
  localStorage.removeItem(KEY);
  state = null;
  return load();
}

export const nextId = list => (list.length ? Math.max(...list.map(r => r.id || 0)) + 1 : 1);

export function exportJson() {
  return JSON.stringify(load(), null, 2);
}

export function importJson(text) {
  const data = JSON.parse(text);
  if (!data || typeof data !== 'object' || !('user' in data)) {
    throw new Error('backup');
  }
  localStorage.setItem(KEY, JSON.stringify(data));
  state = null;
  return load();
}

export const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

export function createUser({ name, last_name, age, goal, preferred_english, current_level, daily_hours_goal, photo, target_level, target_months, study_days }) {
  const s = load();
  s.user = {
    name,
    last_name: last_name || '',
    age: age || null,
    photo: photo || null,
    goal: goal || 'Conversación diaria',
    preferred_english: preferred_english || 'british',
    daily_hours_goal: daily_hours_goal || 1,
    current_level: current_level || 'A2',
    target_level: target_level || null,
    target_months: target_months || null,
    study_days: study_days || [],
    pending_exam: false,
    level_score: 0,
    streak_days: 0,
    last_login: null,
    days_without_login: 0,
    created_at: new Date().toISOString(),
    strengths: [],
    mastered_topics: [],
  };
  return save().user;
}
