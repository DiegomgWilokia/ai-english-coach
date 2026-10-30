/* Practice hub: spaced review, conversation (voice/text), exam-style skills
 * (Use of English, reading, listening, writing, photos), vocabulary notebook and
 * on-demand lessons. Ported from the previous dashboard app. */
import * as store from '../store.js';
import * as C from '../coach.js';
import * as G from '../gemini.js';
import * as gm from '../gamify.js';
import * as srs from '../srs.js';
import { QuotaExhausted } from '../ladder.js';
import { LiveSession } from '../live.js';
import { t } from '../i18n.js';
import { $, view, esc, routes, actions, go, toast, withLoader, confetti, rankSVG, rankName, sevPill } from '../dom.js';
import { sfx } from '../audio.js';

/* XP + quest + streak for activities outside the path. */
function reward(xp, quest, amount = 1) {
  gm.markActive();
  if (quest) gm.track(quest, amount || 1);
  const res = gm.earn(Math.max(0, Math.round(xp)));
  sfx('done');
  if (res.goalReached) toast(t('end_goal'), 'good');
}

// ---------------------------------------------------------------------------
// Exercises (incl. Speaking)
// ---------------------------------------------------------------------------
const EX_TYPES = [
  { key: 'use_of_english', ico: '🧩', name: 'ex_uoe', desc: 'ex_uoe_d' },
  { key: 'reading', ico: '📖', name: 'ex_read', desc: 'ex_read_d' },
  { key: 'listening', ico: '🎧', name: 'ex_listen', desc: 'ex_listen_d' },
  { key: 'writing', ico: '✍️', name: 'ex_write', desc: 'ex_write_d' },
  { key: 'speaking', ico: '🎙️', name: 'ex_speak', desc: 'ex_speak_d' },
  { key: 'photos', ico: '📷', name: 'ex_photos', desc: 'ex_photos_d' },
];

let current = null; // { session, answers, isVocab }

routes['/practice'] = () => {
  const due = srs.dueCards(store.load().review).length;
  const deck = store.load().review.length;
  view().innerHTML = `
    <div class="page-head"><h1 class="gradient-title">${t('ex_title')}</h1><p class="dim">${t('ex_sub2')}</p></div>
    <button class="review-hero ${due ? 'hot' : ''}" data-act="open-review">
      <span class="rh-ico">↺</span>
      <span class="rh-txt"><b>${t('rv_title')}</b><small>${deck ? t('rv_due_long', { n: due, m: deck }) : t('rv_empty')}</small></span>
      <span class="rh-go">${due ? '▶' : ''}</span>
    </button>
    <h3 class="section-h">${t('px_skills')}</h3>
    <div class="tile-grid">
      <a class="tile t-talk" href="#/talk"><span class="tile-ico">🎙️</span><b>${t('ex_speak')}</b><small>${t('ex_speak_d')}</small></a>
      <a class="tile t-coach" href="#/coach"><span class="tile-ico">🧑‍🏫</span><b>${t('nav_coach')}</b><small>${t('coach_tag')}</small></a>
      ${EX_TYPES.filter(x => x.key !== 'speaking').map(x =>
        `<button class="tile" data-act="gen-ex" data-type="${x.key}"><span class="tile-ico">${x.ico}</span><b>${t(x.name)}</b><small>${t(x.desc)}</small></button>`).join('')}
    </div>
    <label class="f" style="margin-top:16px">${t('ex_topic')}
      <input id="ex-topic" class="input" placeholder="${t('ex_topic_ph')}"/></label>
    <h3 class="section-h">${t('px_study')}</h3>
    <div class="tile-grid">
      <a class="tile" href="#/vocab"><span class="tile-ico">📖</span><b>${t('nav_vocab')}</b><small>${t('vb_sub')}</small></a>
      <a class="tile" href="#/lessons"><span class="tile-ico">📚</span><b>${t('nav_lessons')}</b><small>${t('ls_sub').split(':')[0]}</small></a>
    </div>`;
};

routes['/talk'] = () => renderSpeakSetup();

async function generatePhotos() {
  const data = await withLoader(t('ph_generating'), () => C.generatePhotoExercise());
  if (!data) return;
  current = { photo: data };
  view().innerHTML = `
    <div class="page-head"><h1>📷 ${t('ph_title')}</h1></div>
    <div class="photo-grid">
      <figure><img src="${data.images[0]}" alt="A"/><figcaption>${t('ph_a')}</figcaption></figure>
      <figure><img src="${data.images[1]}" alt="B"/><figcaption>${t('ph_b')}</figcaption></figure>
    </div>
    <div class="card" style="margin-top:14px"><p class="dim">${esc(data.prompt)}</p></div>
    <textarea id="w-text" class="input" style="margin-top:14px" placeholder="${t('ex_write_ph')}"></textarea>
    <p class="muted" id="w-count">${t('ex_words', { n: 0 })}</p>
    <button class="btn btn-primary btn-lg btn-block" data-act="submit-photos">✅ ${t('ex_check')}</button>`;
  $('#w-text').addEventListener('input', e => {
    $('#w-count').textContent = t('ex_words', { n: e.target.value.trim().split(/\s+/).filter(Boolean).length });
  });
}

async function submitPhotos() {
  const text = $('#w-text').value.trim();
  if (text.split(/\s+/).filter(Boolean).length < 20) return toast(t('ex_write_more'), 'bad');
  const grade = await withLoader(t('ex_grading'), () => C.gradeWriting(current.photo.prompt, text, 'photo comparison'));
  if (grade) { reward(gm.XP.writing, 'write'); renderWritingGrade(grade); }
}

async function generateExercise(type, topicOverride, isVocab = false) {
  const topic = topicOverride ?? (($('#ex-topic')?.value || '').trim() || null);
  const n = type === 'writing' ? 1 : type === 'listening' ? 5 : 8;
  const session = await withLoader(t('ex_generating'), () =>
    isVocab ? C.generateVocabPractice(topicOverride) : C.generateExercise(type, topic, n));
  if (!session) return;
  current = { session, answers: {}, isVocab };
  renderExercise();
}

function renderExercise() {
  const { session } = current;
  const p = session.payload;

  if (session.exercise_type === 'writing') {
    view().innerHTML = `
      <div class="page-head"><h1>✍️ Writing</h1></div>
      <div class="card"><p>${esc(p.prompt)}</p><small class="muted">${p.min_words || 80}–${p.max_words || 180} words</small></div>
      <textarea id="w-text" class="input" style="margin-top:14px" placeholder="${t('ex_write_ph')}"></textarea>
      <p class="muted" id="w-count">${t('ex_words', { n: 0 })}</p>
      <button class="btn btn-primary btn-lg btn-block" data-act="submit-writing">✅ ${t('ex_check')}</button>`;
    $('#w-text').addEventListener('input', e => {
      $('#w-count').textContent = t('ex_words', { n: e.target.value.trim().split(/\s+/).filter(Boolean).length });
    });
    return;
  }

  const items = p.items || [];
  view().innerHTML = `
    <div class="page-head">
      <h1>${EX_TYPES.find(x => x.key === session.exercise_type)?.ico || '📖'} ${esc(p.topic || '')}</h1>
      <p class="dim">${t('ex_level', { l: esc(session.level) })} · ${t('ex_questions', { n: items.length })}</p>
    </div>
    ${session.exercise_type === 'listening' ? `
      <div class="card">
        <p class="dim">${esc(p.scenario || t('ex_listen_hint'))}</p>
        <button class="btn btn-ghost btn-block" style="margin-top:10px" data-act="play-audio">🔊 ${t('ex_play')}</button>
        <audio id="ex-audio" controls hidden style="width:100%;margin-top:10px"></audio>
        <details style="margin-top:12px"><summary>${t('ex_transcript')}</summary>
          <pre style="white-space:pre-wrap;font-family:inherit">${esc(p.dialogue || '')}</pre></details>
      </div>` : ''}
    ${p.passage ? `<div class="card" style="line-height:1.65">${esc(p.passage).replace(/\n/g, '<br/>')}</div>` : ''}
    <div class="stack" style="margin-top:16px">
      ${items.map(it => `
        <div class="card">
          <p><b>${it.id}.</b> ${esc(it.prompt)}</p>
          ${Array.isArray(it.options) && it.options.length ? `
            <div class="qa" style="margin-top:10px">${it.options.map(o =>
              `<button class="opt" data-act="pick" data-id="${it.id}" data-value="${esc(o)}">${esc(o)}</button>`).join('')}</div>` :
            `<input class="input" style="margin-top:10px" data-answer="${it.id}" placeholder="${t('ex_your_answer')}" autocapitalize="none"/>`}
        </div>`).join('')}
    </div>
    <button class="btn btn-primary btn-lg btn-block" style="margin-top:16px" data-act="submit-ex">✅ ${t('ex_check')}</button>`;
}

async function playListening() {
  const url = await withLoader(t('loading'), () =>
    G.synthesizeDialogue(current.session.payload.dialogue, store.load().user.preferred_english));
  if (!url) return;
  const audio = $('#ex-audio');
  audio.src = url; audio.hidden = false; audio.play();
}

async function submitExercise() {
  const { session } = current;
  const answers = (session.payload.items || []).map(it => ({
    id: it.id,
    answer: current.answers[it.id] ?? (document.querySelector(`[data-answer="${it.id}"]`)?.value || ''),
  }));
  if (answers.every(a => !String(a.answer).trim())) return toast(t('ex_answer_one'), 'bad');
  const grade = await withLoader(t('ex_grading'), () => C.gradeExercise(session.id, answers));
  if (!grade) return;
  if (current.isVocab) {
    for (const r of grade.per_item || []) C.markVocabResult(r.expected, !!r.correct);
  }
  reward((parseInt(grade.correct_answers, 10) || 0) * 10, session.exercise_type === 'listening' ? 'listen' : null, grade.correct_answers);
  renderGrade(grade, session);
}

async function submitWriting() {
  const text = $('#w-text').value.trim();
  if (text.split(/\s+/).filter(Boolean).length < 20) return toast(t('ex_write_more'), 'bad');
  const p = current.session.payload;
  const grade = await withLoader(t('ex_grading'), () => C.gradeWriting(p.prompt, text, p.topic));
  if (grade) { reward(gm.XP.writing, 'write'); renderWritingGrade(grade); }
}

function levelChangeCard(lc) {
  if (!lc) return '';
  if (lc.exam_ready) {
    const u = store.load().user;
    const next = C.nextLevel(u.current_level);
    return `<div class="card exam-banner"><div class="icon-row"><span style="font-size:24px">🎓</span><b style="flex:1">${t('exam_ready_title')}</b></div>
      <p class="dim" style="margin:8px 0 12px">${t('exam_ready_body2', { l: next })}</p>
      <button class="btn btn-primary btn-block" data-act="exam-start">🎓 ${t('exam_take')}</button></div>`;
  }
  const msg = lc.leveled_up ? `🎉 ${t('level_up', { r: `${rankName(lc.new_level)} (${lc.new_level})` })}`
    : lc.leveled_down ? `📉 ${t('level_down', { r: `${rankName(lc.new_level)} (${lc.new_level})` })}`
    : `${rankName(lc.new_level)} ${lc.new_level} · ${lc.new_score}/100 (${lc.delta >= 0 ? '+' : ''}${lc.delta})`;
  if (lc.leveled_up) confetti();
  return `<div class="card"><div class="icon-row">${rankSVG(lc.new_level, 40)}<b style="flex:1">${msg}</b></div>
    <div class="bar" style="margin-top:10px"><span style="width:${lc.new_score}%"></span></div></div>`;
}

const mistakesCard = mistakes => (mistakes || []).length ? `
  <div class="card"><div class="card-title"><h3>${t('ex_review')}</h3><button class="info-dot" data-act="sev-info">?</button></div>
  ${mistakes.map(m => `<p style="margin:8px 0"><b>${esc(m.topic)}</b> ${sevPill(m.severity)}
    <a class="pill pill-link" href="#/lessons?topic=${encodeURIComponent(m.topic)}">📚</a><br/>
    <span class="dim">${esc(m.explanation)}</span></p>`).join('')}</div>` : '';

function renderGrade(grade, session) {
  const per = grade.per_item || [];
  view().innerHTML = `
    <div class="page-head center"><h1 style="font-size:3rem">${Math.round(grade.score || 0)}<small class="muted" style="font-size:1.2rem">/100</small></h1>
      <p class="dim">${t('ex_correct_of', { a: grade.correct_answers ?? 0, b: grade.total_questions ?? per.length })}</p></div>
    ${levelChangeCard(grade.level_change)}
    ${grade.feedback ? `<div class="card" style="margin-top:14px"><p>${esc(grade.feedback)}</p></div>` : ''}
    ${grade.coach_note ? `<div class="card" style="margin-top:14px"><b>🧠 Coach:</b> ${esc(grade.coach_note)}</div>` : ''}
    <div class="stack" style="margin-top:14px">
      ${per.map(r => `<div class="card">
        <p>${r.correct ? '✅' : '❌'} <b>${esc(r.user_answer || '—')}</b></p>
        ${!r.correct ? `<p class="dim">${t('ex_expected')}: <b>${esc(r.expected)}</b></p>` : ''}
        ${r.explanation ? `<p class="muted">${esc(r.explanation)}</p>` : ''}
      </div>`).join('')}
    </div>
    <div style="margin-top:14px">${mistakesCard(grade.mistakes)}</div>
    <button class="btn btn-primary btn-lg btn-block" style="margin-top:16px" data-act="gen-ex" data-type="${session.exercise_type}">🔄 ${t('ex_again')}</button>
    <a class="btn btn-ghost btn-block" style="margin-top:10px" href="#/path">🏠 ${t('ex_home')}</a>`;
}

function renderWritingGrade(grade) {
  const crit = grade.criteria || {};
  view().innerHTML = `
    <div class="page-head center"><h1 style="font-size:3rem">${Math.round(grade.score || 0)}<small class="muted" style="font-size:1.2rem">/100</small></h1></div>
    ${levelChangeCard(grade.level_change)}
    ${grade.feedback ? `<div class="card" style="margin-top:14px"><p>${esc(grade.feedback)}</p></div>` : ''}
    <div class="card" style="margin-top:14px"><h3>${t('ex_criteria')}</h3><div class="hbars" style="margin-top:12px">
      ${Object.entries(crit).map(([k, v]) => `<div class="hbar-row"><span style="text-transform:capitalize">${esc(k)}</span>
        <div class="bar"><span style="width:${Math.max(0, Math.min(100, v))}%"></span></div><b>${v}</b></div>`).join('')}
    </div></div>
    ${grade.corrected_text ? `<div class="card" style="margin-top:14px"><h3>${t('ex_corrected')}</h3><p style="line-height:1.65;margin-top:8px">${esc(grade.corrected_text)}</p></div>` : ''}
    ${grade.improved_version ? `<div class="card" style="margin-top:14px"><h3>${t('ex_improved')} ✨</h3><p style="line-height:1.65;margin-top:8px">${esc(grade.improved_version)}</p></div>` : ''}
    <div style="margin-top:14px">${mistakesCard(grade.mistakes)}</div>
    <a class="btn btn-ghost btn-block" style="margin-top:16px" href="#/practice">📝 ${t('ex_again')}</a>`;
}

// ---------------------------------------------------------------------------
// Speaking (voice + text conversation)
// ---------------------------------------------------------------------------
let speakMode = 'voice';
let chat = null;
let live = null;

function renderSpeakSetup() {
  const roles = C.listRoles(store.load().user.goal);
  view().innerHTML = `
    <div class="page-head"><h1 class="gradient-title">🎙️ ${t('ex_speak')}</h1><p class="dim">${t('ex_pick_role')}</p></div>
    <div class="seg" style="margin-bottom:16px">
      <button class="${speakMode === 'voice' ? 'on' : ''}" data-act="speak-mode" data-v="voice">🎙️ ${t('ex_voice')}</button>
      <button class="${speakMode === 'text' ? 'on' : ''}" data-act="speak-mode" data-v="text">⌨️ ${t('ex_text')}</button>
    </div>
    <div class="stack">${roles.map(r =>
      `<button class="opt" data-act="${speakMode === 'voice' ? 'start-live' : 'start-chat'}" data-role="${esc(r.role)}" data-scenario="${esc(r.scenario)}">
        <b>${esc(r.role)}</b><br/><small class="muted">${esc(r.scenario)}</small></button>`).join('')}
    </div>`;
}

function startChat(role, scenario) {
  chat = C.startConversation(role, scenario);
  renderChat();
  coachOpens();
}

/* The coach speaks first, like a real person would. */
async function coachOpens() {
  showTyping();
  try { await C.conversationGreeting(chat.id); } catch (err) { console.warn(err); }
  renderChat();
}

function showTyping() {
  $('#typing')?.remove();
  $('#stream')?.insertAdjacentHTML('beforeend',
    '<div class="bubble bubble-ai typing" id="typing"><i></i><i></i><i></i></div>');
  window.scrollTo(0, document.body.scrollHeight);
}

function renderChat() {
  const session = store.load().conversations.find(c => c.id === chat.id);
  view().innerHTML = `
    <div class="page-head"><h1>${esc(session.role)}</h1><p class="dim">${esc(session.scenario)}</p></div>
    <div class="chat-stream" id="stream">
      ${session.messages.map(m => `<div class="bubble ${m.role === 'user' ? 'bubble-me' : 'bubble-ai'}">${esc(m.content)}</div>`).join('')
        || `<div class="bubble bubble-ai">${t('sp_say_hi')} 👋</div>`}
    </div>
    <div class="row">
      <input id="chat-input" class="input" placeholder="${t('sp_type')}" style="flex:3"/>
      <button class="btn btn-primary" data-act="send-chat" style="flex:0 0 64px">➤</button>
    </div>
    <button class="btn btn-ghost btn-block" style="margin-top:12px" data-act="end-chat">🏁 ${t('sp_end')}</button>
    <p class="muted" style="margin-top:10px;font-size:12.5px;text-align:center">${t('chat_over')}</p>`;
  $('#chat-input').addEventListener('keydown', e => { if (e.key === 'Enter') sendChat(); });
  $('#chat-input').focus();
}

async function sendChat() {
  const input = $('#chat-input');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  // No blur overlay here: paint the message + typing dots, like a real chat.
  $('#stream').insertAdjacentHTML('beforeend', `<div class="bubble bubble-me">${esc(text)}</div>`);
  showTyping();
  try {
    await C.conversationTurn(chat.id, text);
  } catch (err) {
    toast(err instanceof QuotaExhausted ? err.message : (err.message || t('error_generic')), 'bad');
    input.value = text;   // give the message back so nothing is lost
  }
  renderChat();
  window.scrollTo(0, document.body.scrollHeight);
}

async function endChat() {
  const evaluation = await withLoader(t('sp_eval'), () => C.endConversation(chat.id));
  if (!evaluation) return go('/talk');
  reward(gm.XP.conversation, 'talk');
  renderEvaluation(evaluation);
}

async function startLive(role, scenario) {
  view().innerHTML = `
    <div class="page-head center"><h1>🎙️ ${esc(role)}</h1><p class="dim">${esc(scenario)}</p></div>
    <div class="card center">
      <div class="orb" id="orb"></div>
      <b id="live-status">${t('sp_connecting')}</b>
    </div>
    <div class="card" style="margin-top:14px"><h3>${t('sp_you')}</h3><p id="tx-in" class="dim" style="white-space:pre-wrap">…</p></div>
    <div class="card" style="margin-top:14px"><h3>${t('sp_coach')}</h3><p id="tx-out" style="white-space:pre-wrap">…</p></div>
    <button class="btn btn-primary btn-lg btn-block" style="margin-top:16px" data-act="end-live">🏁 ${t('sp_end')}</button>`;

  const put = (sel, txt) => { const el = $(sel); if (el) el.textContent = (el.textContent === '…' ? '' : el.textContent) + txt; };
  live = new LiveSession({
    status: sVal => { const el = $('#live-status'); if (el) el.textContent = sVal; },
    inputText: x => put('#tx-in', x),
    outputText: x => put('#tx-out', x),
    speaking: on => $('#orb')?.classList.toggle('talk', on),
  });
  live.role = role; live.scenario = scenario;
  try {
    await live.start(C.userForPrompt(), role, scenario);
    $('#live-status').textContent = t('sp_listening');
  } catch (err) {
    live = null;
    toast(err instanceof QuotaExhausted ? err.message : t('sp_mic_err') + (err.message || ''), 'bad');
    renderSpeakSetup();
  }
}

async function endLive() {
  if (!live) return renderSpeakSetup();
  const { role, scenario } = live;
  const messages = live.stop();
  live = null;
  if (!messages.length) { toast(t('sp_no_time'), 'bad'); return renderSpeakSetup(); }
  const session = C.saveLiveConversation(role, scenario, messages);
  chat = session;
  const evaluation = await withLoader(t('sp_eval'), () => C.endConversation(session.id));
  if (evaluation) { reward(gm.XP.conversation, 'talk'); renderEvaluation(evaluation); }
  else renderSpeakSetup();
}

function renderEvaluation(evaluation) {
  const bars = ['fluency', 'grammar', 'vocabulary', 'naturalness', 'comprehension'];
  view().innerHTML = `
    <div class="page-head center"><h1 style="font-size:3rem">${Math.round(evaluation.score)}<small class="muted" style="font-size:1.2rem">/100</small></h1>
      <p class="dim">${t('sp_estimated')}: <b>${esc(evaluation.estimated_level || '—')}</b></p></div>
    ${levelChangeCard(evaluation.level_change)}
    <div class="card" style="margin-top:14px"><div class="hbars">
      ${bars.map(k => `<div class="hbar-row"><span style="text-transform:capitalize">${k}</span>
        <div class="bar"><span style="width:${evaluation[k]}%"></span></div><b>${Math.round(evaluation[k])}</b></div>`).join('')}
    </div></div>
    ${evaluation.feedback ? `<div class="card" style="margin-top:14px"><p>${esc(evaluation.feedback)}</p></div>` : ''}
    ${(evaluation.better_phrases || []).length ? `<div class="card" style="margin-top:14px"><h3>${t('sp_better')}</h3>
      ${evaluation.better_phrases.map(b => `<p style="margin:8px 0">❌ <s class="muted">${esc(b.said)}</s><br/>✅ <b>${esc(b.better)}</b></p>`).join('')}</div>` : ''}
    ${(evaluation.tips || []).length ? `<div class="card" style="margin-top:14px"><h3>${t('sp_tips')}</h3>${evaluation.tips.map(x => `<p style="margin:6px 0">💡 ${esc(x)}</p>`).join('')}</div>` : ''}
    <div style="margin-top:14px">${mistakesCard(evaluation.mistakes)}</div>
    <button class="btn btn-ghost btn-block" style="margin-top:16px" data-act="speak-setup">🎙️ ${t('ex_again')}</button>`;
}

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------
routes['/vocab'] = () => {
  const words = C.vocabList();
  const pending = words.filter(w => w.status !== 'mastered');
  view().innerHTML = `
    <div class="page-head"><h1 class="gradient-title">📖 ${t('vb_title')}</h1><p class="dim">${t('vb_sub')}</p></div>
    ${pending.length ? `<button class="btn btn-primary btn-lg btn-block" data-act="vocab-practice">✨ ${t('vb_practice', { n: Math.min(8, pending.length) })}</button>` : ''}
    <div class="card" style="margin-top:16px">
      ${words.length ? words.map(w => `
        <div class="vocab-row">
          <div style="flex:1">
            <span class="vocab-word">${esc(w.word)}</span>
            ${w.meaning ? `<span class="dim"> — ${esc(w.meaning)}</span>` : ''}
            ${w.example ? `<div class="vocab-ex">“${esc(w.example)}”</div>` : ''}
          </div>
          <div style="text-align:right">
            <span class="pill ${w.status === 'mastered' ? 'sev-2' : 'sev-3'}">${w.status === 'mastered' ? '✓ ' + t('vb_mastered') : t('vb_learning')}</span>
            <div><small class="muted">${t('vb_missed', { n: w.times_failed })}</small></div>
          </div>
        </div>`).join('') : `<p class="muted">${t('vb_empty')}</p>`}
    </div>`;
};

async function vocabPractice() {
  const pending = C.vocabList().filter(w => w.status !== 'mastered').slice(0, 8);
  if (!pending.length) return;
  await generateExercise('use_of_english', pending, true);
}

// ---------------------------------------------------------------------------
// Lessons
// ---------------------------------------------------------------------------
routes['/lessons'] = params => {
  const preset = params.get('topic') || '';
  const suggested = C.suggestedTopics(6);
  const saved = C.listLessons(20);
  view().innerHTML = `
    <div class="page-head"><h1 class="gradient-title">📚 ${t('ls_title')}</h1><p class="dim">${t('ls_sub')}</p></div>
    <div class="card">
      <label class="f">${t('ls_topic')}<input id="lesson-topic" class="input" value="${esc(preset)}" placeholder="${t('ls_topic_ph')}"/></label>
      <button class="btn btn-primary btn-block" style="margin-top:12px" data-act="gen-lesson">✨ ${t('ls_gen')}</button>
    </div>
    ${suggested.length ? `<div class="card" style="margin-top:14px">
      <div class="card-title"><h3>${t('ls_suggested')}</h3><button class="info-dot" data-act="sev-info">?</button></div>
      <div class="chips">${suggested.map(x =>
        `<button class="chip" data-act="pick-topic" data-topic="${esc(x.topic)}">${esc(x.topic)} · ${t('sev_' + Math.min(5, x.severity || 1))}</button>`).join('')}</div>
    </div>` : ''}
    ${saved.length ? `<div class="card" style="margin-top:14px"><h3>${t('ls_yours')}</h3>
      <div class="stack" style="margin-top:10px">${saved.map(l =>
        `<button class="opt" data-act="open-lesson" data-id="${l.id}">📚 <b>${esc(l.title)}</b><br/><small class="muted">${esc(l.topic)}</small></button>`).join('')}</div>
    </div>` : ''}`;
};

async function generateLesson() {
  const topic = $('#lesson-topic').value.trim();
  if (!topic) return toast(t('ls_topic_req'), 'bad');
  const lesson = await withLoader(t('ls_writing'), () => C.generateLesson(topic));
  if (lesson) renderLesson(lesson);
}

function renderLesson(lesson) {
  const c = lesson.content || {};
  view().innerHTML = `
    <div class="page-head"><h1>${esc(c.title || lesson.title)}</h1>
      <p class="dim">${esc(lesson.topic)} · ${t('ex_level', { l: esc(lesson.level) })}</p></div>
    ${c.intro ? `<div class="card"><h3>💡 ${t('ls_explain')}</h3><p style="margin-top:8px;line-height:1.6">${esc(c.intro)}</p></div>` : ''}
    ${(c.sections || []).map(sec => `<div class="card" style="margin-top:14px">
      <h3>${esc(sec.heading)}</h3><p style="line-height:1.65;margin-top:8px">${esc(sec.content)}</p>
      ${(sec.examples || []).length ? `<hr class="divider"/><small class="muted">${t('ls_examples')}</small>` : ''}
      ${(sec.examples || []).map(e => `<p style="margin:8px 0"><b>${esc(e.en)}</b><br/><span class="dim">${esc(e.es)}</span></p>`).join('')}
    </div>`).join('')}
    ${(c.common_mistakes || []).length ? `<div class="card" style="margin-top:14px"><h3>⚖️ ${t('ls_rules')}</h3>
      ${c.common_mistakes.map(m => `<p style="margin:10px 0">❌ <s class="muted">${esc(m.wrong)}</s><br/>✅ <b>${esc(m.right)}</b><br/><span class="dim">${esc(m.why)}</span></p>`).join('')}</div>` : ''}
    ${c.mini_exercise ? `<div class="card" style="margin-top:14px"><h3>📝 ${t('ls_practice')}</h3>
      <p class="dim" style="margin-top:6px">${esc(c.mini_exercise.prompt || '')}</p>
      <div class="stack" style="margin-top:12px">
        ${(c.mini_exercise.items || []).map((it, i) => `<div><p>${esc(it.prompt)}</p>
          <input class="input" style="margin-top:6px" data-mini="${i}" autocapitalize="none" placeholder="${t('ex_your_answer')}"/></div>`).join('')}
      </div>
      <button class="btn btn-primary btn-block" style="margin-top:14px" data-act="check-mini" data-id="${lesson.id}">✅ ${t('ls_check')}</button>
      <div id="mini-result"></div>
    </div>` : ''}
    ${(c.tips || []).length ? `<div class="card" style="margin-top:14px"><h3>💡 ${t('ls_tips')}</h3>${c.tips.map(x => `<p style="margin:6px 0">• ${esc(x)}</p>`).join('')}</div>` : ''}
    <a class="btn btn-ghost btn-block" style="margin-top:16px" href="#/lessons">📚 ${t('ls_other')}</a>`;
}

const normalise = s => String(s || '').trim().toLowerCase().replace(/[.,!?;:"']/g, '');

function checkMini(lessonId) {
  const lesson = store.load().lessons.find(l => l.id === lessonId);
  const items = lesson?.content?.mini_exercise?.items || [];
  let correct = 0;
  const rows = items.map((it, i) => {
    const given = document.querySelector(`[data-mini="${i}"]`)?.value || '';
    const ok = normalise(given) === normalise(it.answer);
    if (ok) correct++;
    return `<p>${ok ? '✅' : '❌'} ${esc(given || '—')}${ok ? '' : ` → <b>${esc(it.answer)}</b>`}</p>`;
  });
  const res = C.markLessonImprovement(lesson.topic, correct, items.length);
  $('#mini-result').innerHTML = `<div class="card" style="margin-top:14px">
    <b>${correct}/${items.length} · ${res.score_percent}%</b>${rows.join('')}
    ${res.mastered ? `<p>🏆 ${t('ls_mastered')}</p>` : res.updated.length ? `<p>📈 ${t('ls_improved')}</p>` : ''}</div>`;
}


Object.assign(actions, {
  'gen-ex': el => (el.dataset.type === 'photos' ? generatePhotos() : generateExercise(el.dataset.type)),
  'submit-photos': submitPhotos,
  'play-audio': playListening,
  'pick': el => {
    document.querySelectorAll(`[data-act="pick"][data-id="${el.dataset.id}"]`)
      .forEach(b => b.classList.toggle('sel', b === el));
    current.answers[el.dataset.id] = el.dataset.value;
  },
  'submit-ex': submitExercise,
  'submit-writing': submitWriting,
  'speak-setup': renderSpeakSetup,
  'speak-mode': el => { speakMode = el.dataset.v; renderSpeakSetup(); },
  'start-chat': el => startChat(el.dataset.role, el.dataset.scenario),
  'send-chat': sendChat,
  'end-chat': endChat,
  'start-live': el => startLive(el.dataset.role, el.dataset.scenario),
  'end-live': endLive,
  'vocab-practice': vocabPractice,
  'gen-lesson': generateLesson,
  'pick-topic': el => { $('#lesson-topic').value = el.dataset.topic; window.scrollTo(0, 0); },
  'open-lesson': el => renderLesson(store.load().lessons.find(l => l.id === +el.dataset.id)),
  'check-mini': el => checkMini(+el.dataset.id),
});

/* Leaving the voice screen must release the microphone. */
window.addEventListener('hashchange', () => {
  if (live && !location.hash.startsWith('#/talk')) { live.stop(); live = null; }
});
