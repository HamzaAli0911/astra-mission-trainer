import { describe, expect, it } from "vitest";
import { advise, forecast, hoursLeft, lessonsFromFailure } from "./advisor";
import { act, advance, createState } from "./engine";
import { advanceAnswering } from "./harness";
import { MODULES } from "./modules";
import type { GameState, ModuleType } from "./types";

function add(s: GameState, type: ModuleType) {
  const r = act(s, { type: "build", module: type });
  r.state.modules[r.state.modules.length - 1].built = MODULES[type].time;
  return r.state;
}

describe("forecast", () => {
  it("sees the battery running out at night before it happens", () => {
    let s = add(add(createState("free-moon"), "solar"), "oxygen");
    s = { ...s, t: 18, res: { ...s.res, power: 20 } };
    const f = forecast(s, 18);
    expect(f.power).not.toBeNull();
    expect(18 + f.power!).toBeGreaterThan(20); // after sunset
    expect(18 + f.power!).toBeLessThan(30); // before sunrise
  });
  it("finds no problem for a well-stocked outpost", () => {
    let s = createState("free-moon");
    for (const t of ["solar", "solar", "battery", "battery"] as const) s = add(s, t);
    s = { ...s, t: 10, res: { ...s.res, power: 100 } };
    expect(forecast(s, 24).power).toBeNull();
  });
  it("hoursLeft is infinite when a resource is not shrinking", () => {
    expect(hoursLeft(10, 2, 1)).toBe(Infinity);
    expect(hoursLeft(10, 1, 2)).toBe(10);
  });
});

describe("advice", () => {
  it("asks for an oxygen maker when oxygen is short", () => {
    const s = createState("free-moon");
    s.res.o2 = 2;
    const a = advise(s);
    expect(a[0].id).toBe("o2-build");
    expect(a[0].fix).toEqual({ kind: "build", label: expect.any(String), module: "oxygen" });
  });
  it("puts the crew in the shelter first during a storm", () => {
    let s = add(createState("free-moon"), "shelter");
    s.hazards.push({ id: 1, kind: "storm", warnAt: 0, startAt: 0, endAt: 99, strength: 15, phase: "active" });
    const a = advise(s);
    expect(a[0].fix).toEqual({ kind: "act", label: "Take shelter", action: { type: "shelter", on: true } });
    s = act(s, { type: "shelter", on: true }).state;
    expect(advise(s).some((x) => x.id === "storm-shelter")).toBe(false);
  });
  it("tells you to bring the rover home before a storm", () => {
    const s = createState("solar-storm");
    s.hazards[0].phase = "warned";
    expect(advise(s).some((x) => x.id === "warn-rover")).toBe(true);
  });
});

describe("debrief lessons", () => {
  it("explain a radiation failure", () => {
    const s = createState("solar-storm");
    s.rover.docked = true;
    const end = advanceAnswering(s, 60);
    expect(end.status).toBe("lost");
    const tips = lessonsFromFailure(end);
    expect(tips[0]).toMatch(/Storm Shelter/);
  });
  it("explain running out of oxygen", () => {
    const s = createState("free-moon");
    s.res.o2 = 0;
    const end = advance(s, 10);
    expect(lessonsFromFailure(end).join(" ")).toMatch(/Oxygen ran out/);
  });
});
