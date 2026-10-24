import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
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

/** Roof height of the cabin's main section. */
const ROOF = 2.34;

/**
 * Cabin cross-sections from the back (+z) to the nose (−z): width, bottom and top, and squareness
 * (a superellipse exponent: high is boxy, low is round). The roof drops into a sloped canopy at the front.
 */
const SECTIONS = [
  { z: 1.97, w: 1.8, yb: 1.04, yt: 2.12, n: 4.5 },
  { z: 1.9, w: 2.02, yb: 0.99, yt: 2.28, n: 6.5 },
  { z: 1.7, w: 2.12, yb: 0.98, yt: ROOF, n: 8 },
  { z: -0.7, w: 2.12, yb: 0.98, yt: ROOF, n: 8 },
  { z: -1.0, w: 2.11, yb: 0.98, yt: 2.29, n: 7.5 },
  { z: -1.35, w: 2.05, yb: 0.98, yt: 2.06, n: 6.5 },
  { z: -1.7, w: 1.93, yb: 0.99, yt: 1.72, n: 5.5 },
  { z: -1.95, w: 1.72, yb: 1.02, yt: 1.42, n: 4.5 },
  { z: -2.07, w: 1.36, yb: 1.08, yt: 1.26, n: 4 },
];
const sectionAt = (z: number) => {
  let i = 0;
  while (i < SECTIONS.length - 2 && z < SECTIONS[i + 1].z) i++;
  const a = SECTIONS[i],
    b = SECTIONS[i + 1];
  const t = Math.min(1, Math.max(0, (a.z - z) / (a.z - b.z)));
  const mix = (k: "w" | "yb" | "yt" | "n") => a[k] + (b[k] - a[k]) * t;
  return { w: mix("w"), yb: mix("yb"), yt: mix("yt"), n: mix("n") };
};
/** Where the canopy glass starts: low at the nose, rising toward the back of the canopy. */
const canopyBelt = (z: number) => 1.5 + 0.3 * Math.min(1, Math.max(0, (z + 1.98) / 0.9));
const sp = (v: number, e: number) => Math.sign(v) * Math.abs(v) ** e;

/** A point on the cabin surface at depth z and angle θ round the section (0 = right side, π/2 = roof), pushed out by `off`. */
function surface(z: number, a: number, off = 0) {
  const { w, yb, yt, n } = sectionAt(z);
  const yc = (yb + yt) / 2,
    h = yt - yb;
  const at = (t: number) => [sp(Math.cos(t), 2 / n) * (w / 2), yc + sp(Math.sin(t), 2 / n) * (h / 2)];
  const [x, y] = at(a);
  if (!off) return new THREE.Vector3(x, y, z);
  const [x1, y1] = at(a + 0.01),
    [x0, y0] = at(a - 0.01);
  let nx = y1 - y0,
    ny = -(x1 - x0);
  if (nx * x + ny * (y - yc) < 0) [nx, ny] = [-nx, -ny];
  const l = Math.hypot(nx, ny) || 1;
  return new THREE.Vector3(x + (nx / l) * off, y + (ny / l) * off, z);
}
/** The angle on a section where the surface reaches height y (right side; the left side is π minus it). */
function angleAt(z: number, y: number) {
  const { yb, yt, n } = sectionAt(z);
  const s = Math.max(-1, Math.min(1, (y - (yb + yt) / 2) / ((yt - yb) / 2)));
  return Math.asin(Math.max(-1, Math.min(1, sp(s, n / 2))));
}

/** A patch of the surface between z0 and z1, from angle lo(z) to hi(z): glass laid on the body, plus its outline. */
function patch(z0: number, z1: number, lo: (z: number) => number, hi: (z: number) => number, nz: number, na: number) {
  const pos: number[] = [],
    idx: number[] = [];
  const outline: THREE.Vector3[] = [];
  for (let i = 0; i <= nz; i++) {
    const z = z0 + ((z1 - z0) * i) / nz;
    for (let j = 0; j <= na; j++) {
      const a = lo(z) + ((hi(z) - lo(z)) * j) / na;
      const p = surface(z, a, 0.008);
      pos.push(p.x, p.y, p.z);
      if (i < nz && j < na) {
        const k = i * (na + 1) + j;
        idx.push(k, k + na + 1, k + 1, k + 1, k + na + 1, k + na + 2);
      }
    }
  }
  // Outline: along the low edge, across the far end, back along the high edge, and across the near end.
  for (let i = 0; i <= nz; i++) outline.push(surface(z0 + ((z1 - z0) * i) / nz, lo(z0 + ((z1 - z0) * i) / nz), 0.02));
  for (let j = 1; j <= na; j++) outline.push(surface(z1, lo(z1) + ((hi(z1) - lo(z1)) * j) / na, 0.02));
  for (let i = nz - 1; i >= 0; i--) outline.push(surface(z0 + ((z1 - z0) * i) / nz, hi(z0 + ((z1 - z0) * i) / nz), 0.02));
  for (let j = na - 1; j >= 0; j--) outline.push(surface(z0, lo(z0) + ((hi(z0) - lo(z0)) * j) / na, 0.02));
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // Face outward: compare a middle vertex's normal with the way out from the cabin's axis.
  const mid = Math.floor(pos.length / 6);
  const out = new THREE.Vector3(pos[mid * 3], pos[mid * 3 + 1] - 1.66, 0);
  if (out.dot(new THREE.Vector3().fromBufferAttribute(g.attributes.normal, mid)) < 0) {
    for (let k = 0; k < idx.length; k += 3) [idx[k + 1], idx[k + 2]] = [idx[k + 2], idx[k + 1]];
    g.setIndex(idx);
    g.computeVertexNormals();
  }
  return { geo: g, outline };
}

/**
 * The pressurised cabin as one smooth loft (cross-sections joined along its length), with window glass
 * laid on it as smooth patches: a wraparound canopy at the front and a window on each side, each framed.
 */
function cabinParts() {
  return shared3("rover-cabin", () => {
    const N = 96;
    const zs: number[] = [];
    for (let z = SECTIONS[0].z; z > SECTIONS[SECTIONS.length - 1].z + 1e-6; z -= 0.045) zs.push(z);
    zs.push(SECTIONS[SECTIONS.length - 1].z);
    const pos: number[] = [],
      body: number[] = [];
    for (const z of zs) for (let j = 0; j < N; j++) {
      const p = surface(z, (j / N) * Math.PI * 2);
      pos.push(p.x, p.y, p.z);
    }
    const S = zs.length;
    const at = (i: number, j: number) => i * N + (j % N);
    for (let i = 0; i < S - 1; i++) for (let j = 0; j < N; j++) body.push(at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j), at(i + 1, j + 1), at(i, j + 1));
    // Flat end caps.
    for (const [i, flip] of [[0, false], [S - 1, true]] as const) {
      const c = pos.length / 3;
      const { yb, yt } = sectionAt(zs[i]);
      pos.push(0, (yb + yt) / 2, zs[i]);
      for (let j = 0; j < N; j++) body.push(...(flip ? [c, at(i, j + 1), at(i, j)] : [c, at(i, j), at(i, j + 1)]));
    }
    const make = () => {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(body);
      g.computeVertexNormals();
      return g;
    };
    let bodyGeo = make();
    if (bodyGeo.attributes.normal.getY(at(Math.floor(S / 2), N / 4)) < 0) {
      for (let k = 0; k < body.length; k += 3) [body[k + 1], body[k + 2]] = [body[k + 2], body[k + 1]];
      bodyGeo = make();
    }
    // The canopy: from where the belt line meets the roof near the nose, back to the roof's front edge.
    let zFront = -1.98;
    while (zFront < -1.2 && sectionAt(zFront).yt - canopyBelt(zFront) < 0.05) zFront += 0.01;
    const zBack = -1.06;
    const canopy = patch(zFront, zBack, (z) => angleAt(z, canopyBelt(z)), (z) => Math.PI - angleAt(z, canopyBelt(z)), 30, 56);
    // Side windows.
    const sides = [1, -1].map((sx) => {
      const lo = (z: number) => angleAt(z, 1.82),
        hi = (z: number) => angleAt(z, 2.14);
      return sx > 0 ? patch(-0.88, 0.28, lo, hi, 16, 6) : patch(-0.88, 0.28, (z) => Math.PI - hi(z), (z) => Math.PI - lo(z), 16, 6);
    });
    const glass = mergeGeometries([canopy.geo, ...sides.map((x) => x.geo)])!;
    return { body: bodyGeo, glass, frames: [canopy.outline, ...sides.map((x) => x.outline)] };
  });
}
const cabinCache = new Map<string, unknown>();
function shared3<T>(key: string, make: () => T): T {
  if (!cabinCache.has(key)) {
    const v = make();
    for (const g of Object.values(v as object)) if (g instanceof THREE.BufferGeometry) g.userData.shared = true;
    cabinCache.set(key, v);
  }
  return cabinCache.get(key) as T;
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
  // The pressurised cabin: a smooth pod with a wraparound canopy.
  const cabin = cabinParts();
  mesh(cabin.body, white, body);
  // Window frames: a rounded rubber-and-metal surround along each window's edge.
  for (const loop of cabin.frames) pipe(body, [...loop, loop[0]].map((v) => [v.x, v.y, v.z] as [number, number, number]), 0.022, rubber("#2a2e36"), 6);
  // Panel seams, a hazard-orange belt line and the name.
  for (const sx of [-1, 1]) {
    box(body, 0.012, 0.06, 2.6, orange, sx * 1.062, 1.36, 0.4);
    box(body, 0.008, 1.0, 0.01, paint(C.grey, 0.6), sx * 1.062, 1.62, 0.55);
    box(body, 0.008, 1.0, 0.01, paint(C.grey, 0.6), sx * 1.062, 1.62, 1.25);
    label(body, "ASTRA ROVER 1", 1.2, sx * 1.07, 1.18, 0.7).rotation.y = (sx * Math.PI) / 2;
  }
  // The window glass stays separate so the driver's view can hide it.
  const glassList: THREE.Object3D[] = [];
  const canopy = keep(mesh(cabin.glass, visor("#162236"), body));
  canopy.castShadow = false;
  glassList.push(canopy);
  // Roof: solar panel on a frame, a light bar, a sensor mast with cameras and lidar, antennas.
  rbox(body, 1.6, 0.05, 1.55, 0.02, frame, 0, ROOF + 0.05, 0.55);
  box(body, 1.5, 0.03, 1.45, cells(1.5, 1.4), 0, ROOF + 0.085, 0.55);
  for (const sx of [-1, 1]) for (const z of [-0.1, 1.2]) cyl(body, 0.02, 0.02, 0.06, frame, sx * 0.7, ROOF + 0.01, z, 6);
  const heads = light("#fff3d6", 2.5);
  rbox(body, 1.3, 0.12, 0.16, 0.04, dark, 0, ROOF + 0.06, -0.62);
  for (let i = 0; i < 4; i++) box(body, 0.22, 0.06, 0.03, heads, -0.45 + i * 0.3, ROOF + 0.06, -0.71);
  cyl(body, 0.035, 0.045, 0.5, frame, 0.55, ROOF + 0.25, -0.2, 8);
  rbox(body, 0.34, 0.14, 0.14, 0.03, dark, 0.55, ROOF + 0.55, -0.2);
  for (const sx of [-1, 1]) ball(body, 0.035, visor("#0a0e16"), 0.55 + sx * 0.1, ROOF + 0.55, -0.28, 10);
  cyl(body, 0.06, 0.06, 0.07, dark, 0.55, ROOF + 0.66, -0.2, 14);
  cyl(body, 0.015, 0.015, 1.0, frame, -0.75, ROOF + 0.5, 1.25, 6);
  const beacon = light("#ff4d5e", 3);
  ball(body, 0.05, beacon, -0.75, ROOF + 1.02, 1.25, 8);
  const dishPivot = new THREE.Group();
  dishPivot.position.set(0.62, ROOF + 0.2, 1.35);
  dishPivot.rotation.x = -0.6;
  body.add(dishPivot);
  const dishMat = new THREE.MeshStandardMaterial({ color: "#eef0f3", roughness: 0.45, side: THREE.DoubleSide });
  mesh(geo("rover-dish", () => new THREE.LatheGeometry([0, 0.08, 0.16, 0.24, 0.29].map((r) => new THREE.Vector2(r, r * r * 0.6)), 28)), dishMat, dishPivot);
  cyl(body, 0.03, 0.03, 0.18, frame, 0.62, ROOF + 0.09, 1.35, 6);
  // Headlights (deep housings with lenses), tail and marker lights.
  for (const x of [-0.5, 0.5]) {
    rbox(body, 0.4, 0.18, 0.14, 0.04, dark, x, 1.17, -1.99);
    box(body, 0.32, 0.11, 0.02, heads, x, 1.17, -2.065);
  }
  const tail = light("#ff5a3d", 1.8);
  for (const x of [-0.82, 0.82]) {
    rbox(body, 0.26, 0.14, 0.06, 0.03, dark, x, 1.12, 1.98);
    box(body, 0.2, 0.08, 0.02, tail, x, 1.12, 2.015);
  }
  const marker = light("#ffb020", 1.6);
  for (const sx of [-1, 1]) for (const z of [-1.2, 1.6]) box(body, 0.02, 0.05, 0.1, marker, sx * 1.05, 1.12, z);
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

