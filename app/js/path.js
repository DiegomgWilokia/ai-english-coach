/* Where the student is on the course map.
 * current_level is the level the student HAS. The path focuses on the NEXT level
 * ("road to B1"), and keeps the current level visible as optional consolidation.
 */
import * as store from './store.js';
import { SYLLABUS, NODES, ROUNDS, unitsOf, levelOfUnit } from './syllabus.js';
import { LEVELS } from './store.js';

const next = l => LEVELS[Math.min(LEVELS.indexOf(l) + 1, LEVELS.length - 1)];

export function focusLevel(user = store.load().user) {
  if (!user) return 'A1';
  if (user.from_zero && user.current_level === 'A1') return 'A1';
  return next(user.current_level);
}

/* [{level, role: 'focus'|'consolidate'}] in display order. */
export function levelsShown(user = store.load().user) {
  const focus = focusLevel(user);
  return focus === user.current_level
    ? [{ level: focus, role: 'focus' }]
    : [{ level: user.current_level, role: 'consolidate' }, { level: focus, role: 'focus' }];
}

export const unitProgress = unitId => store.load().path[unitId] || {};
export const unitDone = unitId => !!unitProgress(unitId).check;
export const roundsOf = (unitId, kind) => (kind === 'check' ? (unitDone(unitId) ? 1 : 0) : unitProgress(unitId)[kind] || 0);

/* Consolidation units are all open; on the focus level each unit opens when the
 * previous one is done (or the student tests out of it with the checkpoint). */
export function unitUnlocked(unitId, role) {
  if (role === 'consolidate') return true;
  const list = unitsOf(levelOfUnit(unitId));
  const i = list.findIndex(u => u.id === unitId);
  return i <= 0 || unitDone(list[i - 1].id) || unitDone(unitId);
}

/* 'done' | 'current' | 'open' | 'locked' for one stop of a unit. The checkpoint is
 * never locked: passing it is how you skip a unit you already know. */
export function nodeStatus(unitId, kind, role) {
  const p = unitProgress(unitId);
  if (kind === 'check') return p.check ? 'done' : 'open';
  if (!unitUnlocked(unitId, role)) return 'locked';
  const idx = NODES.findIndex(n => n.kind === kind);
  const prevDone = idx === 0 || (p[NODES[idx - 1].kind] || 0) >= 1 || p.check;
  if ((p[kind] || 0) >= 1) return 'done';
  return prevDone ? 'open' : 'locked';
}

/* The next lesson the student should do: first unfinished stop on the focus level,
 * then round 2 of anything not yet mastered. */
export function nextNode(user = store.load().user) {
  const focus = focusLevel(user);
  const units = unitsOf(focus);
  for (const unit of units) {
    if (!unitUnlocked(unit.id, 'focus')) break;
    if (unitDone(unit.id)) continue;
    for (const n of NODES) {
      if (n.kind === 'check') {
        if (NODES.slice(0, -1).every(x => roundsOf(unit.id, x.kind) >= 1)) return { unitId: unit.id, kind: 'check' };
        continue;
      }
      if (roundsOf(unit.id, n.kind) < 1) return { unitId: unit.id, kind: n.kind };
    }
  }
  for (const unit of units) {
    for (const n of NODES.slice(0, -1)) {
      if (roundsOf(unit.id, n.kind) < ROUNDS && nodeStatus(unit.id, n.kind, 'focus') !== 'locked') return { unitId: unit.id, kind: n.kind };
    }
  }
  return null;
}

export function levelComplete(level) {
  return unitsOf(level).every(u => unitDone(u.id));
}

/* Promotion exam: unlocked by reaching 100 LP or by finishing every unit of the focus level. */
export function examUnlocked(user = store.load().user) {
  if (!user || user.current_level === 'C2') return false;
  return !!user.pending_exam || (focusLevel(user) !== user.current_level && levelComplete(focusLevel(user)));
}

export function levelStats(level) {
  const units = unitsOf(level);
  const done = units.filter(u => unitDone(u.id)).length;
  return { done, total: units.length, pct: units.length ? Math.round((done / units.length) * 100) : 0 };
}

export { SYLLABUS, NODES, ROUNDS };
