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
