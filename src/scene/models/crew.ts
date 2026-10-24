import * as THREE from "three";
import type { Planet } from "../../sim/types";
import { ball, box, capsule, cyl, fabric, finalize, geo, keep, lathe, light, mesh, metal, paint, rbox, rubber, shared, torus } from "../kit";
import { C } from "./common";

const HIP = 0.96;

/** A gold-coated sun visor: a mirror that shows the sky and the ground. */
function goldVisor() {
  return shared("gold-visor", () => new THREE.MeshPhysicalMaterial({ color: "#d9a640", metalness: 1, roughness: 0.07, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.6 }));
}

function joint<T extends THREE.Object3D>(parent: THREE.Object3D, x: number, y: number, z: number, o?: T) {
  const j = keep(o ?? new THREE.Group());
  j.position.set(x, y, z);
  parent.add(j);
  return j;
}

/**
 * An astronaut in a white surface suit (hard upper torso, life-support backpack,
 * bubble helmet with a gold visor). Jointed at hips, knees, shoulders and elbows.
 * `stripe` marks who is who (commanders wear red).
 */
export function buildAstronaut(stripe = "#ff8a3d") {
  const g = new THREE.Group();
  const suit = fabric("#f1f2f0", 0.86),
    soft = fabric("#e3e5e6", 0.9),
    ring = metal("#a9b2c0", 0.35),
    boot = rubber("#4a4f58"),
    sole = rubber("#23262c"),
    glove = fabric("#d8dade", 0.85),
    mark = paint(stripe, 0.55, 0),
    dark = paint(C.dark, 0.6, 0.3);

  const hips = joint(g, 0, HIP, 0);
  // Brief: the lower torso and its bearing ring.
  lathe(hips, "suit-brief", [[0, -0.12], [0.17, -0.11], [0.2, -0.04], [0.19, 0.05], [0.17, 0.1], [0, 0.1]], soft, 0, 0, 0, 20).scale.z = 0.78;
  const legs: THREE.Object3D[] = [],
    knees: THREE.Object3D[] = [];
  for (const sx of [-1, 1]) {
    const hip = joint(hips, sx * 0.11, -0.05, 0);
    capsule(hip, 0.095, 0.26, suit, 0, -0.21, 0);
    torus(hip, 0.097, 0.018, soft, 0, -0.12, 0).rotation.x = Math.PI / 2;
    box(hip, 0.02, 0.12, 0.12, mark, sx * 0.095, -0.2, 0);
    const knee = joint(hip, 0, -0.42, 0);
    ball(knee, 0.095, soft, 0, 0, 0, 14);
    capsule(knee, 0.085, 0.24, suit, 0, -0.2, 0);
    // Boot with a rigid sole and a toe cap.
    rbox(knee, 0.17, 0.15, 0.3, 0.05, boot, 0, -0.42, -0.04);
    rbox(knee, 0.18, 0.04, 0.32, 0.015, sole, 0, -0.495, -0.04);
    torus(knee, 0.088, 0.016, ring, 0, -0.34, 0).rotation.x = Math.PI / 2;
    legs.push(hip);
    knees.push(knee);
  }

  const upper = joint(g, 0, HIP, 0);
  // Hard upper torso: a shaped shell from the waist bearing to the neck ring.
  const torsoShape: [number, number][] = [[0, 0.06], [0.18, 0.07], [0.2, 0.14], [0.235, 0.3], [0.25, 0.42], [0.24, 0.52], [0.2, 0.6], [0.13, 0.64], [0, 0.65]];
  lathe(upper, "suit-hut", torsoShape, suit, 0, 0, 0, 24).scale.z = 0.72;
  torus(upper, 0.18, 0.025, ring, 0, 0.08, 0).rotation.x = Math.PI / 2;
  torus(upper, 0.13, 0.03, ring, 0, 0.64, 0).rotation.x = Math.PI / 2;
  // Display and control module on the chest.
  rbox(upper, 0.26, 0.13, 0.08, 0.025, paint(C.grey, 0.5, 0.25), 0, 0.42, -0.2);
  box(upper, 0.12, 0.05, 0.01, paint("#10151d", 0.3, 0.3), -0.04, 0.44, -0.245);
  ball(upper, 0.016, light("#3ee39a", 1.6), 0.08, 0.44, -0.245, 6);
  for (const x of [-0.07, 0.0, 0.07]) cyl(upper, 0.012, 0.012, 0.02, dark, x, 0.385, -0.245, 8).rotation.x = Math.PI / 2;
  box(upper, 0.22, 0.04, 0.012, mark, 0, 0.53, -0.18);
  // Portable life-support backpack.
  rbox(upper, 0.46, 0.58, 0.22, 0.06, paint("#e6e8ea", 0.6, 0.05), 0, 0.37, 0.27);
  rbox(upper, 0.4, 0.12, 0.05, 0.02, paint(C.grey, 0.55, 0.2), 0, 0.12, 0.39);
  for (let i = 0; i < 4; i++) box(upper, 0.3, 0.012, 0.012, dark, 0, 0.5 + i * 0.035, 0.385);
  box(upper, 0.36, 0.06, 0.012, mark, 0, 0.62, 0.385);
  cyl(upper, 0.012, 0.012, 0.16, metal(), 0.17, 0.72, 0.3, 6);
  // Helmet: a hard shell at the back, a clear bubble, a gold visor and two lamps.
  const head = upper;
  const shell = ball(head, 0.2, paint("#f3f4f5", 0.45, 0.05), 0, 0.84, 0.02, 24);
  shell.scale.set(1, 1.02, 1);
  // Visor: the front of a slightly larger sphere, covering the face opening.
  mesh(geo("suit-visor", () => new THREE.SphereGeometry(0.208, 28, 16, Math.PI + 0.4, Math.PI - 0.8, 0.72, 1.32)), goldVisor(), head, 0, 0.85, 0.0);
  for (const sx of [-1, 1]) {
    rbox(head, 0.06, 0.05, 0.08, 0.015, paint(C.grey, 0.5, 0.3), sx * 0.19, 0.98, -0.03);
    box(head, 0.04, 0.03, 0.01, light("#fff3d6", 1.4), sx * 0.19, 0.98, -0.075);
  }
  // Arms: shoulder bearings, upper arms, elbows, forearms and gloves.
  const arms: THREE.Object3D[] = [],
    elbows: THREE.Object3D[] = [];
  for (const sx of [-1, 1]) {
    torus(upper, 0.085, 0.022, ring, sx * 0.26, 0.5, 0).rotation.y = Math.PI / 2;
    const shoulder = joint(upper, sx * 0.3, 0.5, 0);
    ball(shoulder, 0.085, soft, 0, 0, 0, 14);
    capsule(shoulder, 0.075, 0.17, suit, 0, -0.16, 0);
    box(shoulder, 0.012, 0.1, 0.09, mark, sx * 0.075, -0.12, 0);
    const elbow = joint(shoulder, 0, -0.3, 0);
    ball(elbow, 0.07, soft, 0, 0, 0, 12);
    capsule(elbow, 0.065, 0.16, suit, 0, -0.14, 0);
    torus(elbow, 0.068, 0.016, ring, 0, -0.25, 0).rotation.x = Math.PI / 2;
    rbox(elbow, 0.09, 0.12, 0.07, 0.03, glove, 0, -0.33, -0.01);
    arms.push(shoulder);
    elbows.push(elbow);
  }
  finalize(g);
  g.userData.legs = legs;
  g.userData.knees = knees;
  g.userData.arms = arms;
  g.userData.elbows = elbows;
  g.userData.upper = upper;
  g.userData.hips = hips;
  return g;
}

/**
 * Pose an astronaut for this frame and return how high to lift it.
 * On the Moon (1/6 g) crews lope: a slow, springy skip with both feet nearly together.
 * On Mars (3/8 g) it is closer to an ordinary walk, with a lighter bounce than on Earth.
 */
export function poseAstronaut(w: THREE.Object3D, t: number, walking: boolean, planet: Planet, seed: number) {
  const legs = w.userData.legs as THREE.Object3D[],
    knees = w.userData.knees as THREE.Object3D[],
    arms = w.userData.arms as THREE.Object3D[],
    elbows = w.userData.elbows as THREE.Object3D[],
    upper = w.userData.upper as THREE.Object3D;
  if (!walking) {
    // Working at a site: crouch a little and reach down with the right hand.
    const k = Math.sin(t * 2.2 + seed) * 0.5 + 0.5;
    upper.rotation.x = 0.28 + k * 0.08;
    legs[0].rotation.x = 0.35;
    legs[1].rotation.x = 0.1;
    knees[0].rotation.x = -0.55;
    knees[1].rotation.x = -0.3;
    arms[0].rotation.x = 0.3;
    elbows[0].rotation.x = 0.4;
    arms[1].rotation.x = 0.9 + k * 0.25;
    elbows[1].rotation.x = 0.3 + k * 0.3;
    return -0.06;
  }
  if (planet === "moon") {
    const p = t * 4.6 + seed;
    const air = Math.max(0, Math.sin(p));
    for (let i = 0; i < 2; i++) {
      const lead = i ? 0.5 : 0;
      legs[i].rotation.x = 0.15 + Math.sin(p + lead) * 0.32;
      knees[i].rotation.x = -0.2 - (1 - air) * 0.45;
      arms[i].rotation.x = 0.25 + Math.sin(p + 1.5) * 0.15;
      elbows[i].rotation.x = 0.55;
    }
    upper.rotation.x = 0.16;
    return air ** 0.8 * 0.24;
  }
  const p = t * 6.2 + seed;
  for (let i = 0; i < 2; i++) {
    const q = p + i * Math.PI;
    legs[i].rotation.x = Math.sin(q) * 0.42;
    knees[i].rotation.x = -0.08 - Math.max(0, Math.cos(q)) * 0.6;
    arms[i].rotation.x = -Math.sin(q) * 0.32;
    elbows[i].rotation.x = 0.3 + Math.max(0, -Math.sin(q)) * 0.25;
  }
  upper.rotation.x = 0.08;
  return Math.abs(Math.cos(p)) * 0.05;
}
