import { describe, expect, it } from "vitest";
import { Runner } from "./harness";
import { starsFor } from "./goals";
import { CAMPAIGN, MISSIONS, mission } from "./missions";
import { MODULES } from "./modules";
import { CARDS } from "./cards";
import { freePad } from "./engine";
import { PADS, padFits } from "./world";

const stars = (r: Runner) => starsFor(r.s, mission(r.s.missionId));
const stormNow = (r: Runner) => r.s.hazards.some((h) => h.kind === "storm" && h.phase === "active");
/** A careful player's reflexes: shelter in storms, repair damage, clean dust. */
function reflexes(r: Runner) {
  const storm = stormNow(r);
  if (storm !== r.s.sheltering && r.s.modules.some((m) => m.type === "shelter" && m.built >= MODULES.shelter.time)) r.do({ type: "shelter", on: storm });
  if (r.s.dust > 0.05 && !r.s.hazards.some((h) => h.phase === "active")) r.do({ type: "clean" });
  for (const m of r.s.modules) if (m.health < 50 && m.repair <= 0 && r.s.res.materials >= 10) r.do({ type: "repair", id: m.id });
}
/** Keep the grow lights bright by day and low at night. */
function lights(r: Runner) {
  const h = r.s.t % 24,
    level = h >= 6 && h < 20 ? 2 : 1;
  for (const gh of r.s.modules.filter((m) => m.type === "greenhouse")) if (gh.light !== level) r.do({ type: "light", id: gh.id, level });
}

describe("mission data", () => {
  it("has six campaign missions in order, each unlocked by the one before", () => {
    expect(CAMPAIGN.map((m) => m.number)).toEqual([1, 2, 3, 4, 5, 6]);
    for (let i = 1; i < CAMPAIGN.length; i++) expect(CAMPAIGN[i].after).toBe(CAMPAIGN[i - 1].id);
  });
  it("only uses pads that fit, cards that exist and modules it offers", () => {
    PADS.forEach((p, i) => expect(p.id).toBe(i));
    for (const m of MISSIONS) {
      for (const pm of m.modules) expect(padFits(pm.type, PADS[pm.pad].kind)).toBe(true);
      expect(new Set(m.modules.map((x) => x.pad)).size).toBe(m.modules.length);
      for (const e of m.script) if ("choice" in e) expect(CARDS[e.choice]).toBeTruthy();
      for (const g of m.goals) if (g.kind === "build") expect(m.build).toContain(g.module);
      for (const c of m.random?.cards ?? []) expect(CARDS[c]).toBeTruthy();
      expect(m.goals.some((g) => g.kind === "survive")).toBe(true);
      expect(m.endT).toBeGreaterThan(m.startT);
    }
  });
});

describe("every mission can be won, and lost", () => {
  it("1 First Light: a careful player earns all three stars", () => {
    const r = new Runner("first-light");
    for (const t of ["solar", "oxygen", "battery", "solar", "battery"] as const) r.do({ type: "build", module: t });
    r.until(55);
    expect(r.errors).toEqual([]);
    expect(r.s.status).toBe("won");
    expect(stars(r)).toBe(3);
  });
  it("1 First Light: doing nothing fails", () => {
    const r = new Runner("first-light").until(55);
    expect(r.s.status).toBe("lost");
  });
  it("2 Ice Hunters: ice runs, regolith for a drill, a recycler", () => {
    const r = new Runner("ice-hunters");
    r.do({ type: "build", module: "recycler" });
    r.trip("ice").trip("regolith");
    r.do({ type: "build", module: "icedrill" });
    r.trip("ice");
    r.do({ type: "build", module: "battery" });
    r.trip("ice").until(81);
    expect(r.errors).toEqual([]);
    expect(r.s.status).toBe("won");
    expect(r.s.stats.trips.ice).toBe(3);
  });
  it("2 Ice Hunters: one trip is not enough water", () => {
    const r = new Runner("ice-hunters");
    r.do({ type: "build", module: "recycler" });
    r.trip("ice").until(81);
    expect(r.s.status).toBe("lost");
  });
  it("3 Green Thumb: two greenhouses, dimmed at night, plus power to run them", () => {
    const r = new Runner("green-thumb");
    r.choices.supply = 1;
    for (const t of ["greenhouse", "greenhouse", "battery"] as const) r.do({ type: "build", module: t });
    let solar = false;
    while (r.s.status === "playing") {
      if (!solar && r.s.res.materials >= 20) solar = r.do({ type: "build", module: "solar" });
      lights(r);
      r.tick(1);
    }
    expect(r.s.status).toBe("won");
    expect(r.s.stats.brownout).toBe(0);
  });
  it("4 Solar Storm: get home, shelter during storms, two samples", () => {
    const r = new Runner("solar-storm");
    r.collect("layers").drive("dock");
    r.do({ type: "build", module: "shelter" });
    let second = false;
    while (r.s.status === "playing") {
      reflexes(r);
      if (!second && r.s.t > 25 && r.s.rover.docked) {
        second = true;
        r.trip("boulder");
      }
      r.tick(0.25);
    }
    expect(r.errors).toEqual([]);
    expect(r.s.status).toBe("won");
    expect(r.s.stats.maxDose).toBeLessThan(30);
  });
  it("4 Solar Storm: no protection fails", () => {
    const r = new Runner("solar-storm").drive("dock").until(91);
    expect(r.s.status).toBe("lost");
    expect(r.s.endReason).toMatch(/radiation/);
  });
  it("5 Red Planet: MOXIE, a reactor and a greenhouse earn all three stars", () => {
    const r = new Runner("red-planet");
    for (const t of ["oxygen", "reactor", "greenhouse"] as const) r.do({ type: "build", module: t });
    while (r.s.status === "playing") {
      reflexes(r);
      r.tick(0.5);
    }
    expect(r.s.status).toBe("won");
    expect(stars(r)).toBe(3);
  });
  it("6 Mars Colony: a full build survives the random events", () => {
    for (const seed of [42, 2026, 7]) {
      const r = new Runner("mars-colony", seed);
      r.reflex = reflexes;
      for (const t of ["reactor", "recycler", "greenhouse", "shelter"] as const) r.do({ type: "build", module: t });
      r.trip("regolith");
      r.do({ type: "build", module: "icedrill" });
      r.trip("regolith");
      r.do({ type: "build", module: "greenhouse" });
      r.trip("regolith");
      r.do({ type: "build", module: "lab" });
      r.trip("layers");
      while (r.s.status === "playing") {
        reflexes(r);
        lights(r);
        // Broken and short of materials: fetch regolith for the repair.
        if (r.s.modules.some((m) => m.health < 50 && m.repair <= 0) && r.s.res.materials < 10) r.trip("regolith");
        if (r.s.res.materials >= 20 && freePad(r.s, "lab") && !r.s.modules.some((m) => m.type === "lab")) r.do({ type: "build", module: "lab" });
        r.tick(0.5);
      }
      expect(r.s.status, `${seed}: ${r.s.endReason}`).toBe("won");
    }
  });
});
