import { describe, expect, it } from "vitest";
import { MAY_2024, OSDR_STUDIES, SEP_EVENTS } from "../data/space";
import { createState, step } from "./engine";
import { mission } from "./missions";
import { dateOf, FLARE_STORMS, flareScore, MARS_CYCLE, MAY_2024_RISE, realStorm, realStormLine, stormStrength } from "./spaceweather";

describe("real space weather (NASA DONKI and RadLab snapshot)", () => {
  it("has real particle storms with their flares, oldest first", () => {
    expect(SEP_EVENTS.length).toBeGreaterThan(40);
    expect(FLARE_STORMS.length).toBeGreaterThan(30);
    for (let i = 1; i < SEP_EVENTS.length; i++) expect(SEP_EVENTS[i].time >= SEP_EVENTS[i - 1].time).toBe(true);
    for (const e of SEP_EVENTS) expect(e.link).toMatch(/^https:\/\/ccmc\.gsfc\.nasa\.gov\/DONKI\//);
  });
  it("turns a flare's class into a storm strength within the game's range", () => {
    expect(flareScore("X10")).toBe(1);
    expect(flareScore("X1.0")).toBeGreaterThan(flareScore("M9.9"));
    expect(flareScore("M5")).toBeGreaterThan(flareScore("C9"));
    for (const e of FLARE_STORMS) {
      const s = stormStrength(e);
      expect(s).toBeGreaterThanOrEqual(12);
      expect(s).toBeLessThanOrEqual(16);
    }
  });
  it("models the Solar Storm mission on the real week of 9–13 May 2024", () => {
    const storms = mission("solar-storm").hazards.filter((h) => h.kind === "storm");
    expect(storms.map((h) => realStorm(h.real)?.time.slice(0, 10))).toEqual(["2024-05-09", "2024-05-11", "2024-05-13"]);
    const line = realStormLine(realStorm(storms[1].real)!);
    expect(line).toContain("11 May 2024");
    expect(line).toContain("an X5.8 flare");
  });
  it("gives every random storm a real event, deterministically, and says so when it's spotted", () => {
    const a = createState("mars-colony", 7),
      b = createState("mars-colony", 7);
    const storms = a.hazards.filter((h) => h.kind === "storm");
    expect(storms.length).toBeGreaterThan(0);
    expect(storms.every((h) => !!realStorm(h.real))).toBe(true);
    expect(storms.map((h) => h.real)).toEqual(b.hazards.filter((h) => h.kind === "storm").map((h) => h.real));
    // Run up to the first warning: CAPCOM names the real event.
    let s = a;
    const first = storms.reduce((m, h) => (h.warnAt < m.warnAt ? h : m));
    while (s.t < first.warnAt + 0.1 && s.status === "playing") {
      s = structuredClone(s);
      s.choice = null;
      step(s, 0.05);
    }
    expect(s.feed.some((f) => f.kind === "capcom" && f.text.includes(dateOf(realStorm(first.real)!.time)))).toBe(true);
  });
  it("measured the May 2024 storms at the Moon (10–14 May) and on Mars (20 May), with the ISS barely touched", () => {
    expect(MAY_2024.moon.instrument).toBe("CRaTER");
    expect(MAY_2024.mars.instrument).toBe("MSL-RAD");
    expect(MAY_2024.iss.instrument).toBe("DosTel2");
    expect(MAY_2024_RISE.moon).toBeGreaterThan(100);
    expect(MAY_2024_RISE.mars).toBeGreaterThan(10);
    // (Different storms: the Moon's peak came first, Mars's on 20 May.)
    expect(MAY_2024.moon.peakAt < MAY_2024.mars.peakAt).toBe(true);
    expect(MAY_2024.mars.peakAt.startsWith("2024-05-20")).toBe(true);
    expect(MAY_2024_RISE.iss).toBeLessThan(3);
    // An active Sun sweeps away galactic cosmic rays: Curiosity's background was lower at solar maximum.
    expect(MARS_CYCLE.max).toBeLessThan(MARS_CYCLE.min);
  });
  it("cites real OSDR studies", () => {
    expect(OSDR_STUDIES.map((s) => s.id)).toContain("OSD-268");
    for (const s of OSDR_STUDIES) expect(s.link).toBe(`https://osdr.nasa.gov/bio/repo/data/studies/${s.id}`);
  });
});
