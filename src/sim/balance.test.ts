import { describe, expect, it } from "vitest";
import { Runner } from "./harness";
import { starsFor } from "./goals";
import { mission } from "./missions";
import type { GameState } from "./types";
import { freePad } from "./engine";

const summary = (s: GameState) => ({
  status: s.status,
  t: s.t.toFixed(1),
  reason: s.endReason,
  stars: starsFor(s, mission(s.missionId)),
  res: Object.fromEntries(Object.entries(s.res).map(([k, v]) => [k, +v.toFixed(1)])),
  min: Object.fromEntries(Object.entries(s.stats.min).map(([k, v]) => [k, +v.toFixed(1)])),
  brownout: +s.stats.brownout.toFixed(2),
  minHealth: +s.stats.minHealth.toFixed(1),
  maxDose: +s.stats.maxDose.toFixed(1),
  made: Object.fromEntries(Object.entries(s.stats.made).map(([k, v]) => [k, +v.toFixed(1)])),
  trips: s.stats.trips,
  sites: s.stats.sites,
});
const log = (name: string, r: Runner, extra?: unknown) =>
  console.log(name, JSON.stringify(summary(r.s)), r.errors.slice(0, 6), extra ?? "");

describe.skipIf(!(globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.PROBE)("balance probes", () => {
  it("M2 trip timing", () => {
    const r = new Runner("ice-hunters");
    const t0 = r.s.t;
    r.drive("ice");
    const t1 = r.s.t,
      b1 = r.s.rover.battery;
    r.collect("ice");
    r.drive("dock");
    console.log("trip out", (t1 - t0).toFixed(2), "h; battery after out", b1.toFixed(1), "back at", r.s.t.toFixed(2), "battery", r.s.rover.battery.toFixed(1));
    r.drive("regolith");
    console.log("regolith out at", r.s.t.toFixed(2), "battery", r.s.rover.battery.toFixed(1));
    r.collect("regolith").drive("dock");
    console.log("regolith back at", r.s.t.toFixed(2), "battery", r.s.rover.battery.toFixed(1));
    for (const id of ["layers", "boulder", "ray"]) {
      const before = r.s.t;
      r.drive(id);
      console.log(id, "out", (r.s.t - before).toFixed(2), "h, battery", r.s.rover.battery.toFixed(1));
      r.drive("dock");
      r.tick(4);
    }
  });
  it("M2 lazy: recycler only, one ice run", () => {
    const r = new Runner("ice-hunters");
    r.do({ type: "build", module: "recycler" });
    r.drive("ice").collect("ice").drive("dock");
    r.until(57);
    log("M2 lazy", r);
  });
  it("M2 drill path: regolith then ice drill", () => {
    const r = new Runner("ice-hunters");
    r.do({ type: "build", module: "recycler" });
    r.drive("regolith").collect("regolith").drive("dock");
    r.do({ type: "build", module: "icedrill" });
    r.drive("ice").collect("ice").drive("dock");
    r.until(57);
    log("M2 drill", r);
  });
  it("M3 one greenhouse, dim at night", () => {
    const r = new Runner("green-thumb");
    r.do({ type: "build", module: "greenhouse" });
    r.do({ type: "build", module: "battery" });
    while (r.s.status === "playing") {
      const h = r.s.t % 24;
      const gh = r.s.modules.find((m) => m.type === "greenhouse");
      if (gh && !r.s.choice) r.do({ type: "light", id: gh.id, level: h >= 6 && h < 20 ? 2 : 1 });
      r.tick(1);
    }
    log("M3 one dim", r);
  });
  it("M3 one greenhouse always high, no extra battery", () => {
    const r = new Runner("green-thumb");
    r.do({ type: "build", module: "greenhouse" });
    r.until(80);
    log("M3 one high nobatt", r);
  });
  it("M3 two greenhouses + battery, dim at night", () => {
    const r = new Runner("green-thumb");
    r.choices.supply = 1;
    r.do({ type: "build", module: "greenhouse" });
    r.do({ type: "build", module: "battery" });
    r.do({ type: "build", module: "greenhouse" });
    while (r.s.status === "playing") {
      const h = r.s.t % 24;
      if (!r.s.choice)
        for (const gh of r.s.modules.filter((m) => m.type === "greenhouse"))
          r.do({ type: "light", id: gh.id, level: h >= 6 && h < 20 ? 2 : 1 });
      r.tick(1);
    }
    log("M3 two dim", r);
  });
  it("M4 shield only", () => {
    const r = new Runner("solar-storm");
    r.drive("dock");
    r.do({ type: "shield" });
    r.until(61);
    log("M4 shield only", r);
  });
  it("M4 nothing, rover home", () => {
    const r = new Runner("solar-storm");
    r.drive("dock");
    r.until(61);
    log("M4 nothing", r);
  });
  it("M4 rover stays out", () => {
    const r = new Runner("solar-storm");
    r.do({ type: "build", module: "shelter" });
    r.until(61);
    log("M4 rover out", r);
  });
  it("M4 expert: two samples, shelter", () => {
    const r = new Runner("solar-storm");
    r.collect("layers").drive("dock");
    r.do({ type: "build", module: "shelter" });
    r.until(26);
    r.drive("boulder").collect("boulder").drive("dock");
    while (r.s.status === "playing") {
      const storm = r.s.hazards.some((h) => h.phase === "active" && h.kind === "storm");
      if (storm !== r.s.sheltering) r.do({ type: "shelter", on: storm });
      r.tick(0.5);
    }
    log("M4 expert", r);
  });
  it("M5 no reactor: MOXIE + solar + battery, switch MOXIE off at night", () => {
    const r = new Runner("red-planet");
    r.do({ type: "build", module: "oxygen" });
    r.do({ type: "build", module: "solar" });
    r.do({ type: "build", module: "battery" });
    r.do({ type: "build", module: "solar" });
    while (r.s.status === "playing") {
      const h = r.s.t % 24;
      const ox = r.s.modules.find((m) => m.type === "oxygen");
      const want = h >= 8 && h < 17 && !r.s.hazards.some((z) => z.phase === "active");
      if (ox && ox.on !== want && !r.s.choice) r.do({ type: "toggle", id: ox.id });
      if (r.s.dust > 0.05 && !r.s.hazards.some((z) => z.phase === "active")) r.do({ type: "clean" });
      r.tick(0.5);
    }
    log("M5 solar only", r);
  });
  it("M5 MOXIE only, never off", () => {
    const r = new Runner("red-planet");
    r.do({ type: "build", module: "oxygen" });
    r.until(80);
    log("M5 moxie only", r);
  });
  it("M6 full plan with rover trips", () => {
    for (const seed of [1, 7, 42, 2026]) {
      const r = new Runner("mars-colony", seed);
      r.do({ type: "build", module: "reactor" });
      r.do({ type: "build", module: "recycler" });
      r.do({ type: "build", module: "greenhouse" });
      r.drive("regolith").collect("regolith").drive("dock");
      r.do({ type: "build", module: "shelter" });
      r.charge().drive("layers").collect("layers").drive("dock");
      r.charge().drive("regolith").collect("regolith").drive("dock");
      r.do({ type: "build", module: "icedrill" });
      r.charge().drive("boulder").collect("boulder").drive("dock");
      r.charge().drive("regolith").collect("regolith").drive("dock");
      r.do({ type: "build", module: "greenhouse" });
      while (r.s.status === "playing") {
        const storm = r.s.hazards.some((h) => h.phase === "active" && h.kind === "storm");
        if (storm !== r.s.sheltering) r.do({ type: "shelter", on: storm });
        if (r.s.dust > 0.05 && !r.s.hazards.some((h) => h.phase === "active")) r.do({ type: "clean" });
        for (const m of r.s.modules) if (m.health < 50 && m.repair <= 0) r.do({ type: "repair", id: m.id });
        if (r.s.res.materials >= 20 && freePad(r.s, "lab") && !r.s.modules.some((m) => m.type === "lab")) r.do({ type: "build", module: "lab" });
        r.tick(1);
      }
      log(`M6 seed ${seed}`, r, JSON.stringify(r.s.hazards.map((h) => [h.kind, h.startAt])) + " " + JSON.stringify(r.s.script.map((e) => [e.id, e.at])));
    }
    expect(true).toBe(true);
  });
  it("Free play moon: sensible build", () => {
    const r = new Runner("free-moon", 5);
    for (const m of ["solar", "solar", "oxygen", "battery", "recycler", "greenhouse"] as const) r.do({ type: "build", module: m });
    r.drive("regolith").collect("regolith").drive("dock");
    r.do({ type: "build", module: "shelter" });
    r.charge().drive("layers").collect("layers").drive("dock");
    while (r.s.status === "playing") {
      const storm = r.s.hazards.some((h) => h.phase === "active" && h.kind === "storm");
      if (storm !== r.s.sheltering) r.do({ type: "shelter", on: storm });
      for (const m of r.s.modules) if (m.health < 50 && m.repair <= 0) r.do({ type: "repair", id: m.id });
      r.tick(1);
    }
    log("Free moon", r);
  });
});
