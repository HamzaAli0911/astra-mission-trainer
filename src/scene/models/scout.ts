import * as THREE from "three";
import { ball, bolts, box, cone, cyl, finalize, foil, keep, lathe, metal, paint, panel, pipe, rbox, strut, torus, visor } from "../kit";
import { label } from "./common";

/**
 * The science rover: a robotic, six-wheeled explorer in the style of the big Mars rovers, with rocker-bogie
 * suspension, four steerable corner wheels, a camera mast, a robotic arm with a tool turret and a nuclear
 * power source (an RTG) at the back. Original design: no real agency's markings.
 *
 * Group coordinates at rest: origin on the ground under the rover's centre, x right, y up, −z forward.
 */
export const SCOUT = {
  /** Wheel radius, to the tips of the grousers. */
  R: 0.265,
  /** Wheel centres: across (x) and along (z: front, middle, rear). */
  track: 1.13,
  z: [-1.12, 0.12, 1.1] as const,
  /** Rocker pivot on each side of the body, and the bogie pivot. */
  pivot: { x: 0.8, y: 0.98, z: -0.2 },
  bogie: { x: 0.92, y: 0.62, z: 0.62 },
};

export interface ScoutView {
  group: THREE.Group;
  /** The body (turns about the rocker pivots), the rockers and bogies (left, right). */
  body: THREE.Object3D;
  rockers: THREE.Object3D[];
  bogies: THREE.Object3D[];
  /** Per wheel (front L/R, middle L/R, rear L/R): the steering frame and the spinning wheel. */
  steer: THREE.Object3D[];
  spin: THREE.Object3D[];
  /** The differential bar across the deck that links the two rockers. */
  diff: THREE.Object3D;
  /** The mast head: pans, then tilts. */
  pan: THREE.Object3D;
  tilt: THREE.Object3D;
  /** Arm joints: azimuth, shoulder, elbow, wrist, and the tool turret. */
  arm: THREE.Object3D[];
  /** Where the mast camera looks from (in the tilt frame). */
  eye: THREE.Vector3;
}

const mats = () => ({
  white: paint("#eceef1", 0.48, 0.08),
  grey: paint("#a8aeb7", 0.45, 0.25),
  dark: paint("#2a2e35", 0.55, 0.35),
  black: paint("#17191d", 0.62, 0.3),
  fins: metal("#4a4f57", 0.45),
  alu: metal("#c6cbd2", 0.3),
  ti: metal("#9ea3aa", 0.38),
  gold: foil("#c99a3a"),
  copper: metal("#b87a4b", 0.4),
  lens: visor("#0b0f17"),
});
type Mats = ReturnType<typeof mats>;

/** One wheel: an aluminium drum with chevron grousers, curved titanium spokes and a hub motor. Axle along x. */
function buildWheel(spin: THREE.Object3D, side: number, m: Mats) {
  const R = SCOUT.R - 0.018,
    W = 0.4;
  const drum = lathe(spin, "scout-drum", [
    [R - 0.012, -W / 2],
    [R, -W / 2 + 0.012],
    [R, W / 2 - 0.012],
    [R - 0.012, W / 2],
    [R - 0.02, W / 2],
    [R - 0.02, -W / 2],
  ], m.alu, 0, 0, 0, 40);
  drum.rotation.z = Math.PI / 2;
  // Grousers: low ridges in a chevron, 24 round the tread (each is a thin plate standing on the drum).
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    for (const k of [-1, 1]) {
      const g = box(spin, 0.205, 0.016, 0.01, m.alu, k * 0.1, Math.cos(a) * (R + 0.007), Math.sin(a) * (R + 0.007));
      g.rotation.set(a, k * 0.3, 0);
    }
  }
  // The outer face: a rim lip, six S-shaped spokes, and the hub motor.
  const out = side * (W / 2 - 0.02);
  torus(spin, R - 0.012, 0.012, m.alu, out, 0, 0).rotation.y = Math.PI / 2;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const pt = (r: number, da: number): [number, number, number] => [out + side * 0.012 * (1 - r / R), Math.cos(a + da) * r, Math.sin(a + da) * r];
    pipe(spin, [pt(0.075, 0), pt(0.13, 0.32), pt(0.19, 0.38), pt(R - 0.02, 0.62)], 0.011, m.alu, 6);
  }
  const hub = cyl(spin, 0.085, 0.085, 0.16, m.alu, side * 0.08, 0, 0, 24);
  hub.rotation.z = Math.PI / 2;
  const cap = cyl(spin, 0.062, 0.075, 0.035, m.dark, out + side * 0.012, 0, 0, 20);
  cap.rotation.z = Math.PI / 2;
  bolts(spin, 6, 0.045, m.alu, out + side * 0.03, 0, 0, 0.008).rotation.y = (side * Math.PI) / 2;
  // The open inner side shows the drum's inside: a dark liner.
  const liner = lathe(spin, "scout-liner", [
    [R - 0.022, -W / 2 + 0.01],
    [R - 0.022, W / 2 - 0.01],
  ], m.dark, 0, 0, 0, 32);
  liner.rotation.z = Math.PI / 2;
}

/**
 * A wheel's mount, on the rocker or bogie at the hub: a steering actuator above the wheel (corner wheels), the
 * leg down its inner side, and the spinning wheel.
 */
function buildCorner(parent: THREE.Object3D, x: number, y: number, z: number, side: number, steers: boolean, m: Mats) {
  const mount = new THREE.Group();
  mount.position.set(x, y, z);
  parent.add(mount);
  const steer = keep(new THREE.Group());
  mount.add(steer);
  const top = 0.42,
    inner = -side * 0.24;
  if (steers) {
    // The steering actuator sits right above the wheel, on its vertical axis.
    cyl(steer, 0.06, 0.06, 0.12, m.grey, 0, top, 0, 20);
    cyl(steer, 0.066, 0.066, 0.02, m.grey, 0, top + 0.065, 0, 20);
    cyl(steer, 0.045, 0.045, 0.05, m.ti, 0, top - 0.08, 0, 16);
  } else cyl(steer, 0.045, 0.045, 0.08, m.grey, inner * 0.5, top, 0, 16);
  // The leg: over and down the inside of the wheel to the axle.
  pipe(steer, [[0, top - 0.1, 0], [inner * 0.55, top - 0.12, 0], [inner, top - 0.24, 0], [inner, 0.05, 0]], 0.03, m.ti, 8);
  rbox(steer, 0.07, 0.12, 0.1, 0.02, m.grey, inner, 0, 0);
  const axle = cyl(steer, 0.035, 0.035, 0.1, m.ti, inner + side * 0.06, 0, 0, 12);
  axle.rotation.z = Math.PI / 2;
  const spin = keep(new THREE.Group());
  steer.add(spin);
  buildWheel(spin, side, m);
  return { steer, spin };
}

/** The tool turret at the end of the arm: a drill, a camera, a spectrometer, a brush and a scoop round a hub. */
function buildTurret(t: THREE.Object3D, m: Mats) {
  cyl(t, 0.09, 0.09, 0.12, m.alu, 0, 0, 0, 20);
  ball(t, 0.06, m.dark, 0, 0.07, 0, 14);
  const tools: [string, number][] = [
    ["drill", 0],
    ["camera", 1.25],
    ["spectro", 2.5],
    ["brush", 3.75],
    ["scoop", 5.0],
  ];
  for (const [kind, a] of tools) {
    const g = new THREE.Group();
    g.rotation.y = a;
    t.add(g);
    const arm = rbox(g, 0.06, 0.06, 0.12, 0.015, m.white, 0, -0.02, -0.11);
    arm.castShadow = true;
    if (kind === "drill") {
      rbox(g, 0.11, 0.2, 0.11, 0.02, m.white, 0, -0.12, -0.2);
      cyl(g, 0.012, 0.012, 0.14, m.alu, 0, -0.28, -0.2, 10);
      cone(g, 0.012, 0.03, m.alu, 0, -0.36, -0.2, 10).rotation.x = Math.PI;
    } else if (kind === "camera") {
      rbox(g, 0.1, 0.09, 0.08, 0.015, m.dark, 0, -0.08, -0.2);
      cyl(g, 0.026, 0.026, 0.02, m.dark, 0, -0.13, -0.2, 16);
    } else if (kind === "spectro") {
      cyl(g, 0.04, 0.035, 0.12, m.alu, 0, -0.1, -0.2, 16);
      cyl(g, 0.03, 0.03, 0.01, m.dark, 0, -0.165, -0.2, 16);
    } else if (kind === "brush") {
      cyl(g, 0.03, 0.03, 0.08, m.alu, 0, -0.08, -0.2, 12);
      cyl(g, 0.045, 0.045, 0.02, m.dark, 0, -0.13, -0.2, 16);
    } else {
      rbox(g, 0.12, 0.09, 0.1, 0.015, m.white, 0, -0.08, -0.2);
      box(g, 0.1, 0.03, 0.06, m.alu, 0, -0.14, -0.2);
    }
  }
}

export function buildScout(): ScoutView {
  const m = mats();
  const g = new THREE.Group();
  const P = SCOUT.pivot,
    B = SCOUT.bogie,
    R = SCOUT.R,
    T = SCOUT.track,
    [ZF, ZM, ZR] = SCOUT.z;

  // The body turns about the rocker pivots: its frame sits on their axis, and `inner` puts things back where
  // they are drawn (in rest coordinates).
  const body = keep(new THREE.Group());
  body.position.set(0, P.y, P.z);
  g.add(body);
  const inner = new THREE.Group();
  inner.position.set(0, -P.y, -P.z);
  body.add(inner);

  // The warm electronics box: white panels, a darker deck plate, insulated sides and a belly pan.
  rbox(inner, 1.3, 0.5, 1.82, 0.05, m.white, 0, 1.02, -0.02);
  panel(inner, 1.36, 1.9, 0.03, 0.03, m.grey, 0, 1.29, -0.02).rotation.x = -Math.PI / 2;
  rbox(inner, 1.22, 0.06, 1.7, 0.02, m.dark, 0, 0.75, -0.02);
  for (const s of [-1, 1]) {
    // Ribbed side panels and an insulated band.
    for (let i = 0; i < 7; i++) box(inner, 0.012, 0.36, 0.05, m.grey, s * 0.656, 1.02, -0.78 + i * 0.25);
    box(inner, 0.008, 0.16, 1.6, m.gold, s * 0.653, 0.86, -0.02);
    // Cable runs and connector boxes along the sides.
    pipe(inner, [[s * 0.665, 1.18, -0.85], [s * 0.67, 1.2, -0.2], [s * 0.665, 1.16, 0.7]], 0.014, m.dark, 6);
    rbox(inner, 0.05, 0.12, 0.18, 0.015, m.grey, s * 0.672, 1.12, 0.32);
    // The rocker pivot housing on each side.
    const hub = cyl(inner, 0.085, 0.085, 0.16, m.grey, s * (P.x - 0.06), P.y, P.z, 24);
    hub.rotation.z = Math.PI / 2;
  }
  // Hazard-avoidance cameras front and back: two stereo pairs under the deck edge.
  for (const end of [-1, 1]) {
    const zc = end * 0.93;
    rbox(inner, 0.62, 0.05, 0.08, 0.015, m.dark, 0, 0.83, zc);
    for (const x of [-0.24, -0.12, 0.12, 0.24]) {
      rbox(inner, 0.07, 0.06, 0.07, 0.012, m.grey, x, 0.79, zc + end * 0.02);
      const l = cyl(inner, 0.016, 0.016, 0.02, m.lens, x, 0.79, zc + end * 0.058, 12);
      l.rotation.x = Math.PI / 2;
    }
  }
  // Deck instruments: sample inlets with their lids, an electronics box, a calibration target, cable trunks.
  for (const [x, z] of [[-0.3, -0.55], [-0.08, -0.55]] as const) {
    rbox(inner, 0.14, 0.06, 0.14, 0.015, m.white, x, 1.33, z);
    box(inner, 0.12, 0.012, 0.12, m.alu, x, 1.37, z).rotation.x = -0.2;
  }
  rbox(inner, 0.32, 0.14, 0.26, 0.03, m.white, -0.32, 1.37, -0.05);
  box(inner, 0.3, 0.008, 0.24, m.gold, -0.32, 1.445, -0.05);
  rbox(inner, 0.12, 0.03, 0.12, 0.01, m.dark, 0.18, 1.32, 0.12);
  for (let i = 0; i < 3; i++) cyl(inner, 0.018, 0.018, 0.012, [m.copper, m.white, m.dark][i], 0.15 + i * 0.03, 1.345, 0.12, 12);
  pipe(inner, [[-0.5, 1.32, 0.6], [-0.2, 1.33, 0.62], [0.2, 1.33, 0.6], [0.45, 1.32, 0.4]], 0.016, m.dark, 6);

  // The RTG at the back: a finned cylinder, tilted up, on a bracket, with its coolant pipes.
  const rtg = new THREE.Group();
  rtg.position.set(0, 1.18, 1.12);
  rtg.rotation.x = -0.62;
  inner.add(rtg);
  const core = cyl(rtg, 0.14, 0.14, 0.62, m.fins, 0, 0, 0, 24);
  core.rotation.x = Math.PI / 2;
  // Twelve thin cooling fins round it, and end rings.
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const fin = box(rtg, 0.008, 0.1, 0.56, m.fins, Math.cos(a) * 0.19, Math.sin(a) * 0.19, 0);
    fin.rotation.z = a + Math.PI / 2;
  }
  for (const zz of [-0.31, 0.31]) {
    const ring = cyl(rtg, 0.245, 0.245, 0.025, m.grey, 0, 0, zz, 32);
    ring.rotation.x = Math.PI / 2;
    const cap = cyl(rtg, 0.12, 0.12, 0.03, m.dark, 0, 0, zz * 1.06, 24);
    cap.rotation.x = Math.PI / 2;
  }
  strut(inner, -0.25, 1.18, 0.9, -0.12, 1.05, 1.1, 0.025, m.ti);
  strut(inner, 0.25, 1.18, 0.9, 0.12, 1.05, 1.1, 0.025, m.ti);
  pipe(inner, [[0.2, 1.28, 0.86], [0.22, 1.3, 1.0], [0.16, 1.32, 1.18]], 0.012, m.copper, 6);
  pipe(inner, [[-0.2, 1.28, 0.86], [-0.22, 1.3, 1.0], [-0.16, 1.32, 1.18]], 0.012, m.copper, 6);

  // Antennas: the hexagonal high-gain dish on its gimbal, and a stubby UHF antenna.
  cyl(inner, 0.04, 0.05, 0.16, m.grey, -0.42, 1.38, 0.5, 16);
  const hga = new THREE.Group();
  hga.position.set(-0.42, 1.5, 0.5);
  hga.rotation.set(-0.5, 0.4, 0);
  inner.add(hga);
  cyl(hga, 0.15, 0.15, 0.03, m.white, 0, 0, 0, 6);
  cyl(hga, 0.135, 0.135, 0.032, m.grey, 0, 0.002, 0, 6);
  cyl(hga, 0.03, 0.04, 0.06, m.dark, 0, -0.04, 0, 12);
  cyl(inner, 0.035, 0.035, 0.2, m.white, 0.42, 1.4, 0.62, 16);
  cone(inner, 0.035, 0.05, m.grey, 0.42, 1.525, 0.62, 16);

  // The differential bar across the deck: it seesaws as the rockers move, keeping the body level between them.
  const diff = keep(new THREE.Group());
  diff.position.set(0, 1.36, P.z + 0.22);
  inner.add(diff);
  cyl(inner, 0.05, 0.07, 0.08, m.grey, 0, 1.32, P.z + 0.22, 16);
  const bar = cyl(diff, 0.028, 0.028, 1.5, m.ti, 0, 0, 0, 10);
  bar.rotation.z = Math.PI / 2;
  for (const s of [-1, 1]) ball(diff, 0.035, m.grey, s * 0.75, 0, 0, 12);

  // The camera mast at the front right, with weather booms; its head pans and tilts.
  const mx = 0.42,
    mz = -0.68;
  cyl(inner, 0.08, 0.1, 0.1, m.grey, mx, 1.33, mz, 20);
  cyl(inner, 0.05, 0.05, 0.78, m.white, mx, 1.72, mz, 16);
  for (const [y, a] of [[1.62, 0.6], [1.66, -2.5]] as const) {
    const boom = new THREE.Group();
    boom.position.set(mx, y, mz);
    boom.rotation.y = a;
    inner.add(boom);
    strut(boom, 0, 0, 0, 0, 0, -0.22, 0.012, m.alu);
    rbox(boom, 0.03, 0.03, 0.06, 0.008, m.white, 0, 0, -0.24);
  }
  const pan = keep(new THREE.Group());
  pan.position.set(mx, 2.12, mz);
  inner.add(pan);
  cyl(pan, 0.06, 0.06, 0.06, m.grey, 0, -0.02, 0, 16);
  const tilt = keep(new THREE.Group());
  tilt.position.set(0, 0.1, 0);
  pan.add(tilt);
  // The head: the big telescope (laser spectrometer) on top, two colour cameras and the navigation cameras.
  rbox(tilt, 0.36, 0.2, 0.26, 0.03, m.white, 0, 0.02, 0);
  rbox(tilt, 0.3, 0.12, 0.2, 0.025, m.grey, 0, 0.17, 0.02);
  const scope = cyl(tilt, 0.07, 0.07, 0.05, m.dark, 0, 0.17, -0.1, 24);
  scope.rotation.x = Math.PI / 2;
  const scopeLens = cyl(tilt, 0.055, 0.055, 0.012, m.lens, 0, 0.17, -0.126, 24);
  scopeLens.rotation.x = Math.PI / 2;
  for (const x of [-0.09, 0.09]) {
    rbox(tilt, 0.08, 0.07, 0.06, 0.012, m.dark, x, -0.03, -0.14);
    const l = cyl(tilt, 0.022, 0.022, 0.012, m.lens, x, -0.03, -0.172, 16);
    l.rotation.x = Math.PI / 2;
  }
  for (const x of [-0.165, 0.165]) {
    rbox(tilt, 0.05, 0.05, 0.08, 0.01, m.grey, x, 0.06, -0.1);
    const l = cyl(tilt, 0.014, 0.014, 0.01, m.lens, x, 0.06, -0.142, 12);
    l.rotation.x = Math.PI / 2;
  }
  box(tilt, 0.34, 0.006, 0.22, m.gold, 0, 0.123, 0.02);

  // The robotic arm, mounted at the front left: azimuth, shoulder, elbow, wrist, then the turret.
  const azimuth = keep(new THREE.Group());
  azimuth.position.set(-0.38, 0.98, -0.98);
  inner.add(azimuth);
  cyl(inner, 0.07, 0.07, 0.12, m.grey, -0.38, 0.92, -0.98, 20);
  const shoulder = keep(new THREE.Group());
  azimuth.add(shoulder);
  ball(shoulder, 0.07, m.grey, 0, 0, 0, 16);
  strut(shoulder, 0, 0, 0, 0, 0, -0.7, 0.04, m.ti, 10);
  rbox(shoulder, 0.09, 0.09, 0.2, 0.02, m.white, 0, 0, -0.18);
  const elbow = keep(new THREE.Group());
  elbow.position.set(0, 0, -0.7);
  shoulder.add(elbow);
  const knuckle = cyl(elbow, 0.06, 0.06, 0.12, m.grey, 0, 0, 0, 18);
  knuckle.rotation.z = Math.PI / 2;
  strut(elbow, 0, 0, 0, 0, 0, -0.68, 0.035, m.ti, 10);
  pipe(elbow, [[0.05, 0.02, -0.05], [0.06, 0.03, -0.35], [0.05, 0.02, -0.62]], 0.008, m.dark, 5);
  const wrist = keep(new THREE.Group());
  wrist.position.set(0, 0, -0.68);
  elbow.add(wrist);
  ball(wrist, 0.05, m.grey, 0, 0, 0, 14);
  const turret = keep(new THREE.Group());
  turret.position.set(0, -0.1, 0);
  wrist.add(turret);
  buildTurret(turret, m);

  // Rockers (one each side): from the pivot forward and down to the front wheel, and back to the bogie, which
  // carries the middle and rear wheels.
  const rockers: THREE.Object3D[] = [],
    bogies: THREE.Object3D[] = [];
  const steer: THREE.Object3D[] = new Array(6),
    spin: THREE.Object3D[] = new Array(6);
  for (const s of [-1, 1]) {
    const side = s < 0 ? 0 : 1;
    const rocker = keep(new THREE.Group());
    rocker.position.set(s * P.x, P.y, P.z);
    inner.add(rocker);
    rockers[side] = rocker;
    const hub = cyl(rocker, 0.07, 0.07, 0.12, m.ti, s * 0.06, 0, 0, 20);
    hub.rotation.z = Math.PI / 2;
    // Corner points, relative to the pivot.
    const fTop: [number, number, number] = [s * (T - P.x - 0.05), R + 0.42 - P.y, ZF - P.z];
    const bPiv: [number, number, number] = [s * (B.x - P.x), B.y - P.y, B.z - P.z];
    pipe(rocker, [[s * 0.1, 0, 0], [s * 0.18, -0.04, -0.28], [fTop[0], fTop[1] + 0.05, fTop[2] + 0.18], [fTop[0], fTop[1] + 0.02, fTop[2]]], 0.04, m.ti, 10);
    pipe(rocker, [[s * 0.1, 0, 0], [s * 0.12, -0.12, 0.3], bPiv], 0.04, m.ti, 10);
    rbox(rocker, 0.08, 0.08, 0.16, 0.02, m.grey, s * 0.12, -0.03, -0.2);
    // The link from the rocker up to the end of the differential bar.
    strut(rocker, s * 0.04, 0.02, 0.22, s * -0.05, 0.38, 0.22, 0.015, m.alu);
    const f = buildCorner(rocker, s * (T - P.x), R - P.y, ZF - P.z, s, true, m);
    steer[side] = f.steer;
    spin[side] = f.spin;

    const bogie = keep(new THREE.Group());
    bogie.position.set(...bPiv);
    rocker.add(bogie);
    bogies[side] = bogie;
    const bh = cyl(bogie, 0.06, 0.06, 0.1, m.ti, 0, 0, 0, 18);
    bh.rotation.z = Math.PI / 2;
    const mTop: [number, number, number] = [s * (T - B.x - 0.05), R + 0.42 - B.y, ZM - B.z];
    const rTop: [number, number, number] = [s * (T - B.x - 0.05), R + 0.42 - B.y, ZR - B.z];
    pipe(bogie, [[0, 0, 0], [mTop[0] * 0.5, mTop[1] * 0.4, mTop[2] * 0.6], [mTop[0], mTop[1] + 0.02, mTop[2]]], 0.035, m.ti, 8);
    pipe(bogie, [[0, 0, 0], [rTop[0] * 0.5, rTop[1] * 0.4, rTop[2] * 0.6], [rTop[0], rTop[1] + 0.02, rTop[2]]], 0.035, m.ti, 8);
    const mid = buildCorner(bogie, s * (T - B.x), R - B.y, ZM - B.z, s, false, m);
    steer[2 + side] = mid.steer;
    spin[2 + side] = mid.spin;
    const rear = buildCorner(bogie, s * (T - B.x), R - B.y, ZR - B.z, s, true, m);
    steer[4 + side] = rear.steer;
    spin[4 + side] = rear.spin;
  }

  // A small name plate on the back (no agency markings).
  label(inner, "SCOUT-1", 0.36, 0, 1.0, 0.895);
  finalize(g);
  return {
    group: g,
    body,
    rockers,
    bogies,
    steer,
    spin,
    diff,
    pan,
    tilt,
    arm: [azimuth, shoulder, elbow, wrist, turret],
    eye: new THREE.Vector3(0, 0.06, -0.2),
  };
}

/**
 * Rocker-bogie kinematics on one side: given the heights of the front, middle and rear wheel centres, the bogie
 * and rocker pitch (positive lifts the front) and the height of the rocker pivot. Pure, so it can be tested.
 */
export function solveSide(hF: number, hM: number, hR: number) {
  const P = SCOUT.pivot,
    B = SCOUT.bogie,
    R = SCOUT.R,
    [ZF, ZM, ZR] = SCOUT.z;
  const bogie = Math.asin(THREE.MathUtils.clamp((hM - hR) / (ZR - ZM), -0.95, 0.95));
  const bogieY = hM - (Math.cos(bogie) * (R - B.y) - Math.sin(bogie) * (ZM - B.z));
  const a = R - B.y,
    b = B.z - ZF;
  const rocker = Math.atan2(b, a) - Math.acos(THREE.MathUtils.clamp((hF - bogieY) / Math.hypot(a, b), -1, 1));
  const pivotY = hF - (Math.cos(rocker) * (R - P.y) - Math.sin(rocker) * (ZF - P.z));
  return { bogie, rocker, pivotY };
}

/** Pose the body, rockers, bogies and differential from the six wheel-centre heights (front L/R, middle, rear). */
export function poseScout(v: ScoutView, hub: number[]) {
  const L = solveSide(hub[0], hub[2], hub[4]),
    Rt = solveSide(hub[1], hub[3], hub[5]);
  const pitch = (L.rocker + Rt.rocker) / 2;
  const roll = Math.atan2(Rt.pivotY - L.pivotY, 2 * SCOUT.pivot.x);
  v.body.position.y = (L.pivotY + Rt.pivotY) / 2;
  v.body.rotation.set(pitch, 0, roll);
  v.rockers[0].rotation.x = L.rocker - pitch;
  v.rockers[1].rotation.x = Rt.rocker - pitch;
  v.bogies[0].rotation.x = L.bogie - L.rocker;
  v.bogies[1].rotation.x = Rt.bogie - Rt.rocker;
  // The differential seesaws by how differently the two rockers have turned.
  v.diff.rotation.z = (Rt.rocker - L.rocker) * 0.8;
}

/**
 * Arm poses (azimuth, shoulder, elbow, wrist): folded across the front for driving, and reaching 1.2 m ahead with
 * the turret hanging straight down onto a rock (worked out from the arm's lengths, 0.7 and 0.68 m).
 */
const STOWED = [-1.52, 0.02, 2.9, -2.2];
const DEPLOYED = [0, -0.03, -0.72, 0.75];
export function poseArm(v: ScoutView, deploy: number, toolSpin: number) {
  const k = deploy * deploy * (3 - 2 * deploy);
  const [az, sh, el, wr] = STOWED.map((s, i) => s + (DEPLOYED[i] - s) * k);
  v.arm[0].rotation.y = az;
  v.arm[1].rotation.x = sh;
  v.arm[2].rotation.x = el;
  v.arm[3].rotation.x = wr;
  v.arm[4].rotation.y = toolSpin;
}

