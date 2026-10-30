// Native English TTS through SAPI (System.Speech): Chromium on Windows only lists OneCore voices,
// so SAPI-only voices such as Zira/David never reach speechSynthesis.
// ONE long-lived PowerShell reads JSON lines on stdin and writes JSON lines on stdout.
const { spawn } = require('child_process');
const path = require('path');
const readline = require('readline');

// Text arrives base64 (UTF-8) inside JSON, so it is never part of a command line or script.
const SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$s.SetOutputToDefaultAudioDevice()
function Emit($o) { [Console]::Out.WriteLine(($o | ConvertTo-Json -Compress)); [Console]::Out.Flush() }
Emit @{ ev = 'ready'; voices = @($s.GetInstalledVoices() | Where-Object { $_.Enabled } | ForEach-Object { @{ name = $_.VoiceInfo.Name; culture = $_.VoiceInfo.Culture.Name } }) }
# Console.In.ReadLineAsync is synchronous on .NET Framework; a StreamReader on the raw stream is not.
$in = New-Object System.IO.StreamReader([Console]::OpenStandardInput(), [System.Text.Encoding]::UTF8)
$read = $in.ReadLineAsync()
$prompts = @{}
while ($true) {
  if ($read.Wait($(if ($prompts.Count) { 25 } else { -1 }))) {
    $line = $read.Result
    if ($null -eq $line) { break }
    $read = $in.ReadLineAsync()
    $m = $null
    try {
      $m = $line | ConvertFrom-Json
      if ($m.cmd -eq 'speak') {
        if ($s.Voice.Name -ne $m.voice) { $s.SelectVoice($m.voice) }
        $s.Rate = [int]$m.rate
        $prompts[[string]$m.id] = $s.SpeakAsync([System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($m.text)))
      } elseif ($m.cmd -eq 'stop') { $s.SpeakAsyncCancelAll() }
    } catch { Emit @{ ev = 'error'; id = $(if ($m) { $m.id } else { $null }); message = $_.Exception.Message } }
  }
  foreach ($id in @($prompts.Keys)) {
    if ($prompts[$id].IsCompleted) { $prompts.Remove($id); Emit @{ ev = 'done'; id = [int]$id } }
  }
}
`;

const MAX_CHARS = 500;
let tts = null;

// en-GB first, then Zira, then David, then other en-US, then any English.
const rank = v => (v.culture === 'en-GB' ? 0 : /zira/i.test(v.name) ? 1 : /david/i.test(v.name) ? 2 : v.culture === 'en-US' ? 3 : 4);
const english = all => all.filter(v => /^en(-|$)/i.test(v.culture)).sort((a, b) => rank(a) - rank(b));

// SAPI Rate is roughly logarithmic (+10 = 3x, -10 = 1/3x): 1.0 -> 0, 0.7 -> -3, 0.6 -> -5, 1.2 -> +2.
function sapiRate(rate) {
  const r = Math.min(1.2, Math.max(0.6, Number.isFinite(rate) ? rate : 1));
  return Math.max(-10, Math.min(10, Math.round((10 * Math.log(r)) / Math.log(3))));
}

function start() {
  if (tts) return tts;
  const exe = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const t = { pending: new Map(), nextId: 1, all: [], startedAt: Date.now(), readyMs: null };
  t.proc = spawn(exe, ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-EncodedCommand', Buffer.from(SCRIPT, 'utf16le').toString('base64')], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
  let onReady;
  const ready = new Promise(ok => { onReady = ok; });
  const timeout = setTimeout(() => onReady([]), 15000);
  t.ready = ready.then(voices => { clearTimeout(timeout); return voices; });
  readline.createInterface({ input: t.proc.stdout }).on('line', line => {
    let m;
    try { m = JSON.parse(line); } catch { return; }
    if (m.ev === 'ready') {
      t.all = m.voices || [];
      t.readyMs = Date.now() - t.startedAt;
      onReady(english(t.all));
    } else if (m.ev === 'done' || m.ev === 'error') {
      const p = t.pending.get(m.id);
      if (!p) return;
      t.pending.delete(m.id);
      if (m.ev === 'done') p.resolve(); else p.reject(new Error(m.message));
    }
  });
  const gone = () => {
    onReady([]);
    for (const p of t.pending.values()) p.reject(new Error('TTS process exited'));
    t.pending.clear();
    if (tts === t) tts = null;
  };
  t.proc.on('exit', gone);
  t.proc.on('error', gone);
  t.proc.stdin.on('error', () => {}); // EPIPE if PowerShell died; 'exit' handles the rest
  tts = t;
  return t;
}

async function voices() {
  return (await start().ready).map(v => v.name);
}

async function speak(opts) {
  const text = typeof opts?.text === 'string' ? opts.text.trim() : '';
  if (!text || text.length > MAX_CHARS) throw new Error(`text must be a string of 1-${MAX_CHARS} characters`);
  const t = start();
  const [voice] = await t.ready;
  if (!voice) throw new Error('No English SAPI voice installed');
  const id = t.nextId++;
  return new Promise((resolve, reject) => {
    t.pending.set(id, { resolve, reject });
    t.proc.stdin.write(JSON.stringify({
      cmd: 'speak', id, voice: voice.name, rate: sapiRate(Number(opts.rate)),
      text: Buffer.from(text, 'utf8').toString('base64'),
    }) + '\n');
  });
}

async function stop() {
  if (!tts) return;
  tts.proc.stdin.write('{"cmd":"stop"}\n');
  for (const p of tts.pending.values()) p.resolve(); // cancelled speaks resolve, like speechSynthesis.cancel()
  tts.pending.clear();
}

function kill() {
  if (tts) { tts.proc.kill(); tts = null; }
}

const info = () => (tts ? { readyMs: tts.readyMs, allSapiVoices: tts.all.map(v => `${v.name} [${v.culture}]`) } : null);

module.exports = { start, voices, speak, stop, kill, info, sapiRate };
