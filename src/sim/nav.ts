import { campusWalls, doorLocked, HQ_STAIR, portalById, type Stage } from "./base";
import { STAIR, stairPoint, walls, type Floor, type Seg, type Where } from "./home";

/**
 * Finding a way on foot through Hab-1 and the campus, for the crew walking between their places and for the tour's
 * pointer: an occupancy grid per floor (walls, rails and furniture grown by a body's half-width), A* across it, the
 * zig-zags pulled straight, and the two stairs (Hab-1's, the HQ's) joining the floors. Doors count as open (they
 * slide open for whoever comes near) except the airlocks' and those into buildings this mission hasn't got.
 * Pure and deterministic; grids are built once per floor and stage, on first use.
 */
const RES = 0.2;
/** Clearance kept from walls and furniture (half a body's width; doors 0.9 m wide still leave a lane). */
const CLEAR = 0.24;

export interface NavPoint {
  x: number;
  z: number;
  where: Where;
}
interface Grid {
  x0: number;
  z0: number;
  nx: number;
  nz: number;
  /** 1 where a body can stand, 2 where it can also walk to the floor's heart (not a pocket between chairs, not a locked wing). */
  free: Uint8Array;
}

const grids = new Map<string, Grid>();
/** Everything that blocks a walker on a floor, for a mission's stage. */
function blockers(floor: Floor, stage: Stage): Seg[] {
  const all = floor === 0 ? [...walls(0), ...campusWalls(0)] : floor === 1 ? walls(1) : campusWalls(2);
  return all.filter((s) => {
    if (!s.door) return true;
    const p = portalById(s.door);
    // (Hab-1's own doors open for anyone.)
    if (!p) return false;
    if (p.kind === "lock-inner" || p.kind === "lock-outer") return true;
    return doorLocked(p, stage);
  });
}
function gridFor(floor: Floor, stage: Stage): Grid {
  const key = `${floor}|${stage}`;
  const hit = grids.get(key);
  if (hit) return hit;
  const segs = blockers(floor, stage);
  let x0 = Infinity,
    z0 = Infinity,
    x1 = -Infinity,
    z1 = -Infinity;
  for (const s of segs) {
    x0 = Math.min(x0, s.ax, s.bx);
    x1 = Math.max(x1, s.ax, s.bx);
    z0 = Math.min(z0, s.az, s.bz);
    z1 = Math.max(z1, s.az, s.bz);
  }
  x0 -= 1;
  z0 -= 1;
  const nx = Math.ceil((x1 + 1 - x0) / RES),
    nz = Math.ceil((z1 + 1 - z0) / RES);
  const free = new Uint8Array(nx * nz).fill(1);
  for (const s of segs) {
    const i0 = Math.max(0, Math.floor((Math.min(s.ax, s.bx) - CLEAR - x0) / RES)),
      i1 = Math.min(nx - 1, Math.ceil((Math.max(s.ax, s.bx) + CLEAR - x0) / RES)),
      j0 = Math.max(0, Math.floor((Math.min(s.az, s.bz) - CLEAR - z0) / RES)),
      j1 = Math.min(nz - 1, Math.ceil((Math.max(s.az, s.bz) + CLEAR - z0) / RES));
    const vx = s.bx - s.ax,
      vz = s.bz - s.az,
      len2 = vx * vx + vz * vz || 1e-9;
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const px = x0 + (i + 0.5) * RES,
          pz = z0 + (j + 0.5) * RES;
        const t = Math.max(0, Math.min(1, ((px - s.ax) * vx + (pz - s.az) * vz) / len2));
        if (Math.hypot(px - (s.ax + vx * t), pz - (s.az + vz * t)) < CLEAR) free[j * nx + i] = 0;
      }
  }
  const g = { x0, z0, nx, nz, free };
  // Flood out from the floor's heart (the HQ hall, the top of Hab-1's stair, the mezzanine), marking what joins it.
  const heart = floor === 0 ? { x: 0, z: 47 } : floor === 1 ? STAIRS[0].head : STAIRS[1].head;
  const seed = cellOf(g, heart.x, heart.z);
  if (seed >= 0 && free[seed]) {
    const todo = [seed];
    free[seed] = 2;
    while (todo.length) {
      const c = todo.pop()!;
      const ci = c % nx,
        cj = (c - ci) / nx;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const i = ci + di,
          j = cj + dj;
        if (i < 0 || j < 0 || i >= nx || j >= nz) continue;
        const k = j * nx + i;
        if (free[k] === 1) {
          free[k] = 2;
          todo.push(k);
        }
      }
    }
  }
  grids.set(key, g);
  return g;
}

const cellOf = (g: Grid, x: number, z: number) => {
  const i = Math.floor((x - g.x0) / RES),
    j = Math.floor((z - g.z0) / RES);
  return i < 0 || j < 0 || i >= g.nx || j >= g.nz ? -1 : j * g.nx + i;
};
const centreOf = (g: Grid, c: number) => ({ x: g.x0 + ((c % g.nx) + 0.5) * RES, z: g.z0 + (Math.floor(c / g.nx) + 0.5) * RES });
/** Can a body stand at (x, z) on this floor, and walk from there to the rest of the base? */
export function standable(floor: Floor, stage: Stage, x: number, z: number) {
  const g = gridFor(floor, stage);
  const c = cellOf(g, x, z);
  return c >= 0 && g.free[c] === 2;
}
/** The nearest spot to (x, z), within `reach` metres, where a body can stand and walk on from; or null. */
export function nearestStandable(floor: Floor, stage: Stage, x: number, z: number, reach = 1.6) {
  const g = gridFor(floor, stage);
  const c = nearestFree(g, x, z, reach);
  return c < 0 ? null : centreOf(g, c);
}
/** The nearest free cell to a point (within `reach` metres), or -1. */
function nearestFree(g: Grid, x: number, z: number, reach = 1.6) {
  const c = cellOf(g, x, z);
  if (c >= 0 && g.free[c] === 2) return c;
  const ci = Math.floor((x - g.x0) / RES),
    cj = Math.floor((z - g.z0) / RES);
  const r = Math.ceil(reach / RES);
  let best = -1,
    bestD = Infinity;
  for (let dj = -r; dj <= r; dj++)
    for (let di = -r; di <= r; di++) {
      const i = ci + di,
        j = cj + dj;
      if (i < 0 || j < 0 || i >= g.nx || j >= g.nz || g.free[j * g.nx + i] !== 2) continue;
      const d = di * di + dj * dj;
      if (d < bestD) {
        bestD = d;
        best = j * g.nx + i;
      }
    }
  return best;
}
/** A clear straight line between two points (every grid cell along it free)? */
function clear(g: Grid, a: { x: number; z: number }, b: { x: number; z: number }) {
  const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / (RES * 0.5));
  for (let k = 1; k < n; k++) {
    const c = cellOf(g, a.x + ((b.x - a.x) * k) / n, a.z + ((b.z - a.z) * k) / n);
    if (c < 0 || !g.free[c]) return false;
  }
  return true;
}

// Scratch for A*, sized to the biggest grid so far.
let gScore = new Float32Array(0),
  came = new Int32Array(0),
  heap = new Int32Array(0),
  fScore = new Float32Array(0),
  state = new Uint8Array(0);
function scratch(n: number) {
  if (gScore.length >= n) return;
  gScore = new Float32Array(n);
  came = new Int32Array(n);
  fScore = new Float32Array(n);
  state = new Uint8Array(n);
  heap = new Int32Array(n);
}
const SQRT2 = Math.SQRT2;
/** A* over one floor's grid; the cells of the way, start to goal, or null. */
function astar(g: Grid, start: number, goal: number, limit = 400000): number[] | null {
  const n = g.nx * g.nz;
  scratch(n);
  gScore.fill(Infinity, 0, n);
  state.fill(0, 0, n);
  const gx = goal % g.nx,
    gz = Math.floor(goal / g.nx);
  const h = (c: number) => {
    const dx = Math.abs((c % g.nx) - gx),
      dz = Math.abs(Math.floor(c / g.nx) - gz);
    return dx + dz + (SQRT2 - 2) * Math.min(dx, dz);
  };
  let size = 0;
  const push = (c: number) => {
    let i = size++;
    heap[i] = c;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (fScore[heap[p]] <= fScore[heap[i]]) break;
      const t = heap[p];
      heap[p] = heap[i];
      heap[i] = t;
      i = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    heap[0] = heap[--size];
    let i = 0;
    for (;;) {
      const l = 2 * i + 1,
        r = l + 1;
      let m = i;
      if (l < size && fScore[heap[l]] < fScore[heap[m]]) m = l;
      if (r < size && fScore[heap[r]] < fScore[heap[m]]) m = r;
      if (m === i) break;
      const t = heap[m];
      heap[m] = heap[i];
      heap[i] = t;
      i = m;
    }
    return top;
  };
  gScore[start] = 0;
  fScore[start] = h(start);
  came[start] = -1;
  push(start);
  state[start] = 1;
  let expanded = 0;
  while (size) {
    const c = pop();
    if (state[c] === 2) continue;
    if (c === goal) {
      const out: number[] = [];
      for (let k = c; k !== -1; k = came[k]) out.push(k);
      return out.reverse();
    }
    state[c] = 2;
    if (++expanded > limit) return null;
    const ci = c % g.nx,
      cj = Math.floor(c / g.nx);
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const i = ci + di,
          j = cj + dj;
        if (i < 0 || j < 0 || i >= g.nx || j >= g.nz) continue;
        const k = j * g.nx + i;
        if (!g.free[k] || state[k] === 2) continue;
        // No cutting corners past a wall's end.
        if (di && dj && (!g.free[cj * g.nx + i] || !g.free[j * g.nx + ci])) continue;
        const t = gScore[c] + (di && dj ? SQRT2 : 1);
        if (t >= gScore[k]) continue;
        gScore[k] = t;
        fScore[k] = t + h(k);
        came[k] = c;
        push(k);
        state[k] = 1;
      }
  }
  return null;
}
/** Cells to a few straight legs: keep a corner only where the straight line from the last one would hit something. */
function straighten(g: Grid, cells: number[], from: { x: number; z: number }, to: { x: number; z: number }) {
  const pts = cells.map((c) => centreOf(g, c));
  // (Exactly from and to where those are clear; from a seat or a bed, the free spot beside it.)
  const ok = (p: { x: number; z: number }) => {
    const c = cellOf(g, p.x, p.z);
    return c >= 0 && g.free[c] === 2;
  };
  if (ok(from)) pts[0] = from;
  if (ok(to)) pts[pts.length - 1] = to;
  const out = [pts[0]];
  let anchor = pts[0];
  for (let k = 2; k < pts.length; k++)
    if (!clear(g, anchor, pts[k])) {
      anchor = pts[k - 1];
      out.push(anchor);
    }
  if (pts.length > 1) out.push(pts[pts.length - 1]);
  return out;
}

/** The two stairs: each one's floors and the points just off its ends (the walk between them is a straight flight). */
const mid = (STAIR.inner + STAIR.outer) / 2;
export const STAIRS = [
  { where: "stair" as const, low: 0 as Floor, high: 1 as Floor, foot: stairPoint(-STAIR.half - 0.45, mid), bottom: stairPoint(-STAIR.half + 0.05, mid), top: stairPoint(STAIR.half - 0.05, mid), head: stairPoint(STAIR.half + 0.45, mid) },
  { where: "hq-stair" as const, low: 0 as Floor, high: 2 as Floor, foot: { x: (HQ_STAIR.x0 + HQ_STAIR.x1) / 2, z: HQ_STAIR.z0 - 0.45 }, bottom: { x: (HQ_STAIR.x0 + HQ_STAIR.x1) / 2, z: HQ_STAIR.z0 + 0.05 }, top: { x: (HQ_STAIR.x0 + HQ_STAIR.x1) / 2, z: HQ_STAIR.z1 - 0.05 }, head: { x: (HQ_STAIR.x0 + HQ_STAIR.x1) / 2, z: HQ_STAIR.z1 + 0.45 } },
];

/** One floor's way from a to b (straight legs), or null. */
function onFloor(floor: Floor, stage: Stage, a: { x: number; z: number }, b: { x: number; z: number }): NavPoint[] | null {
  const g = gridFor(floor, stage);
  const s = nearestFree(g, a.x, a.z),
    e = nearestFree(g, b.x, b.z);
  if (s < 0 || e < 0) return null;
  const cells = astar(g, s, e);
  if (!cells) return null;
  return straighten(g, cells, a, b).map((p) => ({ ...p, where: floor }));
}

/**
 * A way on foot from one place to another, floors and stairs included: points to walk through in order, each with
 * the floor (or stair) it's on. Null if there is no way (a locked building, a place no one can stand).
 */
export function navPath(from: { x: number; z: number; floor: Floor }, to: { x: number; z: number; floor: Floor }, stage: Stage): NavPoint[] | null {
  if (from.floor === to.floor) return onFloor(from.floor, stage, from, to);
  // Up or down a stair; between Hab-1's upper floor and the HQ mezzanine, by way of the ground floor.
  const direct = STAIRS.find((s) => (s.low === from.floor && s.high === to.floor) || (s.high === from.floor && s.low === to.floor));
  if (!direct) {
    const down = navPath(from, { ...(from.floor === 1 ? STAIRS[0].foot : STAIRS[1].foot), floor: 0 }, stage);
    const up = down && navPath({ ...down[down.length - 1], floor: 0 }, to, stage);
    return down && up ? [...down, ...up.slice(1)] : null;
  }
  const goingUp = direct.low === from.floor;
  const [nearEnd, farEnd] = goingUp ? [direct.foot, direct.head] : [direct.head, direct.foot];
  const [onA, onB] = goingUp ? [direct.bottom, direct.top] : [direct.top, direct.bottom];
  const a = onFloor(from.floor, stage, from, nearEnd);
  const b = a && onFloor(to.floor, stage, farEnd, to);
  if (!a || !b) return null;
  return [...a, { ...onA, where: direct.where }, { ...onB, where: direct.where }, ...b];
}

/** Length of a way, in metres. */
export const pathLength = (p: NavPoint[]) => p.reduce((sum, q, i) => (i ? sum + Math.hypot(q.x - p[i - 1].x, q.z - p[i - 1].z) : 0), 0);
/** Forget the grids (if the plan changes). */
export const resetNav = () => grids.clear();
