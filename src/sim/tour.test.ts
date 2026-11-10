import { describe, expect, it } from "vitest";
import type { Stage } from "./base";
import { SPAWN, type Floor } from "./home";
import { navPath } from "./nav";
import { cardBuilt, cardSpot, colonyTour } from "./tour";

describe("the colony tour", () => {
  it("covers command, housing, life support, greenhouse, lab, engineering, EVA, garage and the storm shelter", () => {
    expect(colonyTour(2).map((s) => s.title)).toEqual(["Housing", "Command HQ", "Life support", "Greenhouse", "Storm shelter", "Laboratory", "Engineering", "EVA complex", "Rover garage"]);
  });
  it("only sends you to things the mission's campus has, each one reachable on foot from where a walk starts", () => {
    for (const stage of [0, 1, 2] as Stage[]) {
      for (const s of colonyTour(stage)) {
        const sp = cardSpot(s.card);
        expect(sp, `${stage}: ${s.card}`).toBeTruthy();
        expect(cardBuilt(s.card, stage), `${stage}: ${s.card} is built`).toBe(true);
        if (sp!.level === -1) continue;
        const way = navPath({ x: SPAWN.x, z: SPAWN.z, floor: 0 }, { x: sp!.x, z: sp!.z, floor: sp!.level as Floor }, stage);
        expect(way, `${stage}: a way to ${s.card}`).toBeTruthy();
      }
    }
  });
});
