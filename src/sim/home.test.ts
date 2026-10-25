import { describe, expect, it } from "vitest";
import { blockAxes, blockCorners, BLOCKS, DOORS, floorY, HOME, PACE, polar, ROOMS, roomAt, SPAWN, STAIR, stairLocal, stairPoint, stepLength, stride, walk, walls, WINDOWS, within, type Block, type Seg, type Stroller, type Walker } from "./home";
import { DOCK, DOCK_RADIUS, HABITAT_RADIUS, PADS, terrainHeight } from "./world";

const allOpen = (door: string) => door !== "airlock";
const r = (w: { x: number; z: number }) => Math.hypot(w.x, w.z);
/** Walk in a straight line, a little at a time, as the game does each frame. */
function stroll(w: Walker, dx: number, dz: number, open = allOpen, steps = 40) {
  let p = w;
  const ys: number[] = [];
  for (let i = 0; i < steps; i++) {
    p = walk(p, dx / steps, dz / steps, open);
    ys.push(floorY(p));
  }
  return { p, ys };
}

describe("the Mars home floor plan", () => {
  it("starts the walk inside the suit room, clear of every wall", () => {
    const start: Walker = { x: SPAWN.x, z: SPAWN.z, where: 0 };
    expect(roomAt(start.x, start.z, 0).id).toBe("suit");
    const p = walk(start, 0, 0);
    expect(Math.hypot(p.x - start.x, p.z - start.z)).toBeLessThan(1e-6);
  });

  it("stops at a closed door and goes through it once it slides open", () => {
    const start: Walker = { ...polar(185, 3.9), where: 0 };
    const shut = stroll(start, ...dir(185, -2), () => false).p;
    expect(r(shut)).toBeGreaterThan(HOME.hall + HOME.body - 0.05);
    const open = stroll(start, ...dir(185, -2), allOpen).p;
    expect(r(open)).toBeLessThan(HOME.hall);
    expect(roomAt(open.x, open.z, 0).id).toBe("hall");
  });

  it("never lets you through the outer wall, or out of the airlock without an EVA", () => {
    const galley = stroll({ ...polar(250, 4), where: 0 }, ...dir(250, 3)).p;
    expect(r(galley)).toBeLessThanOrEqual(HOME.lining - HOME.body + 1e-3);
    const airlock = stroll({ x: SPAWN.x, z: SPAWN.z, where: 0 }, 0, 3).p;
    expect(r(airlock)).toBeLessThanOrEqual(HOME.lining - HOME.body + 1e-3);
  });

  it("slides along a wall instead of sticking to it", () => {
    // Walk diagonally into the partition at 290° (galley | hygiene): the walker keeps moving outward.
    const start: Walker = { ...polar(285, 3.6), where: 0 };
    const out = polar(290, 1),
      along = polar(290 + 90, 1);
    const p = stroll(start, out.x * 0.8 + along.x, out.z * 0.8 + along.z).p;
    expect(r(p)).toBeGreaterThan(r(start) + 0.3);
    expect(roomAt(p.x, p.z, 0).id).toBe("galley");
  });

  it("climbs the stair to the upper floor and comes back down", () => {
    const foot = stairPoint(-STAIR.half - 0.45, (STAIR.inner + STAIR.outer) / 2);
    const up = stroll({ ...foot, where: 0 }, ...along(5));
    expect(up.p.where).toBe(1);
    expect(floorY(up.p)).toBeCloseTo(HOME.floor[1]);
    for (let i = 1; i < up.ys.length; i++) expect(up.ys[i]).toBeGreaterThanOrEqual(up.ys[i - 1] - 1e-9);
    const down = stroll(up.p, ...along(-5.5));
    expect(down.p.where).toBe(0);
    expect(floorY(down.p)).toBeCloseTo(HOME.floor[0]);
  });

  it("keeps you out of the stairwell from the side, upstairs and down", () => {
    for (const level of [0, 1] as const) {
      const p = stroll({ ...polar(130, 3.0), where: level }, ...dir(130, 2)).p;
      expect(p.where).toBe(level);
      expect(stairLocal(p.x, p.z).w).toBeLessThan(STAIR.inner);
    }
  });

  it("can reach every room on foot, with room to move about in each", () => {
    for (const level of [0, 1] as const) {
      const start = level === 0 ? { x: SPAWN.x, z: SPAWN.z } : stairPoint(STAIR.half + 0.5, (STAIR.inner + STAIR.outer) / 2);
      const reached = flood(level, start);
      for (const room of ROOMS.filter((m) => m.level === level)) {
        const inside = reached.filter((c) => roomAt(c.x, c.z, level).id === room.id).length;
        // At least 0.6 m² of places for the middle of the walker (grid points are 0.1 m apart): with a body
        // 0.6 m across, that is about 2 m² of floor to move about on.
        expect(inside * 0.01, `${room.id} on floor ${level}`).toBeGreaterThan(0.6);
      }
    }
  });

  it("can walk from the airlock to the foot of the stair, and right up to the hatch", () => {
    const reached = flood(0, { x: SPAWN.x, z: SPAWN.z });
    const near = (p: { x: number; z: number }, d: number) => reached.some((c) => Math.hypot(c.x - p.x, c.z - p.z) < d);
    expect(near(stairPoint(-STAIR.half - 0.3, (STAIR.inner + STAIR.outer) / 2), 0.1)).toBe(true);
    expect(near(polar(180, HOME.lining - HOME.body), 0.1)).toBe(true);
  });

  it("puts every window in a room on its floor, never on the stairs", () => {
    for (const w of WINDOWS) {
      const p = polar(w.bearing, HOME.lining - 0.5);
      const room = roomAt(p.x, p.z, w.level);
      expect(room.id, `window at ${w.bearing}`).not.toBe("hall");
      expect(within(w.bearing, 96, 164)).toBe(false);
    }
  });

  it("keeps furniture inside its room, inside the padded wall and clear of doorways", () => {
    for (const k of BLOCKS) {
      // Every corner is in the piece's own room, and inside the padded wall.
      for (const p of blockCorners(k)) {
        expect(roomAt(p.x, p.z, k.level).id, k.id).toBe(k.room);
        expect(Math.hypot(p.x, p.z), k.id).toBeLessThanOrEqual(HOME.lining - 0.02);
      }
      // At least 0.45 m between either end of a doorway and the nearest edge of the box.
      const { c, n, t } = blockAxes(k);
      for (const d of DOORS.filter((x) => x.level === k.level)) {
        const ends = d.r === HOME.core ? [HOME.core, k.level === 0 ? HOME.shelter : HOME.command] : [d.r];
        for (const r of ends) {
          const dp = polar(d.bearing, r);
          const u = (dp.x - c.x) * t.x + (dp.z - c.z) * t.z,
            v = (dp.x - c.x) * n.x + (dp.z - c.z) * n.z;
          const gap = Math.hypot(Math.max(0, Math.abs(u) - k.w / 2), Math.max(0, Math.abs(v) - k.d / 2));
          expect(gap, `${k.id} vs door ${d.id}`).toBeGreaterThan(0.45);
        }
      }
    }
  });

  it("keeps furniture off the walls and out of each other (a chair may tuck under its table)", () => {
    const faces = [HOME.lining, HOME.core, HOME.shelter, HOME.command];
    for (const k of BLOCKS) {
      const box = blockCorners(k);
      for (const s of walls(k.level)) {
        if (s.block) continue;
        // The padded wall and the core are faces; partitions and the hall wall are 0.12 m thick, drawn about their line.
        const face = faces.some((f) => Math.abs(Math.hypot(s.ax, s.az) - f) < 1e-6 && Math.abs(Math.hypot(s.bx, s.bz) - f) < 1e-6);
        expect(segBox(s, box), `${k.id} vs wall`).toBeGreaterThanOrEqual(face ? 0.02 : HOME.wall / 2 + 0.02);
      }
      for (const o of BLOCKS)
        if (o.id < k.id && o.level === k.level && o.tuck !== k.id && k.tuck !== o.id) expect(overlap(k, o), `${k.id} and ${o.id}`).toBe(false);
    }
  });

  it("speeds up and slows down gently, at walking or fast pace, and stops dead at a wall", () => {
    // Along a clear stretch of the hall.
    let w: Stroller = { ...polar(200, 2.42), where: 0, vx: 0, vz: 0 };
    const ahead = polar(290, 1);
    w = stride(w, ahead, PACE.walk, 0.05);
    expect(Math.hypot(w.vx, w.vz)).toBeLessThan(PACE.walk * 0.4);
    for (let i = 0; i < 9; i++) w = stride(w, ahead, PACE.walk, 0.05);
    expect(Math.hypot(w.vx, w.vz)).toBeGreaterThan(PACE.walk * 0.9);
    expect(Math.hypot(w.vx, w.vz)).toBeLessThanOrEqual(PACE.walk + 1e-6);
    for (let i = 0; i < 4; i++) w = stride(w, { x: ahead.x * 3, z: ahead.z * 3 }, PACE.fast, 0.05);
    expect(Math.hypot(w.vx, w.vz)).toBeGreaterThan(PACE.walk);
    expect(Math.hypot(w.vx, w.vz)).toBeLessThanOrEqual(PACE.fast + 1e-6);
    for (let i = 0; i < 20; i++) w = stride(w, { x: 0, z: 0 }, PACE.walk, 0.05);
    expect(Math.hypot(w.vx, w.vz)).toBeLessThan(0.01);
    // Into the padded wall: the walker stops, with nothing stored up to carry on with.
    let v: Stroller = { ...polar(0, 4.3), where: 0, vx: 0, vz: 0 };
    for (let i = 0; i < 60; i++) v = stride(v, { x: 0, z: -1 }, PACE.walk, 0.05);
    expect(Math.hypot(v.x, v.z)).toBeLessThanOrEqual(HOME.lining - HOME.body + 1e-3);
    expect(Math.abs(v.vz)).toBeLessThan(0.05);
  });

  it("takes longer, slower steps in lower gravity", () => {
    expect(stepLength(9.81)).toBeCloseTo(0.75);
    expect(stepLength(3.71)).toBeGreaterThan(1.1);
    expect(stepLength(1.62)).toBeGreaterThan(stepLength(3.71));
  });

  it("builds the same walls every time (they are cached)", () => {
    expect(walls(0)).toBe(walls(0));
    expect(walls("stair").length).toBe(2);
  });
});

describe("the outpost around the bigger home", () => {
  const PAD = 2.95;
  const base = PADS.filter((p) => p.kind === "base");
  it("keeps every pad clear of the home's footprint, with room to walk between", () => {
    for (const p of base) expect(Math.hypot(p.x, p.z) - PAD, `pad ${p.id}`).toBeGreaterThanOrEqual(HABITAT_RADIUS + 1.2);
    expect(HABITAT_RADIUS).toBeGreaterThanOrEqual(HOME.shell + 0.5);
  });
  it("keeps pads apart from each other and from the rover dock", () => {
    for (const a of PADS)
      for (const b of PADS) if (a.id < b.id) expect(Math.hypot(a.x - b.x, a.z - b.z), `pads ${a.id} and ${b.id}`).toBeGreaterThanOrEqual(2 * PAD + 1.2);
    for (const p of base) {
      // Distance from the pad's centre to the square dock slab.
      const dx = Math.max(0, Math.abs(p.x - DOCK.x) - DOCK_RADIUS),
        dz = Math.max(0, Math.abs(p.z - DOCK.z) - DOCK_RADIUS);
      expect(Math.hypot(dx, dz) - PAD, `pad ${p.id}`).toBeGreaterThanOrEqual(0.3);
    }
    expect(DOCK.z - DOCK_RADIUS - HABITAT_RADIUS).toBeGreaterThanOrEqual(3);
  });
  it("sets every pad on level ground, on both planets", () => {
    for (const planet of ["moon", "mars"] as const)
      for (const p of base) {
        const c = terrainHeight(p.x, p.z, planet);
        for (let k = 0; k < 16; k++) {
          const a = (k / 16) * Math.PI * 2;
          expect(Math.abs(terrainHeight(p.x + Math.cos(a) * PAD, p.z + Math.sin(a) * PAD, planet) - c), `${planet} pad ${p.id}`).toBeLessThan(0.05);
        }
      }
  });
});

/** Shortest distance between a wall segment and a box (0 if they cross). */
function segBox(s: Seg, box: { x: number; z: number }[]) {
  const a = { x: s.ax, z: s.az },
    b = { x: s.bx, z: s.bz };
  const edges = box.map((p, i) => [p, box[(i + 1) % 4]] as const);
  if (edges.some(([p, q]) => crosses(a, b, p, q)) || inside(a, box)) return 0;
  return Math.min(...edges.flatMap(([p, q]) => [pointSeg(p, a, b), pointSeg(a, p, q), pointSeg(b, p, q)]));
}
type P = { x: number; z: number };
const cross = (o: P, a: P, b: P) => (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);
const crosses = (a: P, b: P, c: P, d: P) => cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0;
const inside = (p: P, box: P[]) => box.every((q, i) => cross(q, box[(i + 1) % 4], p) >= 0) || box.every((q, i) => cross(q, box[(i + 1) % 4], p) <= 0);
function pointSeg(p: P, a: P, b: P) {
  const vx = b.x - a.x,
    vz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.z - a.z) * vz) / (vx * vx + vz * vz || 1e-9)));
  return Math.hypot(p.x - a.x - vx * t, p.z - a.z - vz * t);
}
/** Do two boxes overlap (by more than a millimetre)? Separating-axis test on their edges. */
function overlap(a: Block, b: Block) {
  const pa = blockCorners(a),
    pb = blockCorners(b);
  for (const k of [a, b]) {
    const { n, t } = blockAxes(k);
    for (const ax of [n, t]) {
      const proj = (ps: P[]) => ps.map((p) => p.x * ax.x + p.z * ax.z);
      const [qa, qb] = [proj(pa), proj(pb)];
      if (Math.max(...qa) < Math.min(...qb) + 1e-3 || Math.max(...qb) < Math.min(...qa) + 1e-3) return false;
    }
  }
  return true;
}
/** A displacement of length d along a bearing. */
function dir(bearing: number, d: number): [number, number] {
  const p = polar(bearing, d);
  return [p.x, p.z];
}
/** A displacement of length d up the flight. */
function along(d: number): [number, number] {
  const a = stairPoint(0, 0),
    b = stairPoint(d, 0);
  return [b.x - a.x, b.z - a.z];
}
/**
 * Every point of a 0.1 m grid where the walker can stand on a floor (off the stair), and can get to from
 * the start by stepping between neighbouring points without touching a wall (open doors, closed airlock).
 */
function flood(level: 0 | 1, start: { x: number; z: number }) {
  const step = 0.1;
  const segs = walls(level).filter((s) => !s.door || !allOpen(s.door));
  const R = HOME.body - 1e-6;
  const stands = new Map<string, boolean>();
  const at = (i: number, j: number) => ({ x: i * step, z: j * step });
  const standable = (i: number, j: number) => {
    const k = `${i},${j}`;
    let ok = stands.get(k);
    if (ok === undefined) {
      const p = at(i, j);
      const { u, w } = stairLocal(p.x, p.z);
      const onFlight = Math.abs(u) <= STAIR.half && w >= STAIR.inner && w <= STAIR.outer;
      ok = !onFlight && Math.hypot(p.x, p.z) < HOME.lining && segs.every((s) => pointSeg(p, { x: s.ax, z: s.az }, { x: s.bx, z: s.bz }) >= R);
      stands.set(k, ok);
    }
    return ok;
  };
  // A step between neighbours is clear if the walker's circle, swept along it, touches no wall.
  const clear = (a: P, b: P) => segs.every((s) => segSeg(a, b, { x: s.ax, z: s.az }, { x: s.bx, z: s.bz }) >= R);
  const i0 = Math.round(start.x / step),
    j0 = Math.round(start.z / step);
  expect(standable(i0, j0), "the start is somewhere you can stand").toBe(true);
  const seen = new Set([`${i0},${j0}`]);
  const queue = [[i0, j0]];
  const out: P[] = [];
  while (queue.length) {
    const [i, j] = queue.pop()!;
    out.push(at(i, j));
    for (const [di, dj] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const k = `${i + di},${j + dj}`;
      if (seen.has(k) || !standable(i + di, j + dj) || !clear(at(i, j), at(i + di, j + dj))) continue;
      seen.add(k);
      queue.push([i + di, j + dj]);
    }
  }
  return out;
}
/** Shortest distance between two segments. */
function segSeg(a: P, b: P, c: P, d: P) {
  if (crosses(a, b, c, d)) return 0;
  return Math.min(pointSeg(a, c, d), pointSeg(b, c, d), pointSeg(c, a, b), pointSeg(d, a, b));
}
