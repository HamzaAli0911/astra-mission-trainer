import { describe, expect, it } from "vitest";
import { act, advance, createState, step } from "./engine";
import { capacity, DOSE_LIMIT, flows, isBuilt } from "./core";
import { MODULES, RATES } from "./modules";
import { daylight, sunlight } from "./planets";
import type { GameState, ModuleType } from "./types";
import { PADS } from "./world";
import { mission } from "./missions";
import { advanceAnswering } from "./harness";

/** A finished module on the first free pad that fits. */
function add(s: GameState, type: ModuleType) {
  const r = act(s, { type: "build", module: type });
  expect(r.ok, r.message).toBe(true);
  const m = r.state.modules[r.state.modules.length - 1];
  m.built = MODULES[type].time;
  return r.state;
}
const at = (s: GameState, t: number) => ({ ...structuredClone(s), t });

describe("setup", () => {
  it("creates a mission with a habitat, four crew and the docked rover", () => {
    const s = createState("first-light");
    expect(s.modules.map((m) => m.type)).toEqual(["habitat"]);
    expect(s.crew).toHaveLength(4);
    expect(s.rover.docked).toBe(true);
    expect(s.status).toBe("playing");
    expect(s.history).toHaveLength(1);
  });
  it("places prebuilt modules on their pads, finished", () => {
    const s = createState("solar-storm");
    expect(s.modules.filter((m) => m.type === "solar")).toHaveLength(3);
    expect(s.modules.every(isBuilt)).toBe(true);
    expect(s.rover.docked).toBe(false);
  });
  it("is deterministic for a given seed", () => {
    const a = advance(createState("mars-colony", 99), 40),
      b = advance(createState("mars-colony", 99), 40);
    expect(a).toEqual(b);
  });
});

describe("power", () => {
  it("solar arrays only work in daylight, and Mars gets about 43% of the Moon's sunlight", () => {
    let moon = add(createState("free-moon"), "solar");
    let mars = add(createState("free-mars"), "solar");
    expect(flows(at(moon, 12)).gen).toBeCloseTo(RATES.solarKw, 5);
    expect(flows(at(moon, 23)).gen).toBe(0);
    const ratio = flows(at(mars, 12)).gen / flows(at(moon, 12)).gen;
    expect(ratio).toBeCloseTo(0.43, 2);
    moon = at(moon, 2);
    mars = at(mars, 2);
    expect(daylight("moon", 2)).toBe(0);
    expect(sunlight("mars", 2)).toBe(0);
  });
  it("the habitat needs more power at night for its heaters", () => {
    const s = createState("free-moon");
    const day = flows(at(s, 12)).demand,
      night = flows(at(s, 1)).demand;
    expect(night).toBeGreaterThan(day);
  });
  it("batteries add storage; stored power never exceeds capacity", () => {
    let s = createState("free-moon");
    expect(capacity(s).power).toBe(RATES.habitatKwh);
    s = add(s, "battery");
    expect(capacity(s).power).toBe(RATES.habitatKwh + RATES.batteryKwh);
    s = add(add(s, "solar"), "solar");
    s = advance(at(s, 8), 10);
    expect(s.res.power).toBeLessThanOrEqual(capacity(s).power + 1e-9);
  });
  it("when power runs short, life support is powered before the lab", () => {
    let s = createState("free-moon");
    s = add(add(s, "oxygen"), "lab");
    s.res.power = 0;
    s = at(s, 1); // night: no solar
    const f = flows(s);
    const oxygen = s.modules.find((m) => m.type === "oxygen")!,
      lab = s.modules.find((m) => m.type === "lab")!,
      hab = s.modules.find((m) => m.type === "habitat")!;
    expect(f.short.power).toBe(true);
    expect(f.ratio[hab.id]).toBe(0);
    expect(f.ratio[oxygen.id]).toBe(0);
    expect(f.ratio[lab.id]).toBe(0);
    s.res.power = 0.15; // enough for one step of the habitat only
    const g = flows(s);
    expect(g.ratio[hab.id]).toBeGreaterThan(0);
    expect(g.ratio[lab.id]).toBe(0);
  });
  it("switching a machine off removes its demand", () => {
    let s = add(createState("free-moon"), "lab");
    const lab = s.modules.find((m) => m.type === "lab")!;
    const before = flows(s).demand;
    s = act(s, { type: "toggle", id: lab.id }).state;
    expect(flows(s).demand).toBeCloseTo(before - RATES.labKw, 5);
  });
});

describe("life support", () => {
  it("the oxygen maker splits water on the Moon but not on Mars", () => {
    const moon = add(createState("free-moon"), "oxygen");
    const mars = add(createState("free-mars"), "oxygen");
    const fm = flows(moon),
      fr = flows(mars);
    expect(fm.o2.made).toBeCloseTo(RATES.oxygenKgPerHour, 5);
    expect(fm.water.used).toBeGreaterThan(fr.water.used);
    expect(fr.o2.made).toBeCloseTo(RATES.oxygenKgPerHour, 5);
  });
  it("without water the oxygen maker stops", () => {
    let s = add(createState("free-moon"), "oxygen");
    s.res.water = 0;
    const f = flows(s);
    expect(f.o2.made).toBe(0);
    expect(f.short.water).toBe(true);
  });
  it("four crew breathe 3.36 kg of oxygen, drink 12 L and eat 12 meals a day", () => {
    const f = flows(createState("free-moon"));
    expect(f.o2.used * 24).toBeCloseTo(3.36, 5);
    expect(f.water.used * 24).toBeCloseTo(12, 5);
    expect(f.food.used * 24).toBeCloseTo(12, 5);
  });
  it("the recycler gives back 85% of the crew's water", () => {
    const s = add(createState("free-moon"), "recycler");
    const f = flows(s);
    expect(f.water.made).toBeCloseTo(0.5 * 0.85, 5);
  });
  it("greenhouse lights trade power for food", () => {
    let s = add(createState("free-moon"), "greenhouse");
    s = at(s, 12);
    const gh = s.modules.find((m) => m.type === "greenhouse")!;
    const high = flows(s);
    s = act(s, { type: "light", id: gh.id, level: 1 }).state;
    const low = flows(s);
    expect(high.demand - low.demand).toBeCloseTo(RATES.greenhouseKw[2] - RATES.greenhouseKw[1], 5);
    expect(high.food.made).toBeGreaterThan(low.food.made);
  });
  it("running out of oxygen hurts the crew and can end the mission", () => {
    const s = createState("free-moon");
    s.res.o2 = 0;
    const end = advance(s, 8);
    expect(end.status).toBe("lost");
    expect(end.endReason).toMatch(/health reached zero/);
  });
});

describe("radiation", () => {
  const storm = (s: GameState) => {
    s.hazards.push({ id: 9, kind: "storm", warnAt: s.t, startAt: s.t + 0.05, endAt: s.t + 4, strength: 15, phase: "pending" });
    return s;
  };
  it("a storm in the unshielded habitat is far worse than in the shelter", () => {
    const open = advance(storm(createState("free-moon")), 4.2);
    let sheltered = add(createState("free-moon"), "shelter");
    sheltered = act(sheltered, { type: "shelter", on: true }).state;
    sheltered = advance(storm(sheltered), 4.2);
    const max = (s: GameState) => Math.max(...s.crew.map((c) => c.dose));
    expect(max(open)).toBeGreaterThan(30);
    expect(max(sheltered)).toBeLessThan(7);
  });
  it("regolith shielding blocks more than the bare habitat", () => {
    const bare = advance(storm(createState("free-moon")), 4.2);
    const shielded = createState("free-moon");
    shielded.shield = 99;
    shielded.shieldStarted = true;
    const done = advance(storm(shielded), 4.2);
    expect(done.crew[1].dose).toBeLessThan(bare.crew[1].dose * 0.5);
  });
  it("a crew member over the dose limit ends the mission", () => {
    const s = createState("free-moon");
    s.crew[0].dose = DOSE_LIMIT - 0.01;
    step(s, 0.5);
    expect(s.status).toBe("lost");
    expect(s.endReason).toMatch(/flight surgeon/);
  });
  it("sheltering pauses construction and the lab", () => {
    let s = add(createState("free-moon"), "shelter");
    s = add(s, "lab");
    s = act(s, { type: "build", module: "solar" }).state;
    s = act(s, { type: "shelter", on: true }).state;
    const solar = () => s.modules.find((m) => m.type === "solar")!;
    const before = solar().built;
    s = advance(at(s, 12), 2);
    expect(solar().built).toBe(before);
    expect(flows(s).science).toBe(0);
  });
});

describe("actions", () => {
  it("building costs materials and needs a fitting pad", () => {
    const s = createState("free-moon");
    const r = act(s, { type: "build", module: "solar" });
    expect(r.ok).toBe(true);
    expect(r.state.res.materials).toBe(s.res.materials - MODULES.solar.cost);
    expect(act(s, { type: "build", module: "icedrill", pad: 0 }).message).toMatch(/ice pad/);
    expect(act(s, { type: "build", module: "reactor", pad: 0 }).message).toMatch(/far pad/);
    const ice = PADS.find((p) => p.kind === "ice")!;
    expect(act(s, { type: "build", module: "icedrill" }).state.modules.at(-1)!.pad).toBe(ice.id);
  });
  it("refuses what the mission does not offer or you cannot afford", () => {
    const s = createState("first-light");
    expect(act(s, { type: "build", module: "greenhouse" }).ok).toBe(false);
    const poor = { ...s, res: { ...s.res, materials: 5 } };
    expect(act(poor, { type: "build", module: "solar" }).message).toMatch(/Not enough materials/);
  });
  it("the habitat cannot be switched off or recycled", () => {
    const s = createState("free-moon");
    expect(act(s, { type: "toggle", id: 1 }).ok).toBe(false);
    expect(act(s, { type: "recycle", id: 1 }).ok).toBe(false);
  });
  it("recycling refunds half, cancelling refunds everything", () => {
    let s = add(createState("free-moon"), "solar");
    const built = s.modules.at(-1)!;
    const r = act(s, { type: "recycle", id: built.id });
    expect(r.state.res.materials).toBe(s.res.materials + MODULES.solar.cost / 2);
    s = act(createState("free-moon"), { type: "build", module: "lab" }).state;
    const c = act(s, { type: "cancel", id: s.modules.at(-1)!.id });
    expect(c.state.res.materials).toBe(createState("free-moon").res.materials);
  });
  it("repairs cost materials and take an hour", () => {
    let s = add(createState("free-moon"), "oxygen");
    const ox = s.modules.at(-1)!;
    ox.health = 30;
    expect(flows(s).o2.made).toBe(0);
    s = act(s, { type: "repair", id: ox.id }).state;
    s = advance(s, 1.1);
    expect(s.modules.find((m) => m.id === ox.id)!.health).toBe(100);
  });
  it("sheltering needs a built shelter", () => {
    expect(act(createState("free-moon"), { type: "shelter", on: true }).ok).toBe(false);
  });
  it("collecting needs the rover at the site", () => {
    const s = createState("free-moon");
    expect(act(s, { type: "collect", site: "ice" }).ok).toBe(false);
    const there = structuredClone(s);
    there.rover = { ...there.rover, x: -70, z: -46, docked: false };
    const r = act(there, { type: "collect", site: "ice" });
    expect(r.ok).toBe(true);
    const done = advance(r.state, 1.1);
    expect(done.rover.cargo.water).toBe(45);
  });
  it("cleaning dusty panels is a Mars job", () => {
    const moon = createState("free-moon");
    moon.dust = 0.5;
    expect(act(moon, { type: "clean" }).ok).toBe(false);
    const mars = createState("free-mars");
    mars.dust = 0.6;
    expect(act(mars, { type: "clean" }).state.dust).toBe(0);
  });
  it("decision cards pause time until answered and apply their effects", () => {
    const s = createState("green-thumb");
    const card = advance(s, 34 - s.t + 0.1);
    expect(card.choice?.card).toBe("supply");
    const frozen = advance(card, 5);
    expect(frozen.t).toBe(card.t);
    const r = act(card, { type: "choose", option: 1 });
    expect(r.state.res.materials).toBe(card.res.materials + 45);
    expect(r.state.choice).toBeNull();
  });
});

describe("goals and results", () => {
  it("goals stay complete once reached", () => {
    let s = createState("first-light");
    s = add(add(s, "solar"), "solar");
    step(s, 0.05);
    expect(s.goals).toContain("solar");
    s.modules = s.modules.filter((m) => m.type !== "solar");
    step(s, 0.05);
    expect(s.goals).toContain("solar");
  });
  it("running out of time with goals undone is a loss", () => {
    let s = createState("first-light");
    for (const t of ["solar", "oxygen", "battery"] as const) s = add(s, t);
    s = advanceAnswering(s, 50);
    expect(s.status).toBe("lost");
    expect(s.endReason).toMatch(/Time ran out/);
  });
});

describe("random events", () => {
  it("are seeded, few, spaced out and within the mission", () => {
    for (const seed of [1, 2, 3, 77, 2026]) {
      const s = createState("mars-colony", seed);
      const times = [...s.hazards.map((h) => h.startAt), ...s.script.map((e) => e.at)].sort((a, b) => a - b);
      // A storm, a dust storm, a meteor shower and three decision cards over eight days, at least 16 hours apart
      // (less up to an hour of rounding to the half hour or hour).
      expect(times.length).toBe(6);
      for (let i = 1; i < times.length; i++) expect(times[i] - times[i - 1]).toBeGreaterThan(15);
      expect(times[0]).toBeGreaterThanOrEqual(s.startT + 12);
      expect(times.at(-1)!).toBeLessThanOrEqual(mission("mars-colony").endT - 8);
      expect(createState("mars-colony", seed)).toEqual(s);
    }
  });
});
