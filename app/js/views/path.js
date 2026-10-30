/* Home: the course path. Units of the focus level as a winding trail of stops,
 * with today's goal, quests and rank always in sight. */
import * as store from '../store.js';
import * as P from '../path.js';
import * as gm from '../gamify.js';
import * as S from '../session.js';
import * as srs from '../srs.js';
import { unitsOf, findUnit, NODES, ROUNDS } from '../syllabus.js';
import { t, lang } from '../i18n.js';
import { $, view, esc, routes, actions, go, openModal, closeModal, rankSVG, rankName, ring, toast } from '../dom.js';
import { divisionOf } from '../gamify.js';
import { openLesson, openReview } from './lesson.js';

const UNIT_HUES = ['violet', 'cyan', 'pink', 'amber', 'green', 'blue'];
const collapsed = new Set(JSON.parse(sessionStorage.getItem('aec.collapsed') || '[]'));

/* Stats strip shared by the path and the desktop rail. */
export function statsStrip(u) {
  const xp = gm.xpToday(), goal = gm.dailyGoal(), st = gm.streak();
  const due = srs.dueCards(store.load().review).length;
  return `
    <div class="stats-strip">
      <a class="stat-pill fire ${st ? 'on' : ''}" href="#/progress" title="${t('dash_streak')}"><span>🔥</span><b>${st}</b></a>
      <a class="stat-pill goal" href="#/progress" title="${t('goal_today')}">${ring(xp / goal, 26, 4)}<b>${xp}<small>/${goal}</small></b></a>
      <button class="stat-pill review ${due ? 'on' : ''}" data-act="open-review" title="${t('rv_title')}"><span>↺</span><b>${due}</b></button>
      <a class="stat-pill rank" href="#/progress" title="${t('dash_level')}">${rankSVG(u.current_level, 20)}<b>${divisionOf(u.level_score)}<small> · ${u.level_score} LP</small></b></a>
    </div>`;
}

export function questsCard() {
  const qs = gm.quests();
  return `<div class="card quests">
    <div class="card-title"><h3>🎯 ${t('quests_title')}</h3><small class="muted">${t('quests_reset')}</small></div>
    ${qs.map(q => `<div class="quest ${q.done ? 'done' : ''}">
      <span class="quest-ico">${q.done ? '✅' : { xp: '⚡', lessons: '📘', perfect: '💎', review: '↺', speak: '🎙️', combo: '🔥', talk: '💬', write: '✍️', listen: '🎧' }[q.id] || '🎯'}</span>
      <div class="quest-main"><b>${t('quest_' + q.id, { n: q.target })}</b>
        <div class="bar thin"><span style="width:${Math.round((q.progress / q.target) * 100)}%"></span></div></div>
      <small class="quest-num">${q.progress}/${q.target}</small>
    </div>`).join('')}
  </div>`;
}

function nodeButton(unit, n, role, idx, isNext) {
  const status = P.nodeStatus(unit.id, n.kind, role);
  const rounds = P.roundsOf(unit.id, n.kind);
  const mastered = n.kind === 'check' ? rounds >= 1 : rounds >= ROUNDS;
  const offset = [0, 38, 58, 38, 0, -38][idx % 6];
  const cls = ['node', `k-${n.kind}`, status, mastered ? 'mastered' : '', isNext ? 'next' : ''].join(' ');
  const ringPct = n.kind === 'check' ? (rounds ? 1 : 0) : rounds / ROUNDS;
  return `
    <div class="node-wrap" style="--x:${offset}px">
      ${isNext ? `<div class="node-tip">${t('path_start')}</div>` : ''}
      <button class="${cls}" data-act="node" data-unit="${unit.id}" data-kind="${n.kind}" data-role="${role}"
        aria-label="${t('kind_' + n.kind)} · ${t('st_' + status)}">
        ${status !== 'locked' && n.kind !== 'check' ? ring(ringPct, 84, 6, 'node-ring') : ''}
        <span class="node-face">${status === 'locked' ? '🔒' : mastered ? (n.kind === 'check' ? '🏆' : '⭐') : n.icon}</span>
      </button>
    </div>`;
}

function unitBlock(unit, role, ui, nextKey) {
  const p = P.unitProgress(unit.id);
  const done = NODES.filter(n => (n.kind === 'check' ? p.check : (p[n.kind] || 0) >= 1)).length;
  const unlocked = P.unitUnlocked(unit.id, role);
  const hue = UNIT_HUES[ui % UNIT_HUES.length];
  return `
    <section class="unit hue-${hue} ${unlocked ? '' : 'locked'}" id="u-${unit.id}">
      <header class="unit-head">
        <div class="unit-ico">${unit.icon}</div>
        <div class="unit-txt">
          <small>${t('unit_n', { n: ui + 1 })} · ${unit.id.split('-')[0]}</small>
          <h3>${esc(unit.title[lang()])}</h3>
          <p>${esc(unit.can[lang()])}</p>
        </div>
        <div class="unit-meta"><b>${done}/${NODES.length}</b>
          ${p.check ? '<span class="pill sev-2">✓</span>' : `<button class="btn btn-sm btn-ghost" data-act="node" data-unit="${unit.id}" data-kind="check" data-role="${role}">🏆 ${t('unit_skip')}</button>`}</div>
      </header>
      <div class="trail">${NODES.map((n, i) => nodeButton(unit, n, role, i, nextKey === `${unit.id}:${n.kind}`)).join('')}</div>
    </section>`;
}

routes['/path'] = () => {
  const u = store.load().user;
  const next = P.nextNode(u);
  const nextKey = next ? `${next.unitId}:${next.kind}` : '';
  const examOpen = P.examUnlocked(u);
  const focus = P.focusLevel(u);
  const f = gm.minutesPerDay();
  const target = u.target_level && u.target_level !== u.current_level ? u.target_level : focus;
  const fc = gm.forecast(u.current_level, u.level_score, target, f.minutes);

  const levelSections = P.levelsShown(u).map(({ level, role }) => {
    const units = unitsOf(level);
    const stats = P.levelStats(level);
    const key = `${level}:${role}`;
    const isCollapsed = role === 'consolidate' ? !collapsed.has(key + ':open') : collapsed.has(key);
    return `
      <div class="level-block ${role}">
        <button class="level-head" data-act="toggle-level" data-key="${key}" data-role="${role}" aria-expanded="${!isCollapsed}">
          ${rankSVG(level, 34)}
          <div><b>${role === 'focus' ? t('path_road', { l: level, r: rankName(level) }) : t('path_consolidate', { l: level })}</b>
            <small>${role === 'focus' ? t('path_focus_sub', { d: stats.done, n: stats.total }) : t('path_consolidate_sub')}</small></div>
          <span class="chev">${isCollapsed ? '▸' : '▾'}</span>
        </button>
        ${isCollapsed ? '' : units.map((unit, i) => unitBlock(unit, role, i, role === 'focus' ? nextKey : '')).join('')}
        ${role === 'focus' && !isCollapsed && u.current_level !== 'C2' ? `
          <div class="exam-node ${examOpen ? 'open' : ''}">
            <button class="node big k-exam ${examOpen ? 'open next' : 'locked'}" data-act="${examOpen ? 'exam-start' : 'exam-locked'}" aria-label="${t('path_exam', { l: focus })}">
              <span class="node-face">${examOpen ? '🎓' : '🔒'}</span></button>
            <b>${t('path_exam', { l: focus })}</b>
            <small class="dim">${examOpen ? t('path_exam_open') : t('path_exam_locked')}</small>
          </div>` : ''}
      </div>`;
  }).join('');

  view().innerHTML = `
    <div class="path-layout">
      <div class="path-main">
        ${statsStrip(u)}
        ${next ? `<button class="hero-next hue-${UNIT_HUES[unitsOf(focus).findIndex(x => x.id === next.unitId) % UNIT_HUES.length] || 'violet'}" data-act="node" data-unit="${next.unitId}" data-kind="${next.kind}" data-role="focus">
          <span class="hero-ico">${NODES.find(n => n.kind === next.kind).icon}</span>
          <span class="hero-txt"><small>${t('path_next')}</small><b>${esc(findUnit(next.unitId).title[lang()])} · ${t('kind_' + next.kind)}</b>
            <small>${S.isCached(S.lessonKey(next.unitId, next.kind)) ? '⚡ ' + t('path_ready') : t('path_minutes')}</small></span>
          <span class="hero-go">▶</span></button>` : ''}
        ${examOpen ? `<div class="card exam-banner"><div class="icon-row"><span style="font-size:26px">🎓</span><b style="flex:1">${t('exam_ready_title')}</b>
          <button class="btn btn-3d btn-primary" data-act="exam-start">${t('exam_take')}</button></div>
          <p class="dim" style="margin:8px 0 0">${t('exam_ready_body2', { l: focus })}</p></div>` : ''}
        ${levelSections}
      </div>
      <aside class="path-rail">
        ${questsCard()}
        ${fc ? `<div class="card forecast">
          <div class="card-title"><h3>📈 ${t('fc_title')}</h3><button class="info-dot" data-act="fc-info">?</button></div>
          <p class="fc-big">${u.current_level} → ${target}</p>
          <p class="dim">${t('fc_line', { r: fmtRange(fc.low, fc.high), m: f.minutes })}</p>
          <small class="muted">${f.measured ? t('fc_measured') : t('fc_declared')}</small>
        </div>` : ''}
        <div class="card mini-actions">
          <button class="mini-act" data-act="open-review">↺ <b>${t('rv_title')}</b><small>${t('rv_due', { n: srs.dueCards(store.load().review).length })}</small></button>
          <a class="mini-act" href="#/coach">🧑‍🏫 <b>${t('nav_coach')}</b><small>${t('coach_tag')}</small></a>
          <a class="mini-act" href="#/talk">💬 <b>${t('ex_speak')}</b><small>${t('ex_speak_d')}</small></a>
        </div>
      </aside>
    </div>`;

  S.prefetchNext();
  // bring the current stop into view only when it starts below the fold
  if (next) requestAnimationFrame(() => {
    const el = document.getElementById(`u-${next.unitId}`)?.querySelector('.node.next');
    if (el && el.getBoundingClientRect().bottom > window.innerHeight - 90) el.scrollIntoView({ block: 'center', behavior: 'instant' });
  });
};

/* "10–13 months" instead of "10 months – 13 months". */
export function fmtRange(low, high) {
  if (low >= 45 && high >= 45) return t('fc_months', { n: `${Math.round(low / 30.4)}–${Math.round(high / 30.4)}` });
  return `${fmtSpan(low)} – ${fmtSpan(high)}`;
}

export function fmtSpan(days) {
  if (days < 45) return t('fc_days', { n: days });
  const m = Math.round(days / 30.4);
  return t(m === 1 ? 'fc_month' : 'fc_months', { n: m });
}

function nodeTap(el) {
  const { unit: unitId, kind, role } = el.dataset;
  const status = P.nodeStatus(unitId, kind, role);
  const unit = findUnit(unitId);
  if (status === 'locked') return toast(t('node_locked'), '');
  const rounds = P.roundsOf(unitId, kind);
  const round = S.roundFor(unitId, kind);
  const cached = S.isCached(S.lessonKey(unitId, kind));
  const desc = kind === 'check'
    ? (P.unitDone(unitId) ? t('node_check_done') : t('node_check_desc'))
    : rounds >= ROUNDS ? t('node_mastered') : rounds ? t('node_round2') : t('kind_desc_' + kind);
  openModal(`
    <div class="node-pop">
      <div class="node-pop-ico">${NODES.find(n => n.kind === kind).icon}</div>
      <small class="muted">${esc(unit.title[lang()])}</small>
      <h2>${t('kind_' + kind)}${kind !== 'check' ? ` · ${t('round_n', { n: round, m: ROUNDS })}` : ''}</h2>
      <p class="dim">${desc}</p>
      <p class="focus-line">📌 ${esc(unit.grammar)}</p>
      <button class="btn btn-3d btn-primary btn-lg btn-block" data-act="node-go" data-unit="${unitId}" data-kind="${kind}">
        ${cached ? '⚡ ' : ''}${kind === 'check' ? t('node_check_go') : rounds >= ROUNDS ? t('node_practice') : t('path_start')}</button>
    </div>`);
}

Object.assign(actions, {
  'node': nodeTap,
  'node-go': el => { closeModal(); openLesson(el.dataset.unit, el.dataset.kind); },
  'open-review': () => (store.load().review.length ? openReview() : toast(t('rv_empty'), '')),
  'toggle-level': el => {
    const key = el.dataset.key;
    const flag = el.dataset.role === 'consolidate' ? key + ':open' : key;
    if (collapsed.has(flag)) collapsed.delete(flag); else collapsed.add(flag);
    sessionStorage.setItem('aec.collapsed', JSON.stringify([...collapsed]));
    routes['/path']();
  },
  'exam-locked': () => toast(t('path_exam_locked'), ''),
  'fc-info': () => openModal(`<h3>📈 ${t('fc_title')}</h3><div class="dim" style="margin-top:10px;line-height:1.6">${t('fc_explain')}</div>`),
});

export { go };
