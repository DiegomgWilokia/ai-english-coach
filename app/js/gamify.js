/* Motivation layer: XP, daily goal, streak, daily quests, rank divisions and an
 * honest forecast of how long the goal will take. */
import * as store from './store.js';
import { dayKey } from './srs.js';
import { seeded, shuffle } from './check.js';

// ---------------------------------------------------------------------------
// XP + daily goal
// ---------------------------------------------------------------------------
export const XP = { item: 10, combo: 2, lesson: 20, perfect: 15, quest: 30, review: 5, conversation: 60, writing: 60 };

/* ~15 XP per minute of focused practice, so the goal matches the time chosen. */
export const goalFor = hours => Math.max(150, Math.round(((hours || 1) * 60 * 15) / 50) * 50);

export function dailyGoal() {
  const u = store.load().user;
  return u?.daily_xp_goal || goalFor(u?.daily_hours_goal);
}

export function xpToday() {
  return store.load().xp.days[dayKey()] || 0;
}

export function addXP(n) {
  const s = store.load();
  const k = dayKey();
  const before = s.xp.days[k] || 0;
  s.xp.total += n;
  s.xp.days[k] = before + n;
  // keep ~90 days of daily totals
  const keys = Object.keys(s.xp.days).sort();
  for (const old of keys.slice(0, Math.max(0, keys.length - 90))) delete s.xp.days[old];
  store.save();
  const goal = dailyGoal();
  return { today: before + n, goalReached: before < goal && before + n >= goal };
}

/* Add XP and feed the daily XP quest; a quest completed here pays its bonus too. */
export function earn(n) {
  const first = addXP(n);
  const quests = track('xp', n);
  const bonus = quests.length * XP.quest;
  const res = bonus ? addXP(bonus) : first;
  return { today: res.today, goalReached: first.goalReached || res.goalReached, quests, bonus };
}

// ---------------------------------------------------------------------------
// Streak: counts days with at least one finished activity
// ---------------------------------------------------------------------------
const prevDay = key => {
  const [y, m, d] = key.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d - 1, 12));
};

export function streak() {
  const u = store.load().user;
  if (!u) return 0;
  const last = u.last_active_day;
  if (!last) return u.streak_days || 0;
  const today = dayKey();
  return last === today || last === prevDay(today) ? (u.streak_days || 0) : 0;
}

/* Returns {streak, extended} — extended=true the first activity of a new day. */
export function markActive() {
  const s = store.load();
  const u = s.user;
  const today = dayKey();
  if (u.last_active_day === today) return { streak: u.streak_days, extended: false };
  u.streak_days = u.last_active_day === prevDay(today) ? (u.streak_days || 0) + 1 : 1;
  u.last_active_day = today;
  u.best_streak = Math.max(u.best_streak || 0, u.streak_days);
  store.save();
  return { streak: u.streak_days, extended: true };
}

export function activeDays(n = 7) {
  const s = store.load();
  const out = [];
  let k = dayKey();
  for (let i = 0; i < n; i++) {
    out.unshift({ day: k, xp: s.xp.days[k] || 0 });
    k = prevDay(k);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Daily quests: three per day, the same three all day
// ---------------------------------------------------------------------------
const POOL = [
  { id: 'lessons', target: 3 },
  { id: 'perfect', target: 1 },
  { id: 'review', target: 15 },
  { id: 'speak', target: 5 },
  { id: 'combo', target: 8 },
  { id: 'talk', target: 1 },
  { id: 'write', target: 1 },
  { id: 'listen', target: 6 },
];

export function quests() {
  const s = store.load();
  const today = dayKey();
  if (s.quests.day !== today) {
    const rand = seeded(`${today}:${s.user?.name || ''}`);
    const picks = shuffle(POOL, rand).slice(0, 2);
    s.quests = {
      day: today,
      list: [{ id: 'xp', target: dailyGoal(), progress: 0, done: false },
        ...picks.map(q => ({ ...q, progress: 0, done: false }))],
    };
    store.save();
  }
  return s.quests.list;
}

/* Feed an event; returns the quests that just got completed (to celebrate). */
export function track(event, amount = 1) {
  const list = quests();
  const done = [];
  for (const q of list) {
    if (q.done || q.id !== event) continue;
    q.progress = event === 'combo' ? Math.max(q.progress, amount) : q.progress + amount;
    if (q.progress >= q.target) { q.progress = q.target; q.done = true; done.push(q); }
  }
  store.save();
  return done;
}

// ---------------------------------------------------------------------------
// Rank divisions: 0-100 LP inside each CEFR level, split in IV..I like a ladder
// ---------------------------------------------------------------------------
export const DIVISIONS = ['IV', 'III', 'II', 'I'];
export const divisionOf = lp => DIVISIONS[Math.min(3, Math.floor(Math.max(0, lp) / 25))];

// ---------------------------------------------------------------------------
// Forecast from Cambridge English guided learning hours (cumulative, from zero):
// A2 180-200, B1 350-400, B2 500-600, C1 700-800, C2 1000-1200.
// support.cambridgeenglish.org/hc/en-gb/articles/202838506-Guided-learning-hours
// ---------------------------------------------------------------------------
export const GLH = {
  low: { A1: 90, A2: 180, B1: 350, B2: 500, C1: 700, C2: 1000 },
  high: { A1: 100, A2: 200, B1: 400, B2: 600, C1: 800, C2: 1200 },
};
const ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

/* Hours still needed to go from (level, lp) to having `target`. Pure.
 * `level` is the level the student HAS; lp (0-100) is the way to the next one. */
export function hoursLeft(level, lp, target, table) {
  const i = ORDER.indexOf(level), j = ORDER.indexOf(target);
  if (i < 0 || j <= i) return 0;
  const next = table[ORDER[i + 1]];
  const done = table[level] + (next - table[level]) * (Math.max(0, Math.min(100, lp)) / 100);
  return Math.max(0, table[target] - done);
}

/* {low, high} in days, or null when the target is already reached. Pure. */
export function forecast(level, lp, target, minutesPerDay) {
  const lo = hoursLeft(level, lp, target, GLH.low);
  const hi = hoursLeft(level, lp, target, GLH.high);
  if (!hi) return null;
  const perDay = Math.max(10, minutesPerDay || 60) / 60;
  return { low: Math.ceil(lo / perDay), high: Math.ceil(hi / perDay), hoursLow: Math.round(lo), hoursHigh: Math.round(hi) };
}

/* Real minutes per day over the last 14 days; falls back to the declared goal
 * until there are at least 3 active days to measure. */
export function minutesPerDay() {
  const s = store.load();
  const since = Date.now() - 14 * 86400000;
  const rows = s.sessions.filter(r => new Date(r.created_at).getTime() >= since);
  const days = new Set(rows.map(r => dayKey(r.created_at)));
  const goal = Math.round((s.user?.daily_hours_goal || 1) * 60);
  if (days.size < 3) return { minutes: goal, measured: false };
  const total = rows.reduce((a, r) => a + (r.minutes || 0), 0);
  return { minutes: Math.max(5, Math.round(total / 14)), measured: true };
}
