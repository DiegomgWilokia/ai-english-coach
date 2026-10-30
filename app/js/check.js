/* Local answer checking: instant feedback without a round trip to Gemini.
 * Pure functions (no DOM, no storage) so they run under `node --test`.
 */

// Contractions that expand one way only. "'d" and "'s" are ambiguous, so they are
// left alone: the accept lists from the generator cover them.
const CONTRACTIONS = [
  [/\bwon't\b/g, 'will not'], [/\bcan't\b/g, 'cannot'], [/\bshan't\b/g, 'shall not'],
  [/\b(\w+)n't\b/g, '$1 not'], [/\b(i)'m\b/g, '$1 am'], [/\b(\w+)'re\b/g, '$1 are'],
  [/\b(\w+)'ve\b/g, '$1 have'], [/\b(\w+)'ll\b/g, '$1 will'],
  [/\b(it|he|she|that|what|there|here|who|where)'s\b/g, '$1 is'],
  [/\bcan not\b/g, 'cannot'],
];

export function normalize(s) {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[‘’ʼ`´]/g, "'")
    .replace(/[“”"]/g, '')
    .replace(/[.,!?;:¡¿()\[\]…]/g, ' ')
    .replace(/\s+-\s+|\s+—\s+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function expand(s) {
  let out = normalize(s);
  for (const [re, rep] of CONTRACTIONS) out = out.replace(re, rep);
  return out.replace(/\s+/g, ' ').trim();
}

export function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/* A spelling slip, not a grammar mistake: one edit in a word of 6+ letters, and not
 * in its last two letters — that is where English grammar lives (studies/studied,
 * walk/walks), and short words like went/want mean different things. */
export function wordTypo(given, expected) {
  if (expected.length < 6 || levenshtein(given, expected) !== 1) return false;
  let p = 0;
  while (p < given.length && p < expected.length && given[p] === expected[p]) p++;
  return p < expected.length - 2;
}

/* A sentence passes as a typo when exactly one word differs and that word is a slip. */
export function sentenceTypo(given, expected) {
  const gw = given.split(' '), ew = expected.split(' ');
  if (gw.length !== ew.length) return false;
  const diff = ew.map((w, i) => [gw[i], w]).filter(([a, b]) => a !== b);
  return diff.length === 1 && wordTypo(diff[0][0], diff[0][1]);
}

/* Compare one answer against every accepted form.
 * Returns { ok, typo, matched } — typo=true means accepted with a spelling slip. */
export function matchAnswer(given, accepted, kind = 'word') {
  const list = [...new Set((Array.isArray(accepted) ? accepted : [accepted]).filter(x => x != null && String(x).trim()))];
  const g1 = normalize(given), g2 = expand(given);
  if (!g1) return { ok: false, typo: false, matched: list[0] ?? '' };
  for (const a of list) {
    if (g1 === normalize(a) || g2 === expand(a)) return { ok: true, typo: false, matched: a };
  }
  for (const a of list) {
    const e = expand(a);
    if (kind === 'sentence' ? sentenceTypo(g2, e) : (!/\s/.test(e) && wordTypo(g2, e))) return { ok: true, typo: true, matched: a };
  }
  return { ok: false, typo: false, matched: list[0] ?? '' };
}

/* Words for the tap-to-build exercise: the answer split into tiles plus distractors. */
export function tilesFor(answer, distractors = [], rand = Math.random) {
  const words = String(answer).replace(/[.!?]+$/, '').split(/\s+/).filter(Boolean);
  const extra = (distractors || []).map(String).filter(d => d && !words.includes(d)).slice(0, 4);
  return shuffle([...words, ...extra], rand);
}

export function shuffle(arr, rand = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* Small deterministic PRNG so a day's quests (or a tile order) are stable. */
export function seeded(seedStr) {
  let h = 2166136261;
  for (const c of String(seedStr)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Which item types need Gemini to judge an answer the local check rejected:
 * open production can be right in ways no accept list predicts. */
export const OPEN_TYPES = new Set(['translate', 'order', 'transform', 'cloze']);
