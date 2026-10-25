import { describe, expect, it } from "vitest";
import { SIM_STEP } from "./core";
import { act, createState, step } from "./engine";
import { canOccupy, drive, followRoute, planRoute, ROVER, SCOUT_ROVER } from "./rover";
import type { GameState } from "./types";
import { SCOUT_HOME, site, SITES } from "./world";

const run = (s: GameState, hours: number) => {
  for (let i = 0; i < Math.round(hours / SIM_STEP); i++) step(s, SIM_STEP);
  return s;
};
const FORWARD = { forward: true, back: false, left: false, right: false };
/** A fresh Mars outpost with the science rover parked at a science site. */
const atSite = (id = "layers") => {
  const s = createState("free-mars", 9);
  const w = site(id)!;
  Object.assign(s.scout!, { x: w.x + 2, z: w.z + 2 });
  return s;
};

describe("the science rover", () => {
  it("starts every mission parked by the dock, clear of everything, on nuclear power", () => {
    for (const id of ["first-light", "red-planet", "free-moon", "mars-colony"]) {
      const s = createState(id, 3);
      expect(s.scout).toBeTruthy();
      expect(s.scout!.rtg).toBe(true);
      expect(canOccupy(SCOUT_HOME.x, SCOUT_HOME.z, s.modules)).toBe(true);
      expect(Math.hypot(s.scout!.x - s.rover.x, s.scout!.z - s.rover.z)).toBeGreaterThan(SCOUT_ROVER.gap + 2);
    }
  });

  it("drives slower than the crew rover and never runs its battery down", () => {
    const s = createState("free-mars", 3);
    let sc = { ...s.scout!, heading: Math.PI };
    for (let i = 0; i < 40; i++) sc = drive(sc, FORWARD, 0.05, s.modules, s.planet);
    expect(sc.speed).toBeCloseTo(SCOUT_ROVER.top, 0);
    expect(sc.speed).toBeLessThan(ROVER.maxSpeed);
    expect(sc.battery).toBe(100);
    expect(Math.hypot(sc.x - SCOUT_HOME.x, sc.z - SCOUT_HOME.z)).toBeGreaterThan(20);
  });

  it("can't drive through the crew rover, and the autopilot gets it to a site", () => {
    const s = createState("free-mars", 3);
    // The crew rover parked right in front of it.
    const block = { x: SCOUT_HOME.x, z: SCOUT_HOME.z + 4, r: SCOUT_ROVER.gap };
    let sc = { ...s.scout!, heading: Math.PI };
    for (let i = 0; i < 40; i++) sc = drive(sc, FORWARD, 0.05, s.modules, s.planet, block);
    expect(Math.hypot(sc.x - block.x, sc.z - block.z)).toBeGreaterThanOrEqual(SCOUT_ROVER.gap - 1e-6);
    const w = site("boulder")!;
    let route = planRoute(s.scout!, { x: w.x - 3, z: w.z }, s.modules);
    expect(route.length).toBeGreaterThan(0);
    let at = s.scout!;
    for (let i = 0; i < 400 && route.length; i++) ({ rover: at, route } = followRoute(at, route, 0.05, s.modules, s.planet));
    expect(Math.hypot(at.x - w.x, at.z - w.z)).toBeLessThan(5);
  });

  it("studies a science site for a while, then radios the data home", () => {
    let s = atSite();
    const science = s.res.science;
    const r = act(s, { type: "study" });
    expect(r.ok).toBe(true);
    s = r.state;
    expect(s.scout!.task?.left).toBe(SCOUT_ROVER.study);
    run(s, SCOUT_ROVER.study - 0.2);
    expect(s.res.science).toBe(science);
    run(s, 0.3);
    expect(s.res.science).toBe(science + SCOUT_ROVER.science);
    expect(s.scout!.studied).toContain("layers");
    expect(s.feed.at(-1)?.text).toMatch(/radioed home/);
  });

  it("keeps working in a solar storm (no crew to protect), but studies each site only once", () => {
    let s = atSite("ray");
    s.hazards.push({ id: 99, kind: "storm", warnAt: s.t - 2, startAt: s.t - 1, endAt: s.t + 6, strength: 12, phase: "active" });
    s = act(s, { type: "study" }).state;
    run(s, SCOUT_ROVER.study + 0.1);
    expect(s.scout!.studied).toContain("ray");
    const again = act(s, { type: "study" });
    expect(again.ok).toBe(false);
    expect(again.message).toMatch(/already studied/);
  });

  it("refuses away from sites and at ice or regolith (it has no cargo bay), and stops if it drives off", () => {
    const home = createState("free-mars", 9);
    expect(act(home, { type: "study" }).ok).toBe(false);
    const ice = SITES.find((w) => w.kind === "ice")!;
    const s = createState("free-mars", 9);
    Object.assign(s.scout!, { x: ice.x + 1, z: ice.z + 1 });
    expect(act(s, { type: "study" }).message).toMatch(/no cargo bay/);
    let t = act(atSite(), { type: "study" }).state;
    Object.assign(t.scout!, { x: t.scout!.x + 20 });
    t = run(t, 0.2);
    expect(t.scout!.task).toBeNull();
  });

  it("changes nothing for saves from before it existed", () => {
    const s = createState("free-mars", 9);
    delete s.scout;
    expect(() => run(s, 2)).not.toThrow();
    expect(act(s, { type: "study" }).ok).toBe(false);
  });
});
