/* First run and milestones: welcome, API key, onboarding, placement test,
 * promotion exam and diplomas. */
import * as store from '../store.js';
import * as C from '../coach.js';
import * as G from '../gemini.js';
import * as gm from '../gamify.js';
import { t, lang, goalLabel, goalIcon, GOAL_LABELS } from '../i18n.js';
import { $, view, esc, routes, actions, go, toast, withLoader, openModal, confetti, rankSVG, rankName, RANK_STYLE, nextSvgId } from '../dom.js';
import { fmtRange } from './path.js';

// ---------------------------------------------------------------------------
// Welcome
// ---------------------------------------------------------------------------
routes['/welcome'] = () => {
  view().innerHTML = `
    <div class="hero-wrap">
      <img class="hero-logo" src="icon-192.png" alt=""/>
      <h1>${t('wel_tag')}</h1>
      <p class="hero-sub">${t('wel_sub')}</p>
      <div class="hero-feats">
        <div>🎯 ${t('wel_f1')}</div>
        <div>🎙️ ${t('wel_f2')}</div>
        <div>${rankSVG('C2', 22)} ${t('wel_f3')}</div>
      </div>
      <div><button class="btn btn-primary btn-lg" style="min-width:240px" data-act="welcome-go">🚀 ${t('wel_cta')}</button></div>
      <p class="muted" style="margin-top:22px;font-size:13px">🔒 ${t('wel_priv')}</p>
      <div class="lang-toggle" style="margin:18px auto 0">${langToggle()}</div>
    </div>`;
};

// ---------------------------------------------------------------------------
// Setup (API key)
// ---------------------------------------------------------------------------
routes['/setup'] = () => {
  view().innerHTML = `
    <div class="wizard" style="justify-content:center">
      <div class="card">
        <h1>${t('setup_title')} 🔑</h1>
        <p class="dim" style="margin:10px 0 16px">${t('setup_body')}</p>
        <ol style="line-height:1.9;padding-left:20px;color:var(--text-dim)">
          <li>${t('setup_s1', { url: G.API_KEY_URL })}</li>
          <li>${t('setup_s2')}</li>
          <li>${t('setup_s3')}</li>
        </ol>
        <div class="stack" style="margin-top:16px">
          <input id="key" class="input" type="text" placeholder="${t('setup_ph')}" autocomplete="off" spellcheck="false"
                 value="${esc(G.apiKey())}" style="font-family:monospace"/>
          <button class="btn btn-primary btn-lg btn-block" data-act="save-key">✅ ${t('setup_btn')}</button>
        </div>
        <p class="muted" style="margin-top:16px;font-size:13px">🔒 ${t('setup_priv')}</p>
      </div>
    </div>`;
};

async function saveKey() {
  const key = $('#key').value.trim();
  const res = await withLoader(t('setup_check'), () => G.verifyKey(key));
  if (!res) return;
  if (!res.ok) return toast(res.message, 'bad');
  G.saveApiKey(key);
  toast(res.message, 'good');
  go(store.load().user ? '/path' : '/onboarding');
}

// ---------------------------------------------------------------------------
// Onboarding wizard
// ---------------------------------------------------------------------------
const ob = { step: 0, from_zero: false, name: '', last_name: '', age: '', photo: null, goal: null, variant: null, level: null, hours: 1, target_level: null, target_months: 3, study_days: ['mon', 'wed', 'fri'] };
const OB_STEPS = 7;
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const MONTHS = [[1, 'm_1'], [3, 'm_3'], [6, 'm_6'], [12, 'm_12']];

const VARIANTS = [
  { id: 'british', flag: '🇬🇧', name: 'British English', vs: [['film', 'colour'], ['flat', 'lift'], ['holiday', 'autumn']] },
  { id: 'american', flag: '🇺🇸', name: 'American English', vs: [['movie', 'color'], ['apartment', 'elevator'], ['vacation', 'fall']] },
];
const LEVEL_HINTS = {
  A1: { en: '“My name is Ana. I like coffee.”', es: '«My name is Ana. I like coffee.»' },
  A2: { en: '“Yesterday I went to the beach with my friends.”', es: '«Yesterday I went to the beach with my friends.»' },
  B1: { en: '“I’ve been working here since 2022 and I enjoy it.”', es: '«I’ve been working here since 2022 and I enjoy it.»' },
  B2: { en: '“If I’d known earlier, I would have applied.”', es: '«If I’d known earlier, I would have applied.»' },
  C1: { en: '“The proposal, compelling as it was, raised concerns.”', es: '«The proposal, compelling as it was, raised concerns.»' },
  C2: { en: 'Near-native: nuance, idioms and register.', es: 'Casi nativo: matices, idioms y registro.' },
};
const HOURS = [[0.5, '30 min'], [1, '1 h'], [1.5, '1 h 30'], [2, '2 h'], [3, '3 h+']];

routes['/onboarding'] = () => renderOb();

function renderOb() {
  const steps = [obProfile, obGoal, obVariant, obLevel, obTarget, obHours, obDone];
  view().innerHTML = `
    <div class="wizard">
      <div class="wizard-top">
        ${ob.step > 0 && ob.step < OB_STEPS - 1 ? `<button class="btn btn-ghost btn-sm" data-act="ob-back">← ${t('ob_back')}</button>` : ''}
        <div class="bar"><span style="width:${((ob.step + 1) / OB_STEPS) * 100}%"></span></div>
        <small>${t('ob_step', { a: ob.step + 1, b: OB_STEPS })}</small>
      </div>
      <div class="wizard-step" id="ob-step">${steps[ob.step]()}</div>
    </div>`;
  if (ob.step === OB_STEPS - 1) confetti();
}

const obNext = label => `<div class="wizard-nav"><button class="btn btn-primary btn-lg" data-act="ob-next">${label || t('ob_next')} →</button></div>`;

function obProfile() {
  return `
    <h1>${t('ob_profile')} 👋</h1><p class="sub">${t('ob_profile_sub')}</p>
    <div class="stack">
      <div class="photo-pick">
        <div class="ph ${ob.photo ? 'has' : ''}" id="ob-ph">${ob.photo ? `<img src="${ob.photo}"/>` : '📷'}</div>
        <button class="btn btn-ghost" data-act="ob-photo">${ob.photo ? t('ob_photo_change') : t('ob_photo')}</button>
        <input id="ob-file" type="file" accept="image/*" hidden/>
      </div>
      <div class="row">
        <label class="f">${t('ob_name')}<input id="ob-name" class="input" value="${esc(ob.name)}" placeholder="Diego"/></label>
        <label class="f">${t('ob_lastname')}<input id="ob-last" class="input" value="${esc(ob.last_name)}"/></label>
      </div>
      <label class="f" style="max-width:140px">${t('ob_age')}<input id="ob-age" class="input" type="number" min="5" max="99" value="${esc(ob.age)}"/></label>
    </div>
    ${obNext()}`;
}

function obGoal() {
  return `
    <h1>${t('ob_goal')} 🎯</h1><p class="sub">${t('ob_goal_sub')}</p>
    <div class="opt-grid">${Object.keys(GOAL_LABELS).map(g =>
      `<button class="opt-card ${ob.goal === g ? 'on' : ''}" data-act="ob-goal" data-v="${esc(g)}">
        <span class="ico">${goalIcon(g)}</span>${esc(goalLabel(g))}</button>`).join('')}
    </div>`;
}

function obVariant() {
  return `
    <h1>${t('ob_variant')}</h1><p class="sub">${t('ob_variant_sub')}</p>
    <div class="variant-grid">${VARIANTS.map(v => `
      <button class="variant-card ${ob.variant === v.id ? 'on' : ''}" data-act="ob-variant" data-v="${v.id}">
        <span class="flag">${v.flag}</span><h3>${v.name}</h3>
        <div class="vs">${v.vs.map(p => `<span><b>${p[0]}</b> · <b>${p[1]}</b></span>`).join('')}</div>
      </button>`).join('')}
    </div>`;
}

function obLevel() {
  return `
    <h1>${t('ob_level')}</h1><p class="sub">${t('ob_level_sub')}</p>
    <div class="rank-grid">${C.LEVELS.map(l => `
      <button class="rank-card ${ob.level === l ? 'on' : ''}" data-act="ob-level" data-v="${l}">
        ${rankSVG(l, 46)}<b>${rankName(l)}</b><span>${l}</span>
        <small style="min-height:30px">${LEVEL_HINTS[l][lang()]}</small>
      </button>`).join('')}
    </div>
    <button class="btn btn-ghost btn-block" style="margin-top:14px" data-act="ob-test">
      🧭 ${t('ob_test_btn')} <small class="muted">· ${t('ob_test_time')}</small>
    </button>
    <button class="btn btn-ghost btn-block" style="margin-top:10px" data-act="ob-zero">🌱 ${t('ob_zero')}</button>`;
}

function obTarget() {
  const cur = ob.level === 'TEST' ? 'A1' : (ob.level || 'B1');
  const pool = C.LEVELS.filter(l => C.levelIndex(l) > C.levelIndex(cur));
  const opts = pool.length ? pool : ['C2'];
  if (!ob.target_level || !opts.includes(ob.target_level)) ob.target_level = opts[0];
  return `
    <h1>${t('ob_target')} 🎯</h1><p class="sub">${t('ob_target_sub')}</p>
    <div class="stack">
      <div><label class="f">${t('ob_target_level')}</label>
        <div class="chips" style="margin-top:8px">${opts.map(l =>
          `<button class="chip ${ob.target_level === l ? 'on' : ''}" data-act="ob-tlevel" data-v="${l}">${l} · ${rankName(l)}</button>`).join('')}</div></div>
      <div><label class="f">${t('ob_target_months')}</label>
        <div class="chips" style="margin-top:8px">${MONTHS.map(([v, k]) =>
          `<button class="chip ${ob.target_months === v ? 'on' : ''}" data-act="ob-tmonths" data-v="${v}">${t(k)}</button>`).join('')}</div></div>
      <div><label class="f">${t('ob_target_days')}</label>
        <div class="chips" style="margin-top:8px">${DAYS.map(d =>
          `<button class="chip ${ob.study_days.includes(d) ? 'on' : ''}" data-act="ob-tday" data-v="${d}">${t('d_' + d)}</button>`).join('')}</div></div>
    </div>
    ${obNext()}`;
}

function obHours() {
  return `
    <h1>${t('ob_hours')} ⏱️</h1><p class="sub">${t('ob_hours_sub')}</p>
    <div class="chips">${HOURS.map(([v, l]) =>
      `<button class="chip ${ob.hours === v ? 'on' : ''}" data-act="ob-hours" data-v="${v}">${l}</button>`).join('')}
    </div>`;
}

function obDone() {
  const level = ob.level === 'TEST' ? 'B1' : (ob.level || 'B1');
  return `
    <div class="center" style="padding-top:5vh">
      <h1>${t('ob_done', { name: esc(ob.name) })} 🎉</h1>
      <p class="sub">${t('ob_done_sub')}:</p>
      <div class="rank-hero">${rankSVG(level, 110)}<h2>${rankName(level)} · ${level}</h2></div>
      ${(() => {
        const target = ob.target_level || 'B2';
        const fc = gm.forecast(level, 0, target, Math.round((ob.hours || 1) * 60));
        return fc ? `<div class="card forecast" style="max-width:420px;margin:18px auto 0;text-align:left">
          <b>📈 ${t('fc_title')}: ${level} → ${target}</b>
          <p class="dim" style="margin:6px 0 0">${t('fc_line', { r: fmtRange(fc.low, fc.high), m: Math.round((ob.hours || 1) * 60) })}</p>
          <small class="muted">${t('fc_source')}</small></div>` : '';
      })()}
      <div class="wizard-nav" style="max-width:340px;margin:26px auto 0">
        <button class="btn btn-primary btn-lg btn-block" data-act="ob-finish">🚀 ${t('ob_go')}</button>
      </div>
    </div>`;
}

function obAdvance() {
  if (ob.step === 0) {
    ob.name = $('#ob-name').value.trim();
    ob.last_name = $('#ob-last').value.trim();
    ob.age = $('#ob-age').value;
    if (!ob.name) return toast(t('ob_name_req'), 'bad');
  }
  if (ob.step === 3 && !ob.level) ob.level = 'B1';
  ob.step = Math.min(OB_STEPS - 1, ob.step + 1);
  renderOb();
}

function obFinish() {
  store.createUser({
    name: ob.name, last_name: ob.last_name, age: parseInt(ob.age, 10) || null, photo: ob.photo,
    goal: ob.goal || 'Conversación diaria', preferred_english: ob.variant || 'british',
    current_level: ob.level === 'TEST' ? 'B1' : (ob.level || 'B1'), daily_hours_goal: ob.hours,
    target_level: ob.target_level, target_months: ob.target_months, study_days: ob.study_days,
  });
  if (ob.from_zero) { store.load().user.from_zero = true; store.save(); }
  C.touchLogin();
  go(ob.level === 'TEST' ? '/placement' : '/path');
}

function pickPhoto() {
  const input = $('#ob-file') || $('#pf-file');
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    const url = await resizePhoto(file);
    if (currentPath().startsWith('/onboarding')) { ob.photo = url; renderOb(); }
    else { store.load().user.photo = url; store.save(); route(); }
  };
  input.click();
}

function resizePhoto(file) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      const s = 144;
      c.width = c.height = s;
      const m = Math.min(img.width, img.height);
      c.getContext('2d').drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, s, s);
      resolve(c.toDataURL('image/jpeg', 0.82));
    };
    img.src = URL.createObjectURL(file);
  });
}

// ---------------------------------------------------------------------------
// Placement test
// ---------------------------------------------------------------------------
let pl = null; // {test, answers:{}, readingAnswers:{}, mode:'placement'|'exam', level}

routes['/placement'] = () => {
  pl = null;
  view().innerHTML = `
    <div class="wizard" style="justify-content:center">
      <div class="card center">
        <h1>🧭 ${t('pl_title')}</h1>
        <p class="dim" style="margin:14px 0 6px">${t('pl_intro_1')}</p>
        <p class="dim" style="margin:0 0 20px">${t('pl_intro_2')}</p>
        <button class="btn btn-primary btn-lg" style="min-width:230px" data-act="pl-start">${t('pl_start')}</button>
      </div>
    </div>`;
};

async function plStart() {
  const user = C.userForPrompt() || {
    name: ob.name || 'Student', age: ob.age, goal: ob.goal || 'general English',
    current_level: 'B1', level_score: 50, preferred_english: ob.variant || 'british', ui_lang: lang(),
  };
  const test = await withLoader(t('pl_generating'), () => G.generatePlacement(user));
  if (!test) return;
  pl = { test, answers: {}, readingAnswers: {}, mode: 'placement' };
  renderPlTest();
}

function examIntro() {
  const level = C.nextLevel(store.load().user.current_level);
  view().innerHTML = `
    <div class="wizard" style="justify-content:center">
      <div class="card center exam-banner">
        <h1>🎓 ${t('exam_title', { level })}</h1>
        <p class="dim" style="margin:14px 0 20px">${t('exam_intro', { level, pass: C.CERT_PASS })}</p>
        <button class="btn btn-primary btn-lg" style="min-width:230px" data-act="exam-gen">${t('pl_start')}</button>
      </div>
    </div>`;
}

async function examGen() {
  const level = C.nextLevel(store.load().user.current_level);
  const test = await withLoader(t('exam_generating'), () => G.generateCertExam(C.userForPrompt(), level));
  if (!test) return;
  pl = { test, answers: {}, readingAnswers: {}, mode: 'exam', level };
  renderPlTest();
}

const qBlock = (it, group) => `
  <div class="card">
    <p><b>${it.id}.</b> ${esc(it.prompt)}</p>
    ${Array.isArray(it.options) && it.options.length ? `
      <div class="qa" style="margin-top:10px">${it.options.map(o =>
        `<button class="opt" data-act="pl-pick" data-g="${group}" data-id="${it.id}" data-v="${esc(o)}">${esc(o)}</button>`).join('')}
      </div>` :
      `<input class="input" style="margin-top:10px" data-plfill="${group}:${it.id}" autocapitalize="none" placeholder="${t('ex_your_answer')}"/>`}
  </div>`;

function renderPlTest() {
  const { test } = pl;
  view().innerHTML = `
    <div class="wizard">
      <h1>${pl.mode === 'exam' ? '🎓 ' + t('exam_title', { level: pl.level }) : '🧭 ' + t('pl_title')}</h1>
      <h3 style="margin:18px 0 10px">${t('pl_part1')}</h3>
      <div class="stack">${test.items.map(it => qBlock(it, 'g')).join('')}</div>
      <h3 style="margin:24px 0 10px">${t('pl_part2')}</h3>
      <div class="card" style="line-height:1.65">${esc(test.reading.passage)}</div>
      <div class="stack" style="margin-top:12px">${(test.reading.items || []).map(it => qBlock(it, 'r')).join('')}</div>
      <h3 style="margin:24px 0 10px">${t('pl_part3')}</h3>
      <div class="card"><p>${esc(test.writing_prompt)}</p><small class="muted">${t('pl_words')}</small>
        <textarea id="pl-writing" class="input" style="margin-top:12px"></textarea></div>
      <button class="btn btn-primary btn-lg btn-block" style="margin-top:18px" data-act="pl-submit">✅ ${t('pl_submit')}</button>
    </div>`;
}

async function plSubmit() {
  document.querySelectorAll('[data-plfill]').forEach(el => {
    const [g, id] = el.dataset.plfill.split(':');
    if (el.value.trim()) (g === 'g' ? pl.answers : pl.readingAnswers)[id] = el.value.trim();
  });
  const total = pl.test.items.length + (pl.test.reading.items || []).length;
  const done = Object.keys(pl.answers).length + Object.keys(pl.readingAnswers).length;
  if (done < total / 2) return toast(t('pl_answer_more'), 'bad');

  if (pl.mode === 'exam') {
    const result = await withLoader(t('exam_grading'), () => G.evaluateCertExam(
      C.userForPrompt(), pl.level, pl.test,
      { grammar: pl.answers, reading: pl.readingAnswers },
      $('#pl-writing').value.trim(),
    ));
    if (result) renderExamResult(result);
    return;
  }
  const result = await withLoader(t('pl_eval'), () => G.evaluatePlacement(
    C.userForPrompt(), pl.test,
    { grammar: pl.answers, reading: pl.readingAnswers },
    $('#pl-writing').value.trim(),
  ));
  if (!result) return;
  confetti();
  const scores = result.scores || {};
  view().innerHTML = `
    <div class="wizard" style="justify-content:center">
      <div class="card center">
        <p class="dim">${t('pl_result')}</p>
        <div class="rank-hero">${rankSVG(result.level, 120)}<h1>${rankName(result.level)} · ${result.level}</h1></div>
        <div class="hbars" style="margin:20px 0;text-align:left">${Object.entries(scores).map(([k, v]) =>
          `<div class="hbar-row"><span style="text-transform:capitalize">${esc(k)}</span><div class="bar"><span style="width:${v}%"></span></div><b>${v}</b></div>`).join('')}
        </div>
        ${result.summary ? `<p class="dim" style="text-align:left">${esc(result.summary)}</p>` : ''}
        <button class="btn btn-primary btn-lg btn-block" style="margin-top:18px" data-act="pl-apply" data-v="${result.level}">🚀 ${t('pl_apply')}</button>
      </div>
    </div>`;
}

function renderExamResult(result) {
  C.recordWeaknesses(result.mistakes || []);
  const res = C.resolveCertExam(result.score);
  if (res.passed) confetti();
  const sections = result.sections || {};
  view().innerHTML = `
    <div class="wizard" style="justify-content:center">
      <div class="card center">
        <h1 style="font-size:2.2rem">${res.passed ? '🎉 ' + t('exam_passed', { score: Math.round(result.score) }) : t('exam_failed', { score: Math.round(result.score) })}</h1>
        ${res.passed
          ? `<div class="rank-hero" style="margin-top:14px">${rankSVG(res.to, 120)}<h2>${rankName(res.to)} · ${res.to}</h2></div>`
          : `<p class="dim" style="margin-top:12px">${t('exam_failed_body', { pass: C.CERT_PASS })}</p>`}
        <div class="hbars" style="margin:20px 0;text-align:left">${Object.entries(sections).map(([k, v]) =>
          `<div class="hbar-row"><span style="text-transform:capitalize">${esc(k.replace(/_/g, ' '))}</span><div class="bar"><span style="width:${v}%"></span></div><b>${v}</b></div>`).join('')}
        </div>
        ${result.feedback ? `<p class="dim" style="text-align:left">${esc(result.feedback)}</p>` : ''}
        ${res.passed
          ? `<button class="btn btn-primary btn-lg btn-block" style="margin-top:18px" data-act="dip-view" data-i="${store.load().diplomas.length - 1}">🎓 ${t('exam_diploma')}</button>
             <a class="btn btn-ghost btn-block" style="margin-top:10px" href="#/path">🏠 ${t('ex_home')}</a>`
          : `<a class="btn btn-primary btn-lg btn-block" style="margin-top:18px" href="#/path">💪 ${t('exam_retry')}</a>`}
      </div>
    </div>`;
}

// ---------------------------------------------------------------------------
// Diplomas
// ---------------------------------------------------------------------------
function diplomaSVG(d) {
  const to = d.to || C.nextLevel(d.level);
  const st = RANK_STYLE[C.rankOf(to)];
  const gid = `dg${nextSvgId()}`;
  const date = new Date(d.date).toLocaleDateString(lang() === 'es' ? 'es-ES' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const cursive = "font-family=\"'Segoe Script','Brush Script MT','Snell Roundhand',cursive\"";
  const corner = 'M0 46 Q0 8 38 8 M0 30 Q0 16 16 16';
  return `<svg viewBox="0 0 840 594" xmlns="http://www.w3.org/2000/svg" font-family="Georgia,'Times New Roman',serif">
  <defs><linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${st.g[0]}"/><stop offset=".5" stop-color="${st.g[1]}"/><stop offset="1" stop-color="${st.g[2]}"/>
  </linearGradient></defs>
  <rect width="840" height="594" fill="#f8f3e4"/>
  <rect x="20" y="20" width="800" height="554" fill="none" stroke="#b08d3e" stroke-width="3"/>
  <rect x="30" y="30" width="780" height="534" fill="none" stroke="#b08d3e" stroke-width="1"/>
  ${[[44, 44, 1, 1], [796, 44, -1, 1], [44, 550, 1, -1], [796, 550, -1, -1]].map(([x, y, sx, sy]) =>
    `<path d="${corner}" transform="translate(${x},${y}) scale(${sx},${sy})" fill="none" stroke="#b08d3e" stroke-width="2"/>`).join('')}
  <svg x="385" y="52" width="70" height="82" viewBox="0 0 100 116">
    <path d="M50 4 L88 18 V56 C88 86 70 104 50 112 C30 104 12 86 12 56 V18 Z" fill="url(#${gid})" stroke="${st.stroke}" stroke-width="3.5"/>
    <text x="50" y="68" text-anchor="middle" font-size="30" font-weight="800" fill="${st.text}" font-family="Georgia,serif">${to}</text>
  </svg>
  <text x="420" y="176" text-anchor="middle" font-size="34" letter-spacing="4" fill="#7a5b1e">${t('dip_cert').toUpperCase()}</text>
  <text x="420" y="212" text-anchor="middle" font-size="15" fill="#8a7a55" letter-spacing="2">AI ENGLISH COACH</text>
  <text x="420" y="258" text-anchor="middle" font-size="16" fill="#5c5138" font-style="italic">${t('dip_text')}</text>
  <text x="420" y="316" text-anchor="middle" font-size="46" fill="#2e2818" ${cursive}>${esc(d.name)}</text>
  <line x1="240" y1="332" x2="600" y2="332" stroke="#b08d3e" stroke-width="1"/>
  <text x="420" y="368" text-anchor="middle" font-size="16" fill="#5c5138">${t('dip_passed', { level: to })}</text>
  <text x="420" y="392" text-anchor="middle" font-size="16" fill="#5c5138">${t('dip_score', { score: d.score })} · ${date}</text>
  <text x="200" y="486" text-anchor="middle" font-size="26" fill="#31415f" ${cursive}>${esc(d.name)}</text>
  <line x1="110" y1="500" x2="290" y2="500" stroke="#8a7a55" stroke-width="1"/>
  <text x="200" y="520" text-anchor="middle" font-size="12" fill="#8a7a55">${t('dip_student')}</text>
  <text x="640" y="482" text-anchor="middle" font-size="30" fill="#31415f" transform="rotate(-4 640 482)" ${cursive}>Diego Martinez</text>
  <line x1="550" y1="500" x2="730" y2="500" stroke="#8a7a55" stroke-width="1"/>
  <text x="640" y="520" text-anchor="middle" font-size="12" fill="#8a7a55">Diego Martinez · ${t('dip_ceo')}</text>
</svg>`;
}

function viewDiploma(i) {
  const d = store.load().diplomas[i];
  if (!d) return;
  openModal(`<div class="diploma-wrap">${diplomaSVG(d)}</div>
    <button class="btn btn-primary btn-block" style="margin-top:14px" data-act="dip-down" data-i="${i}">⬇️ ${t('dip_download')}</button>`);
}

function downloadDiploma(i) {
  const d = store.load().diplomas[i];
  if (!d) return;
  const blob = new Blob([diplomaSVG(d)], { type: 'image/svg+xml' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `diploma-${C.nextLevel(d.level)}.svg`;
  a.click();
  URL.revokeObjectURL(a.href);
}


export const langToggle = () => `
  <button data-act="lang" data-lang="es" class="${lang() === 'es' ? 'on' : ''}">ES</button>
  <button data-act="lang" data-lang="en" class="${lang() === 'en' ? 'on' : ''}">EN</button>`;

export { pickPhoto, viewDiploma, downloadDiploma, examIntro, HOURS };

Object.assign(actions, {
  'welcome-go': () => go(G.hasKey() ? '/onboarding' : '/setup'),
  'save-key': saveKey,
  'ob-back': () => { ob.step = Math.max(0, ob.step - 1); renderOb(); },
  'ob-next': obAdvance,
  'ob-photo': pickPhoto,
  'ob-goal': el => { ob.goal = el.dataset.v; obAdvance(); },
  'ob-variant': el => { ob.variant = el.dataset.v; obAdvance(); },
  'ob-level': el => { ob.level = el.dataset.v; ob.from_zero = false; obAdvance(); },
  'ob-test': () => { ob.level = 'TEST'; ob.from_zero = false; obAdvance(); },
  'ob-zero': () => { ob.level = 'A1'; ob.from_zero = true; obAdvance(); },
  'ob-hours': el => { ob.hours = parseFloat(el.dataset.v); obAdvance(); },
  'ob-finish': obFinish,
  'ob-tlevel': el => { ob.target_level = el.dataset.v; renderOb(); },
  'ob-tmonths': el => { ob.target_months = parseInt(el.dataset.v, 10); renderOb(); },
  'ob-tday': el => {
    const d = el.dataset.v;
    ob.study_days = ob.study_days.includes(d) ? ob.study_days.filter(x => x !== d) : [...ob.study_days, d];
    renderOb();
  },
  'pl-start': plStart,
  'pl-pick': el => {
    document.querySelectorAll(`[data-act="pl-pick"][data-g="${el.dataset.g}"][data-id="${el.dataset.id}"]`)
      .forEach(b => b.classList.toggle('sel', b === el));
    (el.dataset.g === 'g' ? pl.answers : pl.readingAnswers)[el.dataset.id] = el.dataset.v;
  },
  'pl-submit': plSubmit,
  'pl-apply': el => { C.applyPlacement(el.dataset.v); go('/path'); },
  'exam-start': examIntro,
  'exam-gen': examGen,
  'dip-view': el => viewDiploma(+el.dataset.i),
  'dip-down': el => downloadDiploma(+el.dataset.i),
});
