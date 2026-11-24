/** Efek suara sintetis (WebAudio, tanpa file suara) — dipakai di
 *  momen kunci saja: scan dimulai (radar ping), bor dimulai
 *  (dengung), urat terkumpul, jual/WD/claim (koin), ekspedisi
 *  selesai (arpeggio naik), dan toast error. AudioContext dibuat
 *  malas (lazy) saat bunyi pertama dimainkan, supaya kebijakan
 *  autoplay browser terpenuhi (konteks hanya dibuat setelah gestur
 *  pengguna), dan semua bunyi dijaga pelan (gain rendah) + pendek.
 *  Bila WebAudio tidak tersedia (mis. jsdom), semua fungsi diam-diam
 *  tidak berbunyi — game tidak pernah crash karena suara.
 *
 *  Musik latar: pad ambien prosedural (akord Am9 → Fmaj7 → Cmaj7 →
 *  G6, 7,5 detik per akord, detune halus + echo) — juga tanpa file.
 *  Musik hanya mulai setelah gestur pertama pengguna (ensureMusic,
 *  dipanggil dari App), berhenti saat tab disembunyikan, dan punya
 *  toggle sendiri ("astra-mining-music", default nyala) terpisah
 *  dari toggle efek suara. */
const SOUND_KEY = "astra-mining-sound";

export function soundEnabled(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) !== "0";
  } catch {
    return true;
  }
}

export function setSoundEnabled(on: boolean): void {
  try {
    localStorage.setItem(SOUND_KEY, on ? "1" : "0");
  } catch {
    // localStorage tidak tersedia — pengaturan tidak tersimpan.
  }
}

let ctx: AudioContext | null = null;

function ac(): AudioContext | null {
  try {
    if (!ctx) {
      const AC =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(
  c: AudioContext,
  freq: number,
  startIn: number,
  dur: number,
  type: OscillatorType,
  gain: number,
): void {
  const t0 = c.currentTime + startIn;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g);
  g.connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

/** Sapuan frekuensi (radar): dari f0 ke f1 selama dur detik. */
function sweep(
  c: AudioContext,
  f0: number,
  f1: number,
  startIn: number,
  dur: number,
  type: OscillatorType,
  gain: number,
): void {
  const t0 = c.currentTime + startIn;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, t0);
  osc.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g);
  g.connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

let noiseBuf: AudioBuffer | null = null;

/** Buffer noise putih 1 detik (dipakai dengung bor). */
function noiseBuffer(c: AudioContext): AudioBuffer {
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

/** Klik pendek (urat terkumpul, toggle suara dinyalakan). */
export function playClick(): void {
  if (!soundEnabled()) return;
  const c = ac();
  if (!c) return;
  tone(c, 660, 0, 0.07, "sine", 0.07);
}

/** Sapuan radar naik + gema (scan dimulai). */
export function playScan(): void {
  if (!soundEnabled()) return;
  const c = ac();
  if (!c) return;
  sweep(c, 500, 1600, 0, 0.45, "sine", 0.09);
  sweep(c, 500, 1600, 0.35, 0.45, "sine", 0.04);
}

/** Dengung bor 1 detik (bor dimulai): gerigi rendah + noise. */
export function playDrill(): void {
  if (!soundEnabled()) return;
  const c = ac();
  if (!c) return;
  try {
    const t0 = c.currentTime;
    const master = c.createGain();
    master.gain.setValueAtTime(0, t0);
    master.gain.linearRampToValueAtTime(0.1, t0 + 0.12);
    master.gain.setValueAtTime(0.1, t0 + 0.7);
    master.gain.linearRampToValueAtTime(0, t0 + 1.0);
    master.connect(c.destination);
    for (const f of [55, 58]) {
      const osc = c.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = f;
      const lp = c.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 320;
      osc.connect(lp);
      lp.connect(master);
      osc.start(t0);
      osc.stop(t0 + 1.05);
    }
    const noise = c.createBufferSource();
    noise.buffer = noiseBuffer(c);
    const bp = c.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 300;
    bp.Q.value = 0.8;
    const ng = c.createGain();
    ng.gain.value = 0.35;
    noise.connect(bp);
    bp.connect(ng);
    ng.connect(master);
    noise.start(t0);
    noise.stop(t0 + 1.05);
  } catch {
    // WebAudio bermasalah — diam saja.
  }
}

/** Dua nada koin (jual mineral, beli/upgrade drone, WD). */
export function playCoin(): void {
  if (!soundEnabled()) return;
  const c = ac();
  if (!c) return;
  tone(c, 1318.5, 0, 0.1, "sine", 0.09);
  tone(c, 1975.5, 0.09, 0.3, "sine", 0.09);
}

/** Empat nada naik (scan selesai, ekspedisi selesai). */
export function playSuccess(): void {
  if (!soundEnabled()) return;
  const c = ac();
  if (!c) return;
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((f, i) => tone(c, f, i * 0.13, 0.3, "sine", 0.08));
}

/** Koin + arpeggio (klaim hadiah: bonus harian, klaim Komunitas). */
export function playClaim(): void {
  if (!soundEnabled()) return;
  const c = ac();
  if (!c) return;
  tone(c, 1318.5, 0, 0.1, "sine", 0.09);
  tone(c, 1975.5, 0.09, 0.3, "sine", 0.09);
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((f, i) => tone(c, f, 0.18 + i * 0.13, 0.3, "sine", 0.08));
}

/** Nada rendah turun (toast error). */
export function playError(): void {
  if (!soundEnabled()) return;
  const c = ac();
  if (!c) return;
  tone(c, 220, 0, 0.16, "triangle", 0.08);
  tone(c, 165, 0.1, 0.2, "triangle", 0.07);
}

// --- Musik latar ---------------------------------------------------------
// Pad ambien prosedural: Am9 → Fmaj7 → Cmaj7 → G6, 7,5 detik per
// akord, tiap nada 2 sinus detune + 1 oktaf, attack/release pelan,
// lewat satu DelayNode (gema 0,45 dtk) supaya terasa luas. Semua
// gain dijaga kecil — musik mengiringi, bukan mendominasi.

const MUSIC_KEY = "astra-mining-music";
const MUSIC_CHORDS: number[][] = [
  [110.0, 261.63, 329.63, 493.88], // Am9
  [87.31, 220.0, 261.63, 329.63], // Fmaj7
  [130.81, 164.81, 196.0, 246.94], // Cmaj7
  [98.0, 246.94, 293.66, 329.63], // G6
];
const CHORD_SEC = 7.5;

export function musicEnabled(): boolean {
  try {
    return localStorage.getItem(MUSIC_KEY) !== "0";
  } catch {
    return true;
  }
}

export function setMusicEnabled(on: boolean): void {
  try {
    localStorage.setItem(MUSIC_KEY, on ? "1" : "0");
  } catch {
    // localStorage tidak tersedia — pengaturan tidak tersimpan.
  }
}

let musicTimer: ReturnType<typeof setInterval> | null = null;
let musicMaster: GainNode | null = null;
let musicChord = 0;

function playChord(c: AudioContext): void {
  if (!musicMaster) return;
  const freqs = MUSIC_CHORDS[musicChord % MUSIC_CHORDS.length]!;
  musicChord++;
  const t0 = c.currentTime + 0.05;
  const dur = CHORD_SEC + 2.5; // attack + sustain + release tumpang tindih
  for (const f of freqs) {
    for (const [mult, gain] of [
      [1, 0.05],
      [1.003, 0.035],
      [2, 0.015],
    ] as const) {
      const osc = c.createOscillator();
      osc.type = "sine";
      osc.frequency.value = f * mult;
      const g = c.createGain();
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(gain, t0 + 2.5);
      g.gain.setValueAtTime(gain, t0 + dur - 2.5);
      g.gain.linearRampToValueAtTime(0, t0 + dur);
      osc.connect(g);
      g.connect(musicMaster);
      osc.start(t0);
      osc.stop(t0 + dur + 0.1);
    }
  }
  // Drone oktaf bawah dari akar akord.
  const drone = c.createOscillator();
  drone.type = "sine";
  drone.frequency.value = freqs[0]! / 2;
  const dg = c.createGain();
  dg.gain.setValueAtTime(0, t0);
  dg.gain.linearRampToValueAtTime(0.04, t0 + 2.5);
  dg.gain.setValueAtTime(0.04, t0 + dur - 2.5);
  dg.gain.linearRampToValueAtTime(0, t0 + dur);
  drone.connect(dg);
  dg.connect(musicMaster);
  drone.start(t0);
  drone.stop(t0 + dur + 0.1);
}

/** Mulai musik latar (tidak melakukan apa-apa bila sudah jalan atau
 *  toggle musik mati). Aman dipanggil berulang kali. */
export function startMusic(): void {
  if (musicTimer || !musicEnabled()) return;
  const c = ac();
  if (!c) return;
  try {
    musicMaster = c.createGain();
    musicMaster.gain.value = 0.6;
    const delay = c.createDelay(1);
    delay.delayTime.value = 0.45;
    const fb = c.createGain();
    fb.gain.value = 0.35;
    const wet = c.createGain();
    wet.gain.value = 0.3;
    musicMaster.connect(c.destination);
    musicMaster.connect(delay);
    delay.connect(fb);
    fb.connect(delay);
    delay.connect(wet);
    wet.connect(c.destination);
    musicChord = 0;
    playChord(c);
    musicTimer = setInterval(() => playChord(c), CHORD_SEC * 1000);
  } catch {
    musicTimer = null;
    musicMaster = null;
  }
}

/** Hentikan musik latar (tidak melakukan apa-apa bila tidak jalan). */
export function stopMusic(): void {
  if (musicTimer) {
    clearInterval(musicTimer);
    musicTimer = null;
  }
  if (musicMaster) {
    try {
      musicMaster.gain.linearRampToValueAtTime(0, ctx!.currentTime + 0.5);
    } catch {
      // Konteks hilang — abaikan.
    }
    musicMaster = null;
  }
}

/** Mulai musik bila toggle musik nyala — dipakai setelah gestur
 *  pertama pengguna (kebijakan autoplay) dan saat tab kembali
 *  terlihat. */
export function ensureMusic(): void {
  if (musicEnabled()) startMusic();
}
