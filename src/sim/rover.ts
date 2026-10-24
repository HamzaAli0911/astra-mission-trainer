import { PLANETS } from "./planets";
import type { Module, Planet, Rover } from "./types";
import {
  DOCK,
  DOCK_RADIUS,
  FOOTPRINT,
  inShadow,
  LANDER,
  PADS,
  rocksNear,
  WORLD,
} from "./world";

/**
 * Real-time rover movement. Pure functions of (rover, input, dt, modules), in
 * training hours and metres, so they run the same at any game speed and are
 * testable without a browser. Heading 0 faces north (−z).
 */
export type DriveInput = {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
};
export const STOP: DriveInput = {
  forward: false,
  back: false,
  left: false,
  right: false,
};
export const ROVER = {
  maxSpeed: 36, // metres per training hour
  crawl: 6, // with a flat battery
  turn: 3.4, // radians per training hour
  radius: 1.2,
  /** Battery drain multiplier in the cold, dark crater. */
  shadowDrain: 2.5,
};
const LIMIT = WORLD - 4;
/** Autopilot lattice spacing, metres. */
const CELL = 2;
/** Longest sub-step for movement, hours (keeps collisions solid at high game speeds). */
const MAX_STEP = 0.02;

export type Point = { x: number; z: number };

export function modulePos(m: Pick<Module, "pad">): Point {
  if (m.pad < 0) return { x: 0, z: 0 };
  const p = PADS[m.pad];
  return { x: p.x, z: p.z };
}

/** True when the rover fits at (x, z), with `margin` metres to spare (routes plan with a margin). */
export function canOccupy(x: number, z: number, modules: Module[], margin = 0) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
  if (Math.abs(x) > LIMIT || Math.abs(z) > LIMIT) return false;
  const r = ROVER.radius + margin;
  for (const m of modules) {
    const p = modulePos(m);
    if (Math.hypot(p.x - x, p.z - z) < FOOTPRINT[m.type] + r) return false;
  }
  if (Math.hypot(LANDER.x - x, LANDER.z - z) < LANDER.r + r) return false;
  for (const k of rocksNear(x, z)) if (Math.hypot(k.x - x, k.z - z) < k.r * 0.85 + r) return false;
  return true;
}

export const forwardOf = (h: number) => ({ x: -Math.sin(h), z: -Math.cos(h) });
export const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
/** Heading that faces from a to b. */
export const headingTo = (a: Point, b: Point) =>
  Math.atan2(-(b.x - a.x), -(b.z - a.z));

export const atDock = (r: Pick<Rover, "x" | "z">) =>
  Math.hypot(r.x - DOCK.x, r.z - DOCK.z) <= DOCK_RADIUS;

const maxSpeed = (r: Rover) => (r.battery > 0 ? ROVER.maxSpeed : ROVER.crawl);

/** Move toward (x+dx, z+dz), sliding along obstacles; drains the battery by distance. */
function move(
  r: Rover,
  dx: number,
  dz: number,
  heading: number,
  speed: number,
  modules: Module[],
  planet: Planet,
): Rover {
  let x = r.x,
    z = r.z,
    blocked = false;
  if (canOccupy(x + dx, z + dz, modules)) {
    x += dx;
    z += dz;
  } else {
    blocked = true;
    if (canOccupy(x + dx, z, modules)) x += dx;
    else if (canOccupy(x, z + dz, modules)) z += dz;
  }
  const moved = Math.hypot(x - r.x, z - r.z);
  // The Moon's permanently shadowed crater is far colder, so heaters and lights drain more.
  const drain =
    moved * PLANETS[planet].roverDrain * (planet === "moon" && inShadow(x, z) ? ROVER.shadowDrain : 1);
  return {
    ...r,
    x,
    z,
    heading,
    speed: blocked && moved < 1e-4 ? 0 : Math.abs(speed) < 0.01 ? 0 : speed,
    battery: Math.max(0, r.battery - drain),
  };
}

/** Direct (keyboard / touch) control for `dt` training hours. */
export function drive(
  r: Rover,
  input: DriveInput,
  dt: number,
  modules: Module[],
  planet: Planet,
): Rover {
  let out = r;
  const steps = Math.max(1, Math.ceil(dt / MAX_STEP)),
    h = dt / steps;
  for (let i = 0; i < steps; i++) {
    const throttle = Number(input.forward) - Number(input.back),
      turn = Number(input.left) - Number(input.right);
    const max = maxSpeed(out);
    const target = throttle * (throttle < 0 ? max * 0.55 : max);
    const speed =
      out.speed + (target - out.speed) * Math.min(1, h * (throttle ? 8 : 14));
    const heading = wrap(out.heading + turn * h * ROVER.turn);
    const f = forwardOf(heading);
    out = move(out, f.x * speed * h, f.z * speed * h, heading, speed, modules, planet);
  }
  return out;
}

/** Minimal binary heap keyed by priority. */
class Heap {
  private items: { f: number; k: number }[] = [];
  get size() {
    return this.items.length;
  }
  push(f: number, k: number) {
    const a = this.items;
    a.push({ f, k });
    let i = a.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (a[parent].f <= a[i].f) break;
      [a[parent], a[i]] = [a[i], a[parent]];
      i = parent;
    }
  }
  pop() {
    const a = this.items,
      top = a[0],
      last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1,
          r = l + 1;
        let m = i;
        if (l < a.length && a[l].f < a[m].f) m = l;
        if (r < a.length && a[r].f < a[m].f) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top.k;
  }
}

/** Straight segment check, sampled every 0.4 m. */
export function clearLine(a: Point, b: Point, modules: Module[], margin = 0) {
  const d = Math.hypot(b.x - a.x, b.z - a.z),
    n = Math.max(1, Math.ceil(d / 0.4));
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    // Near the ends the rover is arriving or leaving, so only the true size counts there.
    const m = (i * 0.4 < 1.5 || (n - i) * 0.4 < 1.5) ? 0 : margin;
    if (!canOccupy(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, modules, m))
      return false;
  }
  return true;
}
/** Room to spare around obstacles when planning, so turning never clips them. */
const SAFE = 0.6;

/**
 * A* on a 2 m lattice (8-connected, no corner cutting), then line-of-sight
 * smoothing so the rover drives natural straight lines. [] when unreachable.
 */
export function planRoute(from: Point, target: Point, modules: Module[]): Point[] {
  if (!canOccupy(target.x, target.z, modules)) return [];
  if (clearLine(from, target, modules, SAFE)) return [target];
  const half = Math.floor(LIMIT / CELL),
    size = half * 2 + 1;
  const idx = (i: number, j: number) => (j + half) * size + (i + half);
  const at = (n: number) => n * CELL;
  const si = Math.round(from.x / CELL),
    sj = Math.round(from.z / CELL),
    ei = Math.round(target.x / CELL),
    ej = Math.round(target.z / CELL);
  const cost = new Float64Array(size * size).fill(Infinity),
    parent = new Int32Array(size * size).fill(-1),
    closed = new Uint8Array(size * size),
    free = new Int8Array(size * size);
  const ok = (i: number, j: number) => {
    if (Math.abs(i) > half || Math.abs(j) > half) return false;
    const n = idx(i, j);
    if (!free[n]) free[n] = canOccupy(at(i), at(j), modules, SAFE) ? 1 : -1;
    return free[n] === 1;
  };
  const start = idx(si, sj),
    goal = idx(ei, ej);
  free[start] = 1; // the rover is already there, even if the cell centre is tight
  free[goal] = 1;
  const h = (i: number, j: number) => Math.hypot(i - ei, j - ej);
  const open = new Heap();
  cost[start] = 0;
  open.push(h(si, sj), start);
  let expanded = 0;
  while (open.size && expanded < 60000) {
    const current = open.pop();
    if (closed[current]) continue;
    closed[current] = 1;
    expanded++;
    if (current === goal) break;
    const ci = (current % size) - half,
      cj = Math.floor(current / size) - half;
    for (const [di, dj] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1],
    ]) {
      const ni = ci + di,
        nj = cj + dj;
      if (!ok(ni, nj)) continue;
      if (di && dj && (!ok(ci + di, cj) || !ok(ci, cj + dj))) continue;
      // Cells are 2 m apart: also check the ground between them, so no step clips a rock.
      const mx = at(ci + di / 2),
        mz = at(cj + dj / 2);
      if (!canOccupy(mx, mz, modules, SAFE) || !canOccupy((at(ci) + mx) / 2, (at(cj) + mz) / 2, modules, SAFE) || !canOccupy((at(ni) + mx) / 2, (at(nj) + mz) / 2, modules, SAFE)) continue;
      const n = idx(ni, nj);
      if (closed[n]) continue;
      const c = cost[current] + (di && dj ? Math.SQRT2 : 1);
      if (c < cost[n]) {
        cost[n] = c;
        parent[n] = current;
        open.push(c + h(ni, nj), n);
      }
    }
  }
  if (!closed[goal]) return [];
  const cells: Point[] = [];
  for (let a = goal; a !== start && a !== -1; a = parent[a])
    cells.unshift({ x: at((a % size) - half), z: at(Math.floor(a / size) - half) });
  if (!cells.length) return [target];
  cells[cells.length - 1] = { x: target.x, z: target.z };
  // The rover starts off the lattice; if it can't see the first cell, go via its own cell centre.
  if (!clearLine(from, cells[0], modules, SAFE)) cells.unshift({ x: at(si), z: at(sj) });
  const route: Point[] = [];
  let anchor: Point = { x: from.x, z: from.z },
    i = 0;
  while (i < cells.length) {
    let j = cells.length - 1;
    while (j > i && !clearLine(anchor, cells[j], modules, SAFE)) j--;
    route.push(cells[j]);
    anchor = cells[j];
    i = j + 1;
  }
  return route;
}

/** Autopilot along a planned route for `dt` training hours. */
export function followRoute(
  r: Rover,
  route: Point[],
  dt: number,
  modules: Module[],
  planet: Planet,
): { rover: Rover; route: Point[] } {
  let out = r,
    rest = route;
  const steps = Math.max(1, Math.ceil(dt / MAX_STEP)),
    h = dt / steps;
  for (let i = 0; i < steps && rest.length; i++) {
    const at = rest[0],
      dx = at.x - out.x,
      dz = at.z - out.z,
      distance = Math.hypot(dx, dz);
    if (distance < 0.3) {
      rest = rest.slice(1);
      if (!rest.length) out = { ...out, speed: 0 };
      continue;
    }
    const diff = wrap(Math.atan2(-dx, -dz) - out.heading);
    const heading = wrap(
      out.heading + Math.sign(diff) * Math.min(Math.abs(diff), ROVER.turn * 1.6 * h),
    );
    // Turn on the spot for sharp corners so the rover stays on the planned line.
    const align = Math.abs(diff) > 0.5 ? 0 : Math.cos(diff);
    const last = rest.length === 1;
    const cruise =
      maxSpeed(out) * align * (last ? Math.min(1, (distance + 0.8) / 4) : 1);
    const speed = out.speed + (cruise - out.speed) * Math.min(1, h * 8);
    const step = Math.min(distance, Math.max(0, speed) * h);
    const f = forwardOf(heading);
    const next = move(out, f.x * step, f.z * step, heading, speed, modules, planet);
    if (step > 0.001 && Math.hypot(next.x - out.x, next.z - out.z) < step * 0.2)
      return { rover: { ...next, speed: 0 }, route: [] }; // stuck: give up
    out = next;
  }
  if (!rest.length) out = { ...out, speed: 0 };
  return { rover: out, route: rest };
}

/** The free point nearest the rover on rings around a solid target (a module, a rock). */
export function approachPoint(
  from: Point,
  target: Point,
  modules: Module[],
  minRing = 0,
): Point | null {
  if (!minRing && canOccupy(target.x, target.z, modules)) return target;
  for (let r = Math.max(1, minRing); r <= 8; r += 0.5) {
    let best: Point | null = null,
      bestD = Infinity;
    for (let a = 0; a < 24; a++) {
      const x = target.x + Math.cos((a / 24) * Math.PI * 2) * r,
        z = target.z + Math.sin((a / 24) * Math.PI * 2) * r;
      if (!canOccupy(x, z, modules)) continue;
      const d = Math.hypot(x - from.x, z - from.z);
      if (d < bestD) {
        bestD = d;
        best = { x, z };
      }
    }
    if (best) return best;
  }
  return null;
}

/** Route length in metres (for battery estimates). */
export function routeLength(from: Point, route: Point[]) {
  let d = 0,
    at = from;
  for (const p of route) {
    d += Math.hypot(p.x - at.x, p.z - at.z);
    at = p;
  }
  return d;
}

/** Rough battery % for a one-way trip along a route. */
export function tripCost(from: Point, route: Point[], planet: Planet) {
  let pct = 0,
    at = from;
  for (const p of route) {
    const d = Math.hypot(p.x - at.x, p.z - at.z),
      n = Math.max(1, Math.ceil(d / 2));
    for (let i = 0; i < n; i++) {
      const x = at.x + ((p.x - at.x) * (i + 0.5)) / n,
        z = at.z + ((p.z - at.z) * (i + 0.5)) / n;
      pct +=
        (d / n) * PLANETS[planet].roverDrain * (planet === "moon" && inShadow(x, z) ? ROVER.shadowDrain : 1);
    }
    at = p;
  }
  return pct;
}

/** If a save or a new module left the rover inside an obstacle, nudge it to the nearest free spot. */
export function unstick(r: Rover, modules: Module[]): Rover {
  if (canOccupy(r.x, r.z, modules)) return r;
  for (let d = 1; d < 20; d += 0.5)
    for (let a = 0; a < 16; a++) {
      const x = r.x + Math.cos((a / 16) * Math.PI * 2) * d,
        z = r.z + Math.sin((a / 16) * Math.PI * 2) * d;
      if (canOccupy(x, z, modules)) return { ...r, x, z, speed: 0 };
    }
  return { ...r, x: DOCK.x, z: DOCK.z, speed: 0 };
}
