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
/** Where you come out of the airlock (on the entry deck, facing away from the home), and where you go back in. */
export const OUTER_HATCH = { x: 0, z: 8.7, yaw: Math.PI };

interface Circle {
  x: number;
  z: number;
  r: number;
}
/** Everything solid near a point: buildings (the airlock tunnel too), the lander, the rover, boulders. */
function obstacles(x: number, z: number, modules: Module[], rover: { x: number; z: number } | null): Circle[] {
  const out: Circle[] = [];
  for (const m of modules) {
    const p = modulePos(m);
    out.push({ x: p.x, z: p.z, r: FOOTPRINT[m.type] });
    // The airlock's tunnel runs south from the home to the outer hatch.
    if (m.type === "habitat") for (const tz of [5.5, 6.25, 7.0]) out.push({ x: p.x, z: p.z + tz, r: 1.0 });
  }
  out.push({ x: LANDER.x, z: LANDER.z, r: LANDER.r });
  if (rover) out.push({ x: rover.x, z: rover.z, r: 2.1 });
  for (const k of rocksNear(x, z)) out.push({ x: k.x, z: k.z, r: k.r * 0.85 });
  return out;
}

/** Take a step on foot: (dx, dz) metres, in pieces short enough never to pass through anything. */
export function walkOutside(p: { x: number; z: number }, dx: number, dz: number, modules: Module[], planet: Planet, rover: { x: number; z: number } | null = null) {
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.1));
  let x = p.x,
    z = p.z;
  for (let i = 0; i < steps; i++) {
    let nx = Math.max(-WORLD, Math.min(WORLD, x + dx / steps)),
      nz = Math.max(-WORLD, Math.min(WORLD, z + dz / steps));
    for (let pass = 0; pass < 3; pass++)
      for (const c of obstacles(nx, nz, modules, rover)) {
        const ddx = nx - c.x,
          ddz = nz - c.z;
        const d = Math.hypot(ddx, ddz),
          min = c.r + SUIT.body;
        if (d < min) {
          const k = (min - d) / (d || 1e-9);
          nx += ddx * k;
          nz += ddz * k;
        }
      }
    // Too steep to climb: stay put (walking down or across is fine).
    const run = Math.hypot(nx - x, nz - z);
    if (run > 1e-6 && (terrainHeight(nx, nz, planet) - terrainHeight(x, z, planet)) / run > SUIT.maxSlope) break;
    x = nx;
    z = nz;
  }
  return { x, z };
}
