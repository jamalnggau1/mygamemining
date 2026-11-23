/** Efek suara sintetis (WebAudio, tanpa file suara) — dipakai di
 *  momen kunci saja: scan selesai, urat terkumpul, ekspedisi
 *  selesai, dan toast error. AudioContext dibuat malas (lazy) saat
 *  bunyi pertama dimainkan, supaya kebijakan autoplay browser
 *  terpenuhi (konteks hanya dibuat setelah gestur pengguna), dan
 *  semua bunyi dijaga pelan (gain rendah) + pendek. Bila WebAudio
 *  tidak tersedia (mis. jsdom), semua fungsi diam-diam tidak
 *  berbunyi — game tidak pernah crash karena suara. */
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

/** Klik pendek (urat terkumpul, toggle suara dinyalakan). */
export function playClick(): void {
  if (!soundEnabled()) return;
  const c = ac();
  if (!c) return;
  tone(c, 660, 0, 0.07, "sine", 0.07);
}

/** Dua nada naik (scan selesai, ekspedisi selesai). */
export function playSuccess(): void {
  if (!soundEnabled()) return;
  const c = ac();
  if (!c) return;
  tone(c, 523, 0, 0.12, "sine", 0.08);
  tone(c, 784, 0.1, 0.18, "sine", 0.08);
}

/** Nada rendah turun (toast error). */
export function playError(): void {
  if (!soundEnabled()) return;
  const c = ac();
  if (!c) return;
  tone(c, 220, 0, 0.16, "triangle", 0.08);
  tone(c, 165, 0.1, 0.2, "triangle", 0.07);
}
