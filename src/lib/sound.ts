import { useUI } from "../state/ui";

/**
 * Synthesized sound: no audio files are shipped or downloaded. Interface notes, doors, footsteps and the airlock;
 * the alarms; and the background: the base's air handling and machinery, the thin Martian wind, the rovers' motors
 * and the breathing inside a suit. Physics rules: on the Moon nothing outside makes a sound (there's no air), so
 * outdoors you only hear your own suit, the rover through its cabin, and the radio; on Mars the air is so thin that
 * the wind is soft and muffled.
 */
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
  // (An emergency: played with the alarm voice below, not as plain notes.)
  danger: [],
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
  if (kind === "danger") return synth.alarm(a, master, a.currentTime + 0.01, 2, 0.045);
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

/** A short burst of filtered noise, swept from one pitch to another. */
function burst(len: number, from: number, to: number, q: number, gain: number) {
  const a = audio();
  if (!a || !master) return;
  const t = a.currentTime;
  const buf = a.createBuffer(1, Math.ceil(a.sampleRate * len), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource(),
    f = a.createBiquadFilter(),
    g = a.createGain();
  src.buffer = buf;
  f.type = "bandpass";
  f.Q.value = q;
  f.frequency.setValueAtTime(from, t);
  f.frequency.exponentialRampToValueAtTime(to, t + len);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + len * 0.25);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  src.connect(f).connect(g).connect(master);
  src.start(t);
  src.stop(t + len + 0.02);
}
/** A sliding door's pneumatic hiss, rising as it opens and falling as it closes; quieter further away. */
export function doorSound(open: boolean, near = 1) {
  burst(0.55, open ? 700 : 1500, open ? 1500 : 650, 1.1, 0.07 * near);
}
/** One footstep: a soft thud on the padded floor, a ring on the stair's metal treads, a crunch of regolith outside. */
export function footstep(weight = 1, surface: "floor" | "stair" | "ground" | "grating" = "floor") {
  if (surface === "stair") burst(0.09, 900 + Math.random() * 200, 420, 3, 0.03 * weight);
  else if (surface === "ground") burst(0.14, 520 + Math.random() * 120, 240, 0.8, 0.03 * weight);
  else if (surface === "grating") {
    // Open metal grating: a dull step with a short ring of the bars over it.
    burst(0.1, 230 + Math.random() * 40, 110, 1.4, 0.03 * weight);
    burst(0.07, 2300 + Math.random() * 400, 1700, 9, 0.012 * weight);
  } else burst(0.11, 190 + Math.random() * 50, 90, 1.4, 0.045 * weight);
}

/** The airlock cycling: a long hiss as the air is pumped out (going out) or let back in (coming home). */
export function airlockSound(out: boolean) {
  burst(6.5, out ? 1400 : 300, out ? 200 : 1300, 0.7, 0.05);
}
/** A soft two-note chime (the battery's getting low; the oxygen's short). */
export function chime(urgent = false) {
  const a = audio();
  if (!a || !master) return;
  const t = a.currentTime;
  [urgent ? 880 : 660, urgent ? 660 : 880].forEach((f, i) => {
    const o = a.createOscillator(),
      g = a.createGain();
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t + i * 0.22);
    g.gain.exponentialRampToValueAtTime(0.04, t + i * 0.22 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.22 + 0.4);
    o.connect(g).connect(master!);
    o.start(t + i * 0.22);
    o.stop(t + i * 0.22 + 0.42);
  });
}

/* ---------- Alarms and the dosimeter ---------- */

/** The radiation-storm alarm inside the base: the same calm high-low call as an emergency, every few seconds. */
export function stormAlarm() {
  const a = audio();
  if (a && master) synth.alarm(a, master, a.currentTime + 0.01, 2, 0.03);
}
/** One click of the dosimeter's counter (radiation storms): a tiny, crisp tick. */
export function tick() {
  const a = audio();
  if (a && master) synth.click(a, master, a.currentTime, 0.75 + Math.random() * 0.5);
}

/* ---------- Background sound ---------- */

/**
 * The building blocks, written against any audio context and output (the live one, or an offline one for the
 * sound check in src/dev/soundcheck.ts).
 */
const clicks = new WeakMap<BaseAudioContext, AudioBuffer>();
const loops = new WeakMap<BaseAudioContext, { pink: AudioBuffer; brown: AudioBuffer }>();
export const synth = {
  /**
   * An alarm call: `pairs` of a high and a low tone, each a soft organ-like voice (a sine with quiet overtones), so
   * it's clear and urgent without the rasp of a saw or square wave.
   */
  alarm(a: BaseAudioContext, out: AudioNode, t: number, pairs: number, level: number) {
    const tone = (f: number, at: number, len: number) => {
      const g = a.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(level, at + 0.012);
      g.gain.setValueAtTime(level, at + len - 0.07);
      g.gain.exponentialRampToValueAtTime(0.0001, at + len);
      g.connect(out);
      [
        [1, 1],
        [2, 0.28],
        [3, 0.1],
      ].forEach(([k, amp]) => {
        const o = a.createOscillator(),
          og = a.createGain();
        o.frequency.value = f * k;
        og.gain.value = amp;
        o.connect(og).connect(g);
        o.start(at);
        o.stop(at + len + 0.02);
      });
    };
    for (let i = 0; i < pairs; i++) {
      tone(988, t + i * 0.56, 0.24);
      tone(740, t + i * 0.56 + 0.28, 0.24);
    }
  },
  /** A counter's tick: a very short ring at about 3 kHz with a breath of noise, made once and reused. */
  click(a: BaseAudioContext, out: AudioNode, t: number, loud = 1) {
    let buf = clicks.get(a);
    if (!buf) {
      const n = Math.ceil(a.sampleRate * 0.006);
      buf = a.createBuffer(1, n, a.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) {
        const s = i / a.sampleRate;
        d[i] = Math.exp(-s / 0.0007) * (0.75 * Math.sin(2 * Math.PI * 3100 * s) + 0.25 * (Math.random() * 2 - 1) * Math.exp(-s / 0.0002));
      }
      clicks.set(a, buf);
    }
    const src = a.createBufferSource(),
      g = a.createGain();
    src.buffer = buf;
    g.gain.value = 0.07 * loud;
    src.connect(g).connect(out);
    src.start(t);
  },
  /** Ten seconds of pink and of brown noise that loop without a seam (the ends cross-fade into the start). */
  noise(a: BaseAudioContext) {
    let n = loops.get(a);
    if (!n) {
      n = { pink: loopNoise(a, "pink"), brown: loopNoise(a, "brown") };
      loops.set(a, n);
    }
    return n;
  },
};

function loopNoise(a: BaseAudioContext, colour: "pink" | "brown") {
  const len = Math.ceil(a.sampleRate * 10),
    fade = Math.ceil(a.sampleRate * 0.5);
  const raw = new Float32Array(len + fade);
  let b0 = 0,
    b1 = 0,
    b2 = 0,
    last = 0;
  for (let i = 0; i < raw.length; i++) {
    const w = Math.random() * 2 - 1;
    if (colour === "pink") {
      // Paul Kellet's economy pink filter: equal energy per octave, the natural sound of moving air.
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      raw[i] = b0 + b1 + b2 + w * 0.1848;
    } else {
      // Brown: deeper still (rumble), leaky so it never drifts.
      last = (last + 0.02 * w) / 1.02;
      raw[i] = last;
    }
  }
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  let peak = 1e-9;
  for (let i = 0; i < len; i++) {
    // The first half-second blends from what would have come after the end, so the loop point is seamless.
    const k = i < fade ? i / fade : 1;
    d[i] = i < fade ? raw[i] * Math.sqrt(k) + raw[len + i] * Math.sqrt(1 - k) : raw[i];
    peak = Math.max(peak, Math.abs(d[i]));
  }
  for (let i = 0; i < len; i++) d[i] *= 0.9 / peak;
  return buf;
}

/** The live background mix: each layer its own level, with the filters that colour it. */
export interface Ambience {
  /** The base's air handling: soft moving air and a fan's rumble (room tone). */
  room: GainNode;
  /** Pumps and compressors near life support: a slow working rhythm. */
  pump: GainNode;
  /** Mars's wind: a muffled body of air, and a faint whistle in the gusts. */
  wind: GainNode;
  windTone: BiquadFilterNode;
  whistle: GainNode;
  whistleTone: BiquadFilterNode;
  /** A rover's drive: the electric motors' whine and the wheels' rumble. */
  whine: GainNode;
  whineOsc: OscillatorNode;
  whineOsc2: OscillatorNode;
  roll: GainNode;
  /** In a suit: its fan, and your breathing. */
  fan: GainNode;
  breath: GainNode;
  breathTone: BiquadFilterNode;
  /** Gusts wander rather than repeat: where the gust is now, and where it's heading. */
  gust: number;
  gustTo: number;
  gustAt: number;
}

export function buildAmbience(a: BaseAudioContext, out: AudioNode): Ambience {
  const { pink, brown } = synth.noise(a);
  const source = (buf: AudioBuffer, offset: number) => {
    const s = a.createBufferSource();
    s.buffer = buf;
    s.loop = true;
    s.start(0, offset);
    return s;
  };
  const filter = (type: BiquadFilterType, f: number, q = 0.7) => {
    const b = a.createBiquadFilter();
    b.type = type;
    b.frequency.value = f;
    b.Q.value = q;
    return b;
  };
  const level = (v = 0) => {
    const g = a.createGain();
    g.gain.value = v;
    return g;
  };
  // Room tone: moving air (pink, rolled off above 900 Hz), a fan's rumble round 120 Hz, a whisper of airflow at the vents.
  const room = level();
  room.connect(out);
  source(pink, 0).connect(filter("highpass", 70)).connect(filter("lowpass", 900)).connect(room);
  source(brown, 2.3).connect(filter("bandpass", 120, 1.2)).connect(level(0.7)).connect(room);
  source(pink, 4.1).connect(filter("bandpass", 2600, 0.8)).connect(level(0.12)).connect(room);
  // Pumps: a low churn that swells and eases a little over a second or two.
  const pump = level();
  pump.connect(out);
  const churn = level(0.55);
  source(brown, 6.7).connect(filter("bandpass", 170, 1.6)).connect(churn).connect(pump);
  const beat = a.createOscillator();
  beat.frequency.value = 0.6;
  beat.connect(level(0.4)).connect(churn.gain);
  beat.start();
  // Mars's wind: thin air carries little, so a soft, low body of moving air, and a faint whistle in the gusts.
  const wind = level();
  wind.connect(out);
  const windTone = filter("lowpass", 380, 0.5);
  source(brown, 1.1).connect(windTone).connect(wind);
  const whistle = level();
  whistle.connect(out);
  const whistleTone = filter("bandpass", 600, 3.5);
  source(pink, 7.9).connect(whistleTone).connect(whistle);
  // A rover's drive: two close electric whines (a slow beat between them, as real motors have) and the rumble of the wheels.
  const whine = level();
  whine.connect(out);
  const whineTone = filter("bandpass", 1100, 0.6);
  whineTone.connect(whine);
  const whineOsc = a.createOscillator();
  whineOsc.type = "triangle";
  whineOsc.frequency.value = 150;
  whineOsc.connect(whineTone);
  whineOsc.start();
  const whineOsc2 = a.createOscillator();
  whineOsc2.frequency.value = 302;
  whineOsc2.connect(level(0.35)).connect(whineTone);
  whineOsc2.start();
  const roll = level();
  roll.connect(out);
  source(brown, 3.3).connect(filter("lowpass", 260)).connect(roll);
  // In a suit: its fan (soft, steady), and breathing through the helmet's air (a cycle set from the clock).
  const fan = level();
  fan.connect(out);
  source(pink, 5.2).connect(filter("lowpass", 1300)).connect(fan);
  const breath = level();
  breath.connect(out);
  const breathTone = filter("bandpass", 800, 1.1);
  source(pink, 8.6).connect(breathTone).connect(breath);
  return { room, pump, wind, windTone, whistle, whistleTone, whine, whineOsc, whineOsc2, roll, fan, breath, breathTone, gust: 0.3, gustTo: 0.3, gustAt: 0 };
}

export interface AmbienceState {
  planet: "moon" | "mars";
  /** How thick the dust storm is, 0 to 1. */
  dust: number;
  /** The crew rover's speed, 0 to 1. */
  drive: number;
  /** Seconds (the scene's clock), for breathing and gusts. */
  time: number;
  /** Where you're listening from: the overview, behind the rover, its cab, or on foot. */
  view: "orbit" | "chase" | "cockpit" | "walk";
  /** On foot inside the base, or outside in a suit. */
  inside?: boolean;
  suit?: boolean;
  /** Near loud machinery (0 none, 1 or more by the life-support plant). */
  machines?: number;
}

/** Breathing in a suit: a slower breath in, a longer breath out, a pause (0 to 1, and whether it's the breath in). */
function breathAt(time: number) {
  const p = (((time % 4.8) + 4.8) % 4.8) / 4.8;
  if (p < 0.34) return { k: Math.sin((p / 0.34) * Math.PI) ** 2, inhale: true };
  if (p < 0.4) return { k: 0, inhale: false };
  if (p < 0.88) return { k: Math.sin(((p - 0.4) / 0.48) * Math.PI) ** 1.6, inhale: false };
  return { k: 0, inhale: false };
}

/**
 * Set the background mix for a moment (`t`, the audio clock), from where you are and what's happening. Values glide
 * to their targets, so calling it a few times a second is smooth.
 */
export function updateAmbience(amb: Ambience, t: number, s: AmbienceState) {
  const glide = (p: AudioParam, v: number, tau = 0.35) => p.setTargetAtTime(v, t, tau);
  const mars = s.planet === "mars";
  const walk = s.view === "walk";
  const indoors = walk && !!s.inside;
  const suit = walk && !!s.suit && !indoors;
  const cab = s.view === "cockpit";
  // Gusts drift towards a new random strength every few seconds (a dust storm makes them stronger and more frequent).
  if (s.time >= amb.gustAt) {
    amb.gustTo = Math.random() ** (s.dust > 0.3 ? 0.6 : 1.4);
    amb.gustAt = s.time + 1.5 + Math.random() * (s.dust > 0.3 ? 2 : 4);
  }
  amb.gust += (amb.gustTo - amb.gust) * 0.12;
  const gust = amb.gust;

  // Inside: the base's air handling, louder by the machinery; much quieter in the rover's cab; nothing outside.
  glide(amb.room.gain, indoors ? 0.052 * (1 + 0.5 * (s.machines ?? 0)) : cab ? 0.022 : 0, 0.6);
  glide(amb.pump.gain, indoors ? 0.022 * Math.min(1.5, s.machines ?? 0) : 0, 0.8);
  // Mars's wind: muffled through the walls and the rover's cab, a little through a helmet; none on the Moon.
  const through = indoors ? 0.18 : cab ? 0.3 : suit ? 0.75 : walk ? 1 : 0.85;
  const wind = mars ? (0.008 + 0.012 * gust + s.dust * (0.022 + 0.03 * gust)) * through : 0;
  glide(amb.wind.gain, wind, 0.5);
  glide(amb.windTone.frequency, indoors || cab ? 200 : 280 + 260 * gust + 220 * s.dust, 0.6);
  glide(amb.whistle.gain, mars && !indoors ? (0.0015 + 0.006 * s.dust) * gust * gust * through : 0, 0.6);
  glide(amb.whistleTone.frequency, 450 + 500 * gust + 200 * s.dust, 0.8);
  // The rover: through its own frame in the cab; on Mars faintly through the air from outside; never through vacuum.
  const heard = cab ? 1 : mars && !walk ? 0.35 : 0;
  glide(amb.whine.gain, 0.02 * s.drive * heard, 0.25);
  glide(amb.roll.gain, 0.05 * s.drive * heard, 0.25);
  glide(amb.whineOsc.frequency, 120 + 480 * s.drive, 0.3);
  glide(amb.whineOsc2.frequency, (120 + 480 * s.drive) * 2.013, 0.3);
  // A suit: its fan, and your breath (aimed a moment ahead, so the glide lands on the breath's shape).
  glide(amb.fan.gain, suit ? 0.013 : 0, 0.5);
  const b = breathAt(s.time + 0.15);
  glide(amb.breath.gain, suit ? 0.0028 + (b.inhale ? 0.024 : 0.03) * b.k : 0, 0.12);
  glide(amb.breathTone.frequency, b.inhale ? 1050 : 620, 0.3);
}

let amb: Ambience | null = null;
/** Keep the background sound in step with the scene (call a few times a second). */
export function ambience(s: AmbienceState & { on: boolean }) {
  const want = s.on && !document.hidden && useUI.getState().settings.sound;
  if (!want) {
    if (amb && ctx) for (const g of [amb.room, amb.pump, amb.wind, amb.whistle, amb.whine, amb.roll, amb.fan, amb.breath]) g.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
    return;
  }
  const a = audio();
  if (!a || !master) return;
  if (!amb) amb = buildAmbience(a, master);
  updateAmbience(amb, a.currentTime, s);
}
