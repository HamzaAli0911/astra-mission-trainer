import { FURNITURE } from "./furniture";
import type { Seg } from "./home";
import type { ModuleType } from "./types";

/**
 * The colony campus around the original habitat (Hab-1): a command HQ, two pressurised spines and the buildings
 * along them, airlocks, a rover garage and outdoor compounds. One data source for the 3D model, walking and rover
 * collision, the floor plan, the HUD and the tests, in world metres.
 *
 * World coordinates: origin at Hab-1's centre on the ground, x east, z south, y up. Every campus floor is at
 * y = FLOOR (Hab-1's ground floor height), so walking from Hab-1 into the campus needs no ramp. Rectangles are
 * axis-aligned (x0 < x1, z0 < z1) and give the clear inside of a room; walls stand on their edges.
 *
 *            N (−z)
 *        pad field + Hab-1          power compound (NE, outdoors); reactor compound far to the east
 *              |  T0 link
 *   J ── W1 spine ── HQ ── E1 spine ── G
 *     C  F  (K) (E)          Y  D  (I) (H)        (south of a spine in brackets)
 *            S (+z): garage door, EVA apron, lander pad
 */

export const FLOOR = 0.5;
/** Clear heights: corridors, ordinary rooms, the command hall (double height), and the mezzanine's floor height. */
export const CEILING = { corridor: 2.7, room: 3.1, hall: 8.2, hangar: 7.5 };
export const MEZZANINE = FLOOR + 4.3;
/** Wall thickness: outer (insulated pressure shell) and inner partitions. */
export const WALL = { outer: 0.4, inner: 0.15 };

/** How far the colony has been built: 0 for the first Moon missions, 1 for the later ones, 2 on Mars and in free play. */
export type Stage = 0 | 1 | 2;
const STAGE_OF: Record<string, Stage> = { "first-light": 0, "ice-hunters": 0, "green-thumb": 1, "solar-storm": 1, "red-planet": 2, "mars-colony": 2, "free-moon": 2, "free-mars": 2 };
export const stageOf = (missionId: string): Stage => STAGE_OF[missionId] ?? 2;

export interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}
const R = (x0: number, z0: number, x1: number, z1: number): Rect => ({ x0, z0, x1, z1 });
export const centre = (r: Rect) => ({ x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2 });
export const inRect = (r: Rect, x: number, z: number, pad = 0) => x >= r.x0 - pad && x <= r.x1 + pad && z >= r.z0 - pad && z <= r.z1 + pad;

export type BuildingId = "hab" | "link" | "hq" | "w1" | "e1" | "lifesupport" | "clinic" | "shelter" | "greenhouse" | "logistics" | "yard" | "science" | "garage" | "eva" | "engineering" | "power" | "reactor";

export interface Building {
  id: BuildingId;
  /** The brief's letter (A command, B living, ...), or "" for connectors and compounds. */
  letter: string;
  name: string;
  /** What it is for, in one line (the floor plan and signs). */
  role: string;
  /** Clear inside (outdoor compounds: their fenced area). */
  rect: Rect;
  /** Height of the roof above the ground. */
  height: number;
  stage: Stage;
  /** Pressurised inside (walkable in shirt-sleeves), an unpressurised hangar, or an outdoor compound. */
  kind: "pressurised" | "hangar" | "compound";
  /** Outpost modules whose real state it shows (support buildings make nothing themselves). */
  binds?: ModuleType[];
}

export interface Cell {
  id: string;
  building: BuildingId;
  name: string;
  rect: Rect;
  /** 0: the ground floor (shared with Hab-1's ground floor), 2: the command mezzanine. */
  level: 0 | 2;
  /** Clear height above its floor. */
  height: number;
  kind: "room" | "corridor" | "hall" | "lock" | "hangar";
}

export type PortalKind = "open" | "door" | "lock-inner" | "lock-outer" | "vehicle";
export interface Portal {
  id: string;
  /** The cells either side ("outside" for the surface, "hab" for Hab-1's tunnel door). */
  a: string;
  b: string;
  /** Centre of the opening, the axis its wall runs along, and its clear width. */
  x: number;
  z: number;
  along: "x" | "z";
  width: number;
  kind: PortalKind;
  level: 0 | 2;
}

export const BUILDINGS: Building[] = [
  { id: "hab", letter: "B", name: "Hab-1 (crew residence)", role: "The original two-storey home: quarters, galley, hygiene, exercise, garden", rect: R(-5.2, -5.2, 5.2, 5.2), height: 7.9, stage: 0, kind: "pressurised" },
  { id: "link", letter: "", name: "Hab-1 link", role: "Pressurised tunnel from Hab-1 to the command HQ", rect: R(-1.6, 4.88, 1.6, 34.0), height: 3.2, stage: 0, kind: "pressurised" },
  { id: "hq", letter: "A", name: "Command HQ", role: "Mission operations: the double-height operations hall, command mezzanine, briefing room", rect: R(-14, 34.4, 14, 56.4), height: 9.2, stage: 0, kind: "pressurised" },
  { id: "w1", letter: "", name: "West spine", role: "Pressurised corridor to the west wing", rect: R(-76, 45.4, -14.4, 48.6), height: 3.4, stage: 1, kind: "pressurised" },
  { id: "e1", letter: "", name: "East spine", role: "Pressurised corridor to the east wing", rect: R(14.4, 45.4, 76, 48.6), height: 3.4, stage: 0, kind: "pressurised" },
  { id: "lifesupport", letter: "C", name: "Life support block", role: "Air and water: oxygen plant and recycler controls, tanks, manifolds", rect: R(-60, 31, -40, 45), height: 4.4, stage: 1, kind: "pressurised", binds: ["oxygen", "recycler"] },
  { id: "clinic", letter: "F", name: "Medical clinic", role: "Exam and treatment bays, isolation room, crew health", rect: R(-36, 33, -22, 45), height: 4.2, stage: 2, kind: "pressurised" },
  { id: "shelter", letter: "K", name: "Storm shelter", role: "Water-walled refuge under a regolith berm, for solar storms", rect: R(-34, 49, -20, 61), height: 3.6, stage: 1, kind: "pressurised", binds: ["shelter"] },
  { id: "greenhouse", letter: "E", name: "Greenhouse", role: "Hydroponic racks fed by the greenhouse modules: crops, water, LED light", rect: R(-66, 49, -42, 67), height: 5.2, stage: 1, kind: "pressurised", binds: ["greenhouse"] },
  { id: "logistics", letter: "J", name: "Logistics store", role: "Food, water and parts stores, cargo bay", rect: R(-96.4, 39, -76.4, 55), height: 5.0, stage: 1, kind: "pressurised" },
  { id: "yard", letter: "", name: "Yard lock", role: "Small airlock out to the module field", rect: R(18, 38, 24, 45), height: 3.6, stage: 0, kind: "pressurised" },
  { id: "science", letter: "D", name: "Science lab", role: "Sample preparation, glovebox, microscopes, sample store", rect: R(30, 29, 54, 45), height: 4.4, stage: 1, kind: "pressurised", binds: ["lab"] },
  { id: "garage", letter: "I", name: "Rover garage", role: "Unpressurised hangar: crew rover charging bay and the science rover's bay", rect: R(20, 49, 46, 69), height: 8.0, stage: 0, kind: "hangar" },
  { id: "eva", letter: "H", name: "EVA complex", role: "Suit room, dust lock and the main airlock to the surface", rect: R(50, 49, 70, 63), height: 4.2, stage: 0, kind: "pressurised" },
  { id: "engineering", letter: "G", name: "Engineering workshop", role: "Repair bays, parts printers, workbenches, power desk", rect: R(76.4, 39, 100.4, 55), height: 5.0, stage: 2, kind: "pressurised", binds: ["battery", "solar", "reactor"] },
  { id: "power", letter: "L", name: "Power compound", role: "Switchyard, battery enclosures and radiators (outdoors)", rect: R(44, -62, 84, -30), height: 4.0, stage: 2, kind: "compound" },
  { id: "reactor", letter: "", name: "Reactor compound", role: "Fenced and far from the living areas", rect: R(150, -80, 174, -56), height: 6.0, stage: 2, kind: "compound" },
];
export const building = (id: BuildingId) => BUILDINGS.find((b) => b.id === id)!;

const cell = (id: string, b: BuildingId, name: string, rect: Rect, kind: Cell["kind"] = "room", level: 0 | 2 = 0, height = kind === "corridor" ? CEILING.corridor : CEILING.room): Cell => ({ id, building: b, name, rect, level, height, kind });

export const CELLS: Cell[] = [
  // Hab-1's link: a short tunnel through its old airlock, then a corridor south to the HQ.
  cell("link-tunnel", "link", "Hab-1 link", R(-0.8, 4.88, 0.8, 8.9), "corridor"),
  cell("link", "link", "Hab-1 link", R(-1.6, 8.9, 1.6, 34.0), "corridor"),
  // Command HQ: lobby with the briefing room and equipment room either side, then the double-height hall.
  cell("hq-lobby", "hq", "HQ lobby", R(-6, 34.4, 6, 40)),
  cell("hq-briefing", "hq", "Briefing room", R(-14, 34.4, -6.15, 40)),
  cell("hq-equipment", "hq", "Comms equipment room", R(6.15, 34.4, 14, 40)),
  cell("hq-hall", "hq", "Operations hall", R(-14, 40.15, 14, 56.4), "hall", 0, CEILING.hall),
  cell("hq-mezzanine", "hq", "Command mezzanine", R(-14, 50.4, 14, 56.4), "room", 2, CEILING.hall - (MEZZANINE - FLOOR)),
  // The spines.
  cell("w1", "w1", "West spine", R(-76, 45.4, -14.4, 48.6), "corridor"),
  cell("e1", "e1", "East spine", R(14.4, 45.4, 76, 48.6), "corridor"),
  // West wing.
  cell("ls-plant", "lifesupport", "Life support: plant room", R(-60, 31, -40, 40.5)),
  cell("ls-control", "lifesupport", "Life support: control room", R(-60, 40.65, -40, 45)),
  cell("clinic-bays", "clinic", "Clinic: treatment bays", R(-36, 33, -22, 41)),
  cell("clinic-iso", "clinic", "Clinic: isolation room", R(-36, 41.15, -29.1, 45)),
  cell("clinic-store", "clinic", "Clinic: supplies", R(-28.95, 41.15, -22, 45)),
  cell("shelter", "shelter", "Storm shelter", R(-34, 49, -20, 61)),
  cell("gh-hall", "greenhouse", "Greenhouse: growing hall", R(-66, 49, -42, 63)),
  cell("gh-prep", "greenhouse", "Greenhouse: prep and nutrient room", R(-66, 63.15, -42, 67)),
  cell("log-store", "logistics", "Logistics: main store", R(-96.4, 39, -76.4, 51)),
  cell("log-bay", "logistics", "Logistics: cargo bay", R(-96.4, 51.15, -76.4, 55)),
  // East wing.
  cell("yard-stage", "yard", "Yard lock: suit-up", R(18, 41.6, 24, 45), "room"),
  cell("yard-lock", "yard", "Yard lock: airlock", R(18.8, 38, 23.2, 41.45), "lock"),
  cell("sci-lab", "science", "Science lab", R(30, 29, 54, 39.5)),
  cell("sci-store", "science", "Sample store", R(30, 39.65, 41.9, 45)),
  cell("sci-brief", "science", "Science briefing nook", R(42.05, 39.65, 54, 45)),
  cell("garage", "garage", "Rover garage", R(20, 49, 46, 69), "hangar", 0, CEILING.hangar),
  cell("eva-suit", "eva", "EVA complex: suit room", R(50, 49, 70, 55.5)),
  cell("eva-dust", "eva", "EVA complex: dust lock", R(50, 55.65, 61.85, 63)),
  cell("eva-lock", "eva", "EVA complex: airlock", R(62, 55.65, 70, 63), "lock"),
  cell("eng-shop", "engineering", "Engineering: workshop", R(76.4, 39, 100.4, 50)),
  cell("eng-bay", "engineering", "Engineering: repair bay", R(76.4, 50.15, 92, 55)),
  cell("eng-power", "engineering", "Engineering: power desk", R(92.15, 50.15, 100.4, 55)),
];
export const cellById = (id: string) => CELLS.find((c) => c.id === id);

const P = (id: string, a: string, b: string, x: number, z: number, along: "x" | "z", width: number, kind: PortalKind = "door", level: 0 | 2 = 0): Portal => ({ id, a, b, x, z, along, width, kind, level });
/** Every opening: doors (slide open as you come near), open archways, airlock doors and the garage's vehicle door. */
export const PORTALS: Portal[] = [
  P("hab-door", "hab", "link-tunnel", 0, 4.88, "x", 1.6, "open"),
  P("link-join", "link-tunnel", "link", 0, 8.9, "x", 1.6, "open"),
  P("hq-north", "link", "hq-lobby", 0, 34.2, "x", 1.6),
  P("hq-briefing", "hq-lobby", "hq-briefing", -6.075, 37.4, "z", 1.2),
  P("hq-equipment", "hq-lobby", "hq-equipment", 6.075, 37.4, "z", 1.2),
  P("hq-lobby-hall", "hq-lobby", "hq-hall", 0, 40.075, "x", 3.2),
  P("hq-west", "hq-hall", "w1", -14.2, 47, "z", 1.8),
  P("hq-east", "hq-hall", "e1", 14.2, 47, "z", 1.8),
  // West wing doors off the spine.
  P("ls-door", "w1", "ls-control", -50, 45.2, "x", 1.4),
  P("ls-plant", "ls-control", "ls-plant", -50, 40.575, "x", 1.4),
  P("clinic-door", "w1", "clinic-store", -25.5, 45.2, "x", 1.4),
  P("clinic-store-bays", "clinic-store", "clinic-bays", -25.5, 41.075, "x", 1.4),
  P("clinic-iso", "clinic-bays", "clinic-iso", -32.5, 41.075, "x", 1.2),
  P("shelter-door", "w1", "shelter", -27, 48.8, "x", 1.2),
  P("gh-door", "w1", "gh-hall", -54, 48.8, "x", 1.6),
  P("gh-prep", "gh-hall", "gh-prep", -54, 63.075, "x", 1.4),
  P("log-door", "w1", "log-store", -76.2, 47, "z", 1.6),
  P("log-bay", "log-store", "log-bay", -86.4, 51.075, "x", 3.0),
  // East wing.
  P("yard-door", "e1", "yard-stage", 21, 45.2, "x", 1.2),
  P("yard-inner", "yard-stage", "yard-lock", 21, 41.525, "x", 1.1, "lock-inner"),
  P("yard-outer", "yard-lock", "outside", 21, 37.8, "x", 1.1, "lock-outer"),
  P("sci-door", "e1", "sci-brief", 46, 45.2, "x", 1.4),
  P("sci-brief-lab", "sci-brief", "sci-lab", 48, 39.575, "x", 1.4),
  P("sci-store", "sci-lab", "sci-store", 36, 39.575, "x", 1.2),
  P("eva-door", "e1", "eva-suit", 60, 48.8, "x", 1.4),
  P("eva-dust", "eva-suit", "eva-dust", 56, 55.575, "x", 1.2),
  P("eva-inner", "eva-dust", "eva-lock", 61.925, 59.3, "z", 1.1, "lock-inner"),
  P("eva-outer", "eva-lock", "outside", 66, 63.2, "x", 1.2, "lock-outer"),
  P("eng-door", "e1", "eng-shop", 76.2, 47, "z", 1.6),
  P("eng-bay", "eng-shop", "eng-bay", 84, 50.075, "x", 3.0),
  P("eng-power", "eng-shop", "eng-power", 96, 50.075, "x", 1.2),
  // The top of the HQ stair: the gap in the mezzanine's rail.
  P("hq-stair-top", "hq-stair", "hq-mezzanine", -9.3, 50.4, "x", 1.4, "open", 2),
  // The garage: a wide vehicle door to the apron, and a side door for walkers in suits.
  P("garage-vehicle", "garage", "outside", 33, 69.2, "x", 20, "vehicle"),
  P("garage-side", "garage", "outside", 46.2, 66, "z", 1.4, "open"),
];

/**
 * Windows in the campus's outer walls: on a room's edge (`side`), centred `at` along it, `width` wide, from `y0` to
 * `y1` above the ground. They don't change where you can walk, only what the walls are made of.
 */
export interface Win {
  id: string;
  cell: string;
  side: Side;
  at: number;
  width: number;
  y0: number;
  y1: number;
}
const W = (id: string, cell: string, side: Side, at: number, width: number, y0: number, y1: number): Win => ({ id, cell, side, at, width, y0, y1 });
export const CAMPUS_WINDOWS: Win[] = [
  // The link: a row of windows on its east side, looking out over the pad field.
  ...[12.5, 17.3, 22.1, 26.9].map((z, i) => W(`link-${i + 1}`, "link", "e", z, 2.0, FLOOR + 1.0, FLOOR + 2.2)),
  // The HQ: the lobby looks north to Hab-1, the briefing room west, the mezzanine south over the landing apron.
  W("hq-lobby-w", "hq-lobby", "n", -3.6, 2.4, FLOOR + 1.0, FLOOR + 2.3),
  W("hq-lobby-e", "hq-lobby", "n", 3.6, 2.4, FLOOR + 1.0, FLOOR + 2.3),
  W("hq-briefing-1", "hq-briefing", "w", 35.9, 1.6, FLOOR + 1.0, FLOOR + 2.2),
  W("hq-briefing-2", "hq-briefing", "w", 38.5, 1.6, FLOOR + 1.0, FLOOR + 2.2),
  ...[-9, -3, 3, 9].map((x, i) => W(`hq-mezzanine-${i + 1}`, "hq-hall", "s", x, 5.2, MEZZANINE + 0.95, MEZZANINE + 2.75)),
  // The EVA complex's suit room, over its service bench.
  W("eva-suit", "eva-suit", "e", 52.2, 1.4, FLOOR + 1.1, FLOOR + 2.0),
];
/** The windows on one edge of a room. */
export const windowsOn = (cell: string, side: Side) => CAMPUS_WINDOWS.filter((w) => w.cell === cell && w.side === side);

/**
 * Furniture and fittings that stand on the floor (what you bump into is what you see): a box in a room, `h` tall,
 * its front facing `face` (desks: the side the operator sits at; racks and cabinets: the side you use).
 */
export interface Furniture {
  id: string;
  cell: string;
  kind: string;
  rect: Rect;
  h: number;
  face: Side;
}
export { FURNITURE };
export const furnitureById = (id: string) => FURNITURE.find((f) => f.id === id);

/** The HQ's feature stair: a straight open flight in the hall, rising south (+z) to the mezzanine's edge. */
export const HQ_STAIR = { x0: -10, x1: -8.6, z0: 44.0, z1: 50.4 };
/** Stairs between campus floors (for route finding): from the cell at the foot to the cell at the top. */
export const STAIR_LINKS = [{ id: "hq-stair", from: "hq-hall", to: "hq-mezzanine" }];

/** Buildings joined by a doorway (Hab-1 by its link), for drawing only the insides you could see into. */
export const NEIGHBOURS: Map<BuildingId, Set<BuildingId>> = (() => {
  const of = (id: string): BuildingId | null => (id === "hab" ? "hab" : (CELLS.find((c) => c.id === id)?.building ?? null));
  const out = new Map<BuildingId, Set<BuildingId>>();
  for (const p of PORTALS) {
    const a = of(p.a),
      b = of(p.b);
    if (!a || !b || a === b) continue;
    for (const [x, y] of [
      [a, b],
      [b, a],
    ] as const) {
      if (!out.has(x)) out.set(x, new Set());
      out.get(x)!.add(y);
    }
  }
  return out;
})();
/** The building a walker is in (Hab-1 counts), or null outside. */
export function buildingAt(x: number, z: number, floor: number): BuildingId | null {
  const c = cellAt(x, z, floor === 2 ? 2 : 0);
  if (c) return c.building;
  return Math.hypot(x, z) < 5.3 ? "hab" : null;
}

/** Which buildings exist at a stage (the rest are foundations and scaffolding, with their doors locked). */
export const built = (b: Building, stage: Stage) => b.stage <= stage;
/** Is a cell open to walk into at this stage? */
export const cellOpen = (c: Cell, stage: Stage) => built(building(c.building), stage);

/** A rectangle with a hole cut out of it, as up to four rectangles. */
function subtract(a: Rect, h: Rect): Rect[] {
  if (h.x0 >= a.x1 || h.x1 <= a.x0 || h.z0 >= a.z1 || h.z1 <= a.z0) return [a];
  const out = [R(a.x0, a.z0, h.x0, a.z1), R(h.x1, a.z0, a.x1, a.z1), R(Math.max(a.x0, h.x0), a.z0, Math.min(a.x1, h.x1), h.z0), R(Math.max(a.x0, h.x0), h.z1, Math.min(a.x1, h.x1), a.z1)];
  return out.filter((r) => r.x1 - r.x0 > 1e-6 && r.z1 - r.z0 > 1e-6);
}
/**
 * The doorway of an airlock's outer door, seen from outside: a notch through the wall into the chamber's first
 * 0.8 m, so a suited walker can step right up into the open door (the walk then carries on inside, sim/home.ts).
 */
export function doorwayNotch(p: Portal): Rect {
  const c = cellById(p.a === "outside" ? p.b : p.a)!;
  const r = c.rect,
    h = p.width / 2,
    t = WALL.outer + 0.01;
  if (p.along === "x") return p.z > (r.z0 + r.z1) / 2 ? R(p.x - h, r.z1 - 0.8, p.x + h, r.z1 + t) : R(p.x - h, r.z0 - t, p.x + h, r.z0 + 0.8);
  return p.x > (r.x0 + r.x1) / 2 ? R(r.x1 - 0.8, p.z - h, r.x1 + t, p.z + h) : R(r.x0 - t, p.z - h, r.x0 + 0.8, p.z + h);
}
/** The slab of a closed outer door, for walkers outside. */
export function doorSlab(p: Portal): Rect {
  const h = p.width / 2;
  return p.along === "x" ? R(p.x - h, p.z - 0.06, p.x + h, p.z + 0.06) : R(p.x - 0.06, p.z - h, p.x + 0.06, p.z + h);
}
/** The airlocks' outer doors. */
export const OUTER_DOORS = PORTALS.filter((p) => p.kind === "lock-outer");

/**
 * Regolith banked against outer walls as shielding (radiation and micrometeoroids), at its natural angle of repose
 * (about 35°): `face` is the wall's outer face, the bank runs from `from` to `to` along it, `h` high at the wall.
 * Kept clear of doors, windows and where corridors join. Solid for rovers and suited walkers.
 */
export interface Berm {
  id: string;
  building: BuildingId;
  side: Side;
  face: number;
  from: number;
  to: number;
  h: number;
}
const REPOSE = Math.tan((35 * Math.PI) / 180);
/** How far a bank reaches out from the wall: a flat top 0.4 m wide, then the slope. */
export const bermDepth = (b: Berm) => 0.4 + b.h / REPOSE;
export const BERMS: Berm[] = [
  { id: "hq-n-w", building: "hq", side: "n", face: 34.0, from: -14.4, to: -5.2, h: 1.8 },
  { id: "hq-n-e", building: "hq", side: "n", face: 34.0, from: 5.2, to: 14.4, h: 1.8 },
  { id: "hq-w-n", building: "hq", side: "w", face: -14.4, from: 39.8, to: 44.6, h: 1.8 },
  { id: "hq-w-s", building: "hq", side: "w", face: -14.4, from: 49.4, to: 56.8, h: 1.8 },
  { id: "hq-e-n", building: "hq", side: "e", face: 14.4, from: 34.0, to: 44.6, h: 1.8 },
  { id: "hq-e-s", building: "hq", side: "e", face: 14.4, from: 49.4, to: 56.8, h: 1.8 },
  { id: "hq-s", building: "hq", side: "s", face: 56.8, from: -14.4, to: 14.4, h: 1.8 },
  { id: "eva-e", building: "eva", side: "e", face: 70.4, from: 53.4, to: 63.4, h: 1.8 },
  { id: "eva-s", building: "eva", side: "s", face: 63.4, from: 49.6, to: 64.3, h: 1.8 },
  { id: "link-w", building: "link", side: "w", face: -2.0, from: 14.0, to: 34.0, h: 1.6 },
];
/** A bank's footprint on the ground. */
export function bermRect(b: Berm): Rect {
  const d = bermDepth(b);
  if (b.side === "n") return R(b.from, b.face - d, b.to, b.face);
  if (b.side === "s") return R(b.from, b.face, b.to, b.face + d);
  if (b.side === "w") return R(b.face - d, b.from, b.face, b.to);
  return R(b.face, b.from, b.face + d, b.to);
}

/** Outdoor solids for rovers and suited walkers: every building's footprint with its walls (the garage as walls only). */
export function campusSolids(): Rect[] {
  const out: Rect[] = [];
  const t = WALL.outer;
  for (const b of BUILDINGS) {
    if (b.id === "hab" || b.kind === "compound") continue;
    if (b.kind === "hangar") {
      // Three walls and the stubs either side of the vehicle door; the side door is a gap in the east wall.
      const r = b.rect;
      out.push(R(r.x0 - t, r.z0 - t, r.x1 + t, r.z0), R(r.x0 - t, r.z0, r.x0, r.z1 + t), R(r.x1, r.z0, r.x1 + t, 65.3), R(r.x1, 66.7, r.x1 + t, r.z1 + t));
      out.push(R(r.x0, r.z1, 23, r.z1 + t), R(43, r.z1, r.x1, r.z1 + t));
      continue;
    }
    let pieces = [R(b.rect.x0 - t, b.rect.z0 - t, b.rect.x1 + t, b.rect.z1 + t)];
    for (const p of OUTER_DOORS) {
      if (cellById(p.a === "outside" ? p.b : p.a)?.building !== b.id) continue;
      const notch = doorwayNotch(p);
      pieces = pieces.flatMap((q) => subtract(q, notch));
    }
    out.push(...pieces);
  }
  for (const p of COMPOUND_PARTS) out.push(p.rect);
  for (const b of BERMS) out.push(bermRect(b));
  // Furniture in the garage (walked in a suit, driven in by rovers).
  for (const f of FURNITURE) if (cellById(f.cell)?.kind === "hangar") out.push(f.rect);
  return out;
}

/**
 * The outdoor compounds' fences (each with a gate on its west side) and the equipment inside them. The reactor
 * itself is a module on the reactor compound's pad (world.ts, pad 16), so it isn't listed here.
 */
export interface Part {
  id: string;
  building: BuildingId;
  rect: Rect;
  height: number;
  kind: "fence" | "battery" | "switchyard" | "radiator";
}
const fence = (b: BuildingId, r: Rect, gate: number): Part[] => {
  const t = 0.12;
  return [
    { id: `${b}-fence-n`, building: b, rect: R(r.x0, r.z0, r.x1, r.z0 + t), height: 2.4, kind: "fence" },
    { id: `${b}-fence-s`, building: b, rect: R(r.x0, r.z1 - t, r.x1, r.z1), height: 2.4, kind: "fence" },
    { id: `${b}-fence-e`, building: b, rect: R(r.x1 - t, r.z0, r.x1, r.z1), height: 2.4, kind: "fence" },
    { id: `${b}-fence-w1`, building: b, rect: R(r.x0, r.z0, r.x0 + t, gate - 2), height: 2.4, kind: "fence" },
    { id: `${b}-fence-w2`, building: b, rect: R(r.x0, gate + 2, r.x0 + t, r.z1), height: 2.4, kind: "fence" },
  ];
};
export const COMPOUND_PARTS: Part[] = [
  ...fence("power", building("power").rect, -46),
  ...[50, 58, 66].map((x, i): Part => ({ id: `power-battery-${i + 1}`, building: "power", rect: R(x, -58, x + 6, -52), height: 2.6, kind: "battery" })),
  { id: "power-switchyard", building: "power", rect: R(52, -44, 66, -36), height: 3.2, kind: "switchyard" },
  { id: "power-radiator-1", building: "power", rect: R(74, -56, 75.2, -36), height: 3.8, kind: "radiator" },
  { id: "power-radiator-2", building: "power", rect: R(79, -56, 80.2, -36), height: 3.8, kind: "radiator" },
  ...fence("reactor", building("reactor").rect, -68),
];

/** The point of a rectangle nearest to (x, z), and how far away it is. */
export function rectDistance(r: Rect, x: number, z: number) {
  const cx = Math.max(r.x0, Math.min(r.x1, x)),
    cz = Math.max(r.z0, Math.min(r.z1, z));
  return { x: cx, z: cz, d: Math.hypot(x - cx, z - cz) };
}

/** The cell at a point on a level, if it's inside the campus. */
export function cellAt(x: number, z: number, level: number) {
  return CELLS.find((c) => c.level === level && inRect(c.rect, x, z, 0.02)) ?? null;
}

/** Where the suits hang, by each airlock's staging side: the front of the rack, which you face to suit up. */
export const SUIT_RACKS = [
  { airlock: "eva", cell: "eva-suit", x: 64.5, z: 49.65 },
  { airlock: "yard", cell: "yard-stage", x: 18.65, z: 43.3 },
];
/** The control panel on the wall inside each airlock's chamber, and its twin outside beside the outer door. */
export const LOCK_PANELS = [
  { airlock: "eva", inside: { x: 69.92, z: 59.3 }, outside: { x: 67.4, z: 63.45 } },
  { airlock: "yard", inside: { x: 23.12, z: 39.7 }, outside: { x: 22.2, z: 37.55 } },
];
export const portalById = (id: string) => PORTALS.find((p) => p.id === id);

/** An airlock: its two doors, its chamber, the room you suit up in, and where you stand once outside. */
export interface Airlock {
  id: "eva" | "yard";
  name: string;
  inner: string;
  outer: string;
  chamber: string;
  stage: string;
  outside: { x: number; z: number; yaw: number };
}
export const AIRLOCKS: Airlock[] = [
  // (yaw: a compass bearing in radians, 0 north, as the walker's; on the porch, facing away from the door.)
  { id: "eva", name: "EVA complex airlock", inner: "eva-inner", outer: "eva-outer", chamber: "eva-lock", stage: "eva-dust", outside: { x: 66, z: 64.4, yaw: Math.PI } },
  { id: "yard", name: "Yard lock", inner: "yard-inner", outer: "yard-outer", chamber: "yard-lock", stage: "yard-stage", outside: { x: 21, z: 36.6, yaw: 0 } },
];

/** The outdoor solids in 8 m buckets (each listed in every bucket it comes within 3 m of), so lookups stay cheap. */
const SOLID_BUCKET = 8;
let solidGrid: Map<string, Rect[]> | null = null;
export function solidsNear(x: number, z: number): Rect[] {
  if (!solidGrid) {
    solidGrid = new Map();
    for (const r of campusSolids())
      for (let bx = Math.floor((r.x0 - 3) / SOLID_BUCKET); bx <= Math.floor((r.x1 + 3) / SOLID_BUCKET); bx++)
        for (let bz = Math.floor((r.z0 - 3) / SOLID_BUCKET); bz <= Math.floor((r.z1 + 3) / SOLID_BUCKET); bz++) {
          const key = `${bx},${bz}`;
          const list = solidGrid.get(key);
          if (list) list.push(r);
          else solidGrid.set(key, [r]);
        }
  }
  return solidGrid.get(`${Math.floor(x / SOLID_BUCKET)},${Math.floor(z / SOLID_BUCKET)}`) ?? NONE;
}
const NONE: Rect[] = [];
/** Does a circle at (x, z) of radius r (up to 3 m) overlap a building, a wall or a compound's equipment? */
export const hitsCampus = (x: number, z: number, r: number) => solidsNear(x, z).some((s) => rectDistance(s, x, z).d < r);

/* ---------- Walls for walking inside ---------- */

/** Which edge of a cell an opening is on, and where along it. */
function edgeOf(c: Cell, p: Portal) {
  const r = c.rect;
  if (p.along === "x") return { side: Math.abs(p.z - r.z0) < Math.abs(p.z - r.z1) ? ("n" as const) : ("s" as const), at: p.x };
  return { side: Math.abs(p.x - r.x0) < Math.abs(p.x - r.x1) ? ("w" as const) : ("e" as const), at: p.z };
}
const line = (ax: number, az: number, bx: number, bz: number): Seg => ({ ax, az, bx, bz });
/** The cell (or "outside", "hab", "hq-stair") on each side of an opening, as rectangles' facing edges. */
function faces(p: Portal) {
  const ends = [p.a, p.b].map((id) => {
    const c = cellById(id);
    if (!c) return null;
    const r = c.rect;
    return p.along === "x" ? (Math.abs(p.z - r.z0) < Math.abs(p.z - r.z1) ? r.z0 : r.z1) : Math.abs(p.x - r.x0) < Math.abs(p.x - r.x1) ? r.x0 : r.x1;
  });
  return ends;
}

/** Inside walls cells: every pressurised room, corridor and airlock (the garage is walked in a suit, outside). */
const indoor = (c: Cell) => c.kind !== "hangar";

export type Side = "n" | "s" | "w" | "e";
export interface Edge {
  side: Side;
  /** The edge's fixed coordinate (z for n and s, x for w and e), and its extent along the other axis. */
  fixed: number;
  from: number;
  to: number;
  /** Openings in it: centre along the edge, half-width, and the opening. */
  gaps: { at: number; half: number; portal: Portal }[];
  /** The solid runs between the openings. */
  runs: [number, number][];
}
/** A room's four walls, with their openings (the 3D model and the walls for walking both come from this). */
export function cellEdges(c: Cell): Edge[] {
  const r = c.rect;
  const edges: Edge[] = [
    { side: "n", fixed: r.z0, from: r.x0, to: r.x1, gaps: [], runs: [] },
    { side: "s", fixed: r.z1, from: r.x0, to: r.x1, gaps: [], runs: [] },
    { side: "w", fixed: r.x0, from: r.z0, to: r.z1, gaps: [], runs: [] },
    { side: "e", fixed: r.x1, from: r.z0, to: r.z1, gaps: [], runs: [] },
  ];
  for (const p of PORTALS) {
    if (p.level !== c.level || (p.a !== c.id && p.b !== c.id)) continue;
    const { side, at } = edgeOf(c, p);
    edges.find((e) => e.side === side)!.gaps.push({ at, half: p.width / 2, portal: p });
  }
  for (const e of edges) {
    e.gaps.sort((p, q) => p.at - q.at);
    let at = e.from;
    for (const g of e.gaps) {
      if (g.at - g.half > at + 1e-6) e.runs.push([at, g.at - g.half]);
      at = Math.max(at, g.at + g.half);
    }
    if (e.to > at + 1e-6) e.runs.push([at, e.to]);
  }
  return edges;
}
/** The two faces an opening runs between (its rooms' facing edges; a door to the surface runs through the outer wall). */
export function openingFaces(p: Portal): [number, number] | null {
  const [fa, fb] = faces(p);
  if (fa === null && fb === null) return null;
  const inner = fa ?? fb!;
  const outer = fa !== null && fb !== null ? fb : inner + Math.sign((p.along === "x" ? p.z : p.x) - inner) * WALL.outer;
  return [inner, outer];
}

/**
 * Every wall of the campus that blocks a walker on a floor (0: the ground floor, shared with Hab-1's; 2: the HQ
 * mezzanine), or on the HQ stair. Doors are segments named after their opening, blocking only while closed; door
 * jambs close the wall's thickness at each opening.
 */
export function campusWalls(where: 0 | 2 | "hq-stair"): Seg[] {
  const segs: Seg[] = [];
  const s = HQ_STAIR;
  if (where === "hq-stair") {
    segs.push(line(s.x0, s.z0, s.x0, s.z1), line(s.x1, s.z0, s.x1, s.z1));
    return segs;
  }
  const level = where;
  for (const c of CELLS) {
    if (c.level !== level || !indoor(c)) continue;
    for (const e of cellEdges(c))
      for (const [a, b] of e.runs) segs.push(e.side === "n" || e.side === "s" ? line(a, e.fixed, b, e.fixed) : line(e.fixed, a, e.fixed, b));
  }
  for (const p of PORTALS) {
    if (p.level !== level || p.a === "hab" || p.b === "hab" || p.a === "hq-stair") continue;
    if ([p.a, p.b].some((id) => cellById(id)?.kind === "hangar")) continue;
    const faced = openingFaces(p);
    if (!faced) continue;
    const [inner, outer] = faced;
    const h = p.width / 2;
    if (Math.abs(outer - inner) > 1e-6) {
      if (p.along === "x") segs.push(line(p.x - h, inner, p.x - h, outer), line(p.x + h, inner, p.x + h, outer));
      else segs.push(line(inner, p.z - h, outer, p.z - h), line(inner, p.z + h, outer, p.z + h));
    }
    if (p.kind === "door" || p.kind === "lock-inner" || p.kind === "lock-outer") {
      const d: Seg = p.along === "x" ? line(p.x - h, p.z, p.x + h, p.z) : line(p.x, p.z - h, p.x, p.z + h);
      segs.push({ ...d, door: p.id });
    }
  }
  if (level === 0) {
    // Round the HQ stair: its sides and its high end (you step on at the low, north end).
    segs.push(line(s.x0, s.z0, s.x0, s.z1), line(s.x1, s.z0, s.x1, s.z1), line(s.x0, s.z1, s.x1, s.z1));
  }
  // Furniture: its four sides, named after it (you can see and reach what's on it).
  for (const f of FURNITURE) {
    if (cellById(f.cell)?.level !== level) continue;
    const r = f.rect;
    segs.push(...[line(r.x0, r.z0, r.x1, r.z0), line(r.x1, r.z0, r.x1, r.z1), line(r.x1, r.z1, r.x0, r.z1), line(r.x0, r.z1, r.x0, r.z0)].map((g) => ({ ...g, block: f.id })));
  }
  return segs;
}

/** Height of the HQ stair's walking surface at z (a ramp; the treads are drawn on top). */
export const hqStairY = (z: number) => FLOOR + Math.min(1, Math.max(0, (z - HQ_STAIR.z0) / (HQ_STAIR.z1 - HQ_STAIR.z0))) * (MEZZANINE - FLOOR);
/** Is a point on the HQ stair's flight? */
export const onHqStair = (x: number, z: number) => x >= HQ_STAIR.x0 && x <= HQ_STAIR.x1 && z >= HQ_STAIR.z0 && z <= HQ_STAIR.z1;

/** Doors that open for a walker as they come near (not the airlocks' doors, which follow their own rules). */
export const CAMPUS_DOORS = PORTALS.filter((p) => p.kind === "door");
/** A door into a building that isn't built yet at this stage stays locked. */
export function doorLocked(p: Portal, stage: Stage) {
  return [p.a, p.b].some((id) => {
    const c = cellById(id);
    return !!c && !cellOpen(c, stage);
  });
}

/**
 * Porches outside the airlocks' outer doors: a landing level with the chamber floor, then a ramp down to the
 * ground, so you walk out (and back up) instead of dropping half a metre.
 */
export const PORCHES = OUTER_DOORS.map((p) => {
  const n = doorwayNotch(p);
  const out = p.along === "x" ? (p.z > n.z0 + 0.5 ? 1 : -1) : p.x > n.x0 + 0.5 ? 1 : -1;
  const face = p.along === "x" ? (out > 0 ? n.z1 : n.z0) : out > 0 ? n.x1 : n.x0;
  return { door: p.id, along: p.along, centre: p.along === "x" ? p.x : p.z, half: 1.2, face, out: out as 1 | -1, landing: 1.6, ramp: 2.4 };
});
/** Height of a porch's floor at a point, or -Infinity off every porch. */
export function porchY(x: number, z: number) {
  for (const q of PORCHES) {
    const across = q.along === "x" ? x : z,
      d = ((q.along === "x" ? z : x) - q.face) * q.out;
    if (Math.abs(across - q.centre) > q.half || d < -0.01 || d > q.landing + q.ramp) continue;
    return d <= q.landing ? FLOOR : FLOOR * (1 - (d - q.landing) / q.ramp);
  }
  return -Infinity;
}
