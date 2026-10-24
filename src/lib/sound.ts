import { useUI } from "../state/ui";

/** Synthesized interface sounds: no audio files are shipped or downloaded. */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;

function audio() {
  if (!useUI.getState().settings.sound) return null;
  try {
    if (!ctx) {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

type Note = [freq: number, length: number, type?: OscillatorType, gain?: number];
const SOUNDS: Record<string, Note[]> = {
  click: [[740, 0.05, "sine", 0.05]],
  open: [
    [520, 0.05, "sine", 0.04],
    [700, 0.07, "sine", 0.04],
  ],
  close: [
    [620, 0.05, "sine", 0.035],
    [460, 0.07, "sine", 0.035],
  ],
  build: [
    [330, 0.06, "triangle", 0.06],
    [495, 0.06, "triangle", 0.06],
    [660, 0.1, "triangle", 0.05],
  ],
  online: [
    [523, 0.08, "sine", 0.05],
    [784, 0.12, "sine", 0.05],
  ],
  good: [
    [660, 0.07, "sine", 0.05],
    [880, 0.07, "sine", 0.05],
    [1320, 0.14, "sine", 0.04],
  ],
  warn: [
    [440, 0.12, "triangle", 0.06],
    [370, 0.16, "triangle", 0.06],
  ],
  danger: [
    [660, 0.14, "square", 0.035],
    [440, 0.14, "square", 0.035],
    [660, 0.14, "square", 0.035],
    [440, 0.2, "square", 0.035],
  ],
  toggle: [[880, 0.04, "sine", 0.04]],
  off: [[440, 0.05, "sine", 0.04]],
  rover: [
    [392, 0.06, "sawtooth", 0.025],
    [523, 0.08, "sawtooth", 0.025],
  ],
  capcom: [
    [1046, 0.05, "sine", 0.03],
    [1318, 0.06, "sine", 0.03],
  ],
  star: [
    [784, 0.09, "triangle", 0.06],
    [1046, 0.09, "triangle", 0.06],
    [1568, 0.2, "triangle", 0.05],
  ],
  win: [
    [523, 0.12, "triangle", 0.06],
    [659, 0.12, "triangle", 0.06],
    [784, 0.12, "triangle", 0.06],
    [1046, 0.35, "triangle", 0.06],
  ],
  lose: [
    [392, 0.2, "triangle", 0.06],
    [330, 0.2, "triangle", 0.06],
    [262, 0.45, "triangle", 0.06],
  ],
};
export type Sound = keyof typeof SOUNDS;

export function play(kind: Sound) {
  const a = audio();
  if (!a || !master) return;
  let t = a.currentTime + 0.01;
  for (const [freq, length, type = "sine", gain = 0.05] of SOUNDS[kind]) {
    const osc = a.createOscillator(),
      g = a.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + length);
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + length + 0.02);
    t += length * 0.85;
  }
}

/** One Geiger-counter click (radiation storms). */
export function tick() {
  const a = audio();
  if (!a || !master) return;
  const t = a.currentTime,
    len = 0.012;
  const buf = a.createBuffer(1, Math.ceil(a.sampleRate * len), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 3;
  const src = a.createBufferSource(),
    g = a.createGain();
  g.gain.value = 0.18;
  src.buffer = buf;
  src.connect(g);
  g.connect(master);
  src.start(t);
}

/* ---------- Background sound ---------- */

type Ambience = {
  hum: GainNode;
  wind: GainNode;
  windTone: BiquadFilterNode;
  motor: GainNode;
  motorOsc: OscillatorNode;
};
let amb: Ambience | null = null;

/** A looping buffer of noise: white, or "brown" (smoothed, deeper) for machinery. */
function noise(a: AudioContext, seconds: number, brown: boolean) {
  const buf = a.createBuffer(1, Math.ceil(a.sampleRate * seconds), a.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1;
    last = brown ? (last + 0.02 * w) / 1.02 : w;
    d[i] = brown ? last * 3.5 : w;
  }
  const src = a.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  return src;
}

function startAmbience(a: AudioContext, out: GainNode): Ambience {
  // Life support: fans and pumps, a low rumble with a faint electrical hum.
  const hum = a.createGain();
  hum.gain.value = 0;
  hum.connect(out);
  const fans = noise(a, 4, true);
  const low = a.createBiquadFilter();
  low.type = "lowpass";
  low.frequency.value = 220;
  fans.connect(low).connect(hum);
  fans.start();
  const mains = a.createOscillator();
  mains.frequency.value = 58;
  const mainsLevel = a.createGain();
  mainsLevel.gain.value = 0.25;
  mains.connect(mainsLevel).connect(hum);
  mains.start();
  // Wind (Mars only: the Moon has no air to carry sound or move dust).
  const wind = a.createGain();
  wind.gain.value = 0;
  wind.connect(out);
  const air = noise(a, 6, false);
  const windTone = a.createBiquadFilter();
  windTone.type = "bandpass";
  windTone.frequency.value = 380;
  windTone.Q.value = 0.7;
  air.connect(windTone).connect(wind);
  air.start();
  // Rover drive motors: a soft whine that rises with speed.
  const motor = a.createGain();
  motor.gain.value = 0;
  motor.connect(out);
  const motorOsc = a.createOscillator();
  motorOsc.type = "sawtooth";
  motorOsc.frequency.value = 70;
  const motorTone = a.createBiquadFilter();
  motorTone.type = "lowpass";
  motorTone.frequency.value = 520;
  motorOsc.connect(motorTone).connect(motor);
  motorOsc.start();
  return { hum, wind, windTone, motor, motorOsc };
}

/**
 * Keep the background sound in step with the scene (call a few times a second): life support always,
 * wind on Mars that rises in a dust storm, and the rover's motors while it drives (0 to 1).
 */
export function ambience(s: { on: boolean; planet: "moon" | "mars"; dust: number; drive: number; time: number }) {
  const want = s.on && !document.hidden && useUI.getState().settings.sound;
  if (!want) {
    if (amb && ctx) for (const g of [amb.hum, amb.wind, amb.motor]) g.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
    return;
  }
  const a = audio();
  if (!a || !master) return;
  if (!amb) amb = startAmbience(a, master);
  const t = a.currentTime;
  amb.hum.gain.setTargetAtTime(0.03, t, 0.5);
  const gust = 0.5 + 0.5 * Math.sin(s.time * 0.7) * Math.sin(s.time * 0.23 + 1);
  amb.wind.gain.setTargetAtTime(s.planet === "mars" ? 0.012 + s.dust * 0.08 + gust * 0.01 : 0, t, 0.4);
  amb.windTone.frequency.setTargetAtTime(300 + s.dust * 450 + gust * 160, t, 0.4);
  amb.motor.gain.setTargetAtTime(s.drive * 0.035, t, 0.2);
  amb.motorOsc.frequency.setTargetAtTime(65 + s.drive * 120, t, 0.2);
}
