/* UI strings. English by default, Spanish via the toggle.
 * t('key', {n: 3}) replaces {n}. Missing key -> the key itself (visible, so it gets fixed).
 */
import * as store from './store.js';

const EN = {
  // nav
  nav_home: 'Home', nav_practice: 'Practice', nav_vocab: 'Vocabulary', nav_lessons: 'Lessons', nav_profile: 'Profile',
  // welcome
  wel_tag: 'Your personal AI English coach',
  wel_sub: 'Adaptive exercises, real conversations with voice, lessons built from your own mistakes — and a rank system that makes progress addictive.',
  wel_f1: 'Exercises that adapt to your level', wel_f2: 'Talk with your coach — voice included', wel_f3: 'Climb ranks from Bronze to Diamond',
  wel_cta: 'Get started', wel_priv: 'Everything stays on your device. No accounts, no servers.',
  // setup
  setup_title: 'One last step: your Gemini key',
  setup_body: 'The app uses Google’s AI to correct you and talk with you. It needs <b>your own free key</b>, stored only on this device. 3 steps, under a minute.',
  setup_s1: 'Open <a href="{url}" target="_blank" rel="noopener"><b>aistudio.google.com/apikey</b></a> and sign in with your Google account.',
  setup_s2: 'Press <b>“Create API key”</b> and accept. Google generates a long key: copy all of it.',
  setup_s3: 'Paste it below.',
  setup_ph: 'Paste your key here', setup_btn: 'Save and start', setup_check: 'Checking your key with Google…',
  setup_priv: 'The key never leaves this device. The app talks directly to Google, with no server in between.',
  // onboarding
  ob_step: 'Step {a} of {b}',
  ob_profile: 'Let’s meet you', ob_profile_sub: 'Your coach adapts everything to you.',
  ob_name: 'First name', ob_lastname: 'Last name (optional)', ob_age: 'Age', ob_photo: 'Add a photo', ob_photo_change: 'Change photo',
  ob_goal: 'Why are you learning English?', ob_goal_sub: 'Your conversations and topics will match this goal.',
  ob_variant: 'Which English do you prefer?', ob_variant_sub: 'Vocabulary, spelling and voices will match.',
  ob_level: 'What’s your level?', ob_level_sub: 'Pick your rank — or let the coach measure you.',
  ob_test_btn: 'I’m not sure — take the placement test', ob_test_time: '~15–20 min, evaluated by AI',
  ob_hours: 'How much time per day?', ob_hours_sub: 'A realistic goal keeps the streak alive.',
  ob_done: 'You’re all set, {name}!', ob_done_sub: 'Your journey starts at', ob_go: 'Enter the app',
  ob_back: 'Back', ob_next: 'Next', ob_name_req: 'Write your name to continue.',
  // placement
  pl_title: 'Placement test', pl_intro_1: 'Three short parts: <b>grammar & vocabulary</b>, <b>reading</b> and a short <b>writing</b>.',
  pl_intro_2: 'It takes about <b>15–20 minutes</b>. Answer without help — the result is for you.',
  pl_start: 'Start the test', pl_generating: 'Preparing your test…', pl_part1: 'Part 1 · Grammar & vocabulary',
  pl_part2: 'Part 2 · Reading', pl_part3: 'Part 3 · Writing', pl_words: 'about 40–60 words',
  pl_submit: 'Finish and evaluate', pl_eval: 'The coach is evaluating your English…',
  pl_result: 'Your level is', pl_apply: 'Start at this level', pl_answer_more: 'Answer at least half of the questions first.',
  // dashboard
  dash_hi: 'Hi, {name}', dash_streak: 'day streak', dash_today: 'today', dash_minutes: 'total minutes', dash_last: 'last score',
  dash_level: 'Your rank', dash_towards: '{p}/100 towards {next}', dash_max: 'Top rank reached',
  dash_do: 'What shall we do today?', dash_activity: 'Last 14 days', dash_bytype: 'Performance by skill',
  dash_focus: 'Focus areas', dash_recent: 'Recent scores', dash_tips: 'Coach recommends',
  dash_acts: '{n} activities · {m} min', dash_empty_perf: 'Do a couple of exercises and your progress will appear here.',
  // exercises
  ex_title: 'Practice', ex_sub: 'Generated at your level, focused on your weak spots.',
  ex_topic: 'Specific topic (optional)', ex_topic_ph: 'phrasal verbs, conditionals…',
  ex_uoe: 'Use of English', ex_uoe_d: 'Grammar & structures', ex_read: 'Reading', ex_read_d: 'Text + questions',
  ex_listen: 'Listening', ex_listen_d: 'Real-voice dialogue', ex_write: 'Writing', ex_write_d: 'Write, get corrected',
  ex_speak: 'Speaking', ex_speak_d: 'Roleplay with your coach',
  ex_generating: 'Generating your exercise…', ex_grading: 'Correcting…', ex_questions: '{n} questions', ex_level: 'Level {l}',
  ex_listen_hint: 'Listen to the dialogue and answer.', ex_play: 'Play the dialogue', ex_transcript: 'Show transcript (only if stuck)',
  ex_your_answer: 'Your answer', ex_check: 'Check my answers', ex_words: '{n} words', ex_write_ph: 'Write your text in English…',
  ex_write_more: 'Write a bit more so the coach can correct you.', ex_answer_one: 'Answer at least one question.',
  ex_correct_of: '{a} of {b} correct', ex_expected: 'Correct answer', ex_review: 'To review', ex_again: 'Another exercise',
  ex_home: 'Back to home', ex_corrected: 'Your corrected text', ex_improved: 'Improved version', ex_criteria: 'By criteria',
  ex_voice: 'By voice', ex_text: 'By text', ex_pick_role: 'Choose who you talk to. You’ll get a full evaluation at the end.',
  // speaking / chat
  sp_thinking: 'Thinking…', sp_end: 'Finish & evaluate', sp_say_hi: 'Say hello to start!', sp_type: 'Type in English…',
  sp_connecting: 'Connecting…', sp_ready: 'Ready', sp_listening: 'Listening', sp_speaking: 'Speaking', sp_closed: 'Connection closed',
  sp_you: 'You', sp_coach: 'Coach', sp_estimated: 'Estimated level in this conversation', sp_better: 'You could have said',
  sp_tips: 'Tips', sp_eval: 'Evaluating your conversation…', sp_no_time: 'There was no time to talk. Try again.',
  sp_mic_err: 'Could not start the voice conversation: ',
  // vocab
  vb_title: 'Vocabulary', vb_sub: 'Words you missed, saved so you actually learn them.',
  vb_empty: 'No words yet. When you make vocabulary mistakes in exercises, they land here.',
  vb_practice: 'Practice {n} words', vb_practicing: 'Building your practice…', vb_missed: 'missed {n}×',
  vb_mastered: 'mastered', vb_learning: 'learning',
  // lessons
  ls_title: 'Lessons', ls_sub: 'Corrective lessons: explanation → examples → rules → practice → tips.',
  ls_topic: 'Lesson topic', ls_topic_ph: 'present perfect, phrasal verbs…', ls_gen: 'Generate lesson',
  ls_suggested: 'Suggested from your mistakes', ls_yours: 'Your lessons', ls_writing: 'Writing your lesson…',
  ls_topic_req: 'Write a topic for the lesson.', ls_explain: 'Explanation', ls_rules: 'Rules & common mistakes',
  ls_practice: 'Mini practice', ls_tips: 'Tips', ls_check: 'Check', ls_mastered: 'Topic mastered! It leaves your focus areas.',
  ls_improved: 'Severity of this weakness reduced.', ls_other: 'Other lessons', ls_examples: 'Examples',
  // profile
  pf_title: 'Profile', pf_name: 'First name', pf_lastname: 'Last name', pf_goal: 'Goal', pf_variant: 'English variant',
  pf_level: 'Level', pf_retest: 'Retake the placement test', pf_hours: 'Daily goal', pf_save: 'Save changes', pf_saved: 'Profile saved.',
  pf_lang: 'App language', pf_reminder: 'Daily reminder', pf_reminder_sub: 'One nudge a day to keep the streak.',
  pf_rem_on: 'Enable', pf_rem_off: 'Disable', pf_data: 'Your data', pf_data_sub: 'Everything lives on this device. Export a backup before switching devices.',
  pf_export: 'Export backup', pf_import: 'Restore', pf_key: 'Gemini key', pf_model: 'Model in use now',
  pf_key_change: 'Change my API key', pf_reset: 'Delete everything and start over',
  pf_reset_confirm: 'This deletes your profile, progress and lessons from this device. Sure?',
  pf_restored: 'Backup restored.', pf_bad_backup: 'That file is not an AI English Coach backup.',
  pf_ranks: 'Rank ladder', pf_no_quota: 'no quota available',
  // severity + ranks
  sev_title: 'What do these colors mean?', sev_body: 'Each weakness has a severity from 1 to 5 — how often and how seriously it blocks your English.',
  sev_1: 'Minor', sev_2: 'Moderate', sev_3: 'Frequent', sev_4: 'Important', sev_5: 'Critical',
  rank_bronze: 'Bronze', rank_silver: 'Silver', rank_gold: 'Gold', rank_platinum: 'Platinum', rank_obsidian: 'Obsidian', rank_diamond: 'Diamond',
  level_up: 'You ranked up to {r}!', level_down: 'You dropped to {r}. Let’s get it back.',
  // goal step
  ob_target: 'What is your goal?', ob_target_sub: 'Target level, timeframe and study days — your coach plans around them.',
  ob_target_level: 'I want to reach', ob_target_months: 'In about', ob_target_days: 'I will study on',
  m_1: '1 month', m_3: '3 months', m_6: '6 months', m_12: '1 year',
  d_mon: 'Mon', d_tue: 'Tue', d_wed: 'Wed', d_thu: 'Thu', d_fri: 'Fri', d_sat: 'Sat', d_sun: 'Sun',
  dash_goal: 'Your goal', dash_goal_line: '{from} → {to} · {months} · {days}',
  // certification exam
  exam_ready_title: 'Promotion exam unlocked!',
  exam_ready_body: 'You reached 100/100. Pass the {level} certification exam (score {pass}+) to rank up to {next}.',
  exam_take: 'Take the exam', exam_title: '{level} Certification exam',
  exam_intro: 'A full review of {level}, Cambridge-style: Use of English, reading and a short writing. You need {pass}/100 to be promoted.',
  exam_generating: 'Preparing your exam…', exam_grading: 'Grading your exam…',
  exam_passed: 'PASSED — {score}/100', exam_failed: '{score}/100 — not this time',
  exam_failed_body: 'You need {pass}+. Your score went to 85/100: polish the weak spots and try again.',
  exam_diploma: 'View my diploma', exam_retry: 'Back to practice',
  // diplomas
  dip_title: 'Diplomas', dip_none: 'Pass a promotion exam and your diploma will appear here.',
  dip_download: 'Download', dip_cert: 'Certificate of Achievement', dip_text: 'This certifies that',
  dip_passed: 'has successfully passed the {level} certification exam', dip_score: 'with a score of {score}/100',
  dip_ceo: 'CEO, AI English Coach', dip_student: 'Student',
  // photos
  ex_photos: 'Photos', ex_photos_d: 'Compare two pictures',
  ph_generating: 'Creating your two photos…', ph_title: 'Describe & compare',
  ph_a: 'Photo A', ph_b: 'Photo B',
  // chat niceties
  chat_over: 'When the coach says goodbye, press "Finish & evaluate" to get your result.',
  // misc
  loading: 'Working…', error_generic: 'Something failed. Try again.', close: 'Close',
  quota_out: 'You’ve run out of Gemini tokens for now. Try again later.',
};

const ES = {
  nav_home: 'Inicio', nav_practice: 'Práctica', nav_vocab: 'Vocabulario', nav_lessons: 'Lecciones', nav_profile: 'Perfil',
  wel_tag: 'Tu coach de inglés personal con IA',
  wel_sub: 'Ejercicios adaptativos, conversaciones reales con voz, lecciones nacidas de tus propios fallos — y un sistema de rangos que engancha.',
  wel_f1: 'Ejercicios que se adaptan a tu nivel', wel_f2: 'Habla con tu coach — con voz incluida', wel_f3: 'Sube de rango: de Bronce a Diamante',
  wel_cta: 'Empezar', wel_priv: 'Todo se queda en tu dispositivo. Sin cuentas, sin servidores.',
  setup_title: 'Un último paso: tu clave de Gemini',
  setup_body: 'La app usa la IA de Google para corregirte y hablar contigo. Necesita <b>tu propia clave gratuita</b>, guardada solo en este dispositivo. 3 pasos, menos de un minuto.',
  setup_s1: 'Abre <a href="{url}" target="_blank" rel="noopener"><b>aistudio.google.com/apikey</b></a> e inicia sesión con tu cuenta de Google.',
  setup_s2: 'Pulsa <b>«Create API key»</b> y acepta. Google genera una clave larga: cópiala entera.',
  setup_s3: 'Pégala aquí abajo.',
  setup_ph: 'Pega aquí tu clave', setup_btn: 'Guardar y empezar', setup_check: 'Comprobando la clave con Google…',
  setup_priv: 'La clave no sale de este dispositivo. La app habla directamente con Google, sin ningún servidor por medio.',
  ob_step: 'Paso {a} de {b}',
  ob_profile: 'Vamos a conocerte', ob_profile_sub: 'Tu coach lo adapta todo a ti.',
  ob_name: 'Nombre', ob_lastname: 'Apellido (opcional)', ob_age: 'Edad', ob_photo: 'Añade una foto', ob_photo_change: 'Cambiar foto',
  ob_goal: '¿Para qué quieres el inglés?', ob_goal_sub: 'Tus conversaciones y temas seguirán este objetivo.',
  ob_variant: '¿Qué inglés prefieres?', ob_variant_sub: 'Vocabulario, ortografía y voces irán a juego.',
  ob_level: '¿Cuál es tu nivel?', ob_level_sub: 'Elige tu rango — o deja que el coach te mida.',
  ob_test_btn: 'No lo sé — hacer la prueba de nivel', ob_test_time: '~15–20 min, evaluada por la IA',
  ob_hours: '¿Cuánto tiempo al día?', ob_hours_sub: 'Una meta realista mantiene la racha viva.',
  ob_done: '¡Todo listo, {name}!', ob_done_sub: 'Tu viaje empieza en', ob_go: 'Entrar en la app',
  ob_back: 'Atrás', ob_next: 'Siguiente', ob_name_req: 'Escribe tu nombre para continuar.',
  pl_title: 'Prueba de nivel', pl_intro_1: 'Tres partes cortas: <b>gramática y vocabulario</b>, <b>reading</b> y un <b>writing</b> breve.',
  pl_intro_2: 'Dura unos <b>15–20 minutos</b>. Responde sin ayuda — el resultado es para ti.',
  pl_start: 'Empezar la prueba', pl_generating: 'Preparando tu prueba…', pl_part1: 'Parte 1 · Gramática y vocabulario',
  pl_part2: 'Parte 2 · Reading', pl_part3: 'Parte 3 · Writing', pl_words: 'unas 40–60 palabras',
  pl_submit: 'Terminar y evaluar', pl_eval: 'El coach está evaluando tu inglés…',
  pl_result: 'Tu nivel es', pl_apply: 'Empezar en este nivel', pl_answer_more: 'Responde al menos la mitad de las preguntas.',
  dash_hi: 'Hola, {name}', dash_streak: 'días de racha', dash_today: 'hoy', dash_minutes: 'minutos totales', dash_last: 'última nota',
  dash_level: 'Tu rango', dash_towards: '{p}/100 hacia {next}', dash_max: 'Rango máximo alcanzado',
  dash_do: '¿Qué hacemos hoy?', dash_activity: 'Últimos 14 días', dash_bytype: 'Rendimiento por destreza',
  dash_focus: 'A reforzar', dash_recent: 'Últimas notas', dash_tips: 'El coach recomienda',
  dash_acts: '{n} actividades · {m} min', dash_empty_perf: 'Haz un par de ejercicios y tu progreso aparecerá aquí.',
  ex_title: 'Práctica', ex_sub: 'Generada a tu nivel, centrada en tus puntos flojos.',
  ex_topic: 'Tema concreto (opcional)', ex_topic_ph: 'phrasal verbs, condicionales…',
  ex_uoe: 'Use of English', ex_uoe_d: 'Gramática y estructuras', ex_read: 'Reading', ex_read_d: 'Texto + preguntas',
  ex_listen: 'Listening', ex_listen_d: 'Diálogo con voz real', ex_write: 'Writing', ex_write_d: 'Escribe y te corrijo',
  ex_speak: 'Speaking', ex_speak_d: 'Roleplay con tu coach',
  ex_generating: 'Generando tu ejercicio…', ex_grading: 'Corrigiendo…', ex_questions: '{n} preguntas', ex_level: 'Nivel {l}',
  ex_listen_hint: 'Escucha el diálogo y responde.', ex_play: 'Escuchar el diálogo', ex_transcript: 'Ver transcripción (solo si te atascas)',
  ex_your_answer: 'Tu respuesta', ex_check: 'Corregir', ex_words: '{n} palabras', ex_write_ph: 'Escribe aquí tu texto en inglés…',
  ex_write_more: 'Escribe un poco más para que el coach pueda corregirte.', ex_answer_one: 'Responde al menos una pregunta.',
  ex_correct_of: '{a} de {b} correctas', ex_expected: 'Respuesta correcta', ex_review: 'A repasar', ex_again: 'Otro ejercicio',
  ex_home: 'Volver al inicio', ex_corrected: 'Tu texto corregido', ex_improved: 'Versión mejorada', ex_criteria: 'Por criterio',
  ex_voice: 'Por voz', ex_text: 'Por escrito', ex_pick_role: 'Elige con quién hablas. Al final tendrás una evaluación completa.',
  sp_thinking: 'Pensando…', sp_end: 'Terminar y evaluar', sp_say_hi: '¡Di hola para empezar!', sp_type: 'Escribe en inglés…',
  sp_connecting: 'Conectando…', sp_ready: 'Preparado', sp_listening: 'Te escucho', sp_speaking: 'Hablando', sp_closed: 'Conexión cerrada',
  sp_you: 'Tú', sp_coach: 'Coach', sp_estimated: 'Nivel estimado en esta conversación', sp_better: 'Podrías haber dicho',
  sp_tips: 'Consejos', sp_eval: 'Evaluando tu conversación…', sp_no_time: 'No ha dado tiempo a hablar. Prueba otra vez.',
  sp_mic_err: 'No se pudo iniciar la conversación por voz: ',
  vb_title: 'Vocabulario', vb_sub: 'Palabras que fallaste, guardadas para que las aprendas de verdad.',
  vb_empty: 'Aún no hay palabras. Cuando falles vocabulario en los ejercicios, aterrizará aquí.',
  vb_practice: 'Practicar {n} palabras', vb_practicing: 'Montando tu práctica…', vb_missed: 'fallada {n}×',
  vb_mastered: 'dominada', vb_learning: 'aprendiendo',
  ls_title: 'Lecciones', ls_sub: 'Lecciones correctivas: explicación → ejemplos → reglas → práctica → tips.',
  ls_topic: 'Tema de la lección', ls_topic_ph: 'present perfect, phrasal verbs…', ls_gen: 'Generar lección',
  ls_suggested: 'Sugeridas por tus fallos', ls_yours: 'Tus lecciones', ls_writing: 'Escribiendo tu lección…',
  ls_topic_req: 'Escribe un tema para la lección.', ls_explain: 'Explicación', ls_rules: 'Reglas y errores típicos',
  ls_practice: 'Mini práctica', ls_tips: 'Consejos', ls_check: 'Comprobar', ls_mastered: '¡Tema dominado! Sale de tus puntos flojos.',
  ls_improved: 'Bajamos la severidad de este fallo.', ls_other: 'Otras lecciones', ls_examples: 'Ejemplos',
  pf_title: 'Perfil', pf_name: 'Nombre', pf_lastname: 'Apellido', pf_goal: 'Objetivo', pf_variant: 'Variante de inglés',
  pf_level: 'Nivel', pf_retest: 'Repetir la prueba de nivel', pf_hours: 'Meta diaria', pf_save: 'Guardar cambios', pf_saved: 'Perfil guardado.',
  pf_lang: 'Idioma de la app', pf_reminder: 'Recordatorio diario', pf_reminder_sub: 'Un aviso al día para no romper la racha.',
  pf_rem_on: 'Activar', pf_rem_off: 'Desactivar', pf_data: 'Tus datos', pf_data_sub: 'Todo vive en este dispositivo. Exporta una copia antes de cambiar de aparato.',
  pf_export: 'Exportar copia', pf_import: 'Restaurar', pf_key: 'Clave de Gemini', pf_model: 'Modelo en uso ahora',
  pf_key_change: 'Cambiar mi API key', pf_reset: 'Borrar todo y empezar de cero',
  pf_reset_confirm: 'Esto borra tu perfil, tu progreso y tus lecciones de este dispositivo. ¿Seguro?',
  pf_restored: 'Copia restaurada.', pf_bad_backup: 'Ese archivo no es una copia de AI English Coach.',
  pf_ranks: 'Escalera de rangos', pf_no_quota: 'sin cuota disponible',
  sev_title: '¿Qué significan estos colores?', sev_body: 'Cada punto flojo tiene una severidad de 1 a 5: cuánto y con qué frecuencia bloquea tu inglés.',
  sev_1: 'Leve', sev_2: 'Moderado', sev_3: 'Frecuente', sev_4: 'Importante', sev_5: 'Crítico',
  rank_bronze: 'Bronce', rank_silver: 'Plata', rank_gold: 'Oro', rank_platinum: 'Platino', rank_obsidian: 'Obsidiana', rank_diamond: 'Diamante',
  level_up: '¡Has subido a {r}!', level_down: 'Has bajado a {r}. A por ello.',
  ob_target: '¿Cuál es tu meta?', ob_target_sub: 'Nivel objetivo, plazo y días de estudio — tu coach planifica con ellos.',
  ob_target_level: 'Quiero llegar a', ob_target_months: 'En unos', ob_target_days: 'Estudiaré los',
  m_1: '1 mes', m_3: '3 meses', m_6: '6 meses', m_12: '1 año',
  d_mon: 'Lun', d_tue: 'Mar', d_wed: 'Mié', d_thu: 'Jue', d_fri: 'Vie', d_sat: 'Sáb', d_sun: 'Dom',
  dash_goal: 'Tu meta', dash_goal_line: '{from} → {to} · {months} · {days}',
  exam_ready_title: '¡Examen de ascenso desbloqueado!',
  exam_ready_body: 'Has llegado a 100/100. Aprueba el examen de certificación de {level} (nota {pass}+) para ascender a {next}.',
  exam_take: 'Hacer el examen', exam_title: 'Examen de certificación {level}',
  exam_intro: 'Un repaso completo de {level}, estilo Cambridge: Use of English, reading y un writing corto. Necesitas {pass}/100 para ascender.',
  exam_generating: 'Preparando tu examen…', exam_grading: 'Corrigiendo tu examen…',
  exam_passed: 'APROBADO — {score}/100', exam_failed: '{score}/100 — esta vez no',
  exam_failed_body: 'Necesitas {pass}+. Tu marcador pasa a 85/100: pule los fallos y vuelve a intentarlo.',
  exam_diploma: 'Ver mi diploma', exam_retry: 'Volver a practicar',
  dip_title: 'Diplomas', dip_none: 'Aprueba un examen de ascenso y tu diploma aparecerá aquí.',
  dip_download: 'Descargar', dip_cert: 'Certificate of Achievement', dip_text: 'This certifies that',
  dip_passed: 'has successfully passed the {level} certification exam', dip_score: 'with a score of {score}/100',
  dip_ceo: 'CEO, AI English Coach', dip_student: 'Student',
  ex_photos: 'Fotos', ex_photos_d: 'Compara dos imágenes',
  ph_generating: 'Creando tus dos fotos…', ph_title: 'Describe y compara',
  ph_a: 'Foto A', ph_b: 'Foto B',
  chat_over: 'Cuando el coach se despida, pulsa «Terminar y evaluar» para ver tu resultado.',
  loading: 'Trabajando…', error_generic: 'Algo ha fallado. Vuelve a intentarlo.', close: 'Cerrar',
  quota_out: 'Te has quedado sin tokens de Gemini por ahora. Vuelve a intentarlo más tarde.',
};

/* Goal keys stay in Spanish internally (they key GOAL_ROLES); labels translate. */
export const GOAL_LABELS = {
  'Viajar al extranjero': { en: 'Travel abroad', es: 'Viajar al extranjero', ico: '✈️' },
  'Erasmus o estudios internacionales': { en: 'Erasmus / study abroad', es: 'Erasmus o estudios', ico: '🎓' },
  'Trabajo y entrevistas laborales': { en: 'Work & job interviews', es: 'Trabajo y entrevistas', ico: '💼' },
  'Mejorar el currículum': { en: 'Boost my CV', es: 'Mejorar el currículum', ico: '📄' },
  'Inglés para programación o tecnología': { en: 'Tech & programming', es: 'Programación y tecnología', ico: '💻' },
  'Certificación oficial': { en: 'Official certificate', es: 'Certificación oficial', ico: '🏅' },
  'Conversación diaria': { en: 'Everyday conversation', es: 'Conversación diaria', ico: '💬' },
  'Hobby o crecimiento personal': { en: 'Hobby & personal growth', es: 'Hobby y crecimiento', ico: '🌱' },
  'Negocios y clientes internacionales': { en: 'Business & clients', es: 'Negocios y clientes', ico: '🤝' },
};

export function lang() {
  return store.load().settings.lang === 'es' ? 'es' : 'en';
}

export function setLang(l) {
  store.load().settings.lang = l === 'es' ? 'es' : 'en';
  store.save();
}

export function t(key, vars) {
  const dict = lang() === 'es' ? ES : EN;
  let s = dict[key] ?? EN[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v);
  return s;
}

export const goalLabel = key => (GOAL_LABELS[key] ? GOAL_LABELS[key][lang()] : key);
export const goalIcon = key => GOAL_LABELS[key]?.ico || '🎯';
