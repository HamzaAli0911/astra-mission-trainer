import * as THREE from "three";
import { blockAxes, BLOCKS, HOME, polar, rad, type Block, type Level } from "../../sim/home";
import type { CrewSpot } from "../../sim/interior";
import { ball, box, capsule, keep, rbox } from "../kit";
import { ifabric, ipaint } from "./lighting";
import { CREW_COLOR } from "./parts";

/**
 * The crew at home: four people in flight suits with their own stripe colours, standing at work, sitting at the
 * table, exercising, asleep in their bunks or sheltering in the core, as the routine in sim/interior.ts says.
 */
type Pose = "stand" | "sit" | "lie" | "ride";
interface Place {
  x: number;
  z: number;
  level: Level;
  /** Facing, a compass bearing in degrees. */
  yaw: number;
  pose: Pose;
  /** Height of what they sit or lie on. */
  y?: number;
}
const QUARTERS: Record<string, string> = { maya: "q1", alex: "q2", sam: "q3", noor: "q4" };

const block = (id: string) => BLOCKS.find((k) => k.id === id)!;
/** Where a piece's front faces (degrees), and a point in front of it. */
function front(k: Block, out: number) {
  const { c, n, t } = blockAxes(k);
  const f = k.face ?? 0;
  const dir = f === 90 ? t : f === -90 ? { x: -t.x, z: -t.z } : f === 180 ? n : { x: -n.x, z: -n.z };
  const depth = Math.abs(f) === 90 ? k.w : k.d;
  return { x: c.x + dir.x * (depth / 2 + out), z: c.z + dir.z * (depth / 2 + out), facing: (Math.atan2(-dir.x, dir.z) * 180) / Math.PI };
}
/** Sitting on a seat piece, facing the way it faces. */
function seat(id: string, y = 0.45): Place {
  const k = block(id);
  const p = polar(k.bearing, k.r);
  const f = front(k, 0);
  return { x: p.x, z: p.z, level: k.level, yaw: f.facing, pose: "sit", y };
}
/** Standing at a piece of equipment, looking at it. */
function standAt(id: string, out = 0.35): Place {
  const k = block(id);
  const f = front(k, out);
  return { x: f.x, z: f.z, level: k.level, yaw: f.facing + 180, pose: "stand" };
}

function placeFor(id: string, spot: CrewSpot): Place {
  if (spot.startsWith("galley-")) return seat(`galley-chair-${spot.slice(-1)}`);
  if (spot.startsWith("shelter-")) return seat(`shelter-seat-${spot.slice(-1)}`);
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
      return { x: p.x, z: p.z, level: 1, yaw: k.bearing + 90, pose: "stand", y: 0.17 };
    }
    case "cycle": {
      const k = block("exercise-cycle");
      const p = polar(k.bearing, k.r + 0.15);
      return { x: p.x, z: p.z, level: 1, yaw: k.bearing, pose: "ride", y: 0.69 };
    }
    case "bed": {
      const k = block(`${QUARTERS[id]}-bunk`);
      const p = polar(k.bearing, k.r);
      return { x: p.x, z: p.z, level: 1, yaw: k.bearing + 90, pose: "lie", y: 0.58 };
    }
    case "desk": {
      const k = block(`${QUARTERS[id]}-desk`);
      const f = front(k, 0.32);
      return { x: f.x, z: f.z, level: 1, yaw: f.facing + 180, pose: "sit", y: 0.45 };
    }
  }
  return standAt("lab-bench");
}

interface Figure {
  root: THREE.Group;
  hips: THREE.Group;
  legs: THREE.Group[];
  arms: THREE.Group[];
}
/** A crew member in a flight suit: built standing, hips at 0.9 m; the joints turn for other poses. */
function figure(color: string, hair: string, skin: string): Figure {
  const root = keep(new THREE.Group());
  const suit = ifabric("#4b5a6e", 0.85),
    stripe = ipaint(color, 0.55),
    shoe = ipaint("#2a2e35", 0.7),
    face = ipaint(skin, 0.75),
    hairM = ipaint(hair, 0.85);
  const hips = new THREE.Group();
  hips.position.y = 0.9;
  root.add(hips);
  rbox(hips, 0.36, 0.56, 0.22, 0.08, suit, 0, 0.3, 0);
  box(hips, 0.1, 0.05, 0.015, stripe, -0.1, 0.48, 0.115);
  ball(hips, 0.105, face, 0, 0.74, 0.01, 14);
  const cap = ball(hips, 0.11, hairM, 0, 0.77, -0.012, 14);
  cap.scale.set(1, 0.75, 1);
  const legs = [-1, 1].map((s) => {
    const leg = new THREE.Group();
    leg.position.set(s * 0.09, 0, 0);
    hips.add(leg);
    const thigh = new THREE.Group();
    leg.add(thigh);
    capsule(thigh, 0.07, 0.34, suit, 0, -0.22, 0);
    const knee = new THREE.Group();
    knee.position.y = -0.44;
    thigh.add(knee);
    capsule(knee, 0.06, 0.34, suit, 0, -0.2, 0);
    rbox(knee, 0.11, 0.07, 0.24, 0.03, shoe, 0, -0.42, 0.05);
    return thigh;
  });
  const arms = [-1, 1].map((s) => {
    const arm = new THREE.Group();
    arm.position.set(s * 0.23, 0.53, 0);
    hips.add(arm);
    capsule(arm, 0.055, 0.42, suit, 0, -0.25, 0);
    box(arm, 0.12, 0.05, 0.12, stripe, 0, -0.04, 0);
    ball(arm, 0.045, face, 0, -0.52, 0, 10);
    return arm;
  });
  return { root, hips, legs, arms };
}
/** Bend a figure into a pose (in its own frame: the hips over the origin; it's merged afterwards). */
function bend(f: Figure, kind: Pose) {
  if (kind === "sit" || kind === "ride") {
    // Hips on the seat, thighs forward, shins down; hands on the table or the handlebars.
    f.hips.position.set(0, 0.04, 0);
    for (const l of f.legs) {
      l.rotation.x = -Math.PI / 2;
      (l.children[1] as THREE.Group).rotation.x = Math.PI / 2;
    }
    for (const a of f.arms) a.rotation.x = kind === "ride" ? -1.1 : -0.75;
    if (kind === "ride") f.hips.rotation.x = 0.35;
  } else if (kind === "lie") {
    // On their back, face up.
    f.hips.position.set(0, 0.12, 0);
    f.hips.rotation.x = -Math.PI / 2;
  } else for (const a of f.arms) a.rotation.x = -0.25;
}

const POSES: Pose[] = ["stand", "sit", "ride", "lie"];
export function buildCrew(g: THREE.Group) {
  const looks: Record<string, [string, string]> = { maya: ["#2b1e18", "#d9a37f"], alex: ["#3a2a1a", "#a8714f"], sam: ["#151515", "#6b4430"], noor: ["#1d1410", "#b98563"] };
  // Each crew member in each pose, built once and merged (one set of draw calls per person on show).
  const figures = new Map<string, Record<Pose, THREE.Group>>();
  for (const id of ["maya", "alex", "sam", "noor"]) {
    const set = {} as Record<Pose, THREE.Group>;
    for (const kind of POSES) {
      const f = figure(CREW_COLOR[id], ...looks[id]);
      bend(f, kind);
      f.root.name = `crew-${id}-${kind}`;
      f.root.visible = false;
      g.add(f.root);
      set[kind] = f.root;
    }
    figures.set(id, set);
  }
  let last = "";
  return {
    /** Put everyone where the routine says (only when it changes). */
    place(spots: { id: string; spot: CrewSpot | null }[]) {
      const key = spots.map((s) => `${s.id}:${s.spot}`).join("|");
      if (key === last) return;
      last = key;
      for (const { id, spot } of spots) {
        const set = figures.get(id);
        if (!set) continue;
        for (const kind of POSES) set[kind].visible = false;
        if (!spot) continue;
        const p = placeFor(id, spot);
        const root = set[p.pose];
        root.visible = true;
        root.position.set(p.x, HOME.floor[p.level] + (p.y ?? 0), p.z);
        root.rotation.set(0, Math.PI - rad(p.yaw), 0);
      }
    },
  };
}
