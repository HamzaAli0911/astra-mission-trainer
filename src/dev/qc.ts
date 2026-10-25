/**
 * Quality-control harness, loaded only with ?debug (players never download it).
 * - capture(prefix, only?): the fixed review shots, posted to tools/qc/shotserver.py.
 * - perf(tiers): frame time, draw calls and triangles for fixed cameras on each graphics tier.
 * - startup(tier): the longest main-thread task while a mission starts.
 * - overlaps(): interface panels that overlap at the current window size.
 * - leak(n): enter and leave walk mode n times and compare GPU memory counts.
 * Cameras are placed relative to the current map (pads, dock, habitat size), so the same shot
 * frames the same subject after the layout changes.
 */
import type * as THREE from "three";
import { useGame } from "../state/game";
import { useUI, type View } from "../state/ui";
import { DOCK, HABITAT_RADIUS, PADS } from "../sim/world";
import { HOME, polar, rad, roomAt, ROOMS, SPAWN, STAIR, stairPoint, walls, WINDOWS } from "../sim/home";
import type { ModuleType, Planet } from "../sim/types";
import { SHIELD_TIME } from "../sim/modules";

type V3 = [number, number, number];
interface Hooks {
  renderer: THREE.WebGLRenderer;
  place: (pos: V3, at: V3) => void;
  view: (v: View) => void;
  snap: (frames?: number) => string;
  /** Walk mode: stand at a habitat-local point on a floor, facing a compass bearing and tilted up or down (degrees). */
  walk: (x: number, z: number, level: 0 | 1, yaw?: number, pitch?: number) => void;
  /** The 1.75 m scale figure: habitat-local point, floor, facing (degrees); null hides it. */
  figure: (x: number | null, z?: number, level?: 0 | 1, yaw?: number) => void;
}
const SERVER = "http://127.0.0.1:8799";
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const hooks = () => (window as unknown as { __astra: Partial<Hooks> }).__astra;

async function post(name: string, body: string) {
  await fetch(`${SERVER}/save?name=${encodeURIComponent(name)}`, { method: "POST", body });
}
/** Wait until the world has been built and drawn. */
async function ready() {
  await wait(400);
  for (let i = 0; i < 600 && (!hooks().snap || document.querySelector(".world-loading")); i++) await wait(100);
  await wait(300);
}
async function settle(n = 25) {
  for (let i = 0; i < n; i++) {
    hooks().snap!(1);
    await wait(40);
  }
}

/** Every module on its usual pad, finished, mid-morning, paused. */
const BASE: [ModuleType, number][] = [
  ["solar", 0],
  ["solar", 1],
  ["battery", 2],
  ["oxygen", 3],
  ["recycler", 4],
  ["greenhouse", 6],
  ["lab", 7],
  ["shelter", 8],
  ["icedrill", 15],
  ["reactor", 16],
];
async function setup(planet: Planet, t = 10.5) {
  const h = hooks();
  delete h.snap;
  delete h.place;
  delete h.view;
  useGame.getState().start(planet === "moon" ? "free-moon" : "free-mars");
  useUI.setState({ screen: "game", briefing: false, tutorial: null, panel: null, debrief: false, modal: null, view: "orbit" });
  await ready();
  const st = useGame.getState();
  st.game.res.materials = 99999;
  for (const [m, p] of BASE) st.act({ type: "build", module: m, pad: p });
  const g = useGame.getState().game;
  g.modules.forEach((m) => (m.built = 99));
  g.t = t;
  g.res.power = 60;
  useGame.getState().pause("manual");
  await settle(10);
}

const pad = (id: number) => PADS[id];
const add = (a: { x: number; z: number }, [x, y, z]: V3): V3 => [a.x + x, y, a.z + z];
/** Offsets around the habitat scale with its size, so its shots keep their framing. */
const hab = (v: V3): V3 => [v[0] * (HABITAT_RADIUS / 3.4), v[1] * (HABITAT_RADIUS / 3.4), v[2] * (HABITAT_RADIUS / 3.4)];

interface Shot {
  id: string;
  planet: Planet;
  frames?: number;
  run: (h: Hooks) => void | Promise<void>;
}
const place = (pos: V3, at: V3) => (h: Hooks) => h.place(pos, at);
const SHOTS: Shot[] = [
  { id: "01-moon-overview", planet: "moon", run: place([30, 24, 40], [0, 0, 2]) },
  { id: "02-habitat", planet: "moon", run: (h) => h.place(hab([8.5, 4.2, 11]), hab([0, 0, 1.5])) },
  { id: "03-rover", planet: "moon", run: place(add(DOCK, [5.5, 2.8, 6.5]), add(DOCK, [0, 0, 0])) },
  { id: "09-greenhouse", planet: "moon", run: place(add(pad(6), [5, 3.6, 6.5]), add(pad(6), [0, 0, 0])) },
  { id: "10-modules-west", planet: "moon", run: place(add(pad(4), [-5.5, 5, 2]), add(pad(4), [1.5, 0, -4])) },
  { id: "11-reactor", planet: "moon", run: place(add(pad(16), [4, 8, 13]), add(pad(16), [0, 0, 0])) },
  { id: "13-solar-battery", planet: "moon", run: place(add(pad(1), [6.5, 3.2, 4.5]), add(pad(1), [-2.5, 1.6, 3])) },
  { id: "14-oxygen-recycler", planet: "moon", run: place(add(pad(3), [-8.25, 3, 3.14]), add(pad(3), [-0.75, 1, -2.86])) },
  { id: "15-lab", planet: "moon", run: place(add(pad(7), [5.51, 2.8, 5.3]), add(pad(7), [0.01, 1.4, 0])) },
  { id: "21-shelter", planet: "moon", run: place(add(pad(8), [6.01, 3, -5]), add(pad(8), [0.01, 1, 0])) },
  { id: "16-icedrill", planet: "moon", run: place(add(pad(15), [5.5, 12, 9.5]), add(pad(15), [0, 4, 0])) },
  { id: "17-lander", planet: "moon", run: place([-6, 4.5, 37], [-16, 3, 27]) },
  { id: "22-rover-front", planet: "moon", run: place(add(DOCK, [-6.5, 3.6, 9]), add(DOCK, [0, 1.4, 0.5])) },
  { id: "18-rover-close", planet: "moon", run: place(add(DOCK, [5.2, 1.7, 3.6]), add(DOCK, [0, 1.3, 0])) },
  {
    id: "04-cockpit",
    planet: "moon",
    run: (h) => {
      const rv = useGame.getState().game.rover;
      Object.assign(rv, { docked: false, x: -50, z: -38, heading: 1.0 });
      h.view("cockpit");
    },
  },
  {
    id: "05-crater",
    planet: "moon",
    frames: 30,
    run: (h) => {
      const rv = useGame.getState().game.rover;
      Object.assign(rv, { docked: false, x: -64, z: -44, heading: 0.9 });
      h.view("chase");
    },
  },
  {
    id: "08-astronauts",
    planet: "moon",
    run: (h) => {
      const rv = useGame.getState().game.rover;
      Object.assign(rv, { docked: false, x: 74, z: -39, heading: -0.9, task: { site: "regolith", left: 0.5 } });
      h.place([81, 3.2, -35.5], [77, 0, -41]);
    },
  },
  { id: "06-mars-overview", planet: "mars", run: place([30, 24, 40], [0, 0, 2]) },
  { id: "12-mars-mesa", planet: "mars", run: place([-6, 14, -86], [-28, 0, -122]) },
  { id: "19-mars-solar", planet: "mars", run: place(add(pad(1), [6.5, 3.2, 4.5]), add(pad(1), [-2.5, 1.6, 3])) },
  { id: "20-mars-oxygen", planet: "mars", run: place(add(pad(3), [-8.25, 3, 3.14]), add(pad(3), [-0.75, 1, -2.86])) },
  {
    id: "07-mars-dust",
    planet: "mars",
    frames: 60,
    run: (h) => {
      const g = useGame.getState().game;
      g.hazards.push({ id: 991, kind: "dust", warnAt: g.t, startAt: g.t, endAt: g.t + 30, strength: 0.4, phase: "active" });
      h.place([30, 24, 40], [0, 0, 2]);
    },
  },
];

// The home from outside: close up, the new pad layout from above, lit at night, and fully shielded.
SHOTS.push(
  { id: "EX01-home-close", planet: "moon", run: place([-6.5, 4.2, 15.5], [0, 3.2, 1]) },
  { id: "EX02-layout-above", planet: "moon", run: place([0.5, 62, 24], [0, 0, 3]) },
  {
    id: "EX03-home-night",
    planet: "moon",
    run: (h) => {
      useGame.getState().game.t = 22.5;
      h.place([11, 5.5, 15], [0, 3.2, 1]);
    },
  },
  {
    id: "EX04-home-shielded",
    planet: "mars",
    run: (h) => {
      const g = useGame.getState().game;
      g.shieldStarted = true;
      g.shield = SHIELD_TIME;
      h.place([13, 6, -12], [0, 3, 0]);
    },
  },
);

// Inside the home (Mars, mid-morning), each with a 1.75 m figure for scale where it helps.
/** Stand at a bearing and distance from the centre on a floor, looking along a bearing, tilted (degrees); maybe a figure too. */
const inside =
  (b: number, r: number, level: 0 | 1, yaw: number, pitch: number, fig?: [number, number, 0 | 1, number]) =>
  (h: Hooks) => {
    const p = polar(b, r);
    h.walk(p.x, p.z, level, yaw, pitch);
    if (fig) {
      const f = polar(fig[0], fig[1]);
      h.figure(f.x, f.z, fig[2], fig[3]);
    } else h.figure(null);
  };
const mid = (STAIR.inner + STAIR.outer) / 2;
const stairAt = (u: number) => {
  const p = stairPoint(u, mid);
  return { b: (Math.atan2(p.x, -p.z) * 180) / Math.PI, r: Math.hypot(p.x, p.z) };
};
const foot = stairAt(-STAIR.half - 0.55),
  head = stairAt(STAIR.half + 0.7);
SHOTS.push(
  { id: "IC01-hatch-into-suit-room", planet: "mars", run: inside(180, 4.6, 0, 356, -8, [185, 3.45, 0, 180]) },
  { id: "IC02-suit-room", planet: "mars", run: inside(185, 3.25, 0, 180, -6, [192, 4.25, 0, 20]) },
  { id: "IC03-galley-table", planet: "mars", run: inside(232, 3.15, 0, 272, -10, [266, 3.45, 0, 225]) },
  { id: "IC04-galley-counter-store", planet: "mars", run: inside(246, 3.55, 0, 212, -8, [222, 3.95, 0, 40]) },
  { id: "IC05-life-support", planet: "mars", run: inside(0, 2.6, 0, 0, -4, [14, 3.65, 0, 220]) },
  { id: "IC06-water-tanks", planet: "mars", run: inside(4, 3.55, 0, 28, -10) },
  { id: "IC07-lab-bench", planet: "mars", run: inside(40, 3.15, 0, 50, -14, [58, 3.3, 0, 300]) },
  { id: "IC08-printer-tool-wall", planet: "mars", run: inside(55, 3.75, 0, 8, -6) },
  { id: "IC09-hygiene", planet: "mars", run: inside(310, 3.2, 0, 310, -8) },
  { id: "IC10-medical-bay", planet: "mars", run: inside(66, 3.05, 0, 92, -10, [86, 3.9, 0, 300]) },
  { id: "IC11-shelter-doorway", planet: "mars", run: inside(250, 2.5, 0, 70, -6, [80, 1.0, 0, 250]) },
  { id: "IC12-inside-shelter", planet: "mars", run: inside(250, 1.05, 0, 75, -8) },
  { id: "IC13-stair-from-below", planet: "mars", run: inside(foot.b, foot.r, 0, STAIR.bearing + 90, 18, [head.b, head.r, 1, 270]) },
  { id: "IC14-landing", planet: "mars", run: inside(head.b, head.r, 1, STAIR.bearing - 90, -16) },
  { id: "IC15-crew-quarters", planet: "mars", run: inside(272.5, 3.2, 1, 268, -10, [258, 3.6, 1, 90]) },
  { id: "IC16-exercise", planet: "mars", run: inside(50, 2.9, 1, 66, -8, [84, 3.3, 1, 260]) },
  { id: "IC17-garden", planet: "mars", run: inside(160, 2.6, 1, 200, -6, [195, 3.0, 1, 30]) },
  { id: "IC18-command", planet: "mars", run: inside(250, 1.3, 1, 80, -6, [10, 1.1, 1, 200]) },
  { id: "IC19-cupola-ladder", planet: "mars", run: inside(200, 0.95, 1, 20, 38) },
  {
    id: "IC20-window-day",
    planet: "mars",
    run: (h) => {
      useGame.getState().game.t = 13;
      inside(317.5, 3.55, 1, 317.5, 0)(h);
    },
  },
);

// The home reacting to the mission (Mars). Each starts from a well-stocked, powered outpost, then sets one situation.
const fresh = () => {
  const g = useGame.getState().game;
  Object.assign(g.res, { power: 60, o2: 25, water: 350, food: 130 });
  g.sheltering = false;
  g.hazards = g.hazards.filter((x) => x.id !== 991 && x.id !== 992);
  for (const m of g.modules) {
    m.health = 100;
    m.on = true;
  }
  return g;
};
const state = (b: number, r: number, level: 0 | 1, yaw: number, pitch: number, set: (g: ReturnType<typeof fresh>) => void, fig?: [number, number, 0 | 1, number]) => (h: Hooks) => {
  set(fresh());
  inside(b, r, level, yaw, pitch, fig)(h);
};
SHOTS.push(
  {
    id: "IS01-power-cut-galley",
    planet: "mars",
    frames: 40,
    run: state(232, 3.15, 0, 272, -8, (g) => {
      g.t = 22;
      g.res.power = 0;
      for (const m of g.modules) if (m.type === "solar" || m.type === "reactor") m.on = false;
    }),
  },
  { id: "IS02-battery-low-life-support", planet: "mars", frames: 40, run: state(0, 2.6, 0, 0, -4, (g) => (g.res.power = 4)) },
  { id: "IS03-night-quarters", planet: "mars", frames: 40, run: state(272.5, 3.2, 1, 268, -10, (g) => (g.t = 23.5)) },
  {
    id: "IS04-storm-warned-core",
    planet: "mars",
    frames: 40,
    run: state(212, 2.55, 0, 334, 4, (g) => g.hazards.push({ id: 991, kind: "storm", warnAt: 10, startAt: 12, endAt: 20, strength: 1, phase: "warned" })),
  },
  {
    id: "IS05-sheltering",
    planet: "mars",
    frames: 40,
    run: state(250, 1.05, 0, 75, -8, (g) => {
      g.hazards.push({ id: 991, kind: "storm", warnAt: 8, startAt: 10, endAt: 20, strength: 1, phase: "active" });
      g.sheltering = true;
    }),
  },
  {
    id: "IS06-dust-storm-window",
    planet: "mars",
    frames: 40,
    run: state(255, 3.6, 0, 268, -2, (g) => g.hazards.push({ id: 992, kind: "dust", warnAt: 9, startAt: 10, endAt: 30, strength: 0.35, phase: "active" })),
  },
  { id: "IS07-food-low-galley", planet: "mars", frames: 40, run: state(240, 3.3, 0, 205, -8, (g) => (g.res.food = 9)) },
  {
    id: "IS08-fault-water-recovery",
    planet: "mars",
    frames: 40,
    run: state(0, 2.6, 0, 6, -4, (g) => {
      const r = g.modules.find((m) => m.type === "recycler");
      if (r) r.health = 25;
    }),
  },
  { id: "IS09-morning-galley", planet: "mars", frames: 40, run: state(232, 3.15, 0, 272, -8, (g) => (g.t = 7)) },
  { id: "IS10-evening-galley", planet: "mars", frames: 40, run: state(232, 3.15, 0, 272, -8, (g) => (g.t = 19)) },
);

/** Extra shots (interior, states, new exterior views) register themselves here. */
export function addShots(...more: Shot[]) {
  for (const s of more) {
    const i = SHOTS.findIndex((x) => x.id === s.id);
    if (i >= 0) SHOTS[i] = s;
    else SHOTS.push(s);
  }
}

async function capture(prefix: string, only?: string[]) {
  const want = (id: string) => !only || only.some((o) => id.startsWith(o));
  const done: string[] = [];
  for (const planet of ["moon", "mars"] as const) {
    const list = SHOTS.filter((s) => s.planet === planet && want(s.id));
    if (!list.length) continue;
    await setup(planet);
    for (const s of list) {
      // Each shot starts from the same clean state (rover home, no hazards added, overview).
      const g = useGame.getState().game;
      Object.assign(g.rover, { docked: true, x: DOCK.x, z: DOCK.z, heading: Math.PI, task: null });
      g.hazards = g.hazards.filter((x) => x.id !== 991);
      Object.assign(g, { t: 10.5, shield: 0, shieldStarted: false });
      if (!s.id.startsWith("I")) {
        hooks().figure?.(null);
        if (useUI.getState().view === "walk") useUI.getState().setView("orbit");
      }
      await s.run(hooks() as Hooks);
      await settle(s.frames ?? 25);
      await post(`${prefix}-${s.id}`, hooks().snap!(2));
      done.push(s.id);
    }
  }
  return done;
}

async function perf(tiers: ("low" | "high" | "ultra" | "auto")[] = ["low", "high", "ultra"]) {
  const out: Record<string, unknown> = {};
  for (const tier of tiers) {
    useUI.setState((s) => ({ settings: { ...s.settings, graphics: tier } }));
    await setup("moon");
    const res: Record<string, unknown> = {};
    const cams: [string, (h: Hooks) => void][] = [
      ["overview", (h) => h.place([30, 24, 40], [0, 0, 2])],
      ["habitat", (h) => h.place(hab([8.5, 4.2, 11]), hab([0, 0, 1.5]))],
    ];
    for (const [name, cam] of cams) {
      const h = hooks() as Hooks;
      cam(h);
      await settle(15);
      const r = h.renderer;
      r.info.autoReset = false;
      r.info.reset();
      h.snap(1);
      const calls = r.info.render.calls,
        tris = r.info.render.triangles;
      r.info.autoReset = true;
      const ms: number[] = [];
      for (let k = 0; k < 3; k++) {
        const t0 = performance.now();
        h.snap(1);
        const t1 = performance.now();
        h.snap(11);
        const t2 = performance.now();
        ms.push(+((t2 - t1 - (t1 - t0)) / 10).toFixed(1));
      }
      res[name] = { ms, calls, tris, programs: r.info.programs?.length, geometries: r.info.memory.geometries, textures: r.info.memory.textures, px: r.getPixelRatio() };
    }
    out[tier] = res;
  }
  return out;
}

/** The longest main-thread task while a mission starts (from the title screen). */
async function startup(tier: "low" | "high" | "ultra", mission = "mars-colony") {
  useUI.setState((s) => ({ settings: { ...s.settings, graphics: tier }, screen: "title" }));
  await wait(1200);
  const tasks: number[] = [];
  const po = new PerformanceObserver((l) => l.getEntries().forEach((e) => tasks.push(Math.round(e.duration))));
  po.observe({ type: "longtask" });
  const t0 = performance.now();
  delete hooks().snap;
  useGame.getState().start(mission);
  useUI.setState({ screen: "game", briefing: true, debrief: false, modal: null, panel: null, tutorial: null });
  await ready();
  const readyMs = Math.round(performance.now() - t0);
  await wait(1500);
  po.disconnect();
  return { tier, readyMs, longest: Math.max(0, ...tasks), tasks };
}

/** Stand inside the home at a bearing and distance from its centre (setting up a mission first if needed). */
async function go(bearing: number, r: number, level: 0 | 1, yaw = 0, pitch = 0, planet: Planet = "mars") {
  if (useUI.getState().screen !== "game" || !hooks().snap || useGame.getState().game.planet !== planet) await setup(planet);
  const p = polar(bearing, r);
  hooks().walk!(p.x, p.z, level, yaw, pitch);
  await settle(12);
}
/** Save what the 3D view shows right now. */
async function shot(name: string) {
  await post(name, hooks().snap!(2));
  return name;
}

/**
 * Walk the whole home with the real controls: hold W while facing the next point of a route through every room
 * on both floors, up the stair and back down. Doors open as you come near, as they do for a player. Reports the
 * rooms reached and anywhere the walker got stuck.
 */
async function walkAll(planet: Planet = "mars") {
  await go(180, 4.35, 0, 0, 0, planet);
  const { walker, walkInput } = await import("../state/walk");
  const ring = (from: number, to: number, level: 0 | 1) => {
    const pts: [number, number, 0 | 1][] = [];
    const span = ((to - from + 540) % 360) - 180;
    const n = Math.max(1, Math.ceil(Math.abs(span) / 25));
    for (let i = 1; i <= n; i++) pts.push([from + (span * i) / n, 2.42, level]);
    return pts;
  };
  // In through a door from the hall and back out: [bearing, depth into the room].
  const visit = (b: number, depth: number, level: 0 | 1): [number, number, 0 | 1][] => [
    [b, 2.42, level],
    [b, depth, level],
    [b, 2.42, level],
  ];
  const sp = (u: number) => {
    const p = stairPoint(u, (STAIR.inner + STAIR.outer) / 2);
    return [(Math.atan2(p.x, -p.z) * 180) / Math.PI, Math.hypot(p.x, p.z)] as const;
  };
  const route: [number, number, 0 | 1][] = [
    [185, 3.6, 0],
    [185, 2.42, 0],
    ...ring(185, 232, 0),
    [232, 3.3, 0],
    ...ring(232, 250, 0),
    ...visit(250, 0.7, 0),
    ...ring(250, 310, 0),
    ...visit(310, 3.55, 0),
    ...ring(310, 360, 0),
    ...visit(0, 3.55, 0),
    ...ring(0, 46, 0),
    ...visit(46, 3.45, 0),
    ...ring(46, 78, 0),
    ...visit(78, 3.6, 0),
    [92, 3.9, 0],
    [...sp(-STAIR.half - 0.45), 0],
    [...sp(STAIR.half + 0.5), 1],
    [...sp(STAIR.half + 0.5).map((v, i) => (i ? 2.42 : v)), 1] as [number, number, 1],
    ...ring(162, 165, 1),
    ...visit(165, 0.75, 1),
    ...ring(165, 185, 1),
    ...visit(185, 3.6, 1),
    ...ring(185, 227.5, 1),
    ...visit(227.5, 3.55, 1),
    ...ring(227.5, 272.5, 1),
    ...visit(272.5, 3.55, 1),
    ...ring(272.5, 317.5, 1),
    ...visit(317.5, 3.55, 1),
    ...ring(317.5, 362.5, 1),
    ...visit(2.5, 3.55, 1),
    ...ring(2.5, 58, 1),
    [58, 3.5, 1],
    ...ring(58, 158, 1),
    [...sp(STAIR.half + 0.5), 1],
    [...sp(-STAIR.half - 0.45), 0],
  ];
  const seen = new Set<string>();
  let frames = 0;
  const stuck: string[] = [];
  for (const [b, r, level] of route) {
    const goal = polar(b, r);
    let best = Infinity,
      still = 0;
    while (still < 40 && frames < 20000) {
      const d = Math.hypot(goal.x - walker.x, goal.z - walker.z);
      if (d < 0.22 && (walker.where === level || walker.where === "stair")) break;
      if (d < best - 0.02) {
        best = d;
        still = 0;
      } else still++;
      walker.yaw = Math.atan2(goal.x - walker.x, -(goal.z - walker.z));
      walkInput.keys.add("KeyW");
      hooks().snap!(1);
      frames++;
      if (walker.where !== "stair") seen.add(`${walker.where}:${roomAt(walker.x, walker.z, walker.where).id}`);
      else seen.add("stair");
      await wait(4);
    }
    if (still >= 40) stuck.push(`${b.toFixed(1)}° ${r} m floor ${level} (at ${walker.x.toFixed(2)}, ${walker.z.toFixed(2)}, ${walker.where})`);
  }
  walkInput.keys.delete("KeyW");
  const rooms = ROOMS.map((m) => `${m.level}:${m.id}`);
  return { frames, missed: rooms.filter((k) => !seen.has(k)), stair: seen.has("stair"), stuck };
}

/** Panels that overlap each other at the current window size (ignoring one fully inside another). */
function overlaps() {
  const sel = [".topbar", ".quick-actions", ".goals", ".hud-right", ".dock", ".view-switch", ".capcom", ".coach", ".drawer", ".paused-chip", ".speed-note", ".resource-bar", ".toasts", ".walk-bar", ".walk-hints", ".walk-stick", ".walk-use", ".inspect-card"];
  const els: [string, DOMRect][] = [];
  for (const s of sel)
    document.querySelectorAll(s).forEach((e) => {
      const r = e.getBoundingClientRect(),
        cs = getComputedStyle(e);
      if (r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none" && +cs.opacity > 0.05) els.push([s, r]);
    });
  const hits: string[] = [];
  const inside = (p: DOMRect, q: DOMRect) => p.left >= q.left && p.right <= q.right && p.top >= q.top && p.bottom <= q.bottom;
  for (let i = 0; i < els.length; i++)
    for (let j = i + 1; j < els.length; j++) {
      const [a, x] = els[i],
        [b, y] = els[j];
      const w = Math.min(x.right, y.right) - Math.max(x.left, y.left),
        h = Math.min(x.bottom, y.bottom) - Math.max(x.top, y.top);
      if (w > 4 && h > 4 && !inside(x, y) && !inside(y, x)) hits.push(`${a} x ${b} (${Math.round(w)}x${Math.round(h)})`);
    }
  return { size: [innerWidth, innerHeight], hits };
}

/** Enter and leave walk mode n times; GPU memory counts should come back to where they started. */
async function leak(n = 10) {
  const r = (hooks() as Hooks).renderer;
  const count = () => ({ geometries: r.info.memory.geometries, textures: r.info.memory.textures, programs: r.info.programs?.length ?? 0 });
  useUI.getState().setView("orbit");
  await settle(20);
  const before = count();
  for (let i = 0; i < n; i++) {
    useUI.getState().setView("walk");
    await settle(12);
    useUI.getState().setView("orbit");
    await settle(12);
  }
  return { before, after: count() };
}

/** Draw both floors from the floor plan in sim/home.ts (rooms, walls, doors, windows, stair, furniture) and save the image. */
async function plan() {
  const S = 64; // pixels per metre
  const W = 2 * 11 * S + 60,
    H = 11 * S + 150;
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const c = cv.getContext("2d")!;
  c.fillStyle = "#0b1022";
  c.fillRect(0, 0, W, H);
  const hues: Record<string, string> = {
    suit: "#5b7bd6", galley: "#e0a64a", hygiene: "#4fb7c9", eclss: "#56c28a", lab: "#9a7be0", medical: "#e0697a", stairs: "#6b7280",
    shelter: "#3f6fd8", landing: "#6b7280", garden: "#7fb069", q1: "#e46b6b", q2: "#d98b3a", q3: "#5fbf6a", q4: "#46b8d6", exercise: "#c86bd6", command: "#7aa2ff",
  };
  for (const level of [0, 1] as const) {
    const ox = 30 + level * (11 * S + 0) + 5.5 * S,
      oy = 95 + 5.5 * S;
    const P = (x: number, z: number): [number, number] => [ox + x * S, oy + z * S];
    c.fillStyle = "#e9ecf5";
    c.font = "700 26px system-ui";
    c.fillText(level === 0 ? "Ground floor (deck 0.5 m)" : "Upper floor (deck 3.35 m)", ox - 5.4 * S, 40);
    // Rooms as filled sectors.
    for (const m of ROOMS.filter((x) => x.level === level)) {
      c.beginPath();
      if (m.core) c.arc(ox, oy, HOME.core * S, 0, Math.PI * 2);
      else {
        const a0 = rad(m.from) - Math.PI / 2,
          a1 = rad(m.to) - Math.PI / 2;
        c.arc(ox, oy, HOME.lining * S, a0, a1);
        c.arc(ox, oy, HOME.hall * S, a1, a0, true);
      }
      c.closePath();
      c.fillStyle = hues[m.id] + "55";
      c.fill();
      const mid = m.core ? { x: 0, z: 0.35 } : polar((m.from + m.to) / 2, (HOME.hall + HOME.lining) / 2);
      c.fillStyle = "#ffffff";
      c.font = "600 15px system-ui";
      c.textAlign = "center";
      c.fillText(m.name, ...P(mid.x, mid.z));
    }
    // Stair.
    c.fillStyle = level === 0 ? "#9aa3b488" : "#00000066";
    c.beginPath();
    for (const [u, w] of [[-STAIR.half, STAIR.inner], [STAIR.half, STAIR.inner], [STAIR.half, STAIR.outer], [-STAIR.half, STAIR.outer]] as const) {
      const p = stairPoint(u, w);
      c.lineTo(...P(p.x, p.z));
    }
    c.closePath();
    c.fill();
    for (let i = 1; i < STAIR.risers; i++) {
      const u = -STAIR.half + (2 * STAIR.half * i) / STAIR.risers;
      const a = stairPoint(u, STAIR.inner),
        b = stairPoint(u, STAIR.outer);
      c.strokeStyle = "#ffffff44";
      c.beginPath();
      c.moveTo(...P(a.x, a.z));
      c.lineTo(...P(b.x, b.z));
      c.stroke();
    }
    const up = stairPoint(level === 0 ? -STAIR.half + 0.3 : STAIR.half - 0.3, (STAIR.inner + STAIR.outer) / 2);
    c.fillStyle = "#ffffff";
    c.fillText(level === 0 ? "UP" : "DOWN", ...P(up.x, up.z));
    // Walls, doors (dashed) and furniture.
    for (const s of walls(level)) {
      c.strokeStyle = s.door ? "#ffcf5a" : "#ffffff";
      c.lineWidth = s.door ? 3 : 4;
      c.setLineDash(s.door ? [6, 5] : []);
      c.beginPath();
      c.moveTo(...P(s.ax, s.az));
      c.lineTo(...P(s.bx, s.bz));
      c.stroke();
    }
    c.setLineDash([]);
    // Windows: blue bars on the wall.
    for (const w of WINDOWS.filter((x) => x.level === level)) {
      const half = ((w.w / 2 / HOME.lining) * 180) / Math.PI;
      c.strokeStyle = "#69c8ff";
      c.lineWidth = 9;
      c.beginPath();
      c.arc(ox, oy, HOME.lining * S + 6, rad(w.bearing - half) - Math.PI / 2, rad(w.bearing + half) - Math.PI / 2);
      c.stroke();
    }
    if (level === 0) {
      // The airlock and where a walk starts.
      const a = polar(180, HOME.lining + 0.32);
      c.fillStyle = "#ffffff";
      c.fillText("AIRLOCK ↓", ...P(a.x, a.z));
      c.beginPath();
      c.arc(...P(SPAWN.x, SPAWN.z), 7, 0, Math.PI * 2);
      c.fillStyle = "#3ee39a";
      c.fill();
    }
  }
  // Compass, scale bar and key.
  c.textAlign = "left";
  c.fillStyle = "#c2cbec";
  c.font = "500 15px system-ui";
  c.fillText("N ↑   1 m:", 30, H - 30);
  c.fillRect(120, H - 40, S, 6);
  c.fillText("White: walls · dashed yellow: sliding doors · blue: windows · green dot: where a walk starts", 210, H - 30);
  const url = cv.toDataURL("image/png");
  await post("plan-floors", url);
  return url.length;
}

Object.assign(window, { __qc: { capture, perf, startup, overlaps, leak, plan, post, go, shot, walkAll, shots: () => SHOTS.map((s) => s.id) } });
