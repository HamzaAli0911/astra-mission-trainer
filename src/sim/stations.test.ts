import { describe, expect, it } from "vitest";
import { act, createState } from "./engine";
import { flows, isBuilt } from "./core";
import { cellById, FURNITURE, furnitureById, stageOf } from "./base";
import { lineClear } from "./home";
import { MODULES, RATES } from "./modules";
import { MISSIONS } from "./missions";
import { PLANETS } from "./planets";
import { frontEdge, nearestOn, STATIONS, stationsFor, stationSpot } from "./stations";
import type { GameState, ModuleType } from "./types";

function add(s: GameState, type: ModuleType) {
  const r = act(s, { type: "build", module: type });
  expect(r.ok, r.message).toBe(true);
  const m = r.state.modules[r.state.modules.length - 1];
  m.built = MODULES[type].time;
  return r.state;
}
/** Run a station's control the way the walk does: every action through the game's own act(). */
function press(s: GameState, label: string, station: string) {
  const st = STATIONS.find((x) => x.id === station)!;
  const c = st.controls!(s).find((x) => x.label === label);
  expect(c, `${station}: no control "${label}" in ${st.controls!(s).map((x) => x.label).join(" | ")}`).toBeTruthy();
  expect(c!.off).toBeFalsy();
  if (!("act" in c!.does)) throw new Error("not a game action");
  for (const a of c!.does.act) {
    const r = act(s, a);
    expect(r.ok, r.message).toBe(true);
    s = r.state;
  }
  return s;
}

describe("campus stations", () => {
  it("each stands on real furniture, in a real room, with a front you can stand at", () => {
    for (const st of STATIONS) {
      const { f, cell, level, face } = stationSpot(st);
      expect(cell, st.id).toBeTruthy();
      if (st.furniture) expect(furnitureById(st.furniture), st.id).toBeTruthy();
      if (level === -1 || !f) continue;
      // Somewhere half a metre out from its front (between the chairs at a desk) you can stand and see it.
      const e = frontEdge(f!, 0.55);
      const r = cellById(f!.cell)!.rect;
      const spots = [0.1, 0.25, 0.4, 0.5, 0.6, 0.75, 0.9].map((t) => ({ x: e.ax + (e.bx - e.ax) * t, z: e.az + (e.bz - e.az) * t }));
      const free = (p: { x: number; z: number }) => p.x > r.x0 + 0.25 && p.x < r.x1 - 0.25 && p.z > r.z0 + 0.25 && p.z < r.z1 - 0.25 && !FURNITURE.some((o) => o.cell === f!.cell && p.x > o.rect.x0 - 0.25 && p.x < o.rect.x1 + 0.25 && p.z > o.rect.z0 - 0.25 && p.z < o.rect.z1 + 0.25);
      const ok = spots.some((p) => free(p) && lineClear(level as 0 | 2, p, nearestOn(face, p.x, p.z), () => true, f!.id));
      expect(ok, `${st.id}: there's room to stand at its front and see it`).toBe(true);
    }
  });
  it("shows numbers and a reason without failing, in every mission", () => {
    for (const m of MISSIONS) {
      const g = createState(m.id);
      for (const st of stationsFor(stageOf(m.id))) {
        expect(st.live(g).length, st.id).toBeGreaterThan(0);
        expect(st.why(g).length, st.id).toBeGreaterThan(20);
        expect(st.fact(g)?.title, st.id).toBeTruthy();
        st.controls?.(g);
      }
    }
  });
  it("only offers stations in buildings the mission has", () => {
    expect(stationsFor(0).map((s) => s.id)).not.toContain("ls-oxygen");
    expect(stationsFor(1).map((s) => s.id)).toContain("ls-oxygen");
    expect(stationsFor(2).map((s) => s.id)).toContain("en-repair");
  });
  it("switches the oxygen plant off and on: flows follow", () => {
    let s = add(createState("free-moon"), "oxygen");
    const before = flows(s);
    s = press(s, "Switch the Oxygen Maker off", "ls-oxygen");
    const off = flows(s);
    expect(s.modules.find((m) => m.type === "oxygen")!.on).toBe(false);
    expect(off.o2.made).toBeLessThan(before.o2.made);
    expect(before.demand - off.demand).toBeCloseTo(PLANETS.moon.oxygenPower, 5);
    s = press(s, `Switch the Oxygen Maker on (${PLANETS.moon.oxygenPower.toFixed(1)} kW)`, "ls-oxygen");
    expect(flows(s).o2.made).toBeCloseTo(before.o2.made, 6);
  });
  it("sets the greenhouse lights: power and food follow, and off grows nothing", () => {
    let s = add(createState("free-mars"), "greenhouse");
    s = press(s, "Grow lights high (3 kW)", "gh-lights");
    const high = flows(s);
    s = press(s, "Grow lights low (1.5 kW)", "gh-lights");
    const low = flows(s);
    expect(high.demand - low.demand).toBeCloseTo(RATES.greenhouseKw[2] - RATES.greenhouseKw[1], 5);
    expect(high.food.made).toBeGreaterThan(low.food.made);
    s = press(s, "Grow lights off", "gh-lights");
    const off = flows(s);
    expect(off.food.made).toBeCloseTo(0, 9);
    const lit = STATIONS.find((x) => x.id === "gh-lights")!.controls!(s);
    expect(lit.find((c) => c.on)?.label).toBe("Grow lights off");
  });
  it("repairs a broken machine at the repair bay, for the HUD's cost", () => {
    let s = add(createState("free-moon"), "recycler");
    const m = s.modules.find((x) => x.type === "recycler")!;
    m.health = 30;
    const mats = s.res.materials;
    s = press(s, "Repair the Water Recycler (10 materials)", "en-repair");
    expect(s.modules.find((x) => x.id === m.id)!.repair).toBeGreaterThan(0);
    expect(s.res.materials).toBe(mats - 10);
    const again = STATIONS.find((x) => x.id === "en-repair")!.controls!(s)[0];
    expect(again.off).toBeTruthy();
  });
  it("takes shelter only when there is a shelter to go to", () => {
    const bare = createState("free-moon");
    const c = STATIONS.find((x) => x.id === "sh-console")!.controls!(bare)[0];
    expect(c.off).toBeTruthy();
    let s = add(bare, "shelter");
    s = press(s, "Take shelter now (whole crew)", "sh-console");
    expect(s.sheltering).toBe(true);
    expect(s.crew.every((x) => x.place === "shelter")).toBe(true);
    s = press(s, "Leave the shelter (whole crew)", "sh-console");
    expect(s.sheltering).toBe(false);
  });
  it("lists every switchable machine on the power board, each a real toggle", () => {
    let s = createState("free-mars");
    for (const t of ["oxygen", "recycler", "greenhouse", "lab"] as ModuleType[]) s = add(s, t);
    const labels = STATIONS.find((x) => x.id === "en-power")!.controls!(s).map((c) => c.label);
    expect(labels).toHaveLength(4);
    for (const label of labels) {
      const t = press(s, label, "en-power");
      expect(t.modules.filter((m) => isBuilt(m) && !m.on)).toHaveLength(1);
    }
  });
  it("sends the rovers through the store's own dispatch (sites that exist)", () => {
    const s = createState("free-moon");
    const cs = STATIONS.find((x) => x.id === "hq-dispatch")!.controls!(s);
    expect(cs.length).toBeGreaterThan(2);
    for (const c of cs) if ("send" in c.does) expect(c.does.send === "dock" || c.does.send === "home" || !!c.does.send).toBe(true);
  });
});
