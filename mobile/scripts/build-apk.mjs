// npm run apk: ../app -> www -> cap sync android -> signed release APK -> ../downloads/AI-English-Coach.apk
import { copyFileSync, cpSync, existsSync, rmSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = { ...process.env };
env.ANDROID_HOME ||= join(process.env.LOCALAPPDATA ?? '', 'Android', 'Sdk');
if (!existsSync(join(env.ANDROID_HOME, 'platforms'))) {
  throw new Error(`Android SDK not found at ${env.ANDROID_HOME}. Install it or set ANDROID_HOME.`);
}
const run = (cmd, cwd = root) => execSync(cmd, { cwd, env, stdio: 'inherit' });

if (!existsSync(join(root, 'node_modules', '@capacitor', 'cli'))) run('npm ci');

rmSync(join(root, 'www'), { recursive: true, force: true });
cpSync(join(root, '..', 'app'), join(root, 'www'), { recursive: true });
run('npx cap sync android');

// --no-daemon: no Gradle JVM left eating RAM after the build
run(`${process.platform === 'win32' ? '.\\gradlew.bat' : './gradlew'} assembleRelease --no-daemon`, join(root, 'android'));

const out = join(root, '..', 'downloads', 'AI-English-Coach.apk');
copyFileSync(join(root, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk'), out);
console.log(`\nAPK ready: ${out} (${(statSync(out).size / 1048576).toFixed(1)} MB)`);
