import { furnitureById, type Side } from "./base";
import { blockAxes, BLOCKS, polar, type Block, type Floor } from "./home";
import { nearestStandable, standable } from "./nav";
import type { CrewSpot } from "./interior";

/**
 * Where each of the crew's places is, exactly: the spot, the way they face, their pose (standing at a machine,
 * sitting, lying in a bunk, riding the exercise cycle) and the free spot beside it they walk to first. Hab-1's places
 * come from its floor plan, the campus's from its furniture. Pure: the walking crew (scene) and the tests read it.
 */
export type Pose = "stand" | "sit" | "lie" | "ride";
export interface Place {
  x: number;
  z: number;
  floor: Floor;
  /** Facing, a compass bearing in degrees (0 north, clockwise). */
  yaw: number;
  pose: Pose;
  /** Height of what they sit or lie on, above the floor. */
  y: number;
  /** Where they stand before settling in (beside the seat or the bunk); for standing places, the place itself. */
  approach: { x: number; z: number };
}
const QUARTERS: Record<string, string> = { maya: "q1", alex: "q2", sam: "q3", noor: "q4" };
/** The first of some spots round a seat or a bunk with room to stand (in front, behind, either side). */
const pick = (floor: Floor, ...pts: { x: number; z: number }[]) => pts.find((p) => standable(floor, 2, p.x, p.z)) ?? nearestStandable(floor, 2, pts[0].x, pts[0].z) ?? pts[0];
/** Spots round a Hab-1 piece: `out` metres past its front, its back and its two ends. */
function around(k: Block, out: number) {
  const { c, n, t } = blockAxes(k);
  const f = k.face ?? 0;
  const dir = f === 90 ? t : f === -90 ? { x: -t.x, z: -t.z } : f === 180 ? n : { x: -n.x, z: -n.z };
  const across = { x: -dir.z, z: dir.x };
  const depth = Math.abs(f) === 90 ? k.w : k.d,
    width = Math.abs(f) === 90 ? k.d : k.w;
  const at = (d: { x: number; z: number }, m: number) => ({ x: c.x + d.x * m, z: c.z + d.z * m });
  // (Nearest first; further out if a table or a wall is in the way.)
  return [out, out + 0.2, out + 0.4].flatMap((o) => [at(dir, depth / 2 + o), at({ x: -dir.x, z: -dir.z }, depth / 2 + o), at(across, width / 2 + o), at({ x: -across.x, z: -across.z }, width / 2 + o)]);
}
const block = (id: string) => BLOCKS.find((k) => k.id === id)!;
/** Where a Hab-1 piece's front faces (degrees), and a point `out` metres in front of it. */
function front(k: Block, out: number) {
  const { c, n, t } = blockAxes(k);
  const f = k.face ?? 0;
  const dir = f === 90 ? t : f === -90 ? { x: -t.x, z: -t.z } : f === 180 ? n : { x: -n.x, z: -n.z };
  const depth = Math.abs(f) === 90 ? k.w : k.d;
  return { x: c.x + dir.x * (depth / 2 + out), z: c.z + dir.z * (depth / 2 + out), facing: (Math.atan2(-dir.x, dir.z) * 180) / Math.PI };
}
function seat(id: string, y = 0.45): Place {
  const k = block(id);
  const p = polar(k.bearing, k.r);
  const f = front(k, 0);
  return { x: p.x, z: p.z, floor: k.level, yaw: f.facing, pose: "sit", y, approach: pick(k.level, ...around(k, 0.42)) };
}
function standAt(id: string, out = 0.35): Place {
  const k = block(id);
  const f = front(k, out);
  return { x: f.x, z: f.z, floor: k.level, yaw: f.facing + 180, pose: "stand", y: 0, approach: pick(k.level, f, front(k, out + 0.15), front(k, out + 0.3)) };
}

const BEARING: Record<Side, number> = { n: 0, e: 90, s: 180, w: 270 };
const STEP: Record<Side, { x: number; z: number }> = { n: { x: 0, z: -1 }, s: { x: 0, z: 1 }, e: { x: 1, z: 0 }, w: { x: -1, z: 0 } };
const floorOf = (id: string): Floor => (furnitureById(id)!.cell === "hq-mezzanine" ? 2 : 0);
/** Sitting on a campus chair or seat, facing the way it faces; they come to it from behind (desks) or the front (benches). */
function campusSeat(id: string, y = 0.48, fromFront = false): Place {
  const f = furnitureById(id)!;
  const r = f.rect;
  const x = (r.x0 + r.x1) / 2,
    z = (r.z0 + r.z1) / 2;
  const d = STEP[f.face];
  const k = fromFront ? 0.62 : -0.62;
  const floor = floorOf(id);
  const spots = [k, -k].map((m) => ({ x: x + d.x * m, z: z + d.z * m }));
  spots.push({ x: x + d.z * 0.62, z: z - d.x * 0.62 }, { x: x - d.z * 0.62, z: z + d.x * 0.62 });
  return { x, z, floor, yaw: BEARING[f.face], pose: "sit", y, approach: pick(floor, ...spots) };
}
/** Standing at a campus machine's front (at `along`, 0–1 across it), looking at it. */
function campusStand(id: string, along = 0.5, out = 0.42): Place {
  const f = furnitureById(id)!;
  const r = f.rect;
  const d = STEP[f.face];
  const x = d.x ? (d.x > 0 ? r.x1 + out : r.x0 - out) : r.x0 + (r.x1 - r.x0) * along;
  const z = d.z ? (d.z > 0 ? r.z1 + out : r.z0 - out) : r.z0 + (r.z1 - r.z0) * along;
  const floor = floorOf(id);
  return { x, z, floor, yaw: (BEARING[f.face] + 180) % 360, pose: "stand", y: 0, approach: pick(floor, { x, z }, { x: x + d.x * 0.15, z: z + d.z * 0.15 }, { x: x + d.x * 0.3, z: z + d.z * 0.3 }) };
}

/** A crew member's place for a spot of the routine. */
export function placeOf(id: string, spot: CrewSpot): Place {
  if (spot.startsWith("galley-")) return seat(`galley-chair-${spot.slice(-1)}`);
  if (spot.startsWith("shelter-")) return seat(`shelter-seat-${spot.slice(-1)}`);
  if (spot.startsWith("sh-")) return campusSeat(`sh-seat-${spot.slice(-1)}`, 0.46, true);
  switch (spot) {
    case "command":
      return seat("command-chair-1", 0.5);
    case "eclss":
      return standAt("eclss-co2", 0.3);
    case "garden":
      return standAt("garden-rack-2", 0.35);
    case "lab":
      return standAt("lab-bench", 0.3);
    case "treadmill": {
      const k = block("exercise-treadmill");
      const p = polar(k.bearing, k.r);
      return { x: p.x, z: p.z, floor: 1, yaw: k.bearing + 90, pose: "stand", y: 0.17, approach: pick(1, ...around(k, 0.35)) };
    }
    case "cycle": {
      const k = block("exercise-cycle");
      const p = polar(k.bearing, k.r + 0.15);
      return { x: p.x, z: p.z, floor: 1, yaw: k.bearing, pose: "ride", y: 0.69, approach: pick(1, ...around(k, 0.35)) };
    }
    case "bed": {
      const k = block(`${QUARTERS[id]}-bunk`);
      const p = polar(k.bearing, k.r);
      return { x: p.x, z: p.z, floor: 1, yaw: k.bearing + 90, pose: "lie", y: 0.58, approach: pick(1, ...around(k, 0.32)) };
    }
    case "desk": {
      const k = block(`${QUARTERS[id]}-desk`);
      const f = front(k, 0.32);
      return { x: f.x, z: f.z, floor: 1, yaw: f.facing + 180, pose: "sit", y: 0.45, approach: pick(1, front(k, 0.75), front(k, 0.95), ...around(k, 0.45)) };
    }
    // The campus: the flight director's desk, the alerts board, the power console, and each wing's work place.
    case "hq-ops":
      return campusSeat("hq-fd-chair-2", 0.5);
    case "hq-alerts":
      return campusStand("hq-crisis", 0.35);
    case "hq-power":
      return campusSeat("hq-chair-a-1", 0.5);
    case "ls-work":
      return campusSeat("ls-chair-1", 0.5);
    case "gh-work":
      return campusStand("gh-rack-4", 0.5);
    case "sci-work":
      return campusStand("sci-rocks", 0.5);
    case "eng-power":
      return campusSeat("en-chair-1", 0.5);
    case "eng-repair":
      return campusStand("en-stand", 0.5, 0.5);
  }
  return standAt("lab-bench");
}
