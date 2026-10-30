/* Progress: rank and LP, honest forecast, streak and XP history, skills, weak
 * spots and diplomas. */
import * as store from '../store.js';
import * as C from '../coach.js';
import * as gm from '../gamify.js';
import * as P from '../path.js';
import { t } from '../i18n.js';
import { view, esc, routes, rankSVG, rankName, sevPill } from '../dom.js';
import { divisionOf, DIVISIONS } from '../gamify.js';
import { fmtRange } from './path.js';

routes['/progress'] = () => {
  const s = store.load();
  const u = s.user;
  const days = gm.activeDays(14);
  const maxXp = Math.max(gm.dailyGoal(), ...days.map(d => d.xp));
  const goal = gm.dailyGoal();
  const f = gm.minutesPerDay();
  const focus = P.focusLevel(u);
  const target = u.target_level && C.levelIndex(u.target_level) > C.levelIndex(u.current_level) ? u.target_level : focus;
  const fc = gm.forecast(u.current_level, u.level_score, target, f.minutes);
  const perf = C.performanceByType().filter(p => p.count);
  const weak = C.dedupedWeaknesses(6);
  const lessons = s.sessions.filter(r => r.type === 'lesson').length;
  const totalMin = Math.round(Object.values(s.study_logs).reduce((a, l) => a + (l.minutes || 0), 0));
  const div = divisionOf(u.level_score);

  view().innerHTML = `
    <div class="page-head"><h1 class="gradient-title">${t('nav_progress')}</h1></div>

    <div class="grid-2">
      <div class="card rank-card-big">
        <div class="card-title"><h3>${t('dash_level')}</h3><button class="info-dot" data-act="ranks-info">?</button></div>
        <div class="rank-big">
          ${rankSVG(u.current_level, 84)}
          <div style="flex:1">
            <h2>${rankName(u.current_level)} ${div}</h2>
            <small class="dim">${u.current_level} · ${u.level_score}/100 LP</small>
            <div class="divs">${DIVISIONS.map((d, i) => `<span class="${u.level_score >= i * 25 ? 'on' : ''} ${d === div ? 'cur' : ''}">${d}</span>`).join('')}</div>
            <div class="lp-bar"><span style="width:${u.level_score}%"></span></div>
            <small class="muted">${u.pending_exam ? t('end_exam_ready') : t('pr_lp_hint', { l: focus })}</small>
          </div>
        </div>
      </div>
      <div class="card forecast">
        <div class="card-title"><h3>📈 ${t('fc_title')}</h3><button class="info-dot" data-act="fc-info">?</button></div>
        ${fc ? `<p class="fc-big">${u.current_level} → ${target}</p>
          <p class="dim">${t('fc_line', { r: fmtRange(fc.low, fc.high), m: f.minutes })}</p>
          <p class="muted" style="font-size:13px">${t('fc_hours', { a: fc.hoursLow, b: fc.hoursHigh })} · ${f.measured ? t('fc_measured') : t('fc_declared')}</p>`
          : `<p class="dim">${t('fc_done')}</p>`}
      </div>
    </div>

    <div class="kpis" style="margin-top:16px">
      <div class="kpi"><b>${gm.streak()} 🔥</b><small>${t('dash_streak')}</small></div>
      <div class="kpi"><b>${s.xp.total}</b><small>${t('pr_xp_total')}</small></div>
      <div class="kpi"><b>${lessons}</b><small>${t('pr_lessons')}</small></div>
      <div class="kpi"><b>${totalMin}</b><small>${t('dash_minutes')}</small></div>
    </div>

    <div class="grid-2" style="margin-top:16px">
      <div class="card">
        <div class="card-title"><h3>${t('pr_xp_14')}</h3><small class="muted">${t('pr_goal_line', { n: goal })}</small></div>
        <div class="spark goal-spark" style="--goal:${Math.round((goal / maxXp) * 100)}%">${days.map(d =>
          `<div class="${d.xp >= goal ? 'hit' : ''}" style="height:${Math.max(3, Math.round((d.xp / maxXp) * 100))}%" title="${d.day}: ${d.xp} XP"></div>`).join('')}</div>
        <div class="spark-days">${days.map((d, i) => `<span>${i % 2 ? '' : d.day.slice(8)}</span>`).join('')}</div>
      </div>
      <div class="card">
        <div class="card-title"><h3>${t('pr_levels')}</h3></div>
        <div class="stack" style="gap:12px">${P.levelsShown(u).map(({ level }) => {
          const st = P.levelStats(level);
          return `<div class="icon-row">${rankSVG(level, 30)}<div style="flex:1"><b>${level}</b>
            <div class="bar"><span style="width:${st.pct}%"></span></div></div><small class="muted">${st.done}/${st.total}</small></div>`;
        }).join('')}</div>
      </div>
    </div>

    <div class="grid-2" style="margin-top:16px">
      ${perf.length ? `<div class="card">
        <div class="card-title"><h3>${t('dash_bytype')}</h3></div>
        <div class="hbars">${perf.map(p =>
          `<div class="hbar-row"><span>${esc(p.type === 'lesson' ? t('pr_lessons_label') : p.label)}</span><div class="bar"><span style="width:${p.average}%"></span></div><b>${Math.round(p.average)}</b></div>`).join('')}</div>
      </div>` : `<div class="card empty-card"><div class="empty-ico">📊</div><p class="muted">${t('dash_empty_perf')}</p></div>`}
      ${weak.length ? `<div class="card">
        <div class="card-title"><h3>${t('dash_focus')}</h3><button class="info-dot" data-act="sev-info">?</button></div>
        <div class="stack" style="gap:10px">${weak.map(w => `
          <div class="icon-row"><b style="flex:1">${esc(w.topic)}</b>${sevPill(w.severity)}
          <a class="pill pill-link" href="#/lessons?topic=${encodeURIComponent(w.topic)}">📚 ${t('pr_lesson')}</a></div>`).join('')}</div>
      </div>` : `<div class="card empty-card"><div class="empty-ico">🎯</div><p class="muted">${t('pr_no_weak')}</p></div>`}
    </div>

    <div class="card" style="margin-top:16px">
      <h3>🎓 ${t('dip_title')}</h3>
      ${s.diplomas.length ? s.diplomas.map((d, i) => `<div class="dip-row">
        ${rankSVG(d.to || C.nextLevel(d.level), 32)}
        <div style="flex:1"><b>${d.level} → ${d.to || C.nextLevel(d.level)}</b><br/>
          <small class="muted">${new Date(d.date).toLocaleDateString()} · ${d.score}/100</small></div>
        <button class="btn btn-ghost btn-sm" data-act="dip-view" data-i="${i}" aria-label="${t('dip_view')}">👁️</button>
        <button class="btn btn-ghost btn-sm" data-act="dip-down" data-i="${i}" aria-label="${t('dip_download')}">⬇️</button>
      </div>`).join('') : `<p class="muted" style="margin-top:6px">${t('dip_none')}</p>`}
    </div>`;
};
