/* Practice reminders.
 *
 * A PWA with no server of its own cannot wake itself up: iOS only delivers
 * notifications that come from a push server, and Android dropped scheduled
 * triggers. So here a reminder fires while the app is open (or when it is
 * reopened after the chosen hour). The Android APK build swaps this for real
 * system notifications through Capacitor — see capacitor/README.md.
 */
import * as store from './store.js';
import * as C from './coach.js';
import { lang } from './i18n.js';

// Bilingual copy lives here to keep i18n.js UI-only
const MSG = {
  en: {
    body_streak: n => `You are on a ${n}-day streak. Do not break it: 10 minutes is enough.`,
    body: 'Time to practise English. One quick exercise and done.',
    off: 'Reminders disabled.', on: 'Daily reminder enabled.',
    no_perm: 'Notification permission was not granted. You can enable it in settings.',
    no_support: 'This browser does not allow notifications. On iPhone, install the app to your home screen first.',
  },
  es: {
    body_streak: n => `Llevas ${n} días seguidos. No rompas la racha: 10 minutos bastan.`,
    body: 'Momento de practicar inglés. Un ejercicio rápido y listo.',
    off: 'Recordatorios desactivados.', on: 'Recordatorio diario activado.',
    no_perm: 'No has dado permiso de notificaciones. Puedes activarlo en los ajustes.',
    no_support: 'Este navegador no permite notificaciones. En iPhone instala la app en la pantalla de inicio primero.',
  },
};
const msg = () => MSG[lang()];

const SHOWN_KEY = 'aec.lastReminder';
const NOTIF_ID = 1;
let timer = null;

/* Inside the Android APK there is a real system scheduler; in a browser there is not. */
const native = () => window.Capacitor?.Plugins?.LocalNotifications || null;

export const canNotify = () => !!native() || 'Notification' in window;

async function scheduleNative(hour) {
  const LN = native();
  await LN.cancel({ notifications: [{ id: NOTIF_ID }] }).catch(() => {});
  await LN.schedule({
    notifications: [{
      id: NOTIF_ID,
      title: 'AI English Coach',
      body: msg().body,
      schedule: { on: { hour, minute: 0 }, allowWhileIdle: true },
    }],
  });
}

function alreadyStudiedToday() {
  return C.studyHistory(1)[0].exercises > 0;
}

function fire() {
  const today = new Date().toISOString().slice(0, 10);
  if (localStorage.getItem(SHOWN_KEY) === today || alreadyStudiedToday()) return;
  if (!canNotify() || Notification.permission !== 'granted') return;
  localStorage.setItem(SHOWN_KEY, today);
  const user = store.load().user;
  const streak = user?.streak_days || 0;
  new Notification('AI English Coach', {
    body: streak > 1 ? msg().body_streak(streak) : msg().body,
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    tag: 'aec-daily',
  });
}

/* Check now, then again at the chosen hour for as long as the app stays open. */
export function initReminders() {
  clearTimeout(timer);
  const { reminders_on: on, reminder_hour: hour } = store.load().settings;
  if (!on) return;
  if (native()) return void scheduleNative(hour).catch(err => console.warn('reminder', err));
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  const now = new Date();
  if (now.getHours() >= hour) fire();

  const next = new Date();
  next.setHours(hour, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  timer = setTimeout(() => { fire(); initReminders(); }, next - now);
}

export async function toggleReminders() {
  const s = store.load();
  if (s.settings.reminders_on) {
    s.settings.reminders_on = false;
    store.save();
    clearTimeout(timer);
    await native()?.cancel({ notifications: [{ id: NOTIF_ID }] }).catch(() => {});
    return { ok: true, message: msg().off };
  }
  if (native()) {
    const { display } = await native().requestPermissions();
    if (display !== 'granted') {
      return { ok: false, message: msg().no_perm };
    }
    s.settings.reminders_on = true;
    store.save();
    await scheduleNative(s.settings.reminder_hour);
    return { ok: true, message: msg().on };
  }
  if (!canNotify()) {
    return { ok: false, message: msg().no_support };
  }
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return { ok: false, message: msg().no_perm };
  }
  s.settings.reminders_on = true;
  store.save();
  initReminders();
  return { ok: true, message: 'Recordatorios activados.' };
}

export function setReminderHour(hour) {
  const s = store.load();
  s.settings.reminder_hour = Math.max(0, Math.min(23, parseInt(hour, 10) || 19));
  store.save();
  initReminders();
}

