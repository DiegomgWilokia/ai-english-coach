/* Prompt builders — direct port of app/services/gemini_service.py.
 * The quality of the coach lives in these strings, so they are kept verbatim.
 */
export const SYSTEM_PERSONALITY =
  "You are 'Coach', an expert, friendly, motivating but rigorous English teacher. " +
  'You explain mistakes simply, celebrate progress, never humiliate the student, ' +
  "and you always adapt to the learner's CEFR level, learning goal, and " +
  'preferred English variant (British or American).';

const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const sample = (arr, k) => [...arr].sort(() => Math.random() - 0.5).slice(0, k);
const seed = () => Math.floor(10000 + Math.random() * 90000);
const variantOf = u => (u.preferred_english === 'british' ? 'British' : 'American');
// Feedback language follows the UI language (default English)
const outLang = u => (u.ui_lang === 'es' ? 'Spanish' : 'English');

export function userProfileBlock(user) {
  return (
    'Student profile:\n' +
    `- Name: ${user.name}\n` +
    `- Age: ${user.age}\n` +
    `- Goal: ${user.goal}\n` +
    `- Current CEFR level: ${user.current_level}\n` +
    `- Level progress score (0-100): ${user.level_score}\n` +
    `- Preferred English: ${user.preferred_english} English\n` +
    (user.target_level ? `- Personal goal: reach ${user.target_level} in ${user.target_months || 3} months, studying ${(user.study_days || []).join('/') || 'most days'}\n` : '') +
    `- Known weaknesses: ${(user.weaknesses || []).join(', ') || 'none yet'}\n` +
    `- Strengths: ${(user.strengths || []).join(', ') || 'none yet'}\n`
  );
}

const UOE_KINDS = ['fill_blank', 'multiple_choice', 'transformation', 'correction', 'word_formation', 'open_cloze', 'key_word_transformation'];
const UOE_TOPICS = [
  'phrasal verbs', 'conditionals', 'reported speech', 'passive voice',
  'present perfect vs past simple', 'modal verbs', 'relative clauses',
  'articles', 'prepositions of time', 'prepositions of place',
  'tenses review', 'linking words', 'if-clauses', 'used to / be used to',
  'make vs do', 'have vs have got', 'comparatives & superlatives',
  'countable/uncountable nouns', 'quantifiers', 'gerunds vs infinitives',
];
const READING_STYLES = ['short article', 'personal email', 'informal blog post', 'news story', 'interview excerpt', 'product review', 'short story', 'professional message', 'Wikipedia-style entry'];
const WRITING_FORMATS = ['informal email to a friend', 'formal email to a manager', 'opinion paragraph', 'short story (100-150 words)', 'product review', 'description of a photo', 'professional message on LinkedIn', 'complaint email', 'request for information'];
const LISTENING_STYLES = [
  'casual chat between two friends',
  'short job interview',
  'podcast episode intro on an interesting topic',
  'person being interviewed about their daily life',
  'team meeting discussing a project',
  'customer talking to support agent',
  'two colleagues debating a decision',
  'person telling a short anecdote to a friend',
  'phone call between client and freelancer',
  'two travellers sharing tips',
];

export function buildExercisePrompt(user, exerciseType, topic, n, recentTopics = []) {
  const variant = variantOf(user);
  const weak = (user.weaknesses || []).join(', ') || 'none';
  if (!topic && exerciseType === 'use_of_english') {
    const fresh = UOE_TOPICS.filter(x => !recentTopics.includes(x));
    topic = pick(fresh.length ? fresh : UOE_TOPICS);
  }

  const base =
    `[seed:${seed()}] Student: ${user.current_level}, goal: ${user.goal}, ` +
    `variant: ${variant}, weaknesses: ${weak}. ` +
    `Topic: ${topic || 'auto-pick relevant to goal'}. ` +
    (recentTopics.length ? `AVOID repeating these recent topics/formats: ${recentTopics.join('; ')}. ` : '') +
    `Use ${variant} spelling. Output ONLY valid JSON, no markdown.`;

  if (exerciseType === 'use_of_english') {
    const kinds = sample(UOE_KINDS, 3);
    return `${base}

Generate ${n} short Use-of-English items. MIX these formats: ${kinds.join(', ')}.
Vary them — do NOT make all items the same kind. Each item must feel different from the others.

JSON shape (single object, NOT a list):
{
  "exercise_type":"use_of_english","topic":"...","level":"${user.current_level}",
  "items":[{"id":1,"kind":"fill_blank","prompt":"...with ___...","options":null,"answer":"...","topic":"phrasal verbs"}]
}`;
  }

  if (exerciseType === 'reading') {
    return `${base}

Generate ONE reading exercise in the style of a: ${pick(READING_STYLES)}.
It MUST contain:
1) A "passage" field with the full text (180-280 words). This is MANDATORY — do not leave it empty.
2) An "items" array with ${n} comprehension questions about the passage (mix multiple_choice and short open).

JSON shape (passage REQUIRED):
{
  "exercise_type":"reading",
  "topic":"...",
  "level":"${user.current_level}",
  "passage":"<<the full 180-280 word passage in ${variant} English goes HERE — required>>",
  "items":[
    {"id":1,"kind":"multiple_choice","prompt":"...?","options":["a","b","c","d"],"answer":"a","topic":"detail"}
  ]
}

The passage must NEVER be empty. Output ONLY valid JSON, no markdown.`;
  }

  if (exerciseType === 'writing') {
    return `${base}

Generate ONE writing task in the format of: ${pick(WRITING_FORMATS)}.
Adapt the scenario to the student's goal and level.

JSON shape:
{
  "exercise_type":"writing","topic":"...","level":"${user.current_level}",
  "prompt":"clear writing instruction","min_words":80,"max_words":180
}`;
  }
  return base;
}

export function buildListeningDialoguePrompt(user, topic, nQuestions) {
  const variant = variantOf(user);
  return `[seed:${seed()}] Student: ${user.current_level} CEFR, goal: ${user.goal}, variant: ${variant}.
Generate a short, natural two-speaker dialogue (12-20 turns) in ${variant} English in the form of: ${pick(LISTENING_STYLES)}.
Topic preference: "${topic || 'something relevant to the goal'}".
The dialogue must sound like a real conversation, adapted to level ${user.current_level}.
Then create ${nQuestions} comprehension questions about the dialogue.

Use exactly TWO speakers called "Alex" and "Sam" (gender-neutral).
Each line MUST start with "Alex:" or "Sam:" — never anything else.

Output STRICT JSON, no markdown:
{
  "exercise_type":"listening",
  "topic":"...",
  "level":"${user.current_level}",
  "scenario":"one-line scene description",
  "dialogue":"Alex: Hi Sam, how are you?\\nSam: Great, thanks!\\nAlex: …",
  "items":[
    {"id":1,"kind":"multiple_choice","prompt":"What does Alex say about…?","options":["a","b","c"],"answer":"a","topic":"detail"}
  ]
}`;
}

export function buildGradePrompt(user, exercise, answers) {
  return `${userProfileBlock(user)}

Grade the following ${exercise.exercise_type} exercise using ${variantOf(user)} English standards.

EXERCISE:
${JSON.stringify(exercise)}

STUDENT ANSWERS:
${JSON.stringify(answers)}

IMPORTANT grading rules:
- IGNORE differences in capitalisation, surrounding punctuation, leading/trailing spaces and
  obvious typos (one or two characters off in a long word) — if the answer is semantically right,
  mark it correct.
- If the student wrote "i organised office events" and the expected is "I organised office events.",
  that is CORRECT.
- Only mark wrong when the meaning/grammar is actually wrong.

Return STRICT JSON:
{
  "score": 0-100,
  "correct_answers": int,
  "total_questions": int,
  "per_item": [
    { "id": 1, "correct": true|false, "user_answer": "...", "expected": "...", "explanation": "short why" }
  ],
  "mistakes": [
    { "topic": "phrasal verbs", "explanation": "...", "severity": 1-5 }
  ],
  "vocab": [
    { "word": "...", "meaning": "short meaning in ${outLang(user)}", "example": "natural English sentence using it" }
  ],
  "feedback": "2-4 sentences, warm, motivating, in ${outLang(user)} (examples always in English).",
  "estimated_level": "A1|A2|B1|B2|C1|C2",
  "recommendations": ["next-step exercise idea", "..."]
}
ONLY valid JSON.`;
}

export function buildWritingGradePrompt(user, prompt, text) {
  return `${userProfileBlock(user)}

The student answered the following writing task in ${variantOf(user)} English.

PROMPT:
${prompt}

STUDENT TEXT:
"""${text}"""

Return STRICT JSON:
{
  "score": 0-100,
  "corrected_text": "the text with inline corrections [wrong] -> [right]",
  "improved_version": "a fully rewritten, more natural version at one level above the student",
  "mistakes": [
    { "topic": "subject-verb agreement", "explanation": "...", "severity": 1-5 }
  ],
  "criteria": {
    "grammar": 0-100,
    "vocabulary": 0-100,
    "naturalness": 0-100,
    "clarity": 0-100,
    "register": 0-100,
    "spelling": 0-100,
    "structure": 0-100
  },
  "vocab": [
    { "word": "...", "meaning": "short meaning in ${outLang(user)}", "example": "natural English sentence using it" }
  ],
  "feedback": "Personalised advice in ${outLang(user)}, warm and practical.",
  "estimated_level": "A1|A2|B1|B2|C1|C2",
  "recommendations": ["...", "..."]
}
ONLY valid JSON.`;
}

export function buildChatSystemPrompt(user, role, scenario) {
  const variant = variantOf(user);
  return `You are roleplaying as: ${role}.
Scenario: ${scenario}

The student is a ${user.current_level} English learner whose goal is ${user.goal}.
Speak ONLY in ${variant} English. Stay in character.

Rules:
- Reply naturally as the character, 1-3 short sentences usually.
- Adapt vocabulary and speed to the student's level.
- Do NOT correct grammar in the middle of the roleplay (only at the end).
- Ask follow-up questions to keep the conversation flowing.
- Use ${variant} English vocabulary and spelling.
- If the student asks what a word or phrase means, explain it briefly in simple English, then continue in character.
- The conversation has a natural ARC: after roughly 8-12 exchanges, start wrapping up and end with a natural goodbye that fits the scene (an interviewer closes the interview, a stranger reaches their stop). Do not chat forever.
- Never break character unless the user asks to end the conversation.`;
}

export function buildChatTurnPrompt(system, history, userMessage) {
  const historyStr = history.slice(-12).map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n');
  return `${system}

CONVERSATION SO FAR:
${historyStr}

STUDENT: ${userMessage}

Reply in character. Output plain text only, no JSON, no markdown.`;
}

export function buildConversationEvalPrompt(user, messages, role) {
  const convo = messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n');
  return `${userProfileBlock(user)}

Evaluate the following roleplay conversation (the student was talking to the character: ${role}).
Assess them as ${variantOf(user)} English learners.

Use the full 0-100 range. Do not default to 65.
- 0-30: mostly unintelligible, off-topic, or unable to answer.
- 31-50: frequent grammar/vocabulary issues that block communication.
- 51-70: communication works but with clear recurring mistakes.
- 71-85: solid communication with some mistakes.
- 86-100: fluent, natural, accurate, and well adapted to the situation.
If the student repeats text, misunderstands basic questions, or gives very short/irrelevant answers, lower fluency and comprehension substantially.

CONVERSATION:
${convo}

Return STRICT JSON:
{
  "fluency": 0-100,
  "grammar": 0-100,
  "vocabulary": 0-100,
  "naturalness": 0-100,
  "comprehension": 0-100,
  "pronunciation": null,
  "score": 0-100,
  "estimated_level": "A1|A2|B1|B2|C1|C2",
  "mistakes": [{ "topic": "...", "explanation": "...", "severity": 1-5 }],
  "better_phrases": [{ "said": "...", "better": "..." }],
  "vocab": [
    { "word": "...", "meaning": "short meaning in ${outLang(user)}", "example": "natural English sentence using it" }
  ],
  "tips": ["personalised tip in ${outLang(user)}", "..."],
  "feedback": "warm summary in ${outLang(user)}",
  "next_exercise_suggestion": "string"
}
ONLY JSON.`;
}

export function buildMemoryUpdatePrompt(user, sessionSummary) {
  return `${userProfileBlock(user)}

A new session has been completed:
${JSON.stringify(sessionSummary)}

Decide how to update the student's memory.

Return STRICT JSON:
{
  "level_delta": -10..10,
  "should_level_up": true|false,
  "should_level_down": true|false,
  "new_weaknesses": [{"topic":"...", "severity":1-5}],
  "improved_weaknesses": ["topic", "..."],
  "new_strengths": ["topic", "..."],
  "recommended_exercises": ["..."],
  "coach_note": "short motivating note in ${outLang(user)} for the dashboard"
}
ONLY JSON.`;
}

export function buildLessonPrompt(user, topic, recentMistakes) {
  const variant = variantOf(user);
  const mistakesBlock = recentMistakes && recentMistakes.length ? JSON.stringify(recentMistakes) : '[]';
  return `Eres un profesor experto de inglés que escribe lecciones claras y útiles EN ESPAÑOL para un estudiante.
Perfil del estudiante:
- Nivel CEFR: ${user.current_level}
- Objetivo: ${user.goal}
- Variante preferida: ${variant} English
- Errores recientes detectados sobre este tema: ${mistakesBlock}

Genera UNA lección concreta y práctica sobre: "${topic}".

La lección debe:
- Estar redactada EN ESPAÑOL claro y cercano (tú al estudiante).
- Incluir ejemplos en INGLÉS (usando ortografía ${variant}) con su traducción al ESPAÑOL.
- Adaptarse al nivel CEFR del estudiante (no usar terminología que un ${user.current_level} no entendería).
- Mencionar explícitamente cómo evitar los errores recientes del estudiante si aplican.

Devuelve SOLO JSON válido con esta forma:
{
  "title": "Título corto en español",
  "intro": "1-3 frases de introducción en español sobre por qué importa este tema.",
  "sections": [
    {
      "heading": "Subtítulo en español",
      "content": "Explicación clara en español, 2-5 frases.",
      "examples": [
        {"en": "frase en inglés", "es": "traducción al español"}
      ]
    }
  ],
  "common_mistakes": [
    {"wrong": "frase incorrecta en inglés", "right": "frase correcta en inglés", "why": "por qué, en español"}
  ],
  "tips": ["consejo práctico 1 en español", "consejo 2"],
  "mini_exercise": {
    "prompt": "Mini ejercicio en español pidiendo al estudiante que practique",
    "items": [
      {"prompt": "frase con ___ a completar (en inglés)", "answer": "respuesta esperada"}
    ]
  }
}

Importante:
- Al menos 3 secciones útiles.
- Al menos 4 ejemplos en total.
- 2-4 errores comunes.
- 2-4 tips.
- 3-5 items en el mini ejercicio.
- SOLO JSON, sin markdown.${user.ui_lang === 'es' ? '' : `
- OVERRIDE: write ALL explanations, headings, tips and the mini exercise WORDING in clear simple ENGLISH instead of Spanish (examples stay in English; no Spanish anywhere).`}`;
}

export function buildLiveSystemPrompt(user, role, scenario) {
  const variant = variantOf(user);
  const weaknesses = (user.weaknesses || []).join(', ') || 'none';
  return `You are roleplaying as: ${role}.
Scenario: ${scenario}
The student is a ${user.current_level} English learner. Goal: ${user.goal}. Weaknesses: ${weaknesses}.
- Speak ONLY in ${variant} English, in character, 1-3 short sentences per turn.
- Adapt vocabulary and speed to the student's level.
- Do NOT correct grammar mid-conversation; that comes later in a separate evaluation step.
- Ask follow-up questions to keep the conversation flowing.
- If the student asks what a word means, explain it briefly in simple English, then continue in character.
- The conversation has a natural ARC: after roughly 8-10 exchanges, wrap up and say a natural goodbye that fits the scene. Do not talk forever.
- If the student is silent for a while, gently re-engage with a question.`;
}

/* In vocab lists, "vocab" means: words the student misused or clearly does not
 * know in THIS session. Empty array if none. (Instruction lives in the JSON shape.) */

// ---------------------------------------------------------------------------
// Placement test
// ---------------------------------------------------------------------------
export function buildPlacementTestPrompt(user) {
  const variant = variantOf(user);
  return `[seed:${seed()}] Create a CEFR placement test for an adult Spanish speaker learning ${variant} English.
Goal of the student: ${user.goal || 'general English'}.

Structure (STRICT):
1) "items": 14 short grammar/vocabulary questions covering a RANGE of levels:
   3 at A1, 3 at A2, 3 at B1, 3 at B2, 2 at C1. Mix multiple_choice and fill_blank.
   Order them roughly easiest to hardest. Tag each with its "level".
2) "reading": one ${variant} English passage (120-160 words) around B1-B2, with 3 multiple_choice questions.
3) "writing_prompt": one short personal writing task (40-60 words expected).

Output STRICT JSON, no markdown:
{
  "items":[{"id":1,"level":"A1","kind":"multiple_choice","prompt":"...","options":["a","b","c"],"answer":"a"}],
  "reading":{"passage":"...","items":[{"id":1,"kind":"multiple_choice","prompt":"...","options":["a","b","c"],"answer":"a"}]},
  "writing_prompt":"..."
}`;
}

export function buildPlacementEvalPrompt(user, test, answers, writingText) {
  return `${userProfileBlock(user)}

The student took a CEFR placement test. Estimate their level rigorously.

TEST (with correct answers):
${JSON.stringify(test)}

STUDENT ANSWERS (grammar + reading, by id):
${JSON.stringify(answers)}

STUDENT WRITING:
"""${writingText}"""

Weigh accuracy per level band: failing A2 items caps the level low; passing C1 items with a weak writing does NOT give C1.
Return STRICT JSON:
{
  "level": "A1|A2|B1|B2|C1|C2",
  "scores": { "grammar": 0-100, "vocabulary": 0-100, "reading": 0-100, "writing": 0-100 },
  "summary": "3-4 warm sentences in ${outLang(user)} explaining the result and what to work on first",
  "strengths": ["...", "..."],
  "focus": ["topic to work on", "..."]
}
ONLY JSON.`;
}

// ---------------------------------------------------------------------------
// Level-up certification exam (Cambridge-style review of the WHOLE level)
// ---------------------------------------------------------------------------
export function buildCertExamPrompt(user, level) {
  const variant = variantOf(user);
  return `[seed:${seed()}] Create a certification exam for CEFR level ${level} (${variant} English), for an adult Spanish speaker.
It must review the WHOLE level like a Cambridge exam: mix tenses, vocabulary, prepositions, connectors, word formation, phrasal verbs - varied formats, no two items alike.

Structure (STRICT):
1) "items": 10 Use-of-English questions, ALL at level ${level}, mixing multiple_choice, fill_blank, transformation and word_formation.
2) "reading": one ${variant} English passage (130-170 words) at level ${level} with 3 multiple_choice questions.
3) "writing_prompt": one writing task typical of a ${level} exam (60-90 words expected).

Output STRICT JSON, no markdown:
{
  "items":[{"id":1,"kind":"multiple_choice","prompt":"...","options":["a","b","c"],"answer":"a"}],
  "reading":{"passage":"...","items":[{"id":1,"kind":"multiple_choice","prompt":"...","options":["a","b","c"],"answer":"a"}]},
  "writing_prompt":"..."
}`;
}

export function buildCertEvalPrompt(user, level, test, answers, writingText) {
  return `${userProfileBlock(user)}

The student sat a ${level} certification exam. Grade it rigorously - this decides a promotion to the next CEFR level.

EXAM (with correct answers):
${JSON.stringify(test)}

STUDENT ANSWERS (by id):
${JSON.stringify(answers)}

STUDENT WRITING:
\"\"\"${writingText}\"\"\"

Apply the usual tolerance (typos/capitalisation are fine if semantically right). The writing must genuinely show ${level} command.
Return STRICT JSON:
{
  "score": 0-100,
  "sections": { "use_of_english": 0-100, "reading": 0-100, "writing": 0-100 },
  "feedback": "3-4 sentences in ${outLang(user)}: verdict and what to polish",
  "mistakes": [{ "topic": "...", "explanation": "...", "severity": 1-5 }]
}
ONLY JSON.`;
}

// ---------------------------------------------------------------------------
// Describe-the-two-photos (official-exam style)
// ---------------------------------------------------------------------------
export const PHOTO_PAIRS = [
  ['a mother setting the dinner table at home with her children nearby', 'a young waitress setting an elegant table in a busy restaurant'],
  ['a man cooking breakfast in a small home kitchen', 'a professional chef cooking on a large restaurant stove'],
  ['a student studying alone in a quiet library', 'a group of students working together in a lively cafe'],
  ['a family having a picnic in a sunny park', 'friends having dinner on a rooftop terrace in a city at night'],
  ['a woman jogging alone on a beach at sunrise', 'people exercising together in a crowded gym'],
  ['an elderly man reading a newspaper on a park bench', 'a young woman reading on a tablet in a modern metro train'],
  ['a farmer selling vegetables at a small street market', 'a cashier scanning products in a big supermarket'],
  ['children playing football in a village street', 'professional players in a huge stadium during a match'],
  ['a man working from home at a messy desk with a cat', 'people working in a bright modern open-plan office'],
  ['a couple camping in the mountains with a tent', 'a family checking in at a luxury hotel reception'],
  ['a girl painting at home with watercolours', 'an artist showing paintings in a gallery exhibition'],
  ['a crowded beach in summer with umbrellas', 'a snowy mountain village in winter with skiers'],
];

export function buildPhotoComparePrompt(user, sceneA, sceneB) {
  return `You are shown two photos.
Photo A shows: ${sceneA}.
Photo B shows: ${sceneB}.
Compare and contrast the two photos in ${variantOf(user)} English: describe what you see in each, what they have in common and how they differ, and say which situation you prefer and why.`;
}
