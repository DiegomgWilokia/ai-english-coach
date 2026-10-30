/* Spaced repetition (Leitner boxes). A missed exercise comes back tomorrow, then
 * after 3, 7, 16 and 35 days; get it right in the last box and it retires.
 * Pure: takes and returns plain arrays, the caller persists them.
 */
export const BOX_DAYS = [1, 1, 3, 7, 16, 35];
export const MAX_CARDS = 500;

const DAY = 86400000;
export const dayKey = (d = new Date()) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};
const addDays = (key, n) => {
  const [y, m, d] = key.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d).getTime() + n * DAY + 3600000);   // +1h survives DST
};

/* The same exercise is identified by its type + main text, so a repeated miss
 * resets the existing card instead of duplicating it. */
export function cardKey(item) {
  const main = item.prompt || item.es || item.audio || item.say || item.en ||
    (item.pairs || []).map(p => p.en).join('|');
  return `${item.type}:${String(main).toLowerCase().slice(0, 160)}`;
}

export function addMissed(cards, items, meta = {}, today = dayKey()) {
  const out = [...cards];
  for (const item of items) {
    if (!item || ['teach', 'speak', 'speak_free'].includes(item.type)) continue;
    const key = cardKey(item);
    const old = out.find(c => c.key === key);
    if (old) {
      old.box = 1; old.due = addDays(today, BOX_DAYS[1]); old.lapses = (old.lapses || 0) + 1;
      continue;
    }
    out.push({ key, item, unit: meta.unit || null, box: 1, due: addDays(today, BOX_DAYS[1]), lapses: 0, added: today });
  }
  return out.length > MAX_CARDS ? out.slice(-MAX_CARDS) : out;
}

/* Vocabulary from a words lesson enters the deck as "flash" cards, due tomorrow. */
export function addWords(cards, words, meta = {}, today = dayKey()) {
  const items = (words || []).filter(w => w && w.en && w.es)
    .map(w => ({ type: 'flash', en: String(w.en), es: String(w.es), example: w.example ? String(w.example) : '' }));
  const out = [...cards];
  for (const item of items) {
    const key = cardKey(item);
    if (out.some(c => c.key === key)) continue;
    out.push({ key, item, unit: meta.unit || null, box: 1, due: addDays(today, 1), lapses: 0, added: today });
  }
  return out.length > MAX_CARDS ? out.slice(-MAX_CARDS) : out;
}

export const dueCards = (cards, today = dayKey()) =>
  cards.filter(c => c.due <= today).sort((a, b) => a.due.localeCompare(b.due) || b.lapses - a.lapses);

/* Returns the updated deck; a card answered right in the last box leaves it. */
export function review(cards, key, ok, today = dayKey()) {
  const out = [];
  for (const c of cards) {
    if (c.key !== key) { out.push(c); continue; }
    if (ok) {
      const box = c.box + 1;
      if (box >= BOX_DAYS.length) continue;           // learnt for good
      out.push({ ...c, box, due: addDays(today, BOX_DAYS[box]) });
    } else {
      out.push({ ...c, box: 1, due: addDays(today, 1), lapses: (c.lapses || 0) + 1 });
    }
  }
  return out;
}
