import { describe, expect, it } from "vitest";
import { createState } from "./engine";
import { HOME, walls } from "./home";
import { INSPECTS } from "./inspect";

describe("things to look at inside the home", () => {
  it("has at least 12, each with live readings and a sourced fact, on both planets", () => {
    expect(INSPECTS.length).toBeGreaterThanOrEqual(12);
    for (const planet of ["moon", "mars"] as const) {
      const g = createState(planet === "moon" ? "free-moon" : "free-mars", 3);
      for (const p of INSPECTS) {
        const rows = p.live(g);
        expect(rows.length, p.id).toBeGreaterThan(0);
        for (const [label, value] of rows) expect(label && value, p.id).toBeTruthy();
        const f = p.fact(g);
        expect(f?.url, p.id).toMatch(/^https:\/\//);
      }
    }
  });

  it("shows the mission's real numbers", () => {
    const g = createState("free-mars", 3);
    g.res.o2 = 12.34;
    g.res.water = 207;
    g.res.food = 42;
    const row = (id: string, label: string) => INSPECTS.find((p) => p.id === id)!.live(g).find((r) => r[0] === label)![1];
    expect(row("o2", "Oxygen stored")).toBe("12.3 of 90 kg");
    expect(row("tanks", "Water stored")).toBe("207 of 400 L");
    expect(row("food", "Meals on the shelves")).toBe("42 of 150");
    g.crew[0].dose = 7.25;
    expect(INSPECTS.find((p) => p.id === "medical")!.live(g)[0][1]).toContain("dose 7.3 mSv");
  });

  it("can be reached: somewhere to stand within arm's reach of each one", () => {
    for (const p of INSPECTS) {
      const segs = walls(p.level);
      let ok = false;
      for (let a = 0; a < 32 && !ok; a++)
        for (const d of [0.6, 0.8, 1.0, 1.2]) {
          const x = p.x + Math.cos((a / 32) * Math.PI * 2) * d,
            z = p.z + Math.sin((a / 32) * Math.PI * 2) * d;
          if (Math.hypot(x, z) > HOME.lining - HOME.body) continue;
          const clear = segs.every((s) => {
            const vx = s.bx - s.ax,
              vz = s.bz - s.az;
            const t = Math.max(0, Math.min(1, ((x - s.ax) * vx + (z - s.az) * vz) / (vx * vx + vz * vz || 1e-9)));
            return Math.hypot(x - s.ax - vx * t, z - s.az - vz * t) >= HOME.body;
          });
          if (clear) ok = true;
        }
      expect(ok, p.id).toBe(true);
    }
  });
});
