/* Validation of the exercises Gemini writes. Model output is untrusted input:
 * every item is checked here and anything malformed is dropped, so the lesson
 * screen never has to cope with a half-built exercise. Pure (node --test).
 */
import { normalize } from './check.js';

const str = v => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');
const strs = v => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);
const short = (v, n = 400) => str(v).slice(0, n);

export const ITEM_TYPES = ['teach', 'choice', 'cloze', 'order', 'translate', 'match', 'listen', 'dictation',
  'speak', 'speak_free', 'transform', 'wordform', 'flash'];

export function cleanItem(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const type = str(raw.type);
  const explain = short(raw.explain || raw.explanation, 300);
  const topic = short(raw.topic, 80);
  const accept = list => [...new Set([str(raw.answer), ...strs(raw.accept), ...list].filter(Boolean))];

  switch (type) {
    case 'teach': {
      const title = short(raw.title, 120), body = short(raw.body, 900);
      if (!title || !body) return null;
      const examples = (Array.isArray(raw.examples) ? raw.examples : [])
        .map(e => ({ en: short(e?.en, 200), es: short(e?.es, 200) })).filter(e => e.en).slice(0, 5);
      const words = (Array.isArray(raw.words) ? raw.words : [])
        .map(w => ({ en: short(w?.en, 60), es: short(w?.es, 80), example: short(w?.example, 200) }))
        .filter(w => w.en && w.es).slice(0, 10);
      return { type, title, body, examples, words };
    }
    case 'choice':
    case 'listen': {
      const options = [...new Set(strs(raw.options))].slice(0, 5);
      const answer = str(raw.answer);
      const hit = options.find(o => normalize(o) === normalize(answer));
      if (options.length < 2 || !hit) return null;
      const item = { type, prompt: short(raw.prompt || raw.question, 300), options, answer: hit, explain, topic };
      if (type === 'listen') {
        item.audio = short(raw.audio, 300);
        if (!item.audio) return null;
      } else if (!item.prompt) return null;
      return item;
    }
    case 'cloze':
    case 'wordform': {
      const prompt = short(raw.prompt, 300), answer = str(raw.answer);
      if (!prompt || !answer || !/_{2,}/.test(prompt)) return null;
      const item = { type, prompt, answer, accept: accept([]), explain, topic, hint: short(raw.hint, 60) };
      if (type === 'wordform') {
        item.base = short(raw.base, 40);
        if (!item.base) return null;
      }
      return item;
    }
    case 'order':
    case 'translate': {
      const es = short(raw.es || raw.prompt, 300), answer = str(raw.answer);
      if (!es || !answer || answer.split(/\s+/).length > 16) return null;
      return { type, es, answer, accept: accept([]), distractors: strs(raw.distractors).slice(0, 4), explain, topic };
    }
    case 'transform': {
      const prompt = short(raw.prompt, 300), keyword = str(raw.keyword).toUpperCase(), answer = str(raw.answer);
      if (!prompt || !keyword || !answer) return null;
      return { type, prompt, keyword, start: short(raw.start, 300), answer, accept: accept([]), explain, topic };
    }
    case 'match': {
      const seen = new Set();
      const pairs = (Array.isArray(raw.pairs) ? raw.pairs : [])
        .map(p => ({ en: short(p?.en, 60), es: short(p?.es, 60) }))
        .filter(p => p.en && p.es && !seen.has(p.en.toLowerCase()) && !seen.has('es:' + p.es.toLowerCase()) &&
          seen.add(p.en.toLowerCase()) && seen.add('es:' + p.es.toLowerCase()))
        .slice(0, 6);
      return pairs.length >= 3 ? { type, pairs, explain, topic } : null;
    }
    case 'dictation': {
      const audio = short(raw.audio || raw.answer, 200);
      if (!audio) return null;
      return { type, audio, answer: audio, explain, topic };
    }
    case 'speak': {
      const say = short(raw.say || raw.prompt, 200);
      return say ? { type, say, es: short(raw.es, 200), explain, topic } : null;
    }
    case 'speak_free': {
      const question = short(raw.question || raw.prompt, 300);
      return question ? { type, question, es: short(raw.es, 300), explain, topic, model: short(raw.model, 400) } : null;
    }
    case 'flash': {
      const en = short(raw.en, 60), es = short(raw.es, 80);
      return en && es ? { type, en, es, example: short(raw.example, 200) } : null;
    }
    default:
      return null;
  }
}

/* Keeps valid items, at most one teach card (first), and no duplicates. */
export function cleanItems(list) {
  const out = [];
  const seen = new Set();
  let teach = null;
  for (const raw of Array.isArray(list) ? list : []) {
    const it = cleanItem(raw);
    if (!it) continue;
    if (it.type === 'teach') { teach = teach || it; continue; }
    const key = `${it.type}:${normalize(it.prompt || it.es || it.audio || it.say || it.question || (it.pairs || []).map(p => p.en).join())}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return teach ? [teach, ...out] : out;
}

export const gradable = items => items.filter(i => i.type !== 'teach');
