import { describe, expect, it } from "vitest";
import { createState } from "./engine";
import { crewSpots, dayPhase, interiorState } from "./interior";
import { STORAGE } from "./modules";
import type { GameState } from "./types";

/** A fresh Mars outpost at mid-morning with full stores, a charged battery and the lights on. */
function home(): GameState {
  const g = createState("free-mars", 11);
  g.t = 11;
  g.res.power = 15;
  return g;
}

describe("what the inside of the home shows", () => {
  it("is calm when all is well: lights on, fans running, every screen on, no alarm", () => {
    const s = interiorState(home());
    expect(s.lights).toBe("normal");
    expect(s.phase).toBe("day");
    expect(s.screens).toBe("all");
    expect(s.fans).toBe(1);
    expect(s.alarm).toBeNull();
    expect(s.brightness).toBe(1);
  });

  it("follows the clock: cool mornings, neutral days, warm evenings, dim nights with path lights", () => {
    expect([6, 12, 19, 23, 3].map(dayPhase)).toEqual(["morning", "day", "evening", "night", "night"]);
    const g = home();
    g.t = 7;
    const morning = interiorState(g);
    g.t = 19;
    const evening = interiorState(g);
    g.t = 23.5;
    const night = interiorState(g);
    expect(morning.color[2]).toBeGreaterThan(morning.color[0] - 0.2);
    expect(evening.color[2]).toBeLessThan(evening.color[0] - 0.3);
    expect(night.brightness).toBeLessThan(0.5);
    expect(night.pathLights).toBe(true);
    expect(morning.pathLights).toBe(false);
  });

  it("dims to amber when the battery runs low", () => {
    const g = home();
    g.res.power = 0.1 * 20;
    const s = interiorState(g);
    expect(s.batteryLow).toBe(true);
    expect(s.lights).toBe("dim");
    expect(s.color[2]).toBeLessThan(0.5);
  });

  it("goes to emergency red, essential screens only and slow fans when the power can't keep up", () => {
    const g = home();
    g.t = 23;
    g.res.power = 0;
    for (const m of g.modules) if (m.type === "solar") m.on = false;
    const s = interiorState(g);
    expect(s.lights).toBe("emergency");
    expect(s.screens).toBe("essential");
    expect(s.fans).toBeLessThan(0.5);
    expect(s.pathLights).toBe(true);
    expect(s.alarm).toBe("power");
  });

  it("raises the oxygen alarm when there's less than a day of oxygen", () => {
    const g = home();
    g.res.o2 = 1;
    const s = interiorState(g);
    expect(s.o2Low).toBe(true);
    expect(s.alarm).toBe("o2");
  });

  it("shows rationing when water is low, bare shelves when food is low", () => {
    const g = home();
    g.res.water = 10;
    g.res.food = 5;
    const s = interiorState(g);
    expect(s.waterLow).toBe(true);
    expect(s.foodLow).toBe(true);
    expect(s.foodFill).toBeCloseTo(5 / STORAGE.food);
    expect(s.waterFill).toBeCloseTo(10 / STORAGE.water);
  });

  it("marks the equipment of a damaged module as faulty", () => {
    const g = home();
    g.modules.push({ id: 90, type: "recycler", pad: 4, built: 99, on: true, light: 0, health: 30, repair: 0 });
    const s = interiorState(g);
    expect(s.faults.recycler).toBe(true);
    expect(s.faults.oxygen).toBeUndefined();
  });

  it("sounds the storm alarm and opens the shelter when a storm is warned, quiet once the crew is in", () => {
    const g = home();
    g.hazards.push({ id: 991, kind: "storm", warnAt: 10, startAt: 12, endAt: 20, strength: 1, phase: "warned" });
    const warned = interiorState(g);
    expect(warned.storm).toBe("warned");
    expect(warned.alarm).toBe("storm");
    expect(warned.shelterOpen).toBe(true);
    g.hazards[g.hazards.length - 1].phase = "active";
    g.sheltering = true;
    const inside = interiorState(g);
    expect(inside.storm).toBe("active");
    expect(inside.sheltering).toBe(true);
    expect(inside.alarm).toBeNull();
  });

  it("knows about a Martian dust storm", () => {
    const g = home();
    g.hazards.push({ id: 992, kind: "dust", warnAt: 10, startAt: 11, endAt: 30, strength: 0.4, phase: "active" });
    expect(interiorState(g).dust).toBe(true);
  });

  it("grows the food wall with a working, lit greenhouse", () => {
    const g = home();
    const bare = interiorState(g).plants;
    g.modules.push({ id: 91, type: "greenhouse", pad: 6, built: 99, on: true, light: 2, health: 100, repair: 0 });
    expect(interiorState(g).plants).toBeGreaterThan(bare);
  });
});

describe("the crew's day in the home", () => {
  const at = (g: GameState) => Object.fromEntries(crewSpots(g).map((c) => [c.id, c.spot]));
  it("eats together, works at their stations, takes turns exercising, and sleeps in their quarters", () => {
    const g = home();
    g.t = 24 + 7.5;
    expect(Object.values(at(g)).every((s) => s?.startsWith("galley"))).toBe(true);
    g.t = 24 + 10;
    expect(at(g)).toEqual({ maya: "command", alex: "eclss", sam: "garden", noor: "lab" });
    g.t = 24 + 23;
    expect(Object.values(at(g)).every((s) => s === "bed")).toBe(true);
    const exercising = new Set<string>();
    for (let t = 13; t < 17; t += 0.5) {
      g.t = 24 + t;
      for (const [id, s] of Object.entries(at(g))) if (s === "treadmill" || s === "cycle") exercising.add(id);
    }
    expect(exercising.size).toBe(4);
  });
  it("shelters in the core in a storm, and isn't home while out in the rover or on foot outside", () => {
    const g = home();
    g.t = 10;
    g.sheltering = true;
    for (const c of g.crew) c.place = "shelter";
    expect(Object.values(at(g)).every((s) => s?.startsWith("shelter"))).toBe(true);
    g.sheltering = false;
    g.crew[0].place = "rover";
    g.crew[1].place = "eva";
    expect(at(g).maya).toBeNull();
    expect(at(g).alex).toBeNull();
  });
});
