import { describe, expect, it } from "vitest";
import { CYCLE_SECONDS, mayOpen, newLock, startCycle, stepLock, type Lock } from "./airlock";

const run = (l: Lock, seconds: number, want: { inner: boolean; outer: boolean }) => {
  for (let t = 0; t < seconds; t += 0.05) {
    l = stepLock(l, 0.05, want);
    // The interlock, every step of the way: never both doors open, never a door open while cycling, the outer door
    // only at vacuum and the inner one only at full pressure.
    expect(l.inner > 0 && l.outer > 0).toBe(false);
    if (l.outer > 0) expect(l.pressure).toBe(0);
    if (l.inner > 0) expect(l.pressure).toBe(1);
  }
  return l;
};
const BOTH = { inner: true, outer: true };

describe("the airlock", () => {
  it("starts at full pressure: the inner door opens, the outer one stays shut", () => {
    const l = run(newLock(), 2, BOTH);
    expect(l.inner).toBe(1);
    expect(l.outer).toBe(0);
  });

  it("goes out: closes the inner door, pumps down, then the outer door opens", () => {
    let l = run(newLock(), 2, BOTH);
    l = startCycle(l, "out");
    expect(mayOpen(l, "inner")).toBe(false);
    l = run(l, 1, BOTH);
    expect(l.inner).toBe(0);
    expect(l.pressure).toBeGreaterThan(0.5);
    l = run(l, CYCLE_SECONDS + 2, BOTH);
    expect(l.cycle).toBe("none");
    expect(l.pressure).toBe(0);
    expect(l.outer).toBe(1);
    expect(l.inner).toBe(0);
  });

  it("comes back in: closes the outer door, fills with air, then the inner door opens", () => {
    let l = run(startCycle(newLock(), "out"), CYCLE_SECONDS + 3, { inner: false, outer: true });
    expect(l.outer).toBe(1);
    l = run(startCycle(l, "in"), CYCLE_SECONDS + 3, BOTH);
    expect(l.pressure).toBe(1);
    expect(l.inner).toBe(1);
    expect(l.outer).toBe(0);
  });

  it("can be hurried, but only once its doors are shut", () => {
    let l = run(newLock(), 2, { inner: true, outer: false });
    l = stepLock(startCycle(l, "out"), 0.05, BOTH, true);
    expect(l.pressure).toBe(1);
    l = run(l, 1.5, { inner: false, outer: false });
    l = stepLock(l, 0.05, { inner: false, outer: false }, true);
    expect(l.pressure).toBe(0);
    expect(l.cycle).toBe("none");
  });

  it("ignores a cycle it doesn't need", () => {
    expect(startCycle(newLock(), "in").cycle).toBe("none");
  });
});
