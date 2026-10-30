# AI English Coach

An AI English teacher (Gemini) for Spanish speakers. It follows a CEFR course path
(A1 → C1, units based on the Cambridge English exam syllabus), with 7-minute
lessons that are corrected instantly, speaking with your own voice, spaced review
of your mistakes, XP, streaks, daily quests, and ranks with promotion exams.

Everything runs on the device. There are no accounts and no server of ours. Each user
pastes their own free Gemini API key, and the app talks to Google directly.

## Layout

| Folder | What it is |
|---|---|
| `app/` | The app: a plain ES-module PWA with no build step. GitHub Pages serves it at `/app/`. |
| `desktop/` | Windows installer (Electron + NSIS). It serves `app/` from `app://local` and offers the SAPI English voice as `window.aecDesktop`. |
| `mobile/` | Android APK (Capacitor 8). Native text-to-speech, notifications and microphone. |
| `downloads/` | The built `.exe` and `.apk` that the landing page (`index.html`) links to. |
| `tests/` | `unit.test.mjs` tests the logic. `e2e.mjs` runs headless Chrome with Gemini faked at the network layer. |

Main modules in `app/js/`:
- `syllabus.js` decides **what** is taught.
- `session.js` is the lesson engine.
- `check.js` checks answers locally.
- `srs.js` handles spaced repetition.
- `gamify.js` handles XP, streaks, quests and the forecast based on Cambridge guided hours.
- `items.js` validates everything Gemini generates.

## Commands

```bash
npm test                                   # logic tests (node --test)
npm run e2e                                # full flow in headless Chrome, screenshots in tests/out/
npm run verify                             # both
npm run serve                              # http://127.0.0.1:4321/app/

cd desktop && npm ci && npm run dist       # -> downloads/AI-English-Coach.exe
cd mobile  && npm run apk                  # -> downloads/AI-English-Coach.apk
```

The APK is signed with the keystore in `%LOCALAPPDATA%\AIEnglishCoach\` (`release.jks` +
`keystore.properties`). It is **never** in the repo. If you lose it, future APKs cannot update an
existing install.
