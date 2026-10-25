import { describe, expect, it } from "vitest";
import { floorY, HOME, polar, ROOMS, roomAt, SPAWN, STAIR, stairLocal, stairPoint, walk, walls, WINDOWS, within, type Walker } from "./home";
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

  it("can reach every room on foot", () => {
    for (const level of [0, 1] as const) {
      const start = level === 0 ? { x: SPAWN.x, z: SPAWN.z } : stairPoint(STAIR.half + 0.5, (STAIR.inner + STAIR.outer) / 2);
      const reached = flood(level, start);
      for (const room of ROOMS.filter((m) => m.level === level)) {
        const at = samplePoint(room.id, level, room.core ? null : (room.from + room.to) / 2);
        const near = reached.some((c) => Math.hypot(c.x - at.x, c.z - at.z) < 0.3);
        expect(near, `${room.id} on floor ${level}`).toBe(true);
      }
    }
  });

  it("puts every window in a room on its floor, never on the stairs", () => {
    for (const w of WINDOWS) {
      const p = polar(w.bearing, HOME.lining - 0.5);
      const room = roomAt(p.x, p.z, w.level);
      expect(room.id, `window at ${w.bearing}`).not.toBe("hall");
      expect(within(w.bearing, 96, 164)).toBe(false);
    }
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
/** Where to check that a room can be reached (its middle, or the free spot next to the stair). */
function samplePoint(id: string, level: 0 | 1, mid: number | null) {
  if (id === "stairs") return stairPoint(-STAIR.half - 0.45, (STAIR.inner + STAIR.outer) / 2);
  if (id === "landing") return stairPoint(STAIR.half + 0.5, (STAIR.inner + STAIR.outer) / 2);
  if (mid === null) return level === 0 ? { x: 0, z: 0 } : polar(165, 1.0);
  return polar(mid, (HOME.hall + HOME.lining) / 2);
}
/** Every 0.15 m grid point the walker can reach from a start, moving between neighbours as the game does. */
function flood(level: 0 | 1, start: { x: number; z: number }) {
  const step = 0.15;
  const key = (x: number, z: number) => `${Math.round(x / step)},${Math.round(z / step)}`;
  const seen = new Set<string>([key(start.x, start.z)]);
  const queue = [{ x: start.x, z: start.z }];
  const out: { x: number; z: number }[] = [];
  while (queue.length) {
    const c = queue.pop()!;
    out.push(c);
    for (const [dx, dz] of [
      [step, 0],
      [-step, 0],
      [0, step],
      [0, -step],
    ]) {
      const p = walk({ x: c.x, z: c.z, where: level }, dx, dz, allOpen);
      if (p.where !== level) continue;
      // Sliding along a wall counts (that is how you get through a diagonal doorway), standing still doesn't.
      const k = key(p.x, p.z);
      if (seen.has(k) || Math.hypot(p.x - c.x, p.z - c.z) < 0.1) continue;
      seen.add(k);
      queue.push({ x: p.x, z: p.z });
    }
  }
  return out;
}
