// Logic tests for the parts that decide right/wrong, scheduling and progress.
// Run: npm test   (node --test, no dependencies)
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Minimal browser globals the modules touch at import time
globalThis.localStorage = {
  _: {}, getItem(k) { return this._[k] ?? null; }, setItem(k, v) { this._[k] = String(v); },
  removeItem(k) { delete this._[k]; }, clear() { this._ = {}; },
};
globalThis.window = {};
// Node 24 already has a read-only navigator global

const check = await import('../app/js/check.js');
const srs = await import('../app/js/srs.js');
const items = await import('../app/js/items.js');
const gm = await import('../app/js/gamify.js');
const store = await import('../app/js/store.js');
const S = await import('../app/js/session.js');
const P = await import('../app/js/path.js');
const { SYLLABUS, NODES } = await import('../app/js/syllabus.js');
const { compareVersions } = await import('../app/js/update.js');

test('answers: case, punctuation and contractions do not matter', () => {
  assert.equal(check.matchAnswer('i have been there', ["I've been there."], 'sentence').ok, true);
  assert.equal(check.matchAnswer("She doesn't like it", ['She does not like it'], 'sentence').ok, true);
  assert.equal(check.matchAnswer('went', ['went']).ok, true);
  assert.equal(check.matchAnswer('  Went. ', ['went']).ok, true);
});

test('answers: a slip inside a long word is a typo; grammar endings and short words are not', () => {
  assert.equal(check.matchAnswer('want', ['went']).ok, false);            // different word
  const r = check.matchAnswer('beatiful', ['beautiful']);
  assert.equal(r.ok, true);
  assert.equal(r.typo, true);
  assert.equal(check.matchAnswer('studies', ['studied']).ok, false);      // tense, not spelling
  assert.equal(check.matchAnswer('happyness', ['happiness']).ok, true);
});

test('answers: sentences accept one spelling slip, never a grammar change', () => {
  assert.equal(check.matchAnswer('It was a beatiful day in London', ['It was a beautiful day in London'], 'sentence').ok, true);
  assert.equal(check.matchAnswer('I have live here for three years', ['I have lived here for three years'], 'sentence').ok, false);
  assert.equal(check.matchAnswer('I live here for three years', ['I have lived here for three years'], 'sentence').ok, false);
  assert.equal(check.matchAnswer('', ['anything']).ok, false);
});

test('tiles: every answer word is there, plus distractors', () => {
  const tiles = check.tilesFor('I went to the beach.', ['go', 'gone']);
  assert.deepEqual([...tiles].sort(), ['I', 'beach', 'go', 'gone', 'the', 'to', 'went'].sort());
});

test('seeded random is stable for the same seed', () => {
  const a = check.seeded('2026-10-30'), b = check.seeded('2026-10-30');
  assert.equal(a(), b());
});

test('srs: a miss comes back tomorrow, climbs boxes, and retires', () => {
  const item = { type: 'cloze', prompt: 'I ___ there.', answer: 'went' };
  let deck = srs.addMissed([], [item], {}, '2026-10-30');
  assert.equal(deck.length, 1);
  assert.equal(deck[0].due, '2026-10-31');
  assert.equal(srs.dueCards(deck, '2026-10-30').length, 0);
  assert.equal(srs.dueCards(deck, '2026-10-31').length, 1);
  const key = deck[0].key;
  deck = srs.review(deck, key, true, '2026-10-31');
  assert.equal(deck[0].box, 2);
  assert.equal(deck[0].due, '2026-11-03');
  deck = srs.review(deck, key, false, '2026-11-03');
  assert.equal(deck[0].box, 1);
  assert.equal(deck[0].lapses, 1);
  for (let i = 0; i < 5; i++) deck = srs.review(deck, key, true, '2026-12-01');
  assert.equal(deck.length, 0, 'retired after the last box');
  // the same exercise missed twice is one card
  deck = srs.addMissed(srs.addMissed([], [item]), [item]);
  assert.equal(deck.length, 1);
  // teach/speak never become cards
  assert.equal(srs.addMissed([], [{ type: 'speak', say: 'x' }]).length, 0);
});

test('items: malformed model output is dropped, valid kept', () => {
  const out = items.cleanItems([
    { type: 'teach', title: 'Regla', body: 'Texto', examples: [{ en: 'a', es: 'b' }] },
    { type: 'choice', prompt: 'I ___ there', options: ['go', 'went'], answer: 'went' },
    { type: 'choice', prompt: 'bad', options: ['a', 'b'], answer: 'c' },        // answer not an option
    { type: 'cloze', prompt: 'no gap here', answer: 'x' },                         // no ___
    { type: 'order', es: 'Fui a la playa', answer: 'I went to the beach' },
    { type: 'match', pairs: [{ en: 'a', es: 'x' }, { en: 'b', es: 'y' }] },       // < 3 pairs
    { type: 'listen', options: ['a', 'b'], answer: 'a' },                          // no audio
    { type: 'mystery' },
    null,
    { type: 'choice', prompt: 'I ___ there', options: ['go', 'went'], answer: 'went' }, // duplicate
  ]);
  assert.deepEqual(out.map(i => i.type), ['teach', 'choice', 'order']);
  assert.equal(out[1].answer, 'went');
});

test('forecast: Cambridge hours, A2 to B1 and B2 at 1 h/day', () => {
  const b1 = gm.forecast('A2', 0, 'B1', 60);
  assert.equal(b1.hoursLow, 170);    // 350 - 180
  assert.equal(b1.hoursHigh, 200);   // 400 - 200
  const b2 = gm.forecast('A2', 0, 'B2', 60);
  assert.equal(b2.low, 320);
  assert.equal(b2.high, 400);
  assert.equal(gm.forecast('B2', 0, 'B1', 60), null);
  // halfway through B1 (50 LP) to B2
  assert.equal(gm.hoursLeft('B1', 50, 'B2', gm.GLH.low), 75);
});

test('divisions split 0-100 LP in IV..I', () => {
  assert.equal(gm.divisionOf(0), 'IV');
  assert.equal(gm.divisionOf(49), 'III');
  assert.equal(gm.divisionOf(74), 'II');
  assert.equal(gm.divisionOf(100), 'I');
});

test('syllabus: every level has units with all the fields the prompts need', () => {
  for (const [lvl, units] of Object.entries(SYLLABUS)) {
    assert.ok(units.length >= 6, lvl);
    for (const u of units) {
      assert.ok(u.id && u.icon && u.title.es && u.title.en && u.can.es && u.grammar && u.vocab, u.id);
    }
  }
  assert.equal(new Set(Object.values(SYLLABUS).flat().map(u => u.id)).size, Object.values(SYLLABUS).flat().length);
});

function freshUser(level = 'A2') {
  localStorage.clear();
  store.reset();
  store.createUser({ name: 'Test', current_level: level, target_level: 'B2', daily_hours_goal: 1 });
}

test('path: focus is the next level; first stop open, the rest locked; checkpoint always open', () => {
  freshUser('A2');
  assert.equal(P.focusLevel(), 'B1');
  assert.deepEqual(P.nextNode(), { unitId: 'B1-1', kind: 'learn' });
  assert.equal(P.nodeStatus('B1-1', 'learn', 'focus'), 'open');
  assert.equal(P.nodeStatus('B1-1', 'words', 'focus'), 'locked');
  assert.equal(P.nodeStatus('B1-2', 'learn', 'focus'), 'locked');
  assert.equal(P.nodeStatus('B1-2', 'check', 'focus'), 'open');
  assert.equal(P.nodeStatus('A2-5', 'listen', 'consolidate'), 'locked');   // within a unit, still in order
  assert.equal(P.nodeStatus('A2-5', 'learn', 'consolidate'), 'open');
});

function fakeSession(kind, results) {
  const its = results.map((_, i) => ({ type: 'cloze', prompt: `Sentence ${i} ___`, answer: 'x', accept: ['x'], topic: 'past simple' }));
  const s = { mode: 'lesson', unitId: 'B1-1', kind, round: 1, level: 'B1', title: 't', items: its, queue: its.map((_, i) => i),
    pos: 0, results: {}, requeued: new Set(), combo: 0, maxCombo: 0, xp: 0, started: Date.now() - 6 * 60000, noSpeak: false };
  for (const ok of results) { S.record(s, { ok }); S.advance(s); }
  // answer the re-queued ones correctly
  while (!S.isDone(s)) { S.record(s, { ok: true }); S.advance(s); }
  return s;
}

test('session: misses are re-queued once and the score is first-try accuracy', () => {
  freshUser('A2');
  const s = fakeSession('learn', [true, false, true, true]);
  assert.equal(s.queue.length, 5);                       // one miss came back
  assert.deepEqual(S.scoreOf(s), { score: 75, correct: 3, total: 4 });
  assert.equal(S.progress(s), 1);
});

test('session finish: path round, review card, XP, streak and LP are all recorded', () => {
  freshUser('A2');
  const s = fakeSession('learn', [true, true, true, true, true, true, true, true, true, false]);
  const sum = S.finish(s);
  const st = store.load();
  assert.equal(sum.score, 90);
  assert.equal(sum.passed, true);
  assert.equal(st.path['B1-1'].learn, 2, '90% in round 1 = fast track to mastered');
  assert.equal(st.review.length, 1, 'the miss became a review card');
  assert.ok(st.xp.total > 0);
  assert.equal(st.user.streak_days, 1);
  assert.ok(st.user.level_score > 0, 'LP went up');
  assert.ok(st.user.level_score < 20, 'a short lesson moves LP only a little');
  assert.deepEqual(P.nextNode(), { unitId: 'B1-1', kind: 'words' });
});

test('session finish: a failed checkpoint does not complete the unit; a passed one does', () => {
  freshUser('A2');
  S.finish(fakeSession('check', [true, true, true, false, false, true, true, false, true, true]));   // 70%
  assert.equal(P.unitDone('B1-1'), false);
  S.finish(fakeSession('check', [true, true, true, true, true, true, true, true, false, true]));    // 90%
  assert.equal(P.unitDone('B1-1'), true);
  assert.equal(P.nodeStatus('B1-2', 'learn', 'focus'), 'open', 'next unit unlocked');
  assert.equal(NODES.length, 6);
});

test('quests: three a day, the XP quest pays a bonus once', () => {
  freshUser('A2');
  const qs = gm.quests();
  assert.equal(qs.length, 3);
  assert.equal(qs[0].id, 'xp');
  const first = gm.earn(gm.dailyGoal());
  assert.equal(first.quests.length, 1);
  assert.equal(first.bonus, gm.XP.quest);
  assert.equal(gm.earn(10).quests.length, 0);
});

test('checking is instant and local: right, wrong, alternatives, and free answers can be overridden', () => {
  const tr = { type: 'translate', es: 'He vivido en Londres dos años', answer: 'I have lived in London for two years', accept: ["I've lived in London for two years"] };
  assert.equal(S.checkAnswer(tr, "i've lived in london for two years").ok, true);
  const bad = S.checkAnswer(tr, 'I had live in London for two years');
  assert.equal(bad.ok, false);
  assert.equal(bad.open, true, 'free answer: the student may override');
  assert.equal(bad.expected, tr.answer);
  const ch = { type: 'choice', prompt: 'I ___ there', options: ['go', 'went'], answer: 'went', explain: 'Pasado.' };
  assert.equal(S.checkAnswer(ch, 'go').ok, false);
  assert.equal(S.checkAnswer(ch, 'go').open, false, 'multiple choice is plainly right or wrong');
  assert.equal(S.checkAnswer(ch, 'go') instanceof Promise, false, 'no async round trip');
});

test('versions compare numerically', () => {
  assert.equal(compareVersions('v2.10.0', '2.9.1'), 1);
  assert.equal(compareVersions('2.1.0', '2.1.0'), 0);
  assert.equal(compareVersions('2.0.9', 'v2.1.0'), -1);
});
