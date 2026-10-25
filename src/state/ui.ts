import { create } from "zustand";
import { CAMPAIGN, MISSIONS } from "../sim/missions";
import type { ModuleType } from "../sim/types";

export type Screen = "title" | "map" | "game";
export type Panel = "build" | "power" | "rover" | "crew";
/** Camera: free look over the outpost, chase behind the rover, or the driver's seat. */
export type View = "orbit" | "chase" | "cockpit" | "walk";
export type Modal = "pause" | "settings" | "guide" | "library" | "teachers" | "credits" | "reset" | "restart" | "mars";
export type Selection =
  | { kind: "module"; id: number }
  | { kind: "pad"; id: number }
  | { kind: "site"; id: string };

export interface Settings {
  sound: boolean;
  /** Read CAPCOM's messages aloud. */
  voice: boolean;
  motion: boolean; // reduce motion
  bigText: boolean;
  /** Solid panels, brighter text and stronger outlines. */
  contrast: boolean;
  /** Teachers and judges can open every mission. */
  unlockAll: boolean;
  /** Show the on-screen drive pad: auto (touch screens), on, off. */
  pad: "auto" | "on" | "off";
  /** 3D detail: auto adapts to the device; ultra is the best the browser can do; high adds glow and soft shadows; low is for slow computers. */
  graphics: "auto" | "ultra" | "high" | "low";
  /** Show the map in the corner. */
  minimap: boolean;
}
export interface Progress {
  /** Best stars per mission id (0–3). */
  stars: Record<string, number>;
  /** Quiz answered correctly, per mission id. */
  quiz: Record<string, boolean>;
}

const SETTINGS_KEY = "astra-trainer-settings-v2";
const PROGRESS_KEY = "astra-trainer-progress-v2";
const defaults: Settings = {
  sound: true,
  voice: false,
  motion: false,
  bigText: false,
  contrast: false,
  unlockAll: false,
  pad: "auto",
  graphics: "auto",
  minimap: true,
};

function load<T>(key: string, fallback: T, check: (raw: Record<string, unknown>) => T): T {
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? "null");
    return raw && typeof raw === "object" ? check(raw) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage is optional */
  }
}
const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
const ids = new Set(MISSIONS.map((m) => m.id));

function readSettings(): Settings {
  return load(SETTINGS_KEY, defaults, (r) => ({
    sound: bool(r.sound, defaults.sound),
    voice: bool(r.voice, defaults.voice),
    motion: bool(r.motion, defaults.motion),
    bigText: bool(r.bigText, defaults.bigText),
    contrast: bool(r.contrast, defaults.contrast),
    unlockAll: bool(r.unlockAll, defaults.unlockAll),
    pad: r.pad === "on" || r.pad === "off" ? r.pad : "auto",
    graphics: r.graphics === "ultra" || r.graphics === "high" || r.graphics === "low" ? r.graphics : "auto",
    minimap: bool(r.minimap, defaults.minimap),
  }));
}
function readProgress(): Progress {
  return load(PROGRESS_KEY, { stars: {}, quiz: {} }, (r) => {
    const stars: Record<string, number> = {},
      quiz: Record<string, boolean> = {};
    const rs = (r.stars ?? {}) as Record<string, unknown>,
      rq = (r.quiz ?? {}) as Record<string, unknown>;
    for (const id of ids) {
      const n = rs[id];
      if (typeof n === "number" && n >= 0 && n <= 3) stars[id] = Math.round(n);
      if (rq[id] === true) quiz[id] = true;
    }
    return { stars, quiz };
  });
}

export interface UIStore {
  screen: Screen;
  panel: Panel | null;
  selected: Selection | null;
  modal: Modal | null;
  briefing: boolean;
  debrief: boolean;
  /** Mission highlighted on the campaign map. */
  focus: string;
  /** A module picked in the build menu, waiting for the player to choose a pad. */
  placing: ModuleType | null;
  camera: { cmd: "base" | "rover" | "reset" | "in" | "out" | "left" | "right" | "focus"; n: number };
  view: View;
  /** Index of the active tutorial step, or null. */
  tutorial: number | null;
  /** How many times the player has moved the camera (the tutorial checks it). */
  looked: number;
  settings: Settings;
  progress: Progress;
  setScreen: (s: Screen) => void;
  openPanel: (p: Panel | null) => void;
  togglePanel: (p: Panel) => void;
  select: (s: Selection | null) => void;
  setModal: (m: Modal | null) => void;
  setFocus: (id: string) => void;
  place: (t: ModuleType | null) => void;
  cam: (cmd: UIStore["camera"]["cmd"]) => void;
  setView: (v: View) => void;
  setTutorial: (step: number | null) => void;
  noteLook: () => void;
  setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  record: (missionId: string, stars: number) => void;
  recordQuiz: (missionId: string) => void;
  resetProgress: () => void;
}

export const useUI = create<UIStore>((set, get) => ({
  screen: "title",
  panel: null,
  selected: null,
  modal: null,
  briefing: false,
  debrief: false,
  focus: CAMPAIGN[0].id,
  placing: null,
  camera: { cmd: "reset", n: 0 },
  view: "orbit",
  tutorial: null,
  looked: 0,
  settings: readSettings(),
  progress: readProgress(),
  setScreen: (screen) => set({ screen, panel: null, selected: null, modal: null, placing: null, view: "orbit" }),
  openPanel: (panel) => set({ panel, placing: panel === "build" ? get().placing : null }),
  togglePanel: (p) => {
    const open = get().panel === p ? null : p;
    set({ panel: open, placing: open === "build" ? get().placing : null });
  },
  select: (selected) => set({ selected }),
  setModal: (modal) => set({ modal }),
  setFocus: (focus) => set({ focus }),
  place: (placing) => set({ placing }),
  cam: (cmd) => set({ camera: { cmd, n: get().camera.n + 1 } }),
  setView: (view) => set({ view }),
  setTutorial: (tutorial) => set({ tutorial }),
  noteLook: () => set({ looked: get().looked + 1 }),
  setSetting: (key, value) => {
    const settings = { ...get().settings, [key]: value };
    set({ settings });
    save(SETTINGS_KEY, settings);
  },
  record: (id, stars) => {
    const progress = get().progress;
    if ((progress.stars[id] ?? 0) >= stars && id in progress.stars) return;
    const next = { ...progress, stars: { ...progress.stars, [id]: Math.max(stars, progress.stars[id] ?? 0) } };
    set({ progress: next });
    save(PROGRESS_KEY, next);
  },
  recordQuiz: (id) => {
    const next = { ...get().progress, quiz: { ...get().progress.quiz, [id]: true } };
    set({ progress: next });
    save(PROGRESS_KEY, next);
  },
  resetProgress: () => {
    const next = { stars: {}, quiz: {} };
    set({ progress: next, focus: CAMPAIGN[0].id });
    save(PROGRESS_KEY, next);
  },
}));

/** The first Mars mission: always open, so players can go straight to Mars. */
export const MARS_START = "red-planet";

/** A mission is open once the one before it has been won (or everything is unlocked). The first Mars mission is always open. */
export function unlocked(id: string, s: Pick<UIStore, "progress" | "settings"> = useUI.getState()) {
  if (s.settings.unlockAll || id === MARS_START) return true;
  const m = MISSIONS.find((x) => x.id === id);
  if (!m?.after) return true;
  return (s.progress.stars[m.after] ?? 0) > 0;
}
