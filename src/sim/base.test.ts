import { describe, expect, it } from "vitest";
import {
  AIRLOCKS,
  BUILDINGS,
  building,
  campusSolids,
  cellAt,
  cellById,
  cellOpen,
  CELLS,
  doorLocked,
  doorSlab,
  FLOOR,
  FURNITURE,
  hitsCampus,
  HQ_STAIR,
  LOCK_PANELS,
  SUIT_RACKS,
  MEZZANINE,
  OUTER_DOORS,
  porchY,
  PORTALS,
  rectDistance,
  STAIR_LINKS,
  stageOf,
  type Stage,
} from "./base";
import { createState } from "./engine";
import { floorY, HOME, stride, walk, walkWalls, type Stroller, type Walker } from "./home";
import { OUTER_HATCH, SUIT, walkOutside } from "./outside";
import { canOccupy, modulePos } from "./rover";
import { DOCK, FOOTPRINT, LANDER, PADS, SCOUT_HOME, SITES } from "./world";

const OPEN = () => true;
/** Walk a list of waypoints (all doors open), a few centimetres at a time, and say where you ended up. */
function route(from: Walker, points: { x: number; z: number }[], open: (door: string) => boolean = OPEN) {
  let w: Stroller = { ...from, vx: 0, vz: 0 };
  for (const p of points)
    for (let i = 0; i < 4000 && Math.hypot(p.x - w.x, p.z - w.z) > 0.15; i++) {
      const dx = p.x - w.x,
        dz = p.z - w.z,
        d = Math.hypot(dx, dz);
      w = stride(w, { x: dx / d, z: dz / d }, 1.4, 1 / 30, open);
    }
  return w;
}
const reached = (w: Walker, p: { x: number; z: number }) => Math.hypot(w.x - p.x, w.z - p.z) < 0.3;

describe("the campus plan", () => {
  it("has the brief's twelve major buildings and well over thirty rooms and spaces", () => {
    const major = BUILDINGS.filter((b) => b.letter);
    expect(new Set(major.map((b) => b.letter))).toEqual(new Set("ABCDEFGHIJKL".split("")));
    // Hab-1 has ten rooms of its own (see home.ts); the campus adds its own cells.
    expect(CELLS.length + 10).toBeGreaterThanOrEqual(30);
    const xs = BUILDINGS.filter((b) => b.kind !== "compound").flatMap((b) => [b.rect.x0, b.rect.x1]);
    const span = Math.max(...xs) - Math.min(...xs);
    expect(span).toBeGreaterThan(140);
    expect(span).toBeLessThan(210);
  });

  it("never overlaps two rooms on the same floor, or two buildings", () => {
    for (const a of CELLS)
      for (const b of CELLS) {
        if (a === b || a.level !== b.level) continue;
        const overlap = Math.min(a.rect.x1, b.rect.x1) - Math.max(a.rect.x0, b.rect.x0) > 0.01 && Math.min(a.rect.z1, b.rect.z1) - Math.max(a.rect.z0, b.rect.z0) > 0.01;
        expect(overlap, `${a.id} / ${b.id}`).toBe(false);
      }
    // Every room sits inside its own building.
    for (const c of CELLS) {
      const b = building(c.building).rect;
      expect(c.rect.x0 >= b.x0 - 1e-6 && c.rect.x1 <= b.x1 + 1e-6 && c.rect.z0 >= b.z0 - 1e-6 && c.rect.z1 <= b.z1 + 1e-6, c.id).toBe(true);
    }
  });

  it("puts every door in a wall the two rooms it joins actually share", () => {
    for (const p of PORTALS) {
      for (const id of [p.a, p.b]) {
        if (id === "outside" || id === "hab" || id === "hq-stair") continue;
        const c = cellById(id);
        expect(c, `${p.id}: ${id}`).toBeTruthy();
        const r = c!.rect;
        // Within the wall band next to one of its edges, and wholly along it.
        if (p.along === "x") {
          expect(Math.min(Math.abs(p.z - r.z0), Math.abs(p.z - r.z1)), p.id).toBeLessThanOrEqual(0.21);
          expect(p.x - p.width / 2 >= r.x0 - 1e-6 && p.x + p.width / 2 <= r.x1 + 1e-6, p.id).toBe(true);
        } else {
          expect(Math.min(Math.abs(p.x - r.x0), Math.abs(p.x - r.x1)), p.id).toBeLessThanOrEqual(0.21);
          expect(p.z - p.width / 2 >= r.z0 - 1e-6 && p.z + p.width / 2 <= r.z1 + 1e-6, p.id).toBe(true);
        }
      }
      // Doors are wide enough for a walker (a body is 0.6 m across), and airlock doors for a suit.
      expect(p.width, p.id).toBeGreaterThanOrEqual(p.kind.startsWith("lock") ? 1.1 : 0.9);
    }
  });

  it("links every room to Hab-1 through doors, and only opens what the colony has built", () => {
    const reach = (stage: Stage) => {
      const seen = new Set(["hab"]);
      for (let grew = true; grew; ) {
        grew = false;
        for (const p of PORTALS) {
          if (p.kind === "lock-outer" || p.kind === "vehicle" || p.a === "outside" || p.b === "outside") continue;
          if (doorLocked(p, stage)) continue;
          const [a, b] = [p.a, p.b];
          for (const [from, to] of [[a, b], [b, a]])
            if (seen.has(from) && !seen.has(to)) {
              seen.add(to);
              grew = true;
            }
        }
        for (const l of STAIR_LINKS)
          if (seen.has(l.from) && !seen.has(l.to)) {
            seen.add(l.to);
            grew = true;
          }
      }
      return seen;
    };
    const all = reach(2);
    for (const c of CELLS) if (c.kind !== "hangar") expect(all.has(c.id), c.id).toBe(true);
    for (const stage of [0, 1] as Stage[]) {
      const some = reach(stage);
      for (const c of CELLS) if (c.kind !== "hangar") expect(some.has(c.id), `${c.id} at stage ${stage}`).toBe(cellOpen(c, stage));
    }
    // The first missions already have the HQ, the EVA complex and the garage; Mars has everything.
    expect(stageOf("first-light")).toBe(0);
    expect(stageOf("red-planet")).toBe(2);
    for (const id of ["hq-hall", "eva-lock", "yard-lock"]) expect(reach(0).has(id), id).toBe(true);
  });

  it("walks from Hab-1's suit room through the link and the HQ to the EVA airlock", () => {
    const start: Walker = { x: 0, z: 4.35, where: 0 };
    const w = route(start, [
      { x: 0, z: 6.5 },
      { x: 0, z: 20 },
      { x: 0, z: 33 },
      { x: 0, z: 37 },
      { x: 0, z: 44 },
      { x: 12, z: 47 },
      { x: 30, z: 47 },
      { x: 60, z: 47 },
      { x: 60, z: 52 },
      { x: 56, z: 54 },
      { x: 56, z: 58 },
      { x: 60.5, z: 59.3 },
      { x: 66, z: 59.3 },
    ]);
    expect(reached(w, { x: 66, z: 59.3 }), `${w.x.toFixed(2)}, ${w.z.toFixed(2)}`).toBe(true);
    expect(cellAt(w.x, w.z, 0)?.id).toBe("eva-lock");
  });

  it("walks the west spine to the far end, and never through a shut door", () => {
    // (Round the north end of the HQ stair, which stands in the hall.)
    const hall: Walker = { x: -12, z: 42, where: 0 };
    const far = route(hall, [{ x: -13, z: 47 }, { x: -40, z: 47 }, { x: -70, z: 47 }, { x: -86, z: 47 }, { x: -86, z: 45 }]);
    expect(cellAt(far.x, far.z, 0)?.id).toBe("log-store");
    // With every door shut, the HQ's west door stops you.
    const shut = route(hall, [{ x: -13, z: 47 }, { x: -20, z: 47 }], () => false);
    expect(shut.x).toBeGreaterThan(-14.2);
    expect(cellAt(shut.x, shut.z, 0)?.id).toBe("hq-hall");
  });

  it("climbs the HQ stair to the mezzanine and comes back down", () => {
    const foot: Walker = { x: (HQ_STAIR.x0 + HQ_STAIR.x1) / 2, z: HQ_STAIR.z0 - 1.2, where: 0 };
    const up = route(foot, [{ x: foot.x, z: HQ_STAIR.z1 + 1.5 }, { x: 0, z: 53.5 }]);
    expect(up.where).toBe(2);
    expect(floorY(up)).toBe(MEZZANINE);
    expect(cellAt(up.x, up.z, 2)?.id).toBe("hq-mezzanine");
    const down = route(up, [{ x: foot.x, z: HQ_STAIR.z1 + 0.8 }, { x: foot.x, z: HQ_STAIR.z0 - 1 }]);
    expect(down.where).toBe(0);
    expect(floorY(down)).toBe(FLOOR);
    // You can't step off the mezzanine's edge (there's a rail), or walk into the stair from its side.
    const edge = route(up, [{ x: 4, z: 52 }, { x: 4, z: 47 }]);
    expect(edge.where).toBe(2);
    expect(edge.z).toBeGreaterThan(50.4);
    const side = route({ x: -6, z: 47, where: 0 }, [{ x: -12, z: 47 }]);
    expect(side.where).toBe(0);
    expect(side.x).toBeGreaterThan(HQ_STAIR.x1);
  });

  it("can't tunnel through a campus wall however long a frame is", () => {
    let w: Stroller = { x: 0, z: 47, where: 0, vx: 0, vz: 0 };
    for (let i = 0; i < 8; i++) w = stride(w, { x: 0, z: 1 }, 2.2, 1.5);
    // The hall's south wall is at z 56.4.
    expect(w.z).toBeLessThanOrEqual(56.4 - HOME.body + 1e-6);
    // Every wall segment is somewhere on the campus or in Hab-1, none of them a dot.
    for (const s of walkWalls(0)) expect(Math.hypot(s.bx - s.ax, s.bz - s.az)).toBeGreaterThan(1e-4);
  });

  it("starts each walk on the same floor as the corridor beside Hab-1", () => {
    const w = walk({ x: 0, z: 4.35, where: 0 }, 0, 3, OPEN);
    expect(floorY(w)).toBe(FLOOR);
    expect(cellAt(w.x, w.z, 0)?.id).toBe("link-tunnel");
  });
});

describe("the campus's furniture", () => {
  it("stands inside its own room, never overlapping another piece", () => {
    for (const f of FURNITURE) {
      const c = cellById(f.cell);
      expect(c, f.id).toBeTruthy();
      const r = c!.rect,
        q = f.rect;
      expect(q.x0 >= r.x0 - 1e-6 && q.x1 <= r.x1 + 1e-6 && q.z0 >= r.z0 - 1e-6 && q.z1 <= r.z1 + 1e-6, f.id).toBe(true);
      expect(q.x1 > q.x0 && q.z1 > q.z0 && f.h > 0, f.id).toBe(true);
    }
    for (const a of FURNITURE)
      for (const b of FURNITURE) {
        if (a === b || a.cell !== b.cell) continue;
        const overlap = Math.min(a.rect.x1, b.rect.x1) - Math.max(a.rect.x0, b.rect.x0) > 0.01 && Math.min(a.rect.z1, b.rect.z1) - Math.max(a.rect.z0, b.rect.z0) > 0.01;
        expect(overlap, `${a.id} / ${b.id}`).toBe(false);
      }
  });

  it("keeps every doorway clear: a body's width in front of each door, on both sides", () => {
    for (const p of PORTALS) {
      if (p.kind === "vehicle") continue;
      for (const id of [p.a, p.b]) {
        const c = cellById(id);
        if (!c) continue;
        // The patch of floor a walker crosses to reach the door from this room.
        const r = c.rect,
          h = p.width / 2;
        const zone =
          p.along === "x"
            ? Math.abs(p.z - r.z0) < Math.abs(p.z - r.z1)
              ? { x0: p.x - h, z0: r.z0, x1: p.x + h, z1: r.z0 + 0.9 }
              : { x0: p.x - h, z0: r.z1 - 0.9, x1: p.x + h, z1: r.z1 }
            : Math.abs(p.x - r.x0) < Math.abs(p.x - r.x1)
              ? { x0: r.x0, z0: p.z - h, x1: r.x0 + 0.9, z1: p.z + h }
              : { x0: r.x1 - 0.9, z0: p.z - h, x1: r.x1, z1: p.z + h };
        for (const f of FURNITURE) {
          if (f.cell !== id) continue;
          const hit = Math.min(zone.x1, f.rect.x1) - Math.max(zone.x0, f.rect.x0) > 0.01 && Math.min(zone.z1, f.rect.z1) - Math.max(zone.z0, f.rect.z0) > 0.01;
          expect(hit, `${f.id} blocks ${p.id}`).toBe(false);
        }
      }
    }
  });

  it("leaves the suit racks and airlock panels where you can stand and reach them", () => {
    for (const r of SUIT_RACKS) {
      const spot = { x: r.x + (r.cell === "yard-stage" ? 0.5 : 0), z: r.z + (r.cell === "yard-stage" ? 0 : 0.6), where: 0 as const };
      const w = walk(spot, 0, 0, OPEN);
      expect(Math.hypot(w.x - r.x, w.z - r.z), r.cell).toBeLessThan(1.2);
    }
    for (const p of LOCK_PANELS) {
      const w = walk({ x: p.inside.x - 0.6, z: p.inside.z, where: 0 }, 0, 0, OPEN);
      expect(Math.hypot(w.x - p.inside.x, w.z - p.inside.z), p.airlock).toBeLessThan(1.2);
    }
  });
});

describe("the campus outside", () => {
  const g = createState("mars-colony", 3);
  it("keeps every pad, site, the lander and both rovers' bays clear of buildings", () => {
    for (const p of PADS) expect(hitsCampus(p.x, p.z, FOOTPRINT.reactor + 0.5), `pad ${p.id}`).toBe(false);
    for (const s of SITES) expect(hitsCampus(s.x, s.z, 8), s.id).toBe(false);
    expect(hitsCampus(LANDER.x, LANDER.z, LANDER.r + 2)).toBe(false);
    expect(canOccupy(DOCK.x, DOCK.z, g.modules)).toBe(true);
    expect(canOccupy(SCOUT_HOME.x, SCOUT_HOME.z, g.modules)).toBe(true);
    for (const m of g.modules) {
      const p = modulePos(m);
      if (m.type !== "habitat") expect(hitsCampus(p.x, p.z, FOOTPRINT[m.type]), m.type).toBe(false);
    }
  });

  it("stops a rover at a building's wall but lets it into the garage through the vehicle door", () => {
    // Driving north into the HQ from the pad field: blocked well before its wall.
    expect(canOccupy(0, 33, g.modules)).toBe(false);
    expect(canOccupy(5, 28, g.modules)).toBe(true);
    // The garage: open through its big door, walled at the back.
    expect(canOccupy(33, 72, g.modules)).toBe(true);
    expect(canOccupy(33, 66, g.modules)).toBe(true);
    expect(canOccupy(33, 49.5, g.modules)).toBe(false);
  });

  it("lets a suited walker up the porch and into an open outer door, but not through a shut one", () => {
    expect(porchY(OUTER_HATCH.x, OUTER_HATCH.z)).toBe(FLOOR);
    const door = OUTER_DOORS.find((p) => p.id === "eva-outer")!;
    let q = { x: OUTER_HATCH.x, z: OUTER_HATCH.z };
    for (let i = 0; i < 60; i++) q = walkOutside(q, 0, -0.05, g.modules, "mars");
    expect(q.z).toBeLessThan(door.z);
    q = { x: OUTER_HATCH.x, z: OUTER_HATCH.z };
    for (let i = 0; i < 60; i++) q = walkOutside(q, 0, -0.05, g.modules, "mars", null, [doorSlab(door)]);
    expect(q.z).toBeGreaterThanOrEqual(door.z + 0.06 + SUIT.body - 1e-6);
    // Off to one side of the doorway, the wall stops you.
    q = { x: OUTER_HATCH.x + 2, z: OUTER_HATCH.z };
    for (let i = 0; i < 60; i++) q = walkOutside(q, 0, -0.05, g.modules, "mars");
    expect(q.z).toBeGreaterThanOrEqual(63.4 + SUIT.body - 1e-6);
  });

  it("has a porch and a place to stand outside every airlock", () => {
    for (const a of AIRLOCKS) {
      expect(porchY(a.outside.x, a.outside.z), a.id).toBe(FLOOR);
      expect(hitsCampus(a.outside.x, a.outside.z, SUIT.body), a.id).toBe(false);
    }
    // Every solid is a proper rectangle.
    for (const s of campusSolids()) expect(s.x1 > s.x0 && s.z1 > s.z0).toBe(true);
    expect(rectDistance({ x0: 0, z0: 0, x1: 1, z1: 1 }, 2, 0.5).d).toBeCloseTo(1, 6);
  });
});
