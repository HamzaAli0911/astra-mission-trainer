/**
 * Sound check, loaded only with ?debug: renders the background mixes and alarms offline into WAV files (posted to
 * tools/qc/shotserver.py) with their measured levels, so they can be compared and listened to outside the game.
 * window.__sound.run() renders everything; window.__sound.render(name) one scene.
 */
import { buildAmbience, synth, updateAmbience, type AmbienceState } from "../lib/sound";

const SERVER = "http://127.0.0.1:8799";
const RATE = 44100;
/** The live mix's master level (see lib/sound.ts). */
const MASTER = 0.5;

interface Scene {
  seconds: number;
  /** Where you are, moment to moment (for the background). */
  state?: (t: number) => AmbienceState;
  /** One-off sounds scheduled into the render. */
  events?: (a: OfflineAudioContext, out: AudioNode) => void;
  /** The previous version, rebuilt for comparison. */
  old?: (a: OfflineAudioContext, out: AudioNode) => void;
}
const base = (over: Partial<AmbienceState>) => (t: number): AmbienceState => ({ planet: "moon", dust: 0, drive: 0, time: t, view: "walk", inside: true, ...over });
/** Clicks at random times, `rate` a second (as a dosimeter counts). */
const counter = (a: OfflineAudioContext, out: AudioNode, seconds: number, rate: number) => {
  for (let t = 0.2; t < seconds; t += -Math.log(1 - Math.random()) / rate) synth.click(a, out, t, 0.75 + Math.random() * 0.5);
};

const SCENES: Record<string, Scene> = {
  "hab-room-tone": { seconds: 10, state: base({}) },
  "life-support-plant": { seconds: 10, state: base({ machines: 1.5 }) },
  "mars-overview-calm": { seconds: 12, state: base({ planet: "mars", view: "orbit", inside: false }) },
  "mars-eva-dust-storm": { seconds: 12, state: base({ planet: "mars", inside: false, suit: true, dust: 1 }) },
  "moon-eva-suit": { seconds: 12, state: base({ inside: false, suit: true }) },
  "rover-cab-driving": { seconds: 10, state: (t) => base({ view: "cockpit", inside: false, drive: t < 2 ? 0 : t < 5 ? (t - 2) / 3 : t < 8 ? 1 : 0.4 })(t) },
  "radiation-storm-inside": {
    seconds: 10,
    state: base({}),
    events: (a, out) => {
      for (let t = 0.3; t < 10; t += 4.2) synth.alarm(a, out, t, 2, 0.03);
      counter(a, out, 10, 3.5);
    },
  },
  "radiation-storm-overview": { seconds: 8, events: (a, out) => counter(a, out, 8, 3.5) },
  "emergency-alert": { seconds: 3, events: (a, out) => synth.alarm(a, out, 0.2, 2, 0.045) },
  // The previous versions, for comparison.
  "old-room-hum": {
    seconds: 10,
    old: (a, out) => {
      const g = a.createGain();
      g.gain.value = 0.05;
      g.connect(out);
      oldBrown(a, 4).connect(lowpass(a, 220)).connect(g);
      const mains = a.createOscillator();
      mains.frequency.value = 58;
      const k = a.createGain();
      k.gain.value = 0.25;
      mains.connect(k).connect(g);
      mains.start();
    },
  },
  "old-mars-dust-storm-wind": {
    seconds: 10,
    old: (a, out) => {
      const g = a.createGain();
      g.gain.value = 0.092;
      g.connect(out);
      const n = a.createBuffer(1, RATE * 6, RATE);
      const d = n.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const src = a.createBufferSource();
      src.buffer = n;
      src.loop = true;
      const bp = a.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 750;
      bp.Q.value = 0.7;
      src.connect(bp).connect(g);
      src.start();
    },
  },
  "old-radiation-storm-inside": {
    seconds: 10,
    old: (a, out) => {
      for (let t = 0.3; t < 10; t += 2.6)
        for (let i = 0; i < 2; i++) {
          const o = a.createOscillator(),
            g = a.createGain();
          o.type = "sawtooth";
          o.frequency.setValueAtTime(760, t + i * 0.55);
          o.frequency.linearRampToValueAtTime(520, t + i * 0.55 + 0.5);
          g.gain.setValueAtTime(0.0001, t + i * 0.55);
          g.gain.exponentialRampToValueAtTime(0.035, t + i * 0.55 + 0.05);
          g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.55 + 0.52);
          o.connect(lowpass(a, 1800)).connect(g).connect(out);
          o.start(t + i * 0.55);
          o.stop(t + i * 0.55 + 0.56);
        }
      for (let t = 0.1; t < 10; t += 0.05 + Math.random() * 0.15) {
        const len = Math.ceil(RATE * 0.012);
        const b = a.createBuffer(1, len, RATE);
        const d = b.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
        const s = a.createBufferSource(),
          g = a.createGain();
        g.gain.value = 0.18;
        s.buffer = b;
        s.connect(g).connect(out);
        s.start(t);
      }
    },
  },
};

function lowpass(a: BaseAudioContext, f: number) {
  const b = a.createBiquadFilter();
  b.type = "lowpass";
  b.frequency.value = f;
  return b;
}
/** The old brown noise: a short loop with a seam. */
function oldBrown(a: BaseAudioContext, seconds: number) {
  const buf = a.createBuffer(1, Math.ceil(RATE * seconds), RATE);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    d[i] = last * 3.5;
  }
  const src = a.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  src.start();
  return src;
}

async function renderScene(name: string) {
  const sc = SCENES[name];
  const a = new OfflineAudioContext(1, Math.ceil(RATE * sc.seconds), RATE);
  const out = a.createGain();
  out.gain.value = MASTER;
  out.connect(a.destination);
  if (sc.state) {
    const amb = buildAmbience(a, out);
    for (let t = 0; t < sc.seconds; t += 0.2) updateAmbience(amb, t, sc.state(t));
  }
  sc.events?.(a, out);
  sc.old?.(a, out);
  return a.startRendering();
}

function wav(buf: AudioBuffer) {
  const d = buf.getChannelData(0);
  const bytes = new DataView(new ArrayBuffer(44 + d.length * 2));
  const text = (o: number, s: string) => [...s].forEach((c, i) => bytes.setUint8(o + i, c.charCodeAt(0)));
  text(0, "RIFF");
  bytes.setUint32(4, 36 + d.length * 2, true);
  text(8, "WAVEfmt ");
  bytes.setUint32(16, 16, true);
  bytes.setUint16(20, 1, true);
  bytes.setUint16(22, 1, true);
  bytes.setUint32(24, buf.sampleRate, true);
  bytes.setUint32(28, buf.sampleRate * 2, true);
  bytes.setUint16(32, 2, true);
  bytes.setUint16(34, 16, true);
  text(36, "data");
  bytes.setUint32(40, d.length * 2, true);
  for (let i = 0; i < d.length; i++) bytes.setInt16(44 + i * 2, Math.max(-1, Math.min(1, d[i])) * 32767, true);
  let bin = "";
  const u8 = new Uint8Array(bytes.buffer);
  for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return "data:audio/wav;base64," + btoa(bin);
}

/** Peak and RMS level, in dB relative to full scale. */
function levels(buf: AudioBuffer) {
  const d = buf.getChannelData(0);
  let peak = 0,
    sum = 0;
  for (const v of d) {
    peak = Math.max(peak, Math.abs(v));
    sum += v * v;
  }
  const db = (v: number) => +(20 * Math.log10(Math.max(v, 1e-9))).toFixed(1);
  return { peak: db(peak), rms: db(Math.sqrt(sum / d.length)) };
}

/** In-place radix-2 FFT (re, im of length a power of two). */
function fft(re: Float32Array, im: Float32Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len)
      for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(ang * k),
          wi = Math.sin(ang * k);
        const ur = re[i + k],
          ui = im[i + k];
        const vr = re[i + k + len / 2] * wr - im[i + k + len / 2] * wi,
          vi = re[i + k + len / 2] * wi + im[i + k + len / 2] * wr;
        re[i + k] = ur + vr;
        im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr;
        im[i + k + len / 2] = ui - vi;
      }
  }
}
/**
 * A spectrogram (time across, pitch up a log scale from 30 Hz to 10 kHz, brighter for louder, -110 to -30 dB), as a
 * PNG: steady tones show as horizontal lines, clicks and loop seams as vertical ones.
 */
function spectrogram(buf: AudioBuffer) {
  const d = buf.getChannelData(0),
    N = 4096,
    hop = 1024,
    W = 900,
    H = 300;
  const cols = Math.max(1, Math.floor((d.length - N) / hop));
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H + 20;
  const g = c.getContext("2d")!;
  g.fillStyle = "#000";
  g.fillRect(0, 0, W, H + 20);
  const img = g.createImageData(W, H);
  const re = new Float32Array(N),
    im = new Float32Array(N);
  for (let x = 0; x < W; x++) {
    const at = Math.floor((x / W) * cols) * hop;
    for (let i = 0; i < N; i++) {
      re[i] = d[at + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
      im[i] = 0;
    }
    fft(re, im);
    for (let y = 0; y < H; y++) {
      const f = 30 * (10000 / 30) ** (1 - y / H);
      const bin = Math.min(N / 2 - 1, Math.round((f / RATE) * N));
      const mag = Math.hypot(re[bin], im[bin]) / (N / 4);
      const k = Math.max(0, Math.min(1, (20 * Math.log10(mag + 1e-12) + 110) / 80));
      const o = (y * W + x) * 4;
      img.data[o] = 255 * Math.min(1, k * 1.6);
      img.data[o + 1] = 255 * Math.max(0, k * 1.6 - 0.6);
      img.data[o + 2] = 255 * Math.max(0, 1.2 * k - 0.2) * (1 - k * 0.6);
      img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  // Frequency marks: 100 Hz, 1 kHz.
  g.fillStyle = "#9ab";
  g.font = "11px sans-serif";
  for (const f of [50, 100, 300, 1000, 3000]) {
    const y = H * (1 - Math.log(f / 30) / Math.log(10000 / 30));
    g.fillRect(0, y, 6, 1);
    g.fillText(f >= 1000 ? `${f / 1000}k` : `${f}`, 8, y + 4);
  }
  g.fillText(`${buf.duration.toFixed(0)} s`, W - 30, H + 14);
  return c.toDataURL("image/png");
}

async function render(name: string, picture = true) {
  const buf = await renderScene(name);
  await fetch(`${SERVER}/save?name=${encodeURIComponent(name)}`, { method: "POST", body: wav(buf) });
  if (picture) await fetch(`${SERVER}/save?name=${encodeURIComponent("spectrum-" + name)}`, { method: "POST", body: spectrogram(buf) });
  return { name, ...levels(buf) };
}

async function run() {
  const out = [];
  for (const name of Object.keys(SCENES)) out.push(await render(name));
  await fetch(`${SERVER}/save?name=sound-levels`, { method: "POST", body: JSON.stringify(out) });
  return out;
}

Object.assign(window, { __sound: { run, render, scenes: Object.keys(SCENES) } });
