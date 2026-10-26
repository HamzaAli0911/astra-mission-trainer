import { describe, expect, it } from "vitest";
import { createState, step } from "../sim/engine";
import { canOccupy } from "../sim/rover";
import { DOCK, SCOUT_HOME } from "../sim/world";
import { migrate, type SavedMission } from "./save";

describe("saves", () => {
  it("brings a save from the first outpost's map into the campus: rovers back in the garage, drives dropped", () => {
    const g = createState("ice-hunters", 4);
    // Where v6 left things: the crew rover out on the old road with a load of ice, the science rover studying.
    Object.assign(g.rover, { x: 0, z: 30, heading: 0.3, speed: 12, docked: false, cargo: { water: 45, materials: 0, science: 0, samples: [] }, task: { site: "ice", left: 0.5 } });
    Object.assign(g.scout!, { x: 6.5, z: 15.5, task: { site: "ray", left: 1 } });
    const old: SavedMission = { v: 1, at: 1, game: g, route: [{ x: 4, z: 40 }], target: "ice", speed: 2, tutorial: null };
    const s = migrate(structuredClone(old));
    expect(s.v).toBe(2);
    expect(s.route).toEqual([]);
    expect(s.target).toBeNull();
    expect(s.game.rover).toMatchObject({ x: DOCK.x, z: DOCK.z, docked: true, speed: 0, task: null });
    expect(s.game.rover.cargo.water).toBe(45);
    expect(s.game.scout).toMatchObject({ x: SCOUT_HOME.x, z: SCOUT_HOME.z, task: null });
    expect(canOccupy(s.game.rover.x, s.game.rover.z, s.game.modules)).toBe(true);
    // It plays on from there (the load is unloaded at the dock).
    const water = s.game.res.water;
    for (let i = 0; i < 20; i++) step(s.game, 0.05);
    expect(s.game.res.water).toBeGreaterThan(water - 5);
    expect(s.game.rover.cargo.water).toBe(0);
    // A current save passes through untouched.
    expect(migrate(s)).toBe(s);
  });
});
