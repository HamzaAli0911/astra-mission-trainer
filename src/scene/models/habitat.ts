import * as THREE from "three";
import type { Planet } from "../../sim/types";
import { addDetail, DETAIL } from "../surface";
import {
  box,
  contactShadow,
  cone,
  cyl,
  fabric,
  geo,
  glass,
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
  rng,
  roundRect,
  rubber,
  strut,
  torus,
  windowPane,
} from "../kit";
import { C, label, sandbagGeometry, sandMaterial, statusLamp, type ModuleView } from "./common";

/** The habitat's outline, [radius, height] from the base ring to the crown. */
const PROFILE: [number, number][] = [
  [3.02, 0.36],
  [3.12, 0.46],
  [3.19, 0.64],
  [3.225, 1.0],
  [3.24, 1.5],
  [3.235, 2.0],
  [3.205, 2.4],
  [3.13, 2.75],
  [2.99, 3.05],
  [2.77, 3.33],
  [2.46, 3.58],
  [2.06, 3.78],
  [1.56, 3.92],
  [1.02, 4.0],
  [0.5, 4.04],
  [0.0, 4.05],
];
/** Shell radius at a height (for placing things on the curved wall). */
export function shellRadius(y: number) {
  for (let i = 1; i < PROFILE.length; i++) {
    const [r0, y0] = PROFILE[i - 1],
      [r1, y1] = PROFILE[i];
    if (y <= y1) return r0 + ((r1 - r0) * (y - y0)) / Math.max(1e-6, y1 - y0);
  }
  return 0;
}
const BANDS = [0.46, 1.05, 1.95, 2.75, 3.42];

/** The pressurised shell: soft fabric that bulges between its restraint straps, like a quilted pillow. */
function shellGeometry() {
  return geo("hab-shell", () => {
    const g = new THREE.LatheGeometry(
      PROFILE.flatMap(([r, y], i) => {
        if (i === PROFILE.length - 1) return [new THREE.Vector2(r, y)];
        const [r1, y1] = PROFILE[i + 1];
        return [0, 0.25, 0.5, 0.75].map((t) => new THREE.Vector2(r + (r1 - r) * t, y + (y1 - y) * t));
      }),
      128,
    );
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i),
        y = p.getY(i),
        z = p.getZ(i);
      const r = Math.hypot(x, z);
      if (r < 0.05) continue;
      const a = Math.atan2(z, x);
      // Between the 16 vertical straps the fabric puffs out; at the straps it is pulled in.
      const gore = Math.abs(Math.sin(a * 8)) ** 0.65;
      let band = 0;
      for (let k = 1; k < BANDS.length; k++)
        if (y >= BANDS[k - 1] && y <= BANDS[k]) band = Math.sin((Math.PI * (y - BANDS[k - 1])) / (BANDS[k] - BANDS[k - 1]));
      if (y > BANDS[BANDS.length - 1]) band = Math.sin(Math.min(1, (y - 3.42) / 0.5) * Math.PI) * 0.6;
      const s = 1 + 0.016 * gore * (0.4 + 0.6 * band) + 0.006 * band;
      p.setXYZ(i, x * s, y, z * s);
    }
    g.computeVertexNormals();
    return g;
  });
}

/** A vertical restraint strap following the shell's curve. */
function strapGeometry(a: number) {
  return geo(`hab-strap-${a.toFixed(3)}`, () => {
    const pts = PROFILE.slice(1, -2).map(([r, y]) => new THREE.Vector3(Math.cos(a) * (r + 0.012), y, Math.sin(a) * (r + 0.012)));
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.028, 5, false);
  });
}

/** Regolith sandbags piled in courses over the dome, revealed from the bottom up as the shield is built. */
function shield(planet: Planet, view: ModuleView) {
  const group = keep(new THREE.Group());
  const bag = sandbagGeometry();
  const sand = sandMaterial(planet);
  const spots: THREE.Matrix4[] = [];
  const r = rng(91);
  const q = new THREE.Quaternion(),
    e = new THREE.Euler(),
    s = new THREE.Vector3(),
    v = new THREE.Vector3();
  let course = 0;
  for (let y = 0.5; y < 3.95; y += 0.29, course++) {
    const R = shellRadius(y) + 0.3;
    const slope = Math.atan2(shellRadius(y - 0.1) - shellRadius(y + 0.1), 0.2);
    const n = Math.max(6, Math.floor((Math.PI * 2 * R) / 0.6));
    for (let i = 0; i < n; i++) {
      const a = ((i + (course % 2) * 0.5) / n) * Math.PI * 2;
      // Leave the airlock (south) and the windows open.
      const gap = (target: number, width: number) => Math.abs(Math.atan2(Math.sin(a - target), Math.cos(a - target))) < width;
      if (gap(Math.PI / 2, 0.42) && y < 2.4) continue;
      if (y > 1.25 && y < 2.15 && (gap(-Math.PI / 2, 0.2) || gap(0, 0.2) || gap(Math.PI, 0.2))) continue;
      e.set(-slope, -a + Math.PI / 2, (r() - 0.5) * 0.08, "YXZ");
      q.setFromEuler(e);
      s.set(0.95 + r() * 0.15, 0.95 + r() * 0.2, 0.95 + r() * 0.1);
      v.set(Math.cos(a) * R, y + 0.02, Math.sin(a) * R);
      spots.push(new THREE.Matrix4().compose(v, q, s));
    }
  }
  const inst = new THREE.InstancedMesh(bag, sand, spots.length);
  const tint = new THREE.Color();
  spots.forEach((m, i) => {
    inst.setMatrixAt(i, m);
    inst.setColorAt(i, tint.setScalar(0.85 + r() * 0.25));
  });
  inst.castShadow = inst.receiveShadow = true;
  // Bounds cover the finished shield, so a partly built one is never culled; keep() stops finalize() merging the instances away.
  inst.computeBoundingSphere();
  group.add(keep(inst));
  group.visible = false;
  view.group.add(group);
  view.shield = group;
  view.shieldProgress = (p: number) => {
    group.visible = p > 0.02;
    inst.count = Math.round(spots.length * Math.min(1, p));
  };
}

/** An inflatable habitat: quilted fabric shell, cupola, airlock with a pressure door, radiators and antenna. */
export function buildHabitat(view: ModuleView, planet: Planet) {
  const g = view.group;
  const shellMat = fabric("#e7e9ec", 0.92),
    strap = fabric("#c9ced6", 0.85),
    frame = metal("#a7afbb", 0.4),
    dark = metal("#5d6573", 0.5),
    seal = rubber("#3a3f47"),
    white = paint(C.white, 0.5, 0.1);
  contactShadow(g, 4.4, 4.4, 0.6, 0.02);
  // Foundation ring with anchors driven into the ground.
  lathe(g, "hab-base", [[2.98, 0.02], [3.44, 0.02], [3.5, 0.08], [3.5, 0.3], [3.36, 0.38], [2.98, 0.38]], dark, 0, 0, 0, 72);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + 0.13;
    const c = Math.cos(a),
      sn = Math.sin(a);
    rbox(g, 0.34, 0.26, 0.2, 0.03, frame, c * 3.52, 0.17, sn * 3.52).rotation.y = -a;
    strut(g, c * 3.5, 0.3, sn * 3.5, c * 3.82, 0.04, sn * 3.82, 0.035, frame);
    cyl(g, 0.13, 0.15, 0.05, dark, c * 3.84, 0.025, sn * 3.84, 12);
  }
  // The shell and its straps.
  mesh(shellGeometry(), shellMat, g);
  for (let i = 0; i < 16; i++) mesh(strapGeometry((i / 16) * Math.PI * 2), strap, g);
  for (const y of BANDS) torus(g, shellRadius(y) + 0.01, 0.034, strap, 0, y, 0).rotation.x = Math.PI / 2;
  torus(g, shellRadius(0.7) + 0.07, 0.045, paint(C.orange, 0.55), 0, 0.7, 0).rotation.x = Math.PI / 2;
  // Windows: three round ports with thick frames; warm light inside at night.
  // The cabin seen through the glass: dark inside, lit warm by the crew's lamps.
  view.windows = new THREE.MeshStandardMaterial({ color: "#1c232e", emissive: "#ffc98a", emissiveIntensity: 0.6, roughness: 0.7, toneMapped: false });
  for (const a of [-Math.PI / 2, 0, Math.PI]) {
    const R = shellRadius(1.7) + 0.05;
    const w = windowPane(g, 0.92, 0.56, 0.2, frame, glass("#9fb8cc", 0.32), seal, Math.cos(a) * R, 1.7, Math.sin(a) * R, 0.07);
    w.rotation.y = -a + Math.PI / 2;
    const glow = mesh(geo("hab-port-glow", () => new THREE.ShapeGeometry(roundRect(0.9, 0.54, 0.19), 8)), view.windows, w, 0, 0, -0.05);
    glow.castShadow = false;
    box(w, 1.12, 0.05, 0.08, frame, 0, 0.36, 0.03);
  }
  // Airlock tunnel toward the rover dock (south, +z).
  const tunnel = cyl(g, 0.92, 0.92, 1.9, white, 0, 1.25, 3.62, 40);
  tunnel.rotation.x = Math.PI / 2;
  for (const z of [3.05, 3.55, 4.05, 4.48]) torus(g, 0.935, 0.04, frame, 0, 1.25, z);
  // The pressure door: a domed hatch in a reinforced frame, with gasket, hinges and a locking wheel.
  torus(g, 0.82, 0.09, frame, 0, 1.25, 4.6);
  torus(g, 0.72, 0.035, seal, 0, 1.25, 4.62);
  const hatch = lathe(g, "hatch", [[0, 0.08], [0.45, 0.07], [0.66, 0.035], [0.7, 0], [0.66, -0.03], [0, -0.03]], paint(C.off, 0.5, 0.2), 0, 1.25, 4.64, 40);
  hatch.rotation.x = Math.PI / 2;
  for (const y of [0.85, 1.65]) {
    rbox(g, 0.2, 0.18, 0.16, 0.03, dark, 0.84, y, 4.68);
    cyl(g, 0.035, 0.035, 0.26, frame, 0.84, y, 4.7, 10);
  }
  torus(g, 0.17, 0.022, frame, 0, 1.25, 4.79);
  for (let i = 0; i < 3; i++) strut(g, 0, 1.25, 4.79, Math.cos((i / 3) * Math.PI * 2) * 0.17, 1.25 + Math.sin((i / 3) * Math.PI * 2) * 0.17, 4.79, 0.012, frame);
  cyl(g, 0.04, 0.04, 0.06, frame, 0, 1.25, 4.79, 10).rotation.x = Math.PI / 2;
  windowPane(g, 0.2, 0.2, 0.1, frame, glass("#9fb8cc", 0.4), seal, 0, 1.62, 4.72, 0.04);
  // Entry deck and steps down to the ground.
  panel(g, 1.7, 0.75, 0.06, 0.02, paint("#4a5263", 0.8, 0.3), 0, 0.5, 5.02).rotation.x = -Math.PI / 2;
  grille(g, 1.5, 0.6, 9, dark, frame, 0, 0.535, 5.02).rotation.x = -Math.PI / 2;
  for (const [y, z] of [[0.32, 5.52], [0.15, 5.78]]) panel(g, 1.4, 0.3, 0.05, 0.02, paint("#4a5263", 0.8, 0.3), 0, y, z).rotation.x = -Math.PI / 2;
  for (const sx of [-1, 1]) {
    strut(g, sx * 0.82, 0.05, 5.4, sx * 0.82, 0.5, 5.4, 0.035, frame);
    pipe(g, [[sx * 0.98, 0.55, 4.3], [sx * 0.98, 1.4, 4.42], [sx * 0.92, 1.55, 5.0], [sx * 0.82, 1.1, 5.42], [sx * 0.82, 0.55, 5.5]], 0.025, frame, 6);
  }
  // Porch light, status lamp and an access panel beside the door.
  box(g, 0.5, 0.08, 0.12, paint(C.dark, 0.5), 0, 2.14, 4.52);
  box(g, 0.42, 0.04, 0.04, light("#fff1d6", 2.6), 0, 2.1, 4.59);
  view.status = statusLamp(g, 0.62, 2.16, 4.2);
  rbox(g, 0.32, 0.42, 0.08, 0.03, paint(C.grey, 0.5, 0.3), -0.92, 1.35, 4.5);
  box(g, 0.2, 0.12, 0.01, light("#5ee0ff", 1.2), -0.92, 1.42, 4.545);
  label(g, "AIRLOCK 1", 0.8, 0.935, 1.62, 3.8).rotation.y = Math.PI / 2;
  label(g, "AIRLOCK 1", 0.8, -0.935, 1.62, 3.8).rotation.y = -Math.PI / 2;
  // Cupola on the crown: an eight-sided ring of windows with a top pane.
  lathe(g, "cupola-base", [[1.12, 3.94], [1.18, 4.02], [1.0, 4.16], [0.92, 4.16], [0.92, 3.94]], dark, 0, 0, 0, 48);
  const sides = mesh(geo("cupola-glass", () => new THREE.CylinderGeometry(0.55, 0.88, 0.44, 8, 1, true)), glass("#a8c4dc", 0.3), g, 0, 4.38, 0);
  sides.castShadow = false;
  cyl(g, 0.56, 0.56, 0.05, frame, 0, 4.62, 0, 8);
  const topPane = mesh(geo("cupola-top", () => new THREE.CircleGeometry(0.5, 8).rotateX(-Math.PI / 2)), glass("#a8c4dc", 0.3), g, 0, 4.65, 0);
  topPane.castShadow = false;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    strut(g, Math.cos(a) * 0.9, 4.16, Math.sin(a) * 0.9, Math.cos(a) * 0.57, 4.6, Math.sin(a) * 0.57, 0.035, frame, 6);
  }
  const lit = mesh(geo("cupola-glow", () => new THREE.CircleGeometry(0.85, 24).rotateX(-Math.PI / 2)), view.windows, g, 0, 4.18, 0);
  lit.castShadow = false;
  // Radiator wings on a short truss at the back (north).
  for (const sx of [-1, 1]) {
    strut(g, sx * 1.2, 2.9, -2.7, sx * 1.7, 3.0, -3.25, 0.04, frame);
    const wing = panel(g, 1.25, 1.05, 0.05, 0.03, paint("#f1f3f5", 0.35, 0.05), sx * 2.05, 3.05, -3.3);
    wing.rotation.y = sx * 0.55;
    for (let k = 0; k < 6; k++) {
      const rib = box(g, 0.012, 0.95, 0.02, frame, sx * 2.05 + Math.cos(sx * 0.55) * (-0.5 + k * 0.2), 3.05, -3.3 - Math.sin(sx * 0.55) * (-0.5 + k * 0.2) + 0.03);
      rib.rotation.y = sx * 0.55;
    }
  }
  // High-gain antenna: mast, gimbal, a true parabolic dish with feed horn.
  cyl(g, 0.05, 0.07, 1.4, frame, 1.45, 4.45, -1.0, 10);
  rbox(g, 0.2, 0.16, 0.2, 0.03, dark, 1.45, 5.18, -1.0);
  const dishMat = addDetail(new THREE.MeshStandardMaterial({ color: "#eef0f3", roughness: 0.45, metalness: 0.1, side: THREE.DoubleSide }), DETAIL.paint);
  const dishPivot = new THREE.Group();
  dishPivot.position.set(1.45, 5.35, -1.0);
  dishPivot.rotation.x = -0.75;
  g.add(dishPivot);
  mesh(geo("hab-dish", () => new THREE.LatheGeometry([0, 0.12, 0.24, 0.36, 0.48, 0.58].map((r) => new THREE.Vector2(r, r * r * 0.42)), 40)), dishMat, dishPivot);
  torus(dishPivot, 0.58, 0.015, frame, 0, 0.141, 0).rotation.x = Math.PI / 2;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    strut(dishPivot, Math.cos(a) * 0.56, 0.14, Math.sin(a) * 0.56, 0, 0.5, 0, 0.008, frame, 4);
  }
  cone(dishPivot, 0.05, 0.12, dark, 0, 0.47, 0, 12).rotation.x = Math.PI;
  const beacon = light("#ff4d5e", 3);
  view.blink.push(beacon);
  cyl(g, 0.05, 0.05, 0.08, beacon, 1.45, 5.32, -0.82, 8);
  // EVA handholds around the upper shell, and an umbilical to the ground.
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + 0.2;
    if (Math.abs(Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2))) < 0.4) continue;
    const R = shellRadius(2.6) + 0.07;
    pipe(g, [[Math.cos(a - 0.05) * (R - 0.05), 2.6, Math.sin(a - 0.05) * (R - 0.05)], [Math.cos(a - 0.04) * R, 2.6, Math.sin(a - 0.04) * R], [Math.cos(a + 0.04) * R, 2.6, Math.sin(a + 0.04) * R], [Math.cos(a + 0.05) * (R - 0.05), 2.6, Math.sin(a + 0.05) * (R - 0.05)]], 0.018, paint("#f2c230", 0.5), 5);
  }
  pipe(g, [[2.9, 0.75, 1.4], [3.35, 0.5, 1.55], [3.7, 0.12, 1.7], [4.2, 0.05, 1.85]], 0.07, rubber("#2b2f37"), 8);
  label(g, "ASTRA HAB-1", 1.3, 0, 2.35, -shellRadius(2.35) - 0.06).rotation.y = Math.PI;
  shield(planet, view);
  view.top = 5.6;
}
