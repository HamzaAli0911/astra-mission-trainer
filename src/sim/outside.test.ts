import { describe, expect, it } from "vitest";
import { createState } from "./engine";
import { OUTER_HATCH, SUIT, walkOutside } from "./outside";
import { modulePos } from "./rover";
import { FOOTPRINT, PADS, terrainHeight, WORLD } from "./world";
import type { Module } from "./types";

const stroll = (p: { x: number; z: number }, dx: number, dz: number, modules: Module[], planet: "moon" | "mars" = "mars") => {
  let q = p;
  for (let i = 0; i < 60; i++) q = walkOutside(q, dx / 60, dz / 60, modules, planet);
  return q;
};

describe("walking outside in a suit", () => {
  const g = createState("free-mars", 4);
  const solar: Module = { id: 40, type: "solar", pad: 0, built: 99, on: true, light: 0, health: 100, repair: 0 };
  const modules = [...g.modules, solar];

  it("comes out of the airlock somewhere clear, and can walk away from the home", () => {
    const out = stroll(OUTER_HATCH, 0, 4, modules);
    expect(out.z).toBeGreaterThan(OUTER_HATCH.z + 3.5);
  });

  it("can't walk through the home, its airlock tunnel or a module, but slides round them", () => {
    // Straight at the home from the hatch: stopped by the tunnel and the shell.
    const home = stroll(OUTER_HATCH, 0, -8, modules);
    expect(home.z).toBeGreaterThan(5.8);
    const pad = PADS[0],
      c = modulePos(solar);
    const from = { x: pad.x * 1.6, z: pad.z * 1.6 };
    const into = stroll(from, c.x - from.x, c.z - from.z, modules);
    expect(Math.hypot(into.x - c.x, into.z - c.z)).toBeGreaterThanOrEqual(FOOTPRINT.solar + SUIT.body - 1e-6);
  });

  it("can't climb a slope steeper than 25 degrees", () => {
    // Find a steep spot on the map: a step uphill there goes nowhere.
    let found = false;
    for (let x = -WORLD + 5; x < WORLD - 5 && !found; x += 1.5)
      for (let z = -WORLD + 5; z < WORLD - 5 && !found; z += 1.5) {
        const up = (terrainHeight(x + 0.1, z, "mars") - terrainHeight(x, z, "mars")) / 0.1;
        if (up > SUIT.maxSlope * 1.6) {
          const p = walkOutside({ x, z }, 0.1, 0, [], "mars");
          expect(p.x).toBeCloseTo(x, 6);
          found = true;
        }
      }
    expect(found).toBe(true);
  });

  it("stays on the map", () => {
    const p = stroll({ x: WORLD - 2, z: 0 }, 10, 0, []);
    expect(p.x).toBeLessThanOrEqual(WORLD);
  });
});
