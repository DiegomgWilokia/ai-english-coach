/* App shell: navigation chrome, router and boot. Screens live in views/*.js and
 * register their routes and actions in dom.js. */
import * as store from './store.js';
import * as G from './gemini.js';
import * as gm from './gamify.js';
import * as C from './coach.js';
import { initReminders } from './notify.js';
import { t } from './i18n.js';
import { $, view, esc, routes, actions, setRerender, closeModal, rankSVG, rankName, ring } from './dom.js';
import { divisionOf } from './gamify.js';
import { langToggle } from './views/start.js';
import { initUpdates, updateActions } from './update.js';
import './views/path.js';
import './views/lesson.js';
import './views/practice.js';
import './views/coach.js';
import './views/progress.js';
import './views/profile.js';

const BARE = ['/welcome', '/setup', '/onboarding', '/placement', '/lesson'];
const NAV = [
  ['/path', '🗺️', 'nav_path'],
  ['/practice', '🏋️', 'nav_practice'],
  ['/coach', '🧑‍🏫', 'nav_coach'],
  ['/progress', '🏆', 'nav_progress'],
  ['/profile', '👤', 'nav_profile'],
];
// sub-screens light up their parent tab
const PARENT = { '/talk': '/practice', '/vocab': '/practice', '/lessons': '/practice' };

routes['/dashboard'] = () => { location.replace('#/path'); };
routes['/exercises'] = () => { location.replace('#/practice'); };

function renderChrome(base) {
  const bare = BARE.includes(base);
  document.body.classList.toggle('bare', bare);
  $('#sidebar').hidden = bare;
  $('#topbar').hidden = bare;
  $('#tabbar').hidden = bare;
  if (bare) return;

  const active = PARENT[base] || base;
  const links = mob => NAV.map(([r, ico, key]) =>
    `<a href="#${r}" class="${r === active ? 'active' : ''}" ${r === active ? 'aria-current="page"' : ''}><span class="${mob ? '' : 'ico'}">${ico}</span>${mob ? `<em>${t(key)}</em>` : `<span>${t(key)}</span>`}</a>`).join('');
  $('#side-nav').innerHTML = links(false);
  $('#tabbar').innerHTML = links(true);

  const u = store.load().user;
  if (u) {
    const xp = gm.xpToday(), goal = gm.dailyGoal(), st = gm.streak();
    $('#level-chip').hidden = false;
    $('#level-chip').innerHTML = `<span class="tb-fire ${st ? 'on' : ''}">🔥 ${st}</span><span class="tb-xp">${ring(xp / goal, 18, 3)} ${xp}</span>`;
    $('#side-rank').innerHTML = `<a href="#/progress" class="side-rank-card">${rankSVG(u.current_level, 34)}
      <div style="flex:1"><div class="side-rank-name">${rankName(u.current_level)} ${divisionOf(u.level_score)}</div>
      <div class="bar" style="margin-top:5px"><span style="width:${u.level_score}%"></span></div>
      <div class="side-rank-sub">${u.level_score} LP · 🔥 ${st} · ⚡ ${xp}/${goal}</div></div></a>`;
    $('#top-avatar').innerHTML = u.photo ? `<img src="${u.photo}" alt=""/>` : (u.name ? esc(u.name[0].toUpperCase()) : '👤');
  }
  $('#lang-side').innerHTML = langToggle();
}

const currentPath = () => window.location.hash.replace(/^#/, '') || '/path';

async function route() {
  const path = currentPath();
  const [base] = path.split('?');
  closeModal();

  if (!G.hasKey() && !['/welcome', '/setup'].includes(base)) return go('/welcome');
  if (G.hasKey() && !store.load().user && !['/setup', '/onboarding', '/welcome', '/placement'].includes(base)) return go('/onboarding');

  renderChrome(base);
  window.scrollTo(0, 0);
  const fn = routes[base] || routes['/path'];
  try {
    await fn(new URLSearchParams(path.split('?')[1] || ''));
  } catch (err) {
    console.error(err);
    view().innerHTML = `<div class="card empty-card" style="margin-top:20px"><div class="empty-ico">😵</div>
      <h3>${t('error_generic')}</h3><p class="muted">${esc(err.message || '')}</p>
      <a class="btn btn-primary" style="margin-top:12px" href="#/path">${t('ex_home')}</a></div>`;
  }
}
const go = p => { window.location.hash = `#${p}`; };
setRerender(route);

document.addEventListener('click', e => {
  if (e.target.id === 'modal') return closeModal();
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const fn = actions[el.dataset.act];
  if (fn) { e.preventDefault(); fn(el); }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#modal').hidden) closeModal(); });
window.addEventListener('hashchange', route);

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
// Offline cache only for the web install; the Android/Windows builds ship the files inside.
if ('serviceWorker' in navigator && location.protocol === 'https:' && !window.Capacitor && location.hostname !== 'localhost') {
  navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW', err));
}
Object.assign(actions, updateActions);
if (store.load().user) C.touchLogin();
initReminders();
route();
initUpdates();
