/**
 * The Mars home: a two-storey inflatable habitat on a rigid core. One floor plan, shared by the 3D model,
 * the first-person walking and the tests, so what you see is exactly where you can walk.
 *
 * Habitat-local metres: origin at the centre on the ground, y up, north −z, east +x.
 * Bearings are compass degrees (0 north, 90 east, 180 south, where the airlock is).
 *
 *   ring:   core (r < 1.9) · hall (1.9 – 3.2) · rooms (3.2 – 4.95, the padded inner wall)
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
  /** Outer edge of the ring hall around the core; rooms start here. */
  hall: 3.2,
  floor: [0.5, 3.35] as const,
  ceiling: [3.1, 5.95] as const,
  /** Partition thickness. */
  wall: 0.12,
  /** Eye height above the floor. */
  eye: 1.65,
  /** The walker's body radius (shoulders about half a metre across). */
  body: 0.25,
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
  | "stowage"
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
  { id: "stowage", name: "Stowage", level: 1, from: 165, to: 205, closed: false },
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

/** An arc of wall as short segments, leaving gaps (bearing ± half-width in metres) for doors. */
function arc(r: number, from: number, to: number, gaps: { bearing: number; width: number; door?: string }[] = []): Seg[] {
  const out: Seg[] = [];
  const steps = Math.max(2, Math.ceil(((to - from) * Math.PI * r) / 180 / 0.25));
  for (let i = 0; i < steps; i++) {
    const b0 = from + ((to - from) * i) / steps,
      b1 = from + ((to - from) * (i + 1)) / steps;
    const mid = (b0 + b1) / 2;
    const gap = gaps.find((g) => Math.abs(((mid - g.bearing + 540) % 360) - 180) < ((g.width / 2) * 180) / (Math.PI * r));
    const a = polar(b0, r),
      b = polar(b1, r);
    if (!gap) out.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z });
    else if (gap.door) out.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, door: gap.door });
  }
  return out;
}
const radial = (bearing: number, r0: number, r1: number): Seg => {
  const a = polar(bearing, r0),
    b = polar(bearing, r1);
  return { ax: a.x, az: a.z, bx: b.x, bz: b.z };
};
const line = (a: { x: number; z: number }, b: { x: number; z: number }): Seg => ({ ax: a.x, az: a.z, bx: b.x, bz: b.z });

/** Furniture and fittings that stand in the way, per level (boxes in habitat-local metres). Filled in by the interior plan. */
export interface Block {
  level: Level;
  /** Centre, size along the room's tangent (w) and radius (d), and the bearing the box faces. */
  bearing: number;
  r: number;
  w: number;
  d: number;
  /** Turn the box from facing the centre (degrees), for pieces set at an angle. */
  turn?: number;
}
export const BLOCKS: Block[] = [];
const blockSegs = (k: Block): Seg[] => {
  const c = polar(k.bearing, k.r);
  const a = rad(k.bearing + (k.turn ?? 0));
  // The box's radial (n) and tangential (t) axes.
  const n = { x: Math.sin(a), z: -Math.cos(a) },
    t = { x: -n.z, z: n.x };
  const p = (su: number, sv: number) => ({ x: c.x + t.x * su * (k.w / 2) + n.x * sv * (k.d / 2), z: c.z + t.z * su * (k.w / 2) + n.z * sv * (k.d / 2) });
  const [a1, b1, c1, d1] = [p(-1, -1), p(1, -1), p(1, 1), p(-1, 1)];
  return [line(a1, b1), line(b1, c1), line(c1, d1), line(d1, a1)];
};

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
    // Walls (with doors) in front of closed rooms, and partitions between neighbouring rooms, except
    // where two open rooms meet at the stairs (so you can walk round to the foot of the flight, and
    // along the landing upstairs).
    const ring = ROOMS.filter((m) => !m.core && m.level === level);
    const nearStairs = (m: Room) => m.id === "stairs" || m.id === "landing";
    for (const m of ring) {
      if (m.closed) segs.push(...arc(HOME.hall, m.from, m.to, [{ bearing: m.door!, width: 0.9, door: m.id }]));
      const edge = ((m.to % 360) + 360) % 360;
      const next = ring.find((o) => ((o.from % 360) + 360) % 360 === edge);
      if (next && !m.closed && !next.closed && (nearStairs(m) || nearStairs(next))) continue;
      segs.push(radial(edge, HOME.hall, HOME.lining));
    }
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

/** Where a walk starts: just inside the airlock's inner hatch, in the suit room. */
export const SPAWN = { ...polar(180, 4.35), where: 0 as Where, yaw: 0 };
