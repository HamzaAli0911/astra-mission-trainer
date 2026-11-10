import { describe, expect, it } from "vitest";
import { placeOf } from "./crew";
import type { CrewSpot } from "./interior";
import { navPath, standable } from "./nav";

const SPOTS: CrewSpot[] = ["galley-1", "galley-2", "galley-3", "galley-4", "command", "eclss", "garden", "lab", "treadmill", "cycle", "bed", "desk", "shelter-1", "shelter-2", "shelter-3", "shelter-4", "hq-ops", "hq-alerts", "hq-power", "ls-work", "gh-work", "sci-work", "eng-power", "eng-repair", "sh-1", "sh-2", "sh-3", "sh-4"];
const CREW = ["maya", "alex", "sam", "noor"];

describe("the crew's places", () => {
  it("each has a free spot beside it that the crew can walk to from the HQ hall", () => {
    const cache = new Map<string, boolean>();
    for (const spot of SPOTS)
      for (const id of CREW) {
        // (Some places are each person's own: their bunk, their desk.)
        if (!["bed", "desk"].includes(spot) && id !== "maya") continue;
        const p = placeOf(id, spot);
        expect(standable(p.floor, 2, p.approach.x, p.approach.z), `${id} at ${spot}: room to stand beside it`).toBe(true);
        const key = `${p.floor}|${p.approach.x.toFixed(1)}|${p.approach.z.toFixed(1)}`;
        if (!cache.has(key)) cache.set(key, !!navPath({ x: 0, z: 47, floor: 0 }, { ...p.approach, floor: p.floor }, 2));
        expect(cache.get(key), `${id} at ${spot}: a way there`).toBe(true);
      }
  });
  it("sits facing the desk, stands facing the machine", () => {
    const ops = placeOf("maya", "hq-ops");
    expect(ops.pose).toBe("sit");
    expect(ops.floor).toBe(2);
    // The flight director's desk is north of the chair: facing north.
    expect(ops.yaw).toBe(0);
    const gh = placeOf("sam", "gh-work");
    expect(gh.pose).toBe("stand");
    expect(gh.yaw).toBe(270);
  });
});
