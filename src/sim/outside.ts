import { AIRLOCKS, porchY, rectDistance, solidsNear, type Rect } from "./base";
import { modulePos } from "./rover";
import type { Module, Planet } from "./types";
import { FOOTPRINT, LANDER, rocksNear, terrainHeight, WORLD } from "./world";

/**
 * On foot outside in a suit: the walker follows the ground, slides round the outpost's buildings, the lander,
 * the rover and solid boulders, can't climb slopes steeper than 25°, and stays on the map. Pure, like the
 * walls inside (sim/home.ts).
 */
export const SUIT = {
  /** Half the suit's width, with its backpack. */
  body: 0.4,
  /** Eye height above the ground. */
  eye: 1.7,
  /** The steepest slope you can walk up (tan 25°). */
  maxSlope: Math.tan((25 * Math.PI) / 180),
};
/** Where you come out of the EVA complex's airlock (on its porch, facing away from the door), and go back in. */
export const OUTER_HATCH = { ...AIRLOCKS[0].outside };
/** The ground under a suited walker's boots: the terrain, or an airlock's porch. */
export const groundY = (x: number, z: number, planet: Planet) => Math.max(terrainHeight(x, z, planet), porchY(x, z));

interface Circle {
  x: number;
  z: number;
  r: number;
}
/** Everything round near a point: the modules (Hab-1 too), the lander, the rover, boulders. */
function obstacles(x: number, z: number, modules: Module[], rover: { x: number; z: number } | null): Circle[] {
  const out: Circle[] = [];
  for (const m of modules) {
    const p = modulePos(m);
    out.push({ x: p.x, z: p.z, r: FOOTPRINT[m.type] });
  }
  out.push({ x: LANDER.x, z: LANDER.z, r: LANDER.r });
  if (rover) out.push({ x: rover.x, z: rover.z, r: 2.1 });
  for (const k of rocksNear(x, z)) out.push({ x: k.x, z: k.z, r: k.r * 0.85 });
  return out;
}

/** Push a circle (radius r) out of a rectangle it overlaps. */
function outOfRect(p: { x: number; z: number }, s: Rect, r: number) {
  const n = rectDistance(s, p.x, p.z);
  if (n.d >= r) return false;
  if (n.d > 1e-9) {
    const k = (r - n.d) / n.d;
    p.x += (p.x - n.x) * k;
    p.z += (p.z - n.z) * k;
    return true;
  }
  // Inside it: out by the nearest side.
  const sides = [p.x - s.x0, s.x1 - p.x, p.z - s.z0, s.z1 - p.z];
  const i = sides.indexOf(Math.min(...sides));
  if (i === 0) p.x = s.x0 - r;
  else if (i === 1) p.x = s.x1 + r;
  else if (i === 2) p.z = s.z0 - r;
  else p.z = s.z1 + r;
  return true;
}

/**
 * Take a step on foot: (dx, dz) metres, in pieces short enough never to pass through anything. `closed` are the
 * slabs of airlock doors that are shut (an open one leaves its doorway clear to walk into).
 */
export function walkOutside(p: { x: number; z: number }, dx: number, dz: number, modules: Module[], planet: Planet, rover: { x: number; z: number } | null = null, closed: Rect[] = []) {
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.1));
  let x = p.x,
    z = p.z;
  for (let i = 0; i < steps; i++) {
    const n = { x: Math.max(-WORLD, Math.min(WORLD, x + dx / steps)), z: Math.max(-WORLD, Math.min(WORLD, z + dz / steps)) };
    for (let pass = 0; pass < 3; pass++) {
      for (const c of obstacles(n.x, n.z, modules, rover)) {
        const ddx = n.x - c.x,
          ddz = n.z - c.z;
        const d = Math.hypot(ddx, ddz),
          min = c.r + SUIT.body;
        if (d < min) {
          const k = (min - d) / (d || 1e-9);
          n.x += ddx * k;
          n.z += ddz * k;
        }
      }
      // The colony's buildings, walls and fences, and any airlock door that's shut.
      for (const s of solidsNear(n.x, n.z)) outOfRect(n, s, SUIT.body);
      for (const s of closed) outOfRect(n, s, SUIT.body);
    }
    // Too steep to climb: stay put (walking down or across is fine).
    const run = Math.hypot(n.x - x, n.z - z);
    if (run > 1e-6 && (groundY(n.x, n.z, planet) - groundY(x, z, planet)) / run > SUIT.maxSlope) break;
    x = n.x;
    z = n.z;
  }
  return { x, z };
}
