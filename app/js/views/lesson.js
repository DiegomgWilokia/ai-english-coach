/* The lesson player: one exercise at a time, progress bar on top, instant
 * feedback sheet at the bottom, misses come back at the end. Full-screen. */
import * as S from '../session.js';
import * as A from '../audio.js';
import * as gm from '../gamify.js';
import { findUnit } from '../syllabus.js';
import { tilesFor, shuffle } from '../check.js';
import { t, lang } from '../i18n.js';
import { $, $$, view, esc, routes, actions, go, toast, errorText, confetti, countUp, rankSVG, rankName, md } from '../dom.js';
import { divisionOf } from '../gamify.js';

let ses = null;          // the running session
let ui = null;           // per-item UI state {answer, tiles, picked, checking, result, rec}
let pending = null;      // {unitId, kind} | {review:true} waiting to start

export function openLesson(unitId, kind) { pending = { unitId, kind }; go('/lesson'); }
export function openReview() { pending = { review: true }; go('/lesson'); }

routes['/lesson'] = async () => {
  if (ses && !S.isDone(ses) && !pending) return renderItem();
  if (!pending) return go('/path');
  const req = pending;
  pending = null;
  ses = null;
  if (req.review) {
    ses = S.startReview();
    if (!ses) { toast(t('rv_empty'), ''); return go('/practice'); }
    return renderItem();
  }
  renderLoading(req);
  try {
    ses = await S.startLesson(req.unitId, req.kind);
    renderItem();
  } catch (err) {
    console.error(err);
    renderLoadError(req, err);
  }
};

// ---------------------------------------------------------------------------
// Loading / error states
// ---------------------------------------------------------------------------
function renderLoading(req) {
  const unit = findUnit(req.unitId);
  view().innerHTML = `
    <div class="lesson">
      <div class="lesson-top"><button class="icon-btn" data-act="lesson-quit" aria-label="${t('close')}">✕</button>
        <div class="lbar"><span style="width:4%"></span></div></div>
      <div class="lesson-body center">
        <div class="gen-orb">${unit?.icon || '✨'}</div>
        <h2 style="margin-top:18px">${esc(unit?.title[lang()] || '')}</h2>
        <p class="dim" style="margin-top:6px">${t('ls_preparing')}</p>
        <div class="skel-stack">${'<div class="skel"></div>'.repeat(3)}</div>
      </div>
    </div>`;
}

function renderLoadError(req, err) {
  view().innerHTML = `
    <div class="lesson"><div class="lesson-body center">
      <div class="empty-ico">😵‍💫</div>
      <h2>${t('ls_gen_fail')}</h2>
      <p class="dim" style="margin:8px auto 18px;max-width:420px">${esc(errorText(err))}</p>
      <button class="btn btn-primary btn-lg" data-act="lesson-retry" data-unit="${esc(req.unitId)}" data-kind="${esc(req.kind)}">${t('retry')}</button>
      <button class="btn btn-ghost btn-lg" style="margin-left:8px" data-act="lesson-quit">${t('back')}</button>
    </div></div>`;
}

// ---------------------------------------------------------------------------
// One exercise
// ---------------------------------------------------------------------------
const TYPE_TITLE = {
  choice: 'q_choice', cloze: 'q_cloze', order: 'q_order', translate: 'q_translate', match: 'q_match',
  listen: 'q_listen', dictation: 'q_dictation', speak: 'q_speak', speak_free: 'q_speak_free',
  transform: 'q_transform', wordform: 'q_wordform', teach: 'q_teach',
};

function shell(inner, { footer = '' } = {}) {
  const pct = Math.round(S.progress(ses) * 100);
  return `
    <div class="lesson">
      <div class="lesson-top">
        <button class="icon-btn" data-act="lesson-quit" aria-label="${t('close')}">✕</button>
        <div class="lbar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${Math.max(3, pct)}%"></span></div>
        <span class="combo ${ses.combo >= 3 ? 'on' : ''}" id="combo">🔥 ${ses.combo}</span>
      </div>
      <div class="lesson-body" id="lbody">${inner}</div>
      <div class="lesson-foot" id="lfoot">${footer}</div>
      <div class="sheet" id="sheet" hidden></div>
    </div>`;
}

const checkBtn = (enabled = false) =>
  `<button class="btn btn-3d btn-primary btn-lg btn-block" id="check-btn" data-act="q-check" ${enabled ? '' : 'disabled'}>${t('q_check')}</button>`;

const speakerBtns = (text, big = false) => `
  <div class="speaker-row">
    <button class="speaker ${big ? 'big' : ''}" data-act="q-say" data-text="${esc(text)}" aria-label="${t('q_play')}">🔊</button>
    <button class="speaker slow" data-act="q-say" data-text="${esc(text)}" data-slow="1" aria-label="${t('q_slow')}">🐢</button>
  </div>`;

function renderItem() {
  if (S.isDone(ses)) return renderEnd();
  const it = S.currentItem(ses);
  ui = { answer: '', picked: [], tiles: null, result: null };
  const head = `<p class="q-kicker">${it.review ? `<span class="pill pill-review">↺ ${t('q_review')}</span>` : ''}${t(TYPE_TITLE[it.type] || 'q_choice')}</p>`;
  let body = '', foot = checkBtn(false);

  switch (it.type) {
    case 'teach':
      body = `<div class="teach">
        <h2>💡 ${esc(it.title)}</h2>
        <div class="teach-body">${md(it.body)}</div>
        ${it.examples.length ? `<div class="teach-ex">${it.examples.map(e => `
          <div class="ex-row"><button class="mini-say" data-act="q-say" data-text="${esc(e.en)}" aria-label="${t('q_play')}">🔊</button>
          <div><b>${esc(e.en)}</b><br/><span class="dim">${esc(e.es)}</span></div></div>`).join('')}</div>` : ''}
        ${it.words.length ? `<div class="word-grid">${it.words.map(w => `
          <button class="word-card" data-act="q-say" data-text="${esc(w.en)}"><b>${esc(w.en)}</b><span>${esc(w.es)}</span>
          ${w.example ? `<small>${esc(w.example)}</small>` : ''}</button>`).join('')}</div>` : ''}
      </div>`;
      foot = `<button class="btn btn-3d btn-primary btn-lg btn-block" data-act="q-next">${t('q_got_it')}</button>`;
      break;

    case 'choice':
      body = `${head}<h2 class="q-prompt">${fmtGap(it.prompt)}</h2>
        <div class="choices">${it.options.map((o, i) => `
          <button class="choice" data-act="q-pick" data-v="${esc(o)}"><kbd>${i + 1}</kbd>${esc(o)}</button>`).join('')}</div>`;
      break;

    case 'listen':
      body = `${head}${speakerBtns(it.audio, true)}
        ${it.prompt ? `<h2 class="q-prompt small">${esc(it.prompt)}</h2>` : ''}
        <div class="choices">${it.options.map((o, i) => `
          <button class="choice" data-act="q-pick" data-v="${esc(o)}"><kbd>${i + 1}</kbd>${esc(o)}</button>`).join('')}</div>`;
      setTimeout(() => A.speak(it.audio).catch(() => {}), 250);
      break;

    case 'cloze':
    case 'wordform':
      body = `${head}<h2 class="q-prompt">${fmtGap(it.prompt)}</h2>
        ${it.type === 'wordform' ? `<p class="base-word">${esc(it.base)}</p>` : it.hint ? `<p class="hint">💡 ${esc(it.hint)}</p>` : ''}
        <input id="q-input" class="input q-input" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="${t('ex_your_answer')}"/>`;
      break;

    case 'transform':
      body = `${head}<p class="q-orig">${esc(it.prompt)}</p>
        <p class="keyword">${esc(it.keyword)}</p>
        <h2 class="q-prompt small">${fmtGap(it.start || '___')}</h2>
        <input id="q-input" class="input q-input" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="${t('q_transform_ph')}"/>`;
      break;

    case 'translate':
      body = `${head}<div class="es-bubble"><span class="coach-face">🧑‍🏫</span><p>${esc(it.es)}</p></div>
        <textarea id="q-input" class="input q-input" rows="2" autocomplete="off" autocapitalize="sentences" spellcheck="false" placeholder="${t('q_translate_ph')}"></textarea>`;
      break;

    case 'order': {
      ui.tiles = tilesFor(it.answer, it.distractors).map((w, i) => ({ w, i, used: false }));
      body = `${head}<div class="es-bubble"><span class="coach-face">🧑‍🏫</span><p>${esc(it.es)}</p></div>
        <div class="answer-line" id="answer-line"></div>
        <div class="tiles" id="tiles"></div>`;
      break;
    }

    case 'dictation':
      body = `${head}${speakerBtns(it.audio, true)}
        <textarea id="q-input" class="input q-input" rows="2" autocomplete="off" autocapitalize="sentences" spellcheck="false" placeholder="${t('q_dictation_ph')}"></textarea>`;
      setTimeout(() => A.speak(it.audio).catch(() => {}), 250);
      break;

    case 'match': {
      const en = shuffle(it.pairs.map((p, i) => ({ i, text: p.en })));
      const es = shuffle(it.pairs.map((p, i) => ({ i, text: p.es })));
      ui.match = { sel: null, done: 0, mistakes: 0 };
      body = `${head}<div class="match">
        <div class="match-col">${en.map(x => `<button class="mtile" data-act="q-match" data-side="en" data-i="${x.i}">${esc(x.text)}</button>`).join('')}</div>
        <div class="match-col">${es.map(x => `<button class="mtile" data-act="q-match" data-side="es" data-i="${x.i}">${esc(x.text)}</button>`).join('')}</div>
      </div>`;
      foot = '';
      break;
    }

    case 'speak':
    case 'speak_free':
      body = `${head}
        ${it.type === 'speak'
          ? `<div class="say-card"><h2>${esc(it.say)}</h2>${it.es ? `<p class="dim">${esc(it.es)}</p>` : ''}${speakerBtns(it.say)}</div>`
          : `<div class="es-bubble"><span class="coach-face">🧑‍🏫</span><p><b>${esc(it.question)}</b>${it.es ? `<br/><span class="dim">${esc(it.es)}</span>` : ''}</p></div>
             <p class="dim center" style="margin-top:6px">${t('q_speak_free_hint')}</p>`}
        <div class="mic-wrap">
          <button class="mic" id="mic" data-act="q-mic" aria-label="${t('q_mic')}"><span class="mic-level" id="mic-level"></span>🎙️</button>
          <p class="dim" id="mic-hint">${A.micSupported() ? t('q_mic_tap') : t('q_mic_none')}</p>
        </div>`;
      foot = `<button class="btn btn-ghost btn-block" data-act="q-skip-speak">${t('q_cant_speak')}</button>`;
      break;
  }

  view().innerHTML = shell(body, { footer: foot });
  if (ui.tiles) drawTiles();
  const input = $('#q-input');
  if (input) {
    input.addEventListener('input', () => { ui.answer = input.value; $('#check-btn').disabled = !input.value.trim(); });
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (input.value.trim()) doCheck(); }
    });
    setTimeout(() => input.focus(), 50);
  }
}

const fmtGap = s => esc(s).replace(/_{2,}/g, '<span class="gap">_____</span>');

function drawTiles() {
  $('#answer-line').innerHTML = ui.picked.map((ti, k) =>
    `<button class="tile-w in" data-act="q-unpick" data-k="${k}">${esc(ti.w)}</button>`).join('') || `<span class="ph">${t('q_order_ph')}</span>`;
  $('#tiles').innerHTML = ui.tiles.map(ti =>
    `<button class="tile-w ${ti.used ? 'used' : ''}" data-act="q-tile" data-i="${ti.i}" ${ti.used ? 'disabled aria-hidden="true"' : ''}>${esc(ti.w)}</button>`).join('');
  ui.answer = ui.picked.map(x => x.w).join(' ');
  $('#check-btn').disabled = !ui.picked.length;
}

// ---------------------------------------------------------------------------
// Checking + feedback sheet
// ---------------------------------------------------------------------------
function doCheck() {
  if (ui.result || ui.checking) return;
  const given = ui.answer;
  if (!String(given).trim()) return;
  showResult(S.checkAnswer(S.currentItem(ses), given), given);
}

function showResult(res, given) {
  const it = S.currentItem(ses);
  ui.result = res;
  const rec = S.record(ses, res);
  A.sfx(res.ok ? (rec.milestone ? 'combo' : 'good') : 'bad');
  $$('.choice').forEach(b => {
    if (b.dataset.v === it.answer) b.classList.add('right');
    else if (b.dataset.v === given && !res.ok) b.classList.add('wrong');
    b.disabled = true;
  });
  const input = $('#q-input');
  if (input) { input.disabled = true; input.classList.add(res.ok ? 'ok' : 'ko'); }
  const combo = $('#combo');
  if (combo) { combo.textContent = `🔥 ${ses.combo}`; combo.classList.toggle('on', ses.combo >= 3); if (rec.milestone) combo.classList.add('burst'); }
  const bar = $('.lbar span');
  if (bar) bar.style.width = `${Math.max(3, Math.round(S.progress(ses) * 100))}%`;

  const praise = res.typo ? t('q_typo') : pickPraise(rec);
  const expected = res.expected && !res.ok ? `<p class="sheet-ans"><span>${t('ex_expected')}:</span> <b>${esc(res.expected)}</b></p>` : '';
  const why = res.explain;
  const override = !res.ok && res.open ? `<button class="link-btn" data-act="q-override">${t('q_override')}</button>` : '';
  sheet(res.ok, `
    <div class="sheet-head"><span class="sheet-ico">${res.ok ? '✓' : '✕'}</span><b>${res.ok ? praise : t('q_wrong')}</b>
      ${rec.milestone ? `<span class="pill pill-xp">🔥 ${t('q_combo', { n: ses.combo })}</span>` : ''}</div>
    ${res.typo ? `<p class="sheet-ans"><span>${t('q_correct_is')}:</span> <b>${esc(res.expected)}</b></p>` : ''}
    ${expected}
    ${why ? `<p class="sheet-why">${esc(why)}</p>` : ''}
    <div class="sheet-actions">${override}
      ${!res.ok ? `<button class="link-btn" data-act="q-why">${t('q_ask_why')}</button>` : ''}
      <button class="btn btn-3d ${res.ok ? 'btn-good' : 'btn-bad'} btn-lg" data-act="q-next" id="next-btn">${t('q_continue')}</button>
    </div>`);
}

const PRAISE = ['q_ok_1', 'q_ok_2', 'q_ok_3', 'q_ok_4', 'q_ok_5'];
const pickPraise = rec => t(rec.combo >= 5 ? 'q_ok_combo' : PRAISE[Math.floor(Math.random() * PRAISE.length)]);

function sheet(ok, html) {
  const el = $('#sheet');
  el.className = `sheet ${ok ? 'good' : 'bad'}`;
  el.innerHTML = `<div class="sheet-inner">${html}</div>`;
  el.hidden = false;
  $('#lfoot').innerHTML = '';
  setTimeout(() => $('#next-btn')?.focus(), 30);
}

function next() {
  A.stopSpeaking();
  if (ui?.rec) { ui.rec.cancel(); ui.rec = null; }
  S.advance(ses);
  renderItem();
}

// ---------------------------------------------------------------------------
// Speaking
// ---------------------------------------------------------------------------
async function toggleMic() {
  if (ui.result || ui.checking) return;
  const it = S.currentItem(ses);
  const mic = $('#mic'), hint = $('#mic-hint');
  if (ui.rec) {
    const rec = ui.rec;
    ui.rec = null;
    mic.classList.remove('rec');
    const { wav, seconds } = await rec.stop();
    if (seconds < 0.7) { hint.textContent = t('q_mic_short'); return; }
    ui.checking = true;
    mic.disabled = true;
    hint.innerHTML = `<span class="dots"><i></i><i></i><i></i></span> ${t('q_listening_ai')}`;
    try {
      const res = await S.checkSpoken(it, await A.blobToBase64(wav));
      ui.checking = false;
      showSpoken(res);
    } catch (err) {
      ui.checking = false;
      mic.disabled = false;
      hint.textContent = errorText(err);
    }
    return;
  }
  if (!A.micSupported()) return toast(t('q_mic_none'), 'bad');
  A.stopSpeaking();
  try {
    ui.rec = await A.startRecording({
      maxSeconds: it.type === 'speak' ? 12 : 45,
      onLevel: v => { const l = $('#mic-level'); if (l) l.style.transform = `scale(${1 + v * 0.9})`; },
    });
    mic.classList.add('rec');
    hint.textContent = t('q_mic_stop');
    ui.rec.finished.then(() => { if (ui?.rec) toggleMic(); });   // auto-stop at the time limit
  } catch (err) {
    ui.rec = null;
    toast(t('sp_mic_err') + (err.message || ''), 'bad');
  }
}

function showSpoken(res) {
  const it = S.currentItem(ses);
  const rec = S.record(ses, { ok: res.correct });
  A.sfx(res.correct ? 'good' : 'bad');
  const words = it.type === 'speak' && res.words.length
    ? `<p class="spoken-words">${res.words.map(w => `<span class="${w.ok ? 'w-ok' : 'w-ko'}">${esc(w.w)}</span>`).join(' ')}</p>` : '';
  sheet(res.correct, `
    <div class="sheet-head"><span class="sheet-ico">${res.correct ? '✓' : '✕'}</span>
      <b>${res.correct ? pickPraise(rec) : t('q_speak_again')}</b><span class="pill pill-xp">${res.score}/100</span></div>
    ${words}
    <p class="sheet-ans"><span>${t('q_heard')}:</span> «${esc(res.transcript || '…')}»</p>
    ${res.better ? `<p class="sheet-ans"><span>${t('q_better')}:</span> <b>${esc(res.better)}</b></p>` : ''}
    ${res.feedback ? `<p class="sheet-why">${esc(res.feedback)}</p>` : ''}
    <div class="sheet-actions">
      ${it.model ? `<button class="link-btn" data-act="q-say" data-text="${esc(it.model)}">🔊 ${t('q_model')}</button>` : ''}
      <button class="btn btn-3d ${res.correct ? 'btn-good' : 'btn-bad'} btn-lg" data-act="q-next" id="next-btn">${t('q_continue')}</button>
    </div>`);
}

// ---------------------------------------------------------------------------
// Matching pairs (checks itself, no button)
// ---------------------------------------------------------------------------
function matchTap(el) {
  const m = ui.match;
  if (el.classList.contains('done') || ui.result) return;
  A.sfx('tap');
  if (el.dataset.side === 'en') A.speak(el.textContent).catch(() => {});
  if (!m.sel || m.sel.dataset.side === el.dataset.side) {
    $$('.mtile.sel').forEach(x => x.classList.remove('sel'));
    el.classList.add('sel');
    m.sel = el;
    return;
  }
  const a = m.sel;
  m.sel = null;
  a.classList.remove('sel');
  if (a.dataset.i === el.dataset.i) {
    [a, el].forEach(x => { x.classList.add('done'); x.disabled = true; });
    m.done += 1;
    if (m.done === S.currentItem(ses).pairs.length) {
      setTimeout(() => showResult({ ok: m.mistakes <= 1, typo: false, explain: m.mistakes > 1 ? t('q_match_many', { n: m.mistakes }) : '' }, ''), 250);
    }
  } else {
    m.mistakes += 1;
    A.sfx('bad');
    [a, el].forEach(x => { x.classList.add('shake'); setTimeout(() => x.classList.remove('shake'), 400); });
  }
}

// ---------------------------------------------------------------------------
// End of lesson
// ---------------------------------------------------------------------------
function renderEnd() {
  const s = ses;
  const sum = S.finish(s);
  ses = null;
  A.sfx('done');
  confetti(sum.score >= 90 ? 70 : 36);
  const lc = sum.levelChange;
  const lpBefore = lc ? Math.max(0, lc.new_score - (lc.delta || 0)) : 0;
  const headline = s.mode === 'review' ? t('end_review')
    : sum.passed ? (s.kind === 'check' ? t('end_check_pass') : sum.score === 100 ? t('end_perfect') : t('end_done'))
    : (s.kind === 'check' ? t('end_check_fail') : t('end_retry'));
  const streakUp = sum.streak?.extended;
  view().innerHTML = `
    <div class="lesson"><div class="lesson-body end">
      <div class="end-hero ${sum.passed === false ? 'meh' : ''}">${sum.passed === false ? '💪' : sum.score === 100 ? '🏆' : '🎉'}</div>
      <h1 class="end-title">${headline}</h1>
      ${sum.fastTrack ? `<p class="pill pill-xp" style="margin:6px auto 0">⚡ ${t('end_fast')}</p>` : ''}
      <div class="end-stats">
        <div class="stat xp"><small>${t('end_xp')}</small><b id="end-xp">0</b></div>
        <div class="stat acc"><small>${t('end_acc')}</small><b id="end-acc">0%</b></div>
        <div class="stat time"><small>${t('end_time')}</small><b>${sum.minutes} min</b></div>
      </div>
      ${lc ? `<div class="card end-rank">
        <div class="icon-row">${rankSVG(lc.new_level, 40)}
          <div style="flex:1;text-align:left"><b>${rankName(lc.new_level)} ${divisionOf(lc.new_score)}</b>
            <div class="lp-bar"><span style="width:${lpBefore}%" id="lp-fill"></span></div>
            <small class="dim">${lc.exam_ready ? t('end_exam_ready') : `${lc.new_score} LP`}</small></div>
          <b class="lp-delta ${(lc.delta || 0) >= 0 ? 'up' : 'down'}">${(lc.delta || 0) >= 0 ? '+' : ''}${lc.delta || 0} LP</b>
        </div></div>` : ''}
      ${streakUp ? `<div class="card end-streak"><span class="flame">🔥</span><div><b>${t(sum.streak.streak === 1 ? 'end_streak_1' : 'end_streak', { n: sum.streak.streak })}</b><br/><small class="dim">${t('end_streak_sub')}</small></div></div>` : ''}
      ${sum.goalReached ? `<div class="card end-goal">🎯 <b>${t('end_goal')}</b></div>` : ''}
      ${sum.quests.length ? `<div class="card end-quests">${sum.quests.map(q => `<div class="icon-row">🎁 <b>${t('quest_' + q.id, { n: q.target })}</b><span class="pill pill-xp">+${gm.XP.quest} XP</span></div>`).join('')}</div>` : ''}
      <div class="end-actions">
        ${s.mode === 'lesson' && !sum.passed ? `<button class="btn btn-3d btn-primary btn-lg btn-block" data-act="lesson-retry" data-unit="${esc(s.unitId)}" data-kind="${esc(s.kind)}">${t('end_try_again')}</button>` : ''}
        <button class="btn btn-3d ${s.mode === 'lesson' && !sum.passed ? 'btn-ghost' : 'btn-primary'} btn-lg btn-block" data-act="lesson-continue">${t('q_continue')}</button>
      </div>
    </div></div>`;
  countUp($('#end-xp'), sum.xp);
  countUp($('#end-acc'), sum.score, { suffix: '%' });
  if (lc) setTimeout(() => { const f = $('#lp-fill'); if (f) f.style.width = `${lc.new_score}%`; }, 350);
  S.prefetchNext();
}

// ---------------------------------------------------------------------------
// Actions + keyboard
// ---------------------------------------------------------------------------
Object.assign(actions, {
  'lesson-quit': () => {
    if (ses && !S.isDone(ses) && Object.keys(ses.results).length && !confirm(t('ls_quit_confirm'))) return;
    A.stopSpeaking();
    if (ui?.rec) ui.rec.cancel();
    ses = null;
    go('/path');
  },
  'lesson-retry': el => openLesson(el.dataset.unit, el.dataset.kind),
  'lesson-continue': () => go('/path'),
  'q-say': el => A.speak(el.dataset.text, { slow: !!el.dataset.slow }).catch(err => toast(errorText(err), 'bad')),
  'q-pick': el => {
    if (ui.result) return;
    A.sfx('tap');
    $$('.choice').forEach(b => b.classList.toggle('sel', b === el));
    ui.answer = el.dataset.v;
    $('#check-btn').disabled = false;
  },
  'q-tile': el => {
    const ti = ui.tiles.find(x => String(x.i) === el.dataset.i);
    if (!ti || ti.used || ui.result) return;
    A.sfx('tap');
    ti.used = true;
    ui.picked.push(ti);
    drawTiles();
  },
  'q-unpick': el => {
    if (ui.result) return;
    const [ti] = ui.picked.splice(+el.dataset.k, 1);
    if (ti) ti.used = false;
    drawTiles();
  },
  'q-check': doCheck,
  'q-next': next,
  'q-match': matchTap,
  'q-mic': toggleMic,
  'q-skip-speak': () => {
    if (ui.rec) { ui.rec.cancel(); ui.rec = null; }
    ses.noSpeak = true;
    S.record(ses, { skipped: true });
    next();
  },
  'q-override': () => {
    // The accept list missed a valid free answer: trust the student (no AI call).
    const idx = ses.queue[ses.pos];
    const r = ses.results[idx];
    if (r && r.attempts === 1) { r.firstTry = true; r.solved = true; ses.combo += 1; ses.xp += gm.XP.item; }
    if (ses.queue[ses.queue.length - 1] === idx && ses.requeued.has(idx)) ses.queue.pop();
    next();
  },
  'q-why': () => {
    const it = S.currentItem(ses);
    const q = it.prompt || it.es || it.audio || it.say || '';
    sessionStorage.setItem('aec.coach.prefill', t('q_why_prefill', { q, a: ui.result?.expected || '', mine: ui.answer || '—' }));
    toast(t('q_why_saved'), 'good');
  },
});

document.addEventListener('keydown', e => {
  // focused buttons handle Enter themselves (a second handler here would skip an exercise)
  if (!ses || !location.hash.startsWith('#/lesson') || e.target.closest?.('textarea, input, button')) return;
  if (e.key === 'Enter') {
    if (ui?.result || S.currentItem(ses)?.type === 'teach') { e.preventDefault(); next(); }
    else if (!$('#check-btn')?.disabled) { e.preventDefault(); doCheck(); }
  } else if (/^[1-5]$/.test(e.key) && !ui?.result) {
    $$('.choice')[+e.key - 1]?.click();
  }
});
