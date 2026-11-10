import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { Pose } from "../../sim/crew";
import { ball, capsule, cyl, geo, keep, mesh, rbox, box } from "../kit";
import { ifabric, ipaint } from "./lighting";
import { CREW_COLOR } from "./parts";

/**
 * The crew's bodies: four people in flight suits with their own stripe colours, jointed at the hips, knees and
 * shoulders so they can walk, sit, lie in a bunk or ride the exercise cycle. Each joint's parts are merged (one draw
 * call per material per joint). Posed by `posture()` from a few numbers, so poses blend smoothly into each other.
 */
export interface Body {
  root: THREE.Group;
  hips: THREE.Group;
  /** Thighs (each with its knee as `children[1]`), left then right. */
  legs: THREE.Group[];
  knees: THREE.Group[];
  arms: THREE.Group[];
}
/** Each crew member's hair and skin. */
const LOOKS: Record<string, [string, string]> = { maya: ["#2b1e18", "#d9a37f"], alex: ["#3a2a1a", "#a8714f"], sam: ["#151515", "#6b4430"], noor: ["#1d1410", "#b98563"] };

/** A crew member standing, hips 0.9 m up, facing +z. Every joint is kept (it moves). */
export function crewBody(id: string): Body {
  const [hair, skin] = LOOKS[id];
  const root = keep(new THREE.Group());
  root.name = `crew-${id}`;
  const suit = ifabric("#4b5a6e", 0.85),
    stripe = ipaint(CREW_COLOR[id], 0.55),
    shoe = ipaint("#2a2e35", 0.7),
    face = ipaint(skin, 0.75),
    hairM = ipaint(hair, 0.85);
  const hips = keep(new THREE.Group());
  hips.position.y = 0.9;
  root.add(hips);
  rbox(hips, 0.36, 0.56, 0.22, 0.08, suit, 0, 0.3, 0);
  box(hips, 0.1, 0.05, 0.015, stripe, -0.1, 0.48, 0.115);
  // A belt, a collar and a neck under the head; hair as two shells round it (the top and the back), so the hairline is clean.
  box(hips, 0.37, 0.05, 0.23, ipaint("#2a2e35", 0.6), 0, 0.04, 0);
  cyl(hips, 0.05, 0.055, 0.1, face, 0, 0.61, 0.005, 12);
  cyl(hips, 0.075, 0.085, 0.045, suit, 0, 0.585, 0, 14);
  ball(hips, 0.105, face, 0, 0.725, 0.01, 18);
  mesh(geo("hair-top", () => new THREE.SphereGeometry(0.112, 20, 8, 0, Math.PI * 2, 0, 0.38 * Math.PI)), hairM, hips, 0, 0.725, 0.01);
  mesh(geo("hair-back", () => new THREE.SphereGeometry(0.112, 12, 10, Math.PI, Math.PI, 0, 0.72 * Math.PI)), hairM, hips, 0, 0.725, 0.01);
  const knees: THREE.Group[] = [];
  const legs = [-1, 1].map((s) => {
    const leg = new THREE.Group();
    leg.position.set(s * 0.09, 0, 0);
    hips.add(leg);
    const thigh = keep(new THREE.Group());
    leg.add(thigh);
    capsule(thigh, 0.07, 0.34, suit, 0, -0.22, 0);
    const knee = keep(new THREE.Group());
    knee.position.y = -0.44;
    thigh.add(knee);
    capsule(knee, 0.06, 0.34, suit, 0, -0.2, 0);
    rbox(knee, 0.11, 0.07, 0.24, 0.03, shoe, 0, -0.42, 0.05);
    knees.push(knee);
    return thigh;
  });
  const arms = [-1, 1].map((s) => {
    const arm = keep(new THREE.Group());
    arm.position.set(s * 0.23, 0.53, 0);
    hips.add(arm);
    capsule(arm, 0.055, 0.42, suit, 0, -0.25, 0);
    cyl(arm, 0.062, 0.062, 0.05, stripe, 0, -0.1, 0, 14);
    ball(arm, 0.045, face, 0, -0.52, 0, 10);
    return arm;
  });
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });
  return { root, hips, legs, knees, arms };
}

/** A pose as a handful of joint angles (radians; negative swings a limb forward) and the hips' height and tilt. */
export interface Posture {
  hipsY: number;
  tilt: number;
  thigh: [number, number];
  knee: [number, number];
  arm: [number, number];
}
export const POSTURES: Record<Pose, Posture> = {
  stand: { hipsY: 0.9, tilt: 0, thigh: [0, 0], knee: [0, 0], arm: [-0.12, -0.12] },
  sit: { hipsY: 0.04, tilt: 0, thigh: [-Math.PI / 2, -Math.PI / 2], knee: [Math.PI / 2, Math.PI / 2], arm: [-0.75, -0.75] },
  ride: { hipsY: 0.04, tilt: 0.35, thigh: [-Math.PI / 2, -Math.PI / 2], knee: [Math.PI / 2, Math.PI / 2], arm: [-1.1, -1.1] },
  lie: { hipsY: 0.12, tilt: -Math.PI / 2, thigh: [0, 0], knee: [0, 0], arm: [-0.12, -0.12] },
};
/** Walking: legs and arms swing with the stride's phase, knees bend through the swing, the hips dip between steps. */
export function gait(phase: number, amount: number): Posture {
  const s = Math.sin(phase),
    c = Math.cos(phase);
  const A = 0.4 * amount,
    K = 0.75 * amount,
    B = 0.28 * amount;
  return {
    hipsY: 0.9 - 0.035 * amount * s * s,
    tilt: 0.04 * amount,
    thigh: [-A * s, A * s],
    knee: [K * Math.max(0, c), K * Math.max(0, -c)],
    arm: [-0.12 + B * s, -0.12 - B * s],
  };
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export function mix(a: Posture, b: Posture, t: number): Posture {
  return {
    hipsY: lerp(a.hipsY, b.hipsY, t),
    tilt: lerp(a.tilt, b.tilt, t),
    thigh: [lerp(a.thigh[0], b.thigh[0], t), lerp(a.thigh[1], b.thigh[1], t)],
    knee: [lerp(a.knee[0], b.knee[0], t), lerp(a.knee[1], b.knee[1], t)],
    arm: [lerp(a.arm[0], b.arm[0], t), lerp(a.arm[1], b.arm[1], t)],
  };
}
export function posture(b: Body, p: Posture) {
  b.hips.position.y = p.hipsY;
  b.hips.rotation.x = p.tilt;
  for (let i = 0; i < 2; i++) {
    b.legs[i].rotation.x = p.thigh[i];
    b.knees[i].rotation.x = p.knee[i];
    b.arms[i].rotation.x = p.arm[i];
  }
}

/** Merge each joint's own parts by material (its moving children stay separate): a few draw calls per person. */
export function mergeJoints(root: THREE.Object3D) {
  const joints: THREE.Object3D[] = [];
  root.traverse((o) => {
    if (o.userData.keep && !(o as THREE.Mesh).isMesh) joints.push(o);
  });
  for (const j of joints) {
    j.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(j.matrixWorld).invert();
    const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
    const drop: THREE.Mesh[] = [];
    j.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || Array.isArray(m.material)) return;
      for (let a: THREE.Object3D | null = m.parent; a && a !== j; a = a.parent) if (a.userData.keep) return;
      const g = m.geometry.clone();
      if (!g.index) g.setIndex([...Array(g.attributes.position.count).keys()]);
      for (const name of Object.keys(g.attributes)) if (name !== "position" && name !== "normal" && name !== "uv") g.deleteAttribute(name);
      if (!g.attributes.uv) g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
      const list = byMat.get(m.material);
      if (list) list.push(g);
      else byMat.set(m.material, [g]);
      drop.push(m);
    });
    for (const m of drop) m.parent?.remove(m);
    for (const [mat, list] of byMat) {
      const merged = mergeGeometries(list, false);
      for (const g of list) g.dispose();
      if (!merged) continue;
      const out = new THREE.Mesh(merged, mat);
      out.castShadow = true;
      out.receiveShadow = true;
      out.userData.keep = true;
      j.add(out);
    }
  }
}
