import { describe, expect, it } from "vitest";
import { createState, updateDock } from "./engine";
import { approachPoint, canOccupy, clearLine, drive, followRoute, forwardOf, planRoute, ROVER, STOP, tripCost } from "./rover";
import type { Rover } from "./types";
import { DOCK, HABITAT_RADIUS, rocksNear, ROCKS, SITES, SITE_REACH } from "./world";

const fwd = { ...STOP, forward: true };
const rover = (x = 0, z = 30, heading = 0): Rover => ({ ...createState("free-moon").rover, x, z, heading, docked: false });

describe("driving", () => {
  it("drives forward along its heading (0 faces north, −z)", () => {
    const out = drive(rover(0, 30, 0), fwd, 0.5, [], "moon");
    expect(out.z).toBeLessThan(30);
    expect(Math.abs(out.x)).toBeLessThan(0.01);
    const f = forwardOf(Math.PI / 2);
    expect(f.x).toBeCloseTo(-1);
  });
  it("tops out at the rover's maximum speed", () => {
    const out = drive(rover(), fwd, 1, [], "moon");
    expect(out.speed).toBeCloseTo(ROVER.maxSpeed, 0);
  });
  it("drains the battery with distance, faster in the dark crater", () => {
    const open = drive(rover(0, 30, 0), fwd, 0.3, [], "moon");
    const crater = drive(rover(-66, -48, Math.PI / 2), fwd, 0.3, [], "moon");
    const used = (r: Rover) => 100 - r.battery;
    expect(used(open)).toBeGreaterThan(0);
    expect(used(crater) / used(open)).toBeGreaterThan(2);
  });
  it("drives over rocks, but not big boulders", () => {
    // Head straight at a rock from 6 m away (on open ground, with nothing else solid on the way).
    const clearRun = (k: { x: number; z: number }) =>
      [0, 1, 2, 3, 4, 5, 6, 7, 8].every((d) => rocksNear(k.x, k.z + 6 - d).every((o) => o === k || Math.hypot(o.x - k.x, o.z - (k.z + 6 - d)) > o.r + 3));
    const rock = ROCKS.find((k) => !k.solid && k.r > 0.9 && Math.abs(k.x) < 120 && Math.abs(k.z) < 110 && clearRun(k))!;
    const boulder = ROCKS.find((k) => k.solid && k.r > 1.5 && Math.abs(k.x) < 120 && Math.abs(k.z) < 110 && clearRun(k))!;
    expect(rock && boulder).toBeTruthy();
    const over = (k: { x: number; z: number }) => {
      let r = rover(k.x, k.z + 6, 0);
      for (let i = 0; i < 60; i++) r = drive(r, fwd, 0.02, [], "mars");
      return r;
    };
    expect(over(rock).z).toBeLessThan(rock.z - 2);
    expect(over(boulder).z).toBeGreaterThan(boulder.z + boulder.r * 0.85);
  });
  it("cannot drive through the habitat", () => {
    const s = createState("free-moon");
    let r = rover(0, 8, 0);
    for (let i = 0; i < 40; i++) r = drive(r, fwd, 0.05, s.modules, "moon");
    expect(Math.hypot(r.x, r.z)).toBeGreaterThan(HABITAT_RADIUS + ROVER.radius - 0.01);
  });
  it("crawls with a flat battery", () => {
    const out = drive({ ...rover(), battery: 0 }, fwd, 1, [], "moon");
    expect(out.speed).toBeLessThanOrEqual(ROVER.crawl + 1e-6);
  });
  it("docks only when it stops on the pad", () => {
    const s = createState("free-moon");
    s.rover = { ...s.rover, x: DOCK.x, z: DOCK.z, speed: 15, docked: false };
    updateDock(s);
    expect(s.rover.docked).toBe(false);
    s.rover.speed = 0;
    updateDock(s);
    expect(s.rover.docked).toBe(true);
  });
});

describe("autopilot", () => {
  const s = createState("mars-colony", 3);
  it("finds a collision-free route from the dock to every site, and back", () => {
    for (const site of SITES) {
      const goal = approachPoint(s.rover, site, s.modules, 2.2)!;
      expect(goal, site.id).toBeTruthy();
      expect(Math.hypot(goal.x - site.x, goal.z - site.z)).toBeLessThanOrEqual(SITE_REACH);
      const route = planRoute(s.rover, goal, s.modules);
      expect(route.length, site.id).toBeGreaterThan(0);
      let from = { x: s.rover.x, z: s.rover.z };
      for (const p of route) {
        expect(clearLine(from, p, s.modules), site.id).toBe(true);
        from = p;
      }
      expect(planRoute(goal, DOCK, s.modules).length).toBeGreaterThan(0);
    }
  });
  it("actually arrives when following a route", () => {
    const site = SITES.find((x) => x.id === "regolith")!;
    const goal = approachPoint(s.rover, site, s.modules, 2.2)!;
    let route = planRoute(s.rover, goal, s.modules),
      r = s.rover;
    for (let i = 0; i < 400 && route.length; i++) ({ rover: r, route } = followRoute(r, route, 0.05, s.modules, "mars"));
    expect(route).toEqual([]);
    expect(Math.hypot(r.x - site.x, r.z - site.z)).toBeLessThanOrEqual(SITE_REACH);
  });
  it("estimates trip cost including the cold crater", () => {
    const ice = SITES[0];
    const goal = approachPoint(s.rover, ice, s.modules, 2.2)!;
    const route = planRoute(s.rover, goal, s.modules);
    expect(tripCost(s.rover, route, "moon")).toBeGreaterThan(10);
  });
  it("refuses a blocked destination", () => {
    expect(canOccupy(0, 0, s.modules)).toBe(false);
    expect(planRoute(s.rover, { x: 0, z: 0 }, s.modules)).toEqual([]);
  });
});
