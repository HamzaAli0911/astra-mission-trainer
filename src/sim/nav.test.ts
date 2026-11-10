import { describe, expect, it } from "vitest";
import { cellAt, furnitureById } from "./base";
import { BLOCKS, lineClear, polar, type Floor } from "./home";
import { navPath, pathLength, standable, STAIRS } from "./nav";

const at = (id: string, out = 0.6) => {
  const f = furnitureById(id)!;
  const r = f.rect;
  const x = (r.x0 + r.x1) / 2,
    z = (r.z0 + r.z1) / 2;
  const d = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] }[f.face];
  const half = d[0] ? (r.x1 - r.x0) / 2 : (r.z1 - r.z0) / 2;
  return { x: x + d[0] * (half + out), z: z + d[1] * (half + out) };
};
const block = (id: string) => {
  const k = BLOCKS.find((b) => b.id === id)!;
  return { ...polar(k.bearing, k.r), floor: k.level as Floor };
};
/** Every straight leg on a floor is clear of walls (doors open), so a walker following it never goes through one. */
function legsClear(p: { x: number; z: number; where: unknown }[]) {
  for (let i = 1; i < p.length; i++) {
    const a = p[i - 1],
      b = p[i];
    if (a.where !== b.where || typeof a.where !== "number") continue;
    if (!lineClear(a.where as Floor, a, b, () => true)) return `${JSON.stringify(a)} → ${JSON.stringify(b)}`;
  }
  return null;
}

describe("finding a way on foot", () => {
  it("walks from Hab-1's galley up to the flight director's desk on the HQ mezzanine", () => {
    const from = block("galley-table");
    const to = { ...at("hq-fd-chair-2", -0.9), floor: 2 as Floor };
    const t = performance.now();
    const p = navPath(from, to, 0);
    const ms = performance.now() - t;
    expect(p, "a way exists").toBeTruthy();
    expect(p!.some((q) => q.where === "hq-stair")).toBe(true);
    expect(legsClear(p!)).toBeNull();
    expect(pathLength(p!)).toBeGreaterThan(45);
    expect(pathLength(p!)).toBeLessThan(110);
    expect(ms).toBeLessThan(1500);
  });
  it("reaches the west wing only when it's built", () => {
    const from = { x: 0, z: 30, floor: 0 as Floor };
    const gh = { ...at("gh-rack-4", 0.5), floor: 0 as Floor };
    expect(navPath(from, gh, 0)).toBeNull();
    const p = navPath(from, gh, 1);
    expect(p).toBeTruthy();
    expect(legsClear(p!)).toBeNull();
    expect(cellAt(p![p!.length - 1].x, p![p!.length - 1].z, 0)?.id).toBe("gh-hall");
  });
  it("goes from a bunk upstairs in Hab-1 to the science lab, down Hab-1's stair", () => {
    const from = block("q3-bunk");
    const p = navPath(from, { ...at("sci-rocks"), floor: 0 }, 2);
    expect(p).toBeTruthy();
    expect(p!.some((q) => q.where === "stair")).toBe(true);
    expect(legsClear(p!)).toBeNull();
  });
  it("crosses the whole campus, logistics to the power desk, in one go", () => {
    const t = performance.now();
    const p = navPath({ ...at("lo-shelves-1"), floor: 0 }, { ...at("en-power-desk"), floor: 0 }, 2);
    expect(p).toBeTruthy();
    expect(legsClear(p!)).toBeNull();
    expect(pathLength(p!)).toBeGreaterThan(180);
    expect(performance.now() - t).toBeLessThan(2500);
  });
  it("keeps the stairs' ends on the floors they join", () => {
    for (const s of STAIRS) {
      expect(standable(s.low, 2, s.foot.x, s.foot.z), `${s.where} foot`).toBe(true);
      expect(standable(s.high, 2, s.head.x, s.head.z), `${s.where} head`).toBe(true);
    }
  });
  it("won't walk the crew through an airlock to the surface", () => {
    const p = navPath({ x: 60, z: 52, floor: 0 }, { x: 66, z: 66, floor: 0 }, 2);
    expect(p).toBeNull();
  });
});
