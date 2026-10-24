import * as THREE from "three";
import {
  ball,
  bolts,
  box,
  contactShadow,
  cone,
  cyl,
  finalize,
  geo,
  grille,
  keep,
  lathe,
  light,
  metal,
  mesh,
  paint,
  panel,
  pipe,
  rbox,
  rubber,
  strut,
  torus,
  visor,
  windowPane,
} from "../kit";
import { C, cells, label } from "./common";


export interface RoverView {
  group: THREE.Group;
  /** The sprung body (everything but the wheels): it bobs a little over bumps. */
  body: THREE.Object3D;
  wheels: THREE.Object3D[];
  /** Resting height of the wheel centres; the scene moves each wheel up or down to meet the ground. */
  wheelY: number;
  /** Window glass and frames, hidden in the driver's view so the crew can see out. */
  glass: THREE.Object3D[];
  heads: THREE.MeshStandardMaterial;
  tail: THREE.MeshStandardMaterial;
  beacon: THREE.MeshStandardMaterial;
  arm: THREE.Object3D;
}

/** The cabin's side outline: [forward, height]; extruded across the rover's width. */
function cabinGeometry() {
  return geo("rover-cabin", () => {
    const s = new THREE.Shape();
    s.moveTo(-1.82, 1.0);
    s.lineTo(1.82, 1.0);
    s.quadraticCurveTo(2.0, 1.0, 2.0, 1.18);
    s.lineTo(2.0, 1.36);
    s.quadraticCurveTo(1.98, 1.6, 1.78, 1.64);
    s.lineTo(1.56, 1.7);
    s.quadraticCurveTo(1.48, 1.72, 1.44, 1.8);
    s.lineTo(1.02, 2.3);
    s.quadraticCurveTo(0.95, 2.42, 0.78, 2.43);
    s.lineTo(-1.58, 2.43);
    s.quadraticCurveTo(-1.85, 2.42, -1.86, 2.18);
    s.lineTo(-1.86, 1.2);
    s.quadraticCurveTo(-1.86, 1.0, -1.82, 1.0);
    const bevel = 0.12;
    const g = new THREE.ExtrudeGeometry(s, { depth: 2.12 - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 5, curveSegments: 10 });
    g.rotateY(Math.PI / 2);
    g.translate(-(2.12 - bevel * 2) / 2, 0, 0);
    g.computeVertexNormals();
    return g;
  });
}

/** A tyre: a rounded tread band around a rim, with chevron lugs; its axle runs along x. */
function buildWheel(w: THREE.Group, side: number) {
  const tyre = rubber("#1e2128"),
    rim = metal("#b8c0cc", 0.32),
    hub = metal("#5d6573", 0.45);
  const band = lathe(
    w,
    "tyre",
    [
      [0.3, -0.18],
      [0.41, -0.185],
      [0.455, -0.16],
      [0.475, -0.1],
      [0.478, 0],
      [0.475, 0.1],
      [0.455, 0.16],
      [0.41, 0.185],
      [0.3, 0.18],
    ],
    tyre,
    0,
    0,
    0,
    40,
  );
  band.rotation.z = Math.PI / 2;
  // Chevron lugs: two angled blocks per step, meeting in a V.
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    for (const k of [-1, 1]) {
      const lug = box(w, 0.16, 0.035, 0.07, tyre, k * 0.075, Math.cos(a) * 0.485, Math.sin(a) * 0.485);
      lug.rotation.set(-a, k * 0.45, 0);
    }
  }
  // Rim, spokes and hub on the outer side.
  const out = side * 0.19;
  const r0 = cyl(w, 0.31, 0.31, 0.3, rim, 0, 0, 0, 28);
  r0.rotation.z = Math.PI / 2;
  torus(w, 0.3, 0.022, rim, out, 0, 0).rotation.y = Math.PI / 2;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    strut(w, out, Math.cos(a) * 0.09, Math.sin(a) * 0.09, out, Math.cos(a) * 0.29, Math.sin(a) * 0.29, 0.028, rim, 6);
  }
  const cap = cyl(w, 0.11, 0.13, 0.08, hub, out, 0, 0, 18);
  cap.rotation.z = Math.PI / 2;
  bolts(w, 6, 0.07, rim, out + side * 0.045, 0, 0, 0.012).rotation.y = (side * Math.PI) / 2;
}

/** A small pressurised rover: the crew drive in shirt-sleeves and step out through suitports at the back. */
export function buildRover(): RoverView {
  const g = new THREE.Group();
  const body = keep(new THREE.Group());
  g.add(body);
  const white = paint(C.white, 0.42, 0.08),
    chassisMat = metal("#4b5260", 0.5),
    frame = metal("#9aa3b4", 0.38),
    dark = paint(C.dark, 0.6, 0.35),
    seal = rubber("#24272d"),
    orange = paint(C.orange, 0.5);
  contactShadow(g, 1.9, 2.9, 0.55, 0.03);
  // Chassis: frame rails, cross members, bumpers and an equipment tray underneath.
  for (const sx of [-1, 1]) box(body, 0.16, 0.22, 4.1, chassisMat, sx * 0.72, 0.86, 0);
  for (const z of [-1.7, -0.65, 0.65, 1.7]) box(body, 1.5, 0.12, 0.14, chassisMat, 0, 0.84, z);
  rbox(body, 1.3, 0.22, 2.6, 0.05, dark, 0, 0.68, 0);
  rbox(body, 2.05, 0.18, 0.2, 0.06, chassisMat, 0, 0.92, -2.08);
  rbox(body, 1.9, 0.16, 0.18, 0.06, chassisMat, 0, 0.9, 2.02);
  // The pressurised cabin.
  mesh(cabinGeometry(), white, body);
  // Panel seams, a hazard-orange belt line and the name.
  for (const sx of [-1, 1]) {
    box(body, 0.01, 0.06, 3.5, orange, sx * 1.065, 1.36, 0.05);
    box(body, 0.008, 1.2, 0.01, paint(C.grey, 0.6), sx * 1.062, 1.72, 0.55);
    box(body, 0.008, 1.2, 0.01, paint(C.grey, 0.6), sx * 1.062, 1.72, 1.25);
    label(body, "ASTRA ROVER 1", 1.2, sx * 1.07, 1.18, 0.7).rotation.y = (sx * Math.PI) / 2;
  }
  // Windows: a big windshield and two side windows, in framed glass.
  const glassList: THREE.Object3D[] = [];
  const shieldGlass = keep(windowPane(body, 1.7, 0.72, 0.1, frame, visor("#162236"), seal, 0, 2.15, -1.345, 0.06));
  shieldGlass.rotation.x = Math.PI + 0.71;
  glassList.push(shieldGlass);
  for (const sx of [-1, 1]) {
    const side = keep(windowPane(body, 0.95, 0.42, 0.08, frame, visor("#162236"), seal, sx * 1.075, 2.0, -0.25, 0.05));
    side.rotation.y = (sx * Math.PI) / 2;
    glassList.push(side);
  }
  // Roof: solar panel on a frame, a light bar, a sensor mast with cameras and lidar, antennas.
  rbox(body, 1.6, 0.05, 1.55, 0.02, frame, 0, 2.47, 0.55);
  box(body, 1.5, 0.03, 1.45, cells(1.5, 1.4), 0, 2.505, 0.55);
  for (const sx of [-1, 1]) for (const z of [-0.1, 1.2]) cyl(body, 0.02, 0.02, 0.06, frame, sx * 0.7, 2.46, z, 6);
  const heads = light("#fff3d6", 2.5);
  rbox(body, 1.3, 0.12, 0.16, 0.04, dark, 0, 2.5, -0.6);
  for (let i = 0; i < 4; i++) box(body, 0.22, 0.06, 0.03, heads, -0.45 + i * 0.3, 2.5, -0.69);
  cyl(body, 0.035, 0.045, 0.5, frame, 0.55, 2.7, -0.45, 8);
  rbox(body, 0.34, 0.14, 0.14, 0.03, dark, 0.55, 2.98, -0.45);
  for (const sx of [-1, 1]) ball(body, 0.035, visor("#0a0e16"), 0.55 + sx * 0.1, 2.98, -0.53, 10);
  cyl(body, 0.06, 0.06, 0.07, dark, 0.55, 3.09, -0.45, 14);
  cyl(body, 0.015, 0.015, 1.0, frame, -0.75, 2.95, 1.25, 6);
  const beacon = light("#ff4d5e", 3);
  ball(body, 0.05, beacon, -0.75, 3.47, 1.25, 8);
  const dishPivot = new THREE.Group();
  dishPivot.position.set(0.62, 2.62, 1.35);
  dishPivot.rotation.x = -0.6;
  body.add(dishPivot);
  const dishMat = new THREE.MeshStandardMaterial({ color: "#eef0f3", roughness: 0.45, side: THREE.DoubleSide });
  mesh(geo("rover-dish", () => new THREE.LatheGeometry([0, 0.08, 0.16, 0.24, 0.29].map((r) => new THREE.Vector2(r, r * r * 0.6)), 28)), dishMat, dishPivot);
  cyl(body, 0.03, 0.03, 0.18, frame, 0.62, 2.53, 1.35, 6);
  // Headlights (deep housings with lenses), tail and marker lights.
  for (const x of [-0.62, 0.62]) {
    rbox(body, 0.42, 0.2, 0.12, 0.04, dark, x, 1.18, -2.02);
    box(body, 0.34, 0.12, 0.02, heads, x, 1.18, -2.085);
  }
  const tail = light("#ff5a3d", 1.8);
  for (const x of [-0.82, 0.82]) {
    rbox(body, 0.26, 0.14, 0.06, 0.03, dark, x, 1.12, 1.98);
    box(body, 0.2, 0.08, 0.02, tail, x, 1.12, 2.015);
  }
  const marker = light("#ffb020", 1.6);
  for (const sx of [-1, 1]) for (const z of [-1.65, 1.6]) box(body, 0.02, 0.05, 0.1, marker, sx * 1.075, 1.12, z);
  // Rear wall: two suitports (spacesuits dock here from outside), a ladder and a step.
  for (const x of [-0.5, 0.5]) {
    torus(body, 0.36, 0.06, frame, x, 1.78, 1.99);
    torus(body, 0.3, 0.025, seal, x, 1.78, 2.02);
    const port = lathe(body, "suitport", [[0, 0.05], [0.24, 0.045], [0.3, 0.02], [0.31, 0], [0, -0.02]], paint(C.off, 0.5, 0.15), x, 1.78, 2.0, 32);
    port.rotation.x = Math.PI / 2;
    pipe(body, [[x - 0.12, 2.1, 2.04], [x - 0.12, 2.16, 2.09], [x + 0.12, 2.16, 2.09], [x + 0.12, 2.1, 2.04]], 0.015, frame, 5);
  }
  panel(body, 1.6, 0.32, 0.05, 0.02, paint("#4a5263", 0.8, 0.3), 0, 1.0, 2.2).rotation.x = -Math.PI / 2;
  grille(body, 1.4, 0.26, 6, dark, frame, 0, 1.03, 2.2).rotation.x = -Math.PI / 2;
  for (const sx of [-1, 1]) strut(body, sx * 0.86, 1.1, 2.02, sx * 0.86, 2.3, 2.02, 0.02, frame);
  for (let i = 0; i < 4; i++) box(body, 0.04, 0.02, 0.06, frame, 0.86, 1.3 + i * 0.28, 2.06);
  // Side lockers with latches, handrails and a stowed tool rack.
  for (const sx of [-1, 1]) {
    const lx = sx * 1.12;
    rbox(body, 0.12, 0.44, 1.05, 0.03, paint(C.grey, 0.5, 0.3), lx, 1.62, 1.0);
    for (const z of [0.66, 1.33]) rbox(body, 0.03, 0.08, 0.05, 0.01, frame, lx + sx * 0.06, 1.62, z);
    pipe(body, [[sx * 1.08, 2.18, 0.4], [sx * 1.14, 2.22, 0.45], [sx * 1.14, 2.22, 1.55], [sx * 1.08, 2.18, 1.6]], 0.018, frame, 5);
  }
  // Fenders over each wheel (arched), suspension arms, shock absorbers with springs.
  const wheelY = 0.47;
  for (const z of [-1.3, 0, 1.3])
    for (const sx of [-1, 1]) {
      const fender = torus(body, 0.6, 0.06, dark, sx * 1.2, wheelY, z, Math.PI * 0.8);
      fender.rotation.set(0, Math.PI / 2, Math.PI * 0.1);
      const fenderTop = box(body, 0.5, 0.05, 1.05, dark, sx * 1.2, 1.06, z);
      fenderTop.position.y = 1.07;
      strut(body, sx * 0.8, 0.86, z - 0.35, sx * 1.05, wheelY, z, 0.04, frame);
      strut(body, sx * 0.8, 0.86, z + 0.35, sx * 1.05, wheelY, z, 0.04, frame);
      cyl(body, 0.06, 0.06, 0.28, chassisMat, sx * 1.02, 0.86, z + 0.18, 10);
      const spring = pipe(
        body,
        Array.from({ length: 13 }, (_, k): [number, number, number] => {
          const a = k * 1.2;
          return [sx * 1.02 + Math.cos(a) * 0.075, 0.62 + k * 0.03, z + 0.18 + Math.sin(a) * 0.075];
        }),
        0.012,
        metal("#d9a441", 0.35),
        4,
      );
      spring.castShadow = false;
      rbox(body, 0.16, 0.24, 0.24, 0.04, chassisMat, sx * 1.0, wheelY, z);
    }
  // Wheels: their own groups so they can spin, and rise or fall to meet the ground.
  const wheels: THREE.Object3D[] = [];
  for (const z of [-1.3, 0, 1.3])
    for (const sx of [-1, 1]) {
      const w = keep(new THREE.Group());
      w.position.set(sx * 1.2, wheelY, z);
      g.add(w);
      buildWheel(w, sx);
      wheels.push(w);
    }
  // Robotic arm, stowed along the front right: turret, two links, a wrist and a gripper.
  const arm = keep(new THREE.Group());
  arm.position.set(0.82, 1.24, -1.95);
  body.add(arm);
  cyl(arm, 0.11, 0.13, 0.12, dark, 0, 0, 0, 16);
  ball(arm, 0.08, frame, 0, 0.1, 0, 12);
  strut(arm, 0, 0.1, 0, 0, 0.32, -0.42, 0.045, frame);
  ball(arm, 0.065, dark, 0, 0.32, -0.42, 12);
  strut(arm, 0, 0.32, -0.42, -0.02, -0.06, -0.62, 0.035, frame);
  cyl(arm, 0.055, 0.055, 0.1, dark, -0.02, -0.1, -0.64, 12);
  for (const k of [-1, 1]) {
    const f = box(arm, 0.025, 0.12, 0.04, frame, -0.02 + k * 0.035, -0.2, -0.64);
    f.rotation.z = k * 0.25;
  }
  cone(arm, 0.04, 0.05, visor("#0a0e16"), 0.06, -0.06, -0.62, 10);
  finalize(g);
  return { group: g, body, wheels, wheelY, glass: glassList, heads, tail, beacon, arm };
}

