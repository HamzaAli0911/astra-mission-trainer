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

describe("mission data", () => {
  it("has six campaign missions in order, each unlocked by the one before", () => {
    expect(CAMPAIGN.map((m) => m.number)).toEqual([1, 2, 3, 4, 5, 6]);
    for (let i = 1; i < CAMPAIGN.length; i++) expect(CAMPAIGN[i].after).toBe(CAMPAIGN[i - 1].id);
  });
  it("only uses pads that fit, cards that exist and modules it offers", () => {
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
    for (const t of ["solar", "oxygen", "battery", "solar"] as const) r.do({ type: "build", module: t });
    r.until(31);
    expect(r.errors).toEqual([]);
    expect(r.s.status).toBe("won");
    expect(stars(r)).toBe(3);
  });
  it("1 First Light: doing nothing fails", () => {
    const r = new Runner("first-light").until(31);
    expect(r.s.status).toBe("lost");
  });
  it("2 Ice Hunters: three ice runs and a recycler", () => {
    const r = new Runner("ice-hunters");
    r.do({ type: "build", module: "recycler" });
    for (let i = 0; i < 3; i++) r.drive("ice").collect("ice").drive("dock").charge(80);
    r.until(57);
    expect(r.errors).toEqual([]);
    expect(r.s.status).toBe("won");
    expect(r.s.stats.trips.ice).toBe(3);
  });
  it("2 Ice Hunters: one trip is not enough water", () => {
    const r = new Runner("ice-hunters");
    r.do({ type: "build", module: "recycler" });
    r.drive("ice").collect("ice").drive("dock").until(57);
    expect(r.s.status).toBe("lost");
  });
  it("3 Green Thumb: one greenhouse, dimmed at night", () => {
    const r = new Runner("green-thumb");
    r.do({ type: "build", module: "greenhouse" });
    r.do({ type: "build", module: "battery" });
    while (r.s.status === "playing") {
      const gh = r.s.modules.find((m) => m.type === "greenhouse")!;
      const h = r.s.t % 24;
      r.do({ type: "light", id: gh.id, level: h >= 6 && h < 20 ? 2 : 1 });
      r.tick(1);
    }
    expect(r.s.status).toBe("won");
    expect(stars(r)).toBeGreaterThanOrEqual(2);
  });
  it("4 Solar Storm: get home, shelter during storms", () => {
    const r = new Runner("solar-storm");
    r.collect("layers").drive("dock");
    r.do({ type: "build", module: "shelter" });
    while (r.s.status === "playing") {
      reflexes(r);
      r.tick(0.25);
    }
    expect(r.errors).toEqual([]);
    expect(r.s.status).toBe("won");
    expect(r.s.stats.maxDose).toBeLessThan(25);
  });
  it("4 Solar Storm: no protection fails", () => {
    const r = new Runner("solar-storm").drive("dock").until(61);
    expect(r.s.status).toBe("lost");
    expect(r.s.endReason).toMatch(/radiation/);
  });
  it("5 Red Planet: MOXIE and a reactor earn all three stars", () => {
    const r = new Runner("red-planet");
    r.do({ type: "build", module: "oxygen" });
    r.do({ type: "build", module: "reactor" });
    while (r.s.status === "playing") {
      reflexes(r);
      r.tick(0.5);
    }
    expect(r.s.status).toBe("won");
    expect(stars(r)).toBe(3);
  });
  it("6 Mars Colony: a full build survives the random events", () => {
    for (const seed of [42, 2026]) {
      const r = new Runner("mars-colony", seed);
      for (const t of ["reactor", "recycler", "greenhouse"] as const) r.do({ type: "build", module: t });
      r.drive("regolith").collect("regolith").drive("dock");
      r.do({ type: "build", module: "shelter" });
      r.charge().drive("layers").collect("layers").drive("dock");
      r.charge().drive("regolith").collect("regolith").drive("dock");
      r.do({ type: "build", module: "icedrill" });
      r.charge().drive("boulder").collect("boulder").drive("dock");
      r.charge().drive("regolith").collect("regolith").drive("dock");
      r.do({ type: "build", module: "greenhouse" });
      while (r.s.status === "playing") {
        reflexes(r);
        if (r.s.res.materials >= 20 && freePad(r.s, "lab") && !r.s.modules.some((m) => m.type === "lab")) r.do({ type: "build", module: "lab" });
        r.tick(0.5);
      }
      expect(r.s.status, `${seed}: ${r.s.endReason}`).toBe("won");
    }
  });
});
