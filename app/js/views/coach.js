/* "Profe": a free chat with the AI teacher. Explains grammar in Spanish, fixes
 * sentences, sets mini drills. The thread is kept on the device. */
import * as store from '../store.js';
import * as C from '../coach.js';
import * as G from '../gemini.js';
import * as P from '../path.js';
import { findUnit } from '../syllabus.js';
import { t } from '../i18n.js';
import { $, view, esc, md, routes, actions, toast, errorText } from '../dom.js';

let busy = false;

const SUGGEST = ['cs_1', 'cs_2', 'cs_3', 'cs_4', 'cs_5'];

function context() {
  const next = P.nextNode();
  const unit = next ? findUnit(next.unitId) : null;
  return { unit: unit ? `${unit.title.en} (${unit.grammar})` : '' };
}

routes['/coach'] = () => {
  const msgs = store.load().coach_chat;
  const prefill = sessionStorage.getItem('aec.coach.prefill') || '';
  sessionStorage.removeItem('aec.coach.prefill');
  view().innerHTML = `
    <div class="coach-page">
      <div class="coach-head">
        <div class="coach-avatar">🧑‍🏫</div>
        <div><h1>${t('nav_coach')}</h1><p class="dim">${t('coach_sub')}</p></div>
        ${msgs.length ? `<button class="btn btn-sm btn-ghost" data-act="coach-clear" style="margin-left:auto">${t('coach_clear')}</button>` : ''}
      </div>
      <div class="chat-stream coach-stream" id="stream">
        <div class="bubble bubble-ai">${md(t('coach_hello', { name: store.load().user.name }))}</div>
        ${msgs.map(m => bubble(m)).join('')}
      </div>
      ${msgs.length ? '' : `<div class="chips suggest">${SUGGEST.map(k =>
        `<button class="chip" data-act="coach-suggest" data-text="${esc(t(k))}">${esc(t(k))}</button>`).join('')}</div>`}
      <div class="composer">
        <textarea id="coach-input" class="input" rows="1" placeholder="${t('coach_ph')}">${esc(prefill)}</textarea>
        <button class="btn btn-3d btn-primary" data-act="coach-send" aria-label="${t('coach_send')}">➤</button>
      </div>
    </div>`;
  const input = $('#coach-input');
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
  input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = `${Math.min(160, input.scrollHeight)}px`; });
  scrollDown();
  input.focus();
};

const bubble = m => `<div class="bubble ${m.role === 'user' ? 'bubble-me' : 'bubble-ai'}">${m.role === 'user' ? esc(m.text) : md(m.text)}</div>`;
const scrollDown = () => requestAnimationFrame(() => { window.scrollTo(0, document.body.scrollHeight); });

async function send(textArg) {
  if (busy) return;
  const input = $('#coach-input');
  const text = (textArg ?? input.value).trim();
  if (!text) return;
  input.value = '';
  $('.suggest')?.remove();
  const s = store.load();
  s.coach_chat.push({ role: 'user', text });
  store.save();
  const stream = $('#stream');
  stream.insertAdjacentHTML('beforeend', bubble({ role: 'user', text }) +
    '<div class="bubble bubble-ai typing" id="typing"><i></i><i></i><i></i></div>');
  scrollDown();
  busy = true;
  try {
    const reply = await G.coachReply(C.userForPrompt(), s.coach_chat, context());
    s.coach_chat.push({ role: 'model', text: reply });
    store.save();
    $('#typing')?.remove();
    stream.insertAdjacentHTML('beforeend', bubble({ role: 'model', text: reply }));
  } catch (err) {
    $('#typing')?.remove();
    s.coach_chat.pop();                    // unsent: give the text back so nothing is lost
    store.save();
    stream.lastElementChild?.remove();
    input.value = text;
    toast(errorText(err), 'bad');
  } finally {
    busy = false;
    scrollDown();
  }
}

Object.assign(actions, {
  'coach-send': () => send(),
  'coach-suggest': el => send(el.dataset.text),
  'coach-clear': () => {
    if (!confirm(t('coach_clear_confirm'))) return;
    store.load().coach_chat = [];
    store.save();
    routes['/coach']();
  },
});
