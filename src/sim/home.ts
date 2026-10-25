/**
 * The Mars home: a two-storey inflatable habitat on a rigid core. One floor plan, shared by the 3D model,
 * the first-person walking and the tests, so what you see is exactly where you can walk.
 *
 * Habitat-local metres: origin at the centre on the ground, y up, north −z, east +x.
 * Bearings are compass degrees (0 north, 90 east, 180 south, where the airlock is).
 *
 *   ring:   core (r < 1.9) · hall (1.9 – 2.95) · rooms (2.95 – 4.95, the padded inner wall)
 *   floors: ground deck at 0.5 m, upper deck at 3.35 m; ceilings at 3.1 m and 5.95 m
 */

export const HOME = {
  /** Outer face of the inflatable shell. */
  shell: 5.2,
  /** Inner face of the padded wall: the edge of the rooms. */
  lining: 4.95,
  /** Outer face of the central core. */
  core: 1.9,
  /** Inner face of the storm shelter's water walls (ground floor core). */
  shelter: 1.5,
  /** Inner face of the command room's wall (upper floor core). */
  command: 1.75,
  /** Outer edge of the ring hall around the core (the middle of its wall); rooms start here. */
  hall: 2.95,
  floor: [0.5, 3.35] as const,
  ceiling: [3.1, 5.95] as const,
  /** Partition thickness. */
  wall: 0.12,
  /** Eye height above the floor. */
  eye: 1.65,
  /** The walker's body radius (shoulders and elbows, about 0.6 m across). */
  body: 0.3,
};
export type Level = 0 | 1;

export const rad = (deg: number) => (deg * Math.PI) / 180;
/** A habitat-local point at a compass bearing (degrees) and distance from the centre. */
export const polar = (bearing: number, r: number) => ({ x: Math.sin(rad(bearing)) * r, z: -Math.cos(rad(bearing)) * r });
/** The compass bearing (0 – 360) of a habitat-local point. */
export const bearingOf = (x: number, z: number) => ((Math.atan2(x, -z) * 180) / Math.PI + 360) % 360;
/** Is a bearing inside the arc from `from` to `to` (clockwise, `to` may pass 360)? */
export const within = (b: number, from: number, to: number) => {
  const span = to - from;
  return ((((b - from) % 360) + 360) % 360) <= span;
};

export type RoomId =
  | "suit"
  | "galley"
  | "hygiene"
  | "eclss"
  | "lab"
  | "medical"
  | "stairs"
  | "shelter"
  | "hall"
  | "landing"
  | "garden"
  | "q1"
  | "q2"
  | "q3"
  | "q4"
  | "exercise"
  | "command";

export interface Room {
  id: RoomId;
  name: string;
  level: Level;
  /** Ring rooms: bearings, clockwise from `from` to `to`. */
  from: number;
  to: number;
  /** Rooms behind a wall with a sliding door (at `door`, a bearing); open rooms join the hall. */
  closed: boolean;
  door?: number;
  /** A room inside the core. */
  core?: boolean;
}

export const ROOMS: Room[] = [
  // Ground floor.
  { id: "suit", name: "Suit room", level: 0, from: 165, to: 205, closed: true, door: 185 },
  { id: "galley", name: "Galley", level: 0, from: 205, to: 290, closed: false },
  { id: "hygiene", name: "Hygiene", level: 0, from: 290, to: 330, closed: true, door: 310 },
  { id: "eclss", name: "Life support", level: 0, from: 330, to: 390, closed: true, door: 0 },
  { id: "lab", name: "Lab", level: 0, from: 30, to: 62, closed: false },
  { id: "medical", name: "Medical bay", level: 0, from: 62, to: 95, closed: false },
  { id: "stairs", name: "Stairs", level: 0, from: 95, to: 165, closed: false },
  { id: "shelter", name: "Storm shelter", level: 0, from: 0, to: 360, closed: true, door: 250, core: true },
  // Upper floor.
  { id: "landing", name: "Landing", level: 1, from: 95, to: 165, closed: false },
  { id: "garden", name: "Garden", level: 1, from: 165, to: 205, closed: false },
  { id: "q1", name: "Maya's quarters", level: 1, from: 205, to: 250, closed: true, door: 227.5 },
  { id: "q2", name: "Alex's quarters", level: 1, from: 250, to: 295, closed: true, door: 272.5 },
  { id: "q3", name: "Sam's quarters", level: 1, from: 295, to: 340, closed: true, door: 317.5 },
  { id: "q4", name: "Noor's quarters", level: 1, from: 340, to: 385, closed: true, door: 2.5 },
  { id: "exercise", name: "Exercise", level: 1, from: 25, to: 95, closed: false },
  { id: "command", name: "Command", level: 1, from: 0, to: 360, closed: true, door: 165, core: true },
];

/** Which room a habitat-local point is in. */
export function roomAt(x: number, z: number, level: Level): Room | { id: "hall"; name: string; level: Level } {
  const r = Math.hypot(x, z);
  if (r < HOME.core) return ROOMS.find((m) => m.core && m.level === level)!;
  if (r < HOME.hall) return { id: "hall", name: "Hall", level };
  const b = bearingOf(x, z);
  return ROOMS.find((m) => !m.core && m.level === level && within(b, m.from, m.to)) ?? { id: "hall", name: "Hall", level };
}

/** Windows through the shell: the same list places the frames outside and the openings inside. */
export interface Window {
  level: Level;
  bearing: number;
  /** Width and height of the glass (metres). */
  w: number;
  h: number;
}
export const WINDOWS: Window[] = [
  { level: 0, bearing: 228, w: 0.95, h: 0.62 },
  { level: 0, bearing: 268, w: 0.95, h: 0.62 },
  { level: 0, bearing: 46, w: 0.95, h: 0.62 },
  { level: 0, bearing: 80, w: 0.7, h: 0.5 },
  { level: 1, bearing: 227.5, w: 0.8, h: 0.55 },
  { level: 1, bearing: 272.5, w: 0.8, h: 0.55 },
  { level: 1, bearing: 317.5, w: 0.8, h: 0.55 },
  { level: 1, bearing: 2.5, w: 0.8, h: 0.55 },
  { level: 1, bearing: 45, w: 0.95, h: 0.62 },
  { level: 1, bearing: 78, w: 0.95, h: 0.62 },
];
/** Height of a window's centre above the ground. */
export const windowY = (w: Window) => HOME.floor[w.level] + 1.4;

/**
 * The stair: a straight flight along a chord of the ring, rising clockwise from the ground floor
 * (bottom near bearing 103) to the upper floor (top near bearing 157). 15 risers of 0.19 m, treads 0.28 m.
 */
export const STAIR = {
  /** Bearing of the flight's middle. */
  bearing: 130,
  /** Distance from the centre to the flight's inner and outer edges. */
  inner: 3.35,
  outer: 4.25,
  /** Half the length of the flight. */
  half: 1.96,
  risers: 15,
};
const stairAxis = () => {
  const n = polar(STAIR.bearing, 1);
  // Clockwise tangent: up the flight.
  return { n, t: { x: -n.z, z: n.x } };
};
/** A point in the stair's own frame: u along the flight (−half at the bottom, +half at the top), w out from the centre. */
export function stairLocal(x: number, z: number) {
  const { n, t } = stairAxis();
  return { u: x * t.x + z * t.z, w: x * n.x + z * n.z };
}
/** Back from the stair's frame to habitat-local x, z. */
export function stairPoint(u: number, w: number) {
  const { n, t } = stairAxis();
  return { x: t.x * u + n.x * w, z: t.z * u + n.z * w };
}
/** Height of the stair's walking surface at u (a smooth ramp; the treads are drawn on top). */
export const stairY = (u: number) => HOME.floor[0] + Math.min(1, Math.max(0, (u + STAIR.half) / (2 * STAIR.half))) * (HOME.floor[1] - HOME.floor[0]);

/* ---------- Walls and walking ---------- */

export interface Seg {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  /** A sliding door: it only blocks while closed. */
  door?: string;
  /** The piece of furniture this is an edge of. */
  block?: string;
}
/** Doors you can walk through once they slide open (the airlock hatch only opens for an EVA). */
export const DOORS: { id: string; level: Level; bearing: number; r: number; width: number }[] = [
  ...ROOMS.filter((m) => m.closed && m.door !== undefined).map((m) => ({
    id: m.id,
    level: m.level,
    bearing: m.door!,
    r: m.core ? HOME.core : HOME.hall,
    width: 0.9,
  })),
  { id: "airlock", level: 0, bearing: 180, r: HOME.lining, width: 0.9 },
];

/** An arc of wall as short segments, with openings exactly `width` metres wide (closed by a door segment if it has a door). */
function arc(r: number, from: number, to: number, gaps: { bearing: number; width: number; door?: string }[] = []): Seg[] {
  const out: Seg[] = [];
  const run = (a: number, b: number, door?: string) => {
    if (b - a < 1e-9) return;
    // A door is one flat panel; a wall follows the curve in pieces of at most 0.25 m.
    const steps = door ? 1 : Math.max(1, Math.ceil(((b - a) * Math.PI * r) / 180 / 0.25));
    for (let i = 0; i < steps; i++) {
      const p = polar(a + ((b - a) * i) / steps, r),
        q = polar(a + ((b - a) * (i + 1)) / steps, r);
      out.push(door ? { ax: p.x, az: p.z, bx: q.x, bz: q.z, door } : { ax: p.x, az: p.z, bx: q.x, bz: q.z });
    }
  };
  const cuts = gaps
    .map((g) => {
      const half = ((g.width / 2) * 180) / (Math.PI * r);
      const c = from + ((((g.bearing - from) % 360) + 360) % 360);
      return { a: c - half, b: c + half, door: g.door };
    })
    .filter((c) => c.a < to && c.b > from)
    .sort((p, q) => p.a - q.a);
  let at = from;
  for (const c of cuts) {
    run(at, Math.max(at, c.a));
    run(Math.max(at, c.a), Math.min(to, c.b), c.door);
    at = Math.min(to, c.b);
  }
  run(at, to);
  return out;
}
const radial = (bearing: number, r0: number, r1: number): Seg => {
  const a = polar(bearing, r0),
    b = polar(bearing, r1);
  return { ax: a.x, az: a.z, bx: b.x, bz: b.z };
};
const line = (a: { x: number; z: number }, b: { x: number; z: number }): Seg => ({ ax: a.x, az: a.z, bx: b.x, bz: b.z });

/**
 * Furniture and fittings that stand in the way: boxes in habitat-local metres, set square to the ring at
 * a bearing (w along the ring, d across it, h tall). The 3D model builds each piece in its box, so what
 * you bump into is what you see. Wall-mounted things above head height are not listed.
 */
export interface Block {
  id: string;
  room: RoomId | "hall";
  level: Level;
  bearing: number;
  r: number;
  w: number;
  d: number;
  h: number;
  /** Turn the box from square to the ring (degrees). */
  turn?: number;
  /** The piece this one tucks under (a chair under its table), the only one it may overlap. */
  tuck?: string;
  /** Which way its front faces, turned from facing the habitat's centre (degrees; 90 is clockwise round the ring). */
  face?: number;
}
const b = (id: string, room: Block["room"], level: Level, bearing: number, r: number, w: number, d: number, h: number, turn?: number): Block => ({ id, room, level, bearing, r, w, d, h, turn });
/** Clearance between a piece of furniture and the wall it stands against. */
const GAP = 0.03;
/** A piece with its back to a round wall: the padded wall, or (with `wall`) the inside of the core. */
const atWall = (id: string, room: RoomId, level: Level, bearing: number, w: number, d: number, h: number, wall: number = HOME.lining) =>
  b(id, room, level, bearing, Math.sqrt((wall - GAP) ** 2 - (w / 2) ** 2) - d / 2, w, d, h);
/** The box's own axes: n across the ring (outward), t along it (clockwise). */
export function blockAxes(k: Block) {
  const a = rad(k.bearing + (k.turn ?? 0));
  const n = { x: Math.sin(a), z: -Math.cos(a) };
  return { c: polar(k.bearing, k.r), n, t: { x: -n.z, z: n.x } };
}
/** A piece set square to the radial wall at bearing `edge`, on its clockwise side (+1) or the other (−1), from r0 to r1 along it; it stands w out from the wall. */
function byPartition(id: string, room: RoomId, level: Level, edge: number, side: 1 | -1, r0: number, r1: number, w: number, h: number): Block {
  const n = polar(edge, 1),
    t = { x: -n.z, z: n.x };
  const off = side * (HOME.wall / 2 + GAP + w / 2),
    mid = (r0 + r1) / 2;
  const x = n.x * mid + t.x * off,
    z = n.z * mid + t.z * off;
  const bearing = bearingOf(x, z);
  return { ...b(id, room, level, bearing, Math.hypot(x, z), w, r1 - r0, h, edge - bearing), face: side * 90 };
}
/** A piece set square to another, du along it and dv out from its middle, tucked against it. */
function beside(id: string, base: Block, du: number, dv: number, w: number, d: number, h: number): Block {
  const { c, n, t } = blockAxes(base);
  const x = c.x + t.x * du + n.x * dv,
    z = c.z + t.z * du + n.z * dv;
  const bearing = bearingOf(x, z);
  // It faces the piece it tucks under.
  return { ...b(id, base.room, base.level, bearing, Math.hypot(x, z), w, d, h, base.bearing + (base.turn ?? 0) - bearing), tuck: base.id, face: dv < 0 ? 180 : 0 };
}
const table = b("galley-table", "galley", 0, 253, 3.85, 1.3, 0.75, 0.75);
const bench = atWall("lab-bench", "lab", 0, 46, 1.6, 0.62, 0.92);
export const BLOCKS: Block[] = [
  // Suit room: two racks against the side walls (two suits each), a bench by the hatch to sit and pull boots on.
  byPartition("suit-rack-e", "suit", 0, 165, 1, 3.45, 4.7, 0.62, 2.0),
  byPartition("suit-rack-w", "suit", 0, 205, -1, 3.45, 4.7, 0.62, 2.0),
  atWall("suit-bench", "suit", 0, 192, 0.6, 0.38, 0.46),
  // Galley: the food store and the fridge on the side walls, the counter under the first window, a table for four.
  byPartition("galley-store", "galley", 0, 205, 1, 3.4, 4.65, 0.55, 2.0),
  atWall("galley-counter", "galley", 0, 228, 1.6, 0.62, 0.92),
  table,
  ...[
    [-0.34, -0.52],
    [0.34, -0.52],
    [-0.34, 0.52],
    [0.34, 0.52],
  ].map(([du, dv], i) => beside(`galley-chair-${i + 1}`, table, du, dv, 0.44, 0.44, 0.9)),
  byPartition("galley-fridge", "galley", 0, 290, -1, 3.6, 4.5, 0.7, 1.9),
  // Hygiene: a toilet compartment and a shower stall on the side walls, the sink between them.
  byPartition("hygiene-toilet", "hygiene", 0, 290, 1, 3.75, 4.8, 0.95, 2.1),
  byPartition("hygiene-shower", "hygiene", 0, 330, -1, 3.85, 4.8, 0.9, 2.1),
  atWall("hygiene-sink", "hygiene", 0, 310, 0.6, 0.42, 0.88),
  // Life support: racks along the wall (oxygen, CO2 removal, water recovery) and the water tanks.
  atWall("eclss-o2", "eclss", 0, 339, 0.95, 0.66, 2.1),
  atWall("eclss-co2", "eclss", 0, 352.5, 0.95, 0.66, 2.1),
  atWall("eclss-water", "eclss", 0, 6, 0.95, 0.66, 2.1),
  atWall("eclss-tanks", "eclss", 0, 20.5, 0.9, 0.9, 1.8),
  // Lab: the bench under the window (sample freezer underneath, the stool pushed in), the 3D printer by the hall.
  bench,
  beside("lab-stool", bench, 0, -0.13, 0.36, 0.36, 0.62),
  byPartition("lab-printer", "lab", 0, 30, 1, 3.1, 3.65, 0.5, 1.1),
  // Medical bay: the exam couch under its window, the medical cabinet (the ultrasound is on an arm on the wall).
  atWall("medical-couch", "medical", 0, 76.5, 1.85, 0.7, 0.7),
  byPartition("medical-cabinet", "medical", 0, 62, 1, 3.1, 3.9, 0.45, 1.9),
  // Storm shelter: four seats against the water walls, the emergency locker by the door.
  ...[20, 90, 160, 310].map((bearing, i) => atWall(`shelter-seat-${i + 1}`, "shelter", 0, bearing, 0.5, 0.45, 0.46, HOME.shelter)),
  atWall("shelter-locker", "shelter", 0, 205, 0.5, 0.4, 1.6, HOME.shelter),
  // Crew quarters: a bunk under each window, a desk beside it, a locker by the door.
  ...([
    ["q1", 205, 250],
    ["q2", 250, 295],
    ["q3", 295, 340],
    ["q4", 340, 385],
  ] as const).flatMap(([id, from, to]) => [
    atWall(`${id}-bunk`, id, 1, (from + to) / 2, 1.95, 0.85, 0.55),
    byPartition(`${id}-desk`, id, 1, from, 1, 3.95, 4.8, 0.5, 0.76),
    byPartition(`${id}-locker`, id, 1, to, -1, 3.1, 3.7, 0.55, 2.0),
  ]),
  // Exercise: the resistance frame by the wall, a cycle facing one window and a treadmill under the other.
  byPartition("exercise-frame", "exercise", 1, 25, 1, 3.15, 4.15, 0.9, 2.2),
  atWall("exercise-cycle", "exercise", 1, 46, 0.6, 1.1, 1.2),
  atWall("exercise-treadmill", "exercise", 1, 78, 1.9, 0.8, 1.3),
  // Garden: salad greens growing on racks under lights (the big crops grow in the greenhouse outside).
  byPartition("garden-rack-1", "garden", 1, 205, -1, 3.3, 4.75, 0.6, 2.2),
  atWall("garden-rack-2", "garden", 1, 186, 1.2, 0.55, 2.2),
  // Command: a console of three desks with screens, two chairs, and the ladder up to the cupola in the middle.
  ...[40, 80, 120].map((bearing, i) => atWall(`command-desk-${i + 1}`, "command", 1, bearing, 0.8, 0.5, 0.76, HOME.command)),
  { ...b("command-chair-1", "command", 1, 50, 0.85, 0.5, 0.5, 0.95), face: 180 },
  { ...b("command-chair-2", "command", 1, 110, 0.85, 0.5, 0.5, 0.95), face: 180 },
  b("command-ladder", "command", 1, 0, 0, 0.62, 0.62, 2.6),
];
/** A piece's four corners, anticlockwise from its back-left as you face it. */
export function blockCorners(k: Block) {
  const { c, n, t } = blockAxes(k);
  const p = (su: number, sv: number) => ({ x: c.x + t.x * su * (k.w / 2) + n.x * sv * (k.d / 2), z: c.z + t.z * su * (k.w / 2) + n.z * sv * (k.d / 2) });
  return [p(-1, -1), p(1, -1), p(1, 1), p(-1, 1)];
}
const blockSegs = (k: Block): Seg[] => {
  const [a1, b1, c1, d1] = blockCorners(k);
  return [line(a1, b1), line(b1, c1), line(c1, d1), line(d1, a1)].map((s) => ({ ...s, block: k.id }));
};

/** The closed rooms on a floor: each has a wall along the hall, with a sliding door. */
export const hallWalls = (level: Level) => ROOMS.filter((m) => !m.core && m.level === level && m.closed);
/**
 * Bearings of the radial walls between neighbouring rooms on a floor, except where two open rooms meet at
 * the stairs (so you can walk round to the foot of the flight, and along the landing upstairs).
 */
export function partitions(level: Level) {
  const ring = ROOMS.filter((m) => !m.core && m.level === level);
  const nearStairs = (m: Room) => m.id === "stairs" || m.id === "landing";
  const out: number[] = [];
  for (const m of ring) {
    const edge = ((m.to % 360) + 360) % 360;
    const next = ring.find((o) => ((o.from % 360) + 360) % 360 === edge);
    if (next && !m.closed && !next.closed && (nearStairs(m) || nearStairs(next))) continue;
    out.push(edge);
  }
  return out;
}

/** Where the walker can be: on a floor, or on the stair (between the two). */
export type Where = Level | "stair";

let cache: Map<Where, Seg[]> | null = null;
/** Every wall, rail and piece of furniture that blocks the walker, for a floor or the stair. */
export function walls(where: Where): Seg[] {
  if (!cache) cache = new Map();
  const hit = cache.get(where);
  if (hit) return hit;
  const segs: Seg[] = [];
  const s = STAIR;
  const corner = (u: number, w: number) => stairPoint(u, w);
  if (where === "stair") {
    // The flight's two sides; its ends lead off to the floors.
    segs.push(line(corner(-s.half, s.inner), corner(s.half, s.inner)), line(corner(-s.half, s.outer), corner(s.half, s.outer)));
  } else {
    const level = where;
    const doors = DOORS.filter((d) => d.level === level);
    const doorsAt = (r: number) => doors.filter((d) => Math.abs(d.r - r) < 0.01).map((d) => ({ bearing: d.bearing, width: d.width, door: d.id }));
    // The padded outer wall (the airlock hatch is a door on the ground floor).
    segs.push(...arc(HOME.lining, 0, 360, doorsAt(HOME.lining)));
    // The core: water walls round the shelter below, the command room above.
    const coreRoom = ROOMS.find((m) => m.core && m.level === level)!;
    const inner = level === 0 ? HOME.shelter : HOME.command;
    const gap = [{ bearing: coreRoom.door!, width: 0.9, door: coreRoom.id }];
    segs.push(...arc(HOME.core, 0, 360, gap), ...arc(inner, 0, 360, gap));
    // The doorway through the core wall's thickness: straight sides, 0.9 m apart.
    const d = polar(coreRoom.door!, 1),
      t = { x: -d.z, z: d.x };
    for (const side of [-0.45, 0.45])
      segs.push(line({ x: d.x * inner + t.x * side, z: d.z * inner + t.z * side }, { x: d.x * HOME.core + t.x * side, z: d.z * HOME.core + t.z * side }));
    // Walls (with doors) in front of closed rooms, and partitions between neighbouring rooms.
    for (const m of hallWalls(level)) segs.push(...arc(HOME.hall, m.from, m.to, [{ bearing: m.door!, width: 0.9, door: m.id }]));
    for (const edge of partitions(level)) segs.push(radial(edge, HOME.hall, HOME.lining));
    if (level === 0) {
      // Round the flight: its sides and the top end (you walk on at the bottom end).
      segs.push(
        line(corner(-s.half, s.inner), corner(s.half, s.inner)),
        line(corner(-s.half, s.outer), corner(s.half, s.outer)),
        line(corner(s.half, s.inner), corner(s.half, s.outer)),
      );
    } else {
      // Rails round the stairwell, open at the top of the flight.
      segs.push(
        line(corner(-s.half, s.inner), corner(s.half, s.inner)),
        line(corner(-s.half, s.outer), corner(s.half, s.outer)),
        line(corner(-s.half, s.inner), corner(-s.half, s.outer)),
      );
    }
    for (const k of BLOCKS) if (k.level === level) segs.push(...blockSegs(k));
  }
  cache.set(where, segs);
  return segs;
}
/** Forget the cached walls (after the interior plan adds furniture blocks). */
export function resetWalls() {
  cache = null;
}

export interface Walker {
  /** Habitat-local position. */
  x: number;
  z: number;
  where: Where;
}
/** The height of the floor under the walker. */
export function floorY(w: Walker) {
  if (w.where === "stair") return stairY(stairLocal(w.x, w.z).u);
  return HOME.floor[w.where];
}

/** Push a circle out of every segment it overlaps (sliding along walls). */
function resolve(p: { x: number; z: number }, segs: Seg[], open: (door: string) => boolean) {
  const R = HOME.body;
  for (let pass = 0; pass < 4; pass++) {
    let moved = false;
    for (const s of segs) {
      if (s.door && open(s.door)) continue;
      const vx = s.bx - s.ax,
        vz = s.bz - s.az;
      const len2 = vx * vx + vz * vz || 1e-9;
      const t = Math.max(0, Math.min(1, ((p.x - s.ax) * vx + (p.z - s.az) * vz) / len2));
      const cx = s.ax + vx * t,
        cz = s.az + vz * t;
      const dx = p.x - cx,
        dz = p.z - cz;
      const d = Math.hypot(dx, dz);
      if (d < R) {
        const k = (R - d) / (d || 1e-9);
        p.x += dx * k;
        p.z += dz * k;
        moved = true;
      }
    }
    if (!moved) break;
  }
}

/**
 * Move the walker by (dx, dz), in small steps so it can never tunnel through a wall; slides along
 * walls, climbs or descends the stair, and steps between floors at the stair's ends.
 */
export function walk(w: Walker, dx: number, dz: number, open: (door: string) => boolean = () => false): Walker {
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.08));
  const p = { x: w.x, z: w.z };
  let where = w.where;
  for (let i = 0; i < steps; i++) {
    p.x += dx / steps;
    p.z += dz / steps;
    resolve(p, walls(where), open);
    const { u, w: across } = stairLocal(p.x, p.z);
    const onFlight = Math.abs(u) <= STAIR.half && across >= STAIR.inner && across <= STAIR.outer;
    if (where === 0 && onFlight) where = "stair";
    else if (where === 1 && onFlight) where = "stair";
    else if (where === "stair") {
      if (u < -STAIR.half) where = 0;
      else if (u > STAIR.half) where = 1;
    }
  }
  return { x: p.x, z: p.z, where };
}

/** Where a walk starts: just inside the airlock's inner hatch, in the suit room, facing the door out to the hall and the galley. */
export const SPAWN = (() => {
  const at = polar(180, 4.35),
    door = polar(ROOMS.find((m) => m.id === "suit")!.door!, HOME.hall);
  return { ...at, where: 0 as Where, yaw: rad(bearingOf(door.x - at.x, door.z - at.z)) };
})();

/** Walking pace (metres a second) and how quickly you get up to it (or stop). */
export const PACE = { walk: 1.4, fast: 2.2, accel: 7 };
/**
 * Length of one step at walking pace on a planet: like a pendulum, legs swing more slowly in low gravity, so the
 * same speed takes fewer, longer steps (Earth about 0.75 m, Mars about 1.2 m, the Moon about 1.8 m: the lunar lope).
 */
export const stepLength = (gravity: number) => 0.75 * Math.sqrt(9.81 / gravity);

export interface Stroller extends Walker {
  /** Velocity, metres a second (habitat-local). */
  vx: number;
  vz: number;
}
/**
 * One frame of walking: `wish` is the direction you want to go (habitat-local, length up to 1) and `speed` the
 * pace. You speed up and slow down gently, and stop dead against a wall instead of pushing into it.
 */
export function stride(w: Stroller, wish: { x: number; z: number }, speed: number, dt: number, open: (door: string) => boolean = () => false): Stroller {
  const len = Math.hypot(wish.x, wish.z);
  const k = len > 1 ? 1 / len : 1;
  const ease = 1 - Math.exp(-PACE.accel * dt);
  const vx = w.vx + (wish.x * k * speed - w.vx) * ease,
    vz = w.vz + (wish.z * k * speed - w.vz) * ease;
  const p = walk(w, vx * dt, vz * dt, open);
  // What actually happened becomes the new velocity, so a wall doesn't store up a push.
  const dx = p.x - w.x,
    dz = p.z - w.z;
  return dt > 0 ? { ...p, vx: dx / dt, vz: dz / dt } : { ...p, vx, vz };
}
