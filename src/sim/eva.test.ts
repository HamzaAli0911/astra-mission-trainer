import { describe, expect, it } from "vitest";
import { SIM_STEP } from "./core";
import { act, createState, step, SUIT_HOURS, WALKER } from "./engine";
import { REPAIR_COST } from "./modules";
import { PLANETS } from "./planets";
import type { GameState } from "./types";

const run = (s: GameState, hours: number) => {
  for (let i = 0; i < Math.round(hours / SIM_STEP); i++) step(s, SIM_STEP);
  return s;
};
const walker = (s: GameState) => s.crew.find((c) => c.id === WALKER)!;

describe("walking outside (EVA)", () => {
  it("takes the full outdoor dose on foot, while the others stay behind the habitat's walls", () => {
    const s = act(createState("free-mars", 5), { type: "eva", on: true }).state;
    expect(walker(s).place).toBe("eva");
    const before = walker(s).dose,
      other = s.crew.find((c) => c.id !== WALKER && c.place === "habitat")!;
    const otherBefore = other.dose;
    run(s, 1);
    const bg = PLANETS.mars.background;
    expect(walker(s).dose - before).toBeCloseTo(bg * 1, 6);
    expect(other.dose - otherBefore).toBeCloseTo(bg * 0.6, 6);
  });

  it("comes back inside through the airlock, with the suit back on its rack", () => {
    let s = act(createState("free-mars", 5), { type: "eva", on: true }).state;
    s = act(s, { type: "eva", on: false }).state;
    expect(s.eva).toBeNull();
    expect(walker(s).place).toBe("habitat");
  });

  it("repairs on foot with the same action, at the same cost, as the HUD", () => {
    let s = createState("free-mars", 5);
    s.res.materials = 100;
    s.modules.push({ id: 50, type: "solar", pad: 0, built: 99, on: true, light: 0, health: 30, repair: 0 });
    s = act(s, { type: "eva", on: true }).state;
    const r = act(s, { type: "repair", id: 50 });
    expect(r.ok).toBe(true);
    expect(r.state.res.materials).toBe(100 - REPAIR_COST);
  });

  it("can't start when the mission is over, during a decision, or while sheltering", () => {
    const over = createState("free-mars", 5);
    over.status = "lost";
    expect(act(over, { type: "eva", on: true }).ok).toBe(false);
    const card = createState("free-mars", 5);
    card.choice = { card: "overheat", t: card.t };
    expect(act(card, { type: "eva", on: true }).ok).toBe(false);
    const sheltering = createState("free-mars", 5);
    sheltering.sheltering = true;
    expect(act(sheltering, { type: "eva", on: true }).ok).toBe(false);
  });

  it("warns with an hour of suit time left, and brings the walker in when it runs out", () => {
    const s = act(createState("free-mars", 5), { type: "eva", on: true }).state;
    run(s, SUIT_HOURS - 1);
    expect(s.feed.some((f) => f.text.includes("an hour of suit time left"))).toBe(true);
    expect(s.eva).not.toBeNull();
    run(s, 1.05);
    expect(s.eva).toBeNull();
    expect(walker(s).place).toBe("habitat");
    expect(s.feed.at(-1)?.kind).toBe("capcom");
  });

  it("changes nothing at all when nobody goes outside (old saves without the field included)", () => {
    const a = createState("mars-colony", 9);
    const b = structuredClone(a);
    delete b.eva;
    run(a, 30);
    run(b, 30);
    const { eva: _, ...restA } = a;
    expect(JSON.stringify(restA)).toBe(JSON.stringify(b));
  });
});
