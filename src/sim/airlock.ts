/**
 * An airlock: a chamber between an inner door (to the pressurised base) and an outer door (to the surface). The
 * doors are interlocked like a real one: the inner door only opens while the chamber holds full pressure, the outer
 * door only once it has been pumped down to vacuum, never both at once, and neither while it is cycling. Pure and
 * deterministic (real seconds), so the walk and the tests share it.
 */
export interface Lock {
  /** Air in the chamber: 1 at full cabin pressure, 0 at vacuum. */
  pressure: number;
  /** Pumping down for the surface, filling for the base, or neither. */
  cycle: "none" | "out" | "in";
  /** How far each door has slid open (0 shut, 1 open). */
  inner: number;
  outer: number;
}

/** Seconds to pump the chamber down or fill it again (it can be hurried along). */
export const CYCLE_SECONDS = 8;
/** Seconds for a door to slide fully open or shut. */
export const LOCK_DOOR_SECONDS = 0.9;

export const newLock = (): Lock => ({ pressure: 1, cycle: "none", inner: 0, outer: 0 });

/** May this door open right now? */
export function mayOpen(l: Lock, door: "inner" | "outer") {
  if (l.cycle !== "none") return false;
  return door === "inner" ? l.pressure >= 1 && l.outer === 0 : l.pressure <= 0 && l.inner === 0;
}

/** Start pumping down ("out", for the surface) or filling ("in", for the base). The doors close first. */
export function startCycle(l: Lock, dir: "out" | "in"): Lock {
  if ((dir === "out" && l.pressure <= 0) || (dir === "in" && l.pressure >= 1)) return l;
  return { ...l, cycle: dir };
}

/**
 * Move the doors toward what's wanted (only opening when the interlock allows), and run a cycle once both doors are
 * shut. `hurry` finishes the cycle at once (the doors still have to be shut).
 */
export function stepLock(l: Lock, dt: number, want: { inner: boolean; outer: boolean }, hurry = false): Lock {
  const door = (open: number, wanted: boolean, allowed: boolean) => Math.min(1, Math.max(0, open + ((wanted && allowed ? 1 : -1) * dt) / LOCK_DOOR_SECONDS));
  let { pressure, cycle } = l;
  const inner = door(l.inner, want.inner, mayOpen(l, "inner"));
  const outer = door(l.outer, want.outer, mayOpen(l, "outer"));
  if (cycle !== "none" && inner === 0 && outer === 0) {
    const goal = cycle === "out" ? 0 : 1;
    pressure = hurry ? goal : cycle === "out" ? Math.max(0, pressure - dt / CYCLE_SECONDS) : Math.min(1, pressure + dt / CYCLE_SECONDS);
    if (pressure === goal) cycle = "none";
  }
  return { pressure, cycle, inner, outer };
}

/** What the airlock is doing, for its panel and the HUD. */
export function lockStatus(l: Lock) {
  if (l.cycle === "out") return l.inner > 0 ? "Closing the inner door" : `Pumping down: ${Math.round(l.pressure * 100)}% pressure`;
  if (l.cycle === "in") return l.outer > 0 ? "Closing the outer door" : `Filling with air: ${Math.round(l.pressure * 100)}% pressure`;
  return l.pressure >= 1 ? "Full pressure: the inner door can open" : "Vacuum: the outer door can open";
}
