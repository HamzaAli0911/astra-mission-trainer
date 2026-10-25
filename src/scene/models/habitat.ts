import * as THREE from "three";
import type { Planet } from "../../sim/types";
import { bearingOf, HOME, polar, WINDOWS, windowY } from "../../sim/home";
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

/**
 * The habitat's outline, [radius, height]: a near-vertical quilted wall for two storeys (decks at
 * 0.5 m and 3.35 m inside), then a dome to the crown, where the cupola sits. See sim/home.ts.
 */
const PROFILE: [number, number][] = [
  [4.9, 0.36],
  [5.04, 0.46],
  [5.13, 0.66],
  [5.19, 1.0],
  [5.22, 1.6],
  [5.23, 2.4],
  [5.23, 3.4],
  [5.22, 4.4],
  [5.2, 5.2],
  [5.14, 5.75],
  [5.02, 6.2],
  [4.8, 6.6],
  [4.45, 6.98],
  [3.95, 7.3],
  [3.3, 7.55],
  [2.55, 7.72],
  [1.75, 7.83],
  [0.9, 7.89],
  [0.0, 7.91],
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
/** Height of the shell at a radius (on the dome). */
function shellHeightAt(r: number) {
  for (let i = PROFILE.length - 1; i > 0; i--) {
    const [r0, y0] = PROFILE[i],
      [r1, y1] = PROFILE[i - 1];
    if (r <= r1) return y0 + ((y1 - y0) * (r - r0)) / Math.max(1e-6, r1 - r0);
  }
  return PROFILE[0][1];
}
const BANDS = [0.46, 1.4, 2.4, 3.4, 4.25, 5.35, 6.05, 6.75, 7.35];
/** Vertical restraint straps every 15°. */
const STRAPS = 24;
const AIRLOCK = { bearing: 180, y: 1.45, r: 0.95, from: 4.95, to: 7.15 };
const LADDER = 125;
const MAST = { bearing: 45, r: 3.6 };

const angleDiff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);
/** Openings in the shell (windows and the airlock), with a margin, for straps and sandbags to avoid. */
function inOpening(bearing: number, y: number, margin: number) {
  for (const w of WINDOWS) {
    const cy = windowY(w),
      R = shellRadius(cy);
    const half = (((w.w / 2 + 0.12 + margin) / R) * 180) / Math.PI;
    if (angleDiff(bearing, w.bearing) < half && Math.abs(y - cy) < w.h / 2 + 0.12 + margin) return true;
  }
  const half = (((AIRLOCK.r + 0.15 + margin) / HOME.shell) * 180) / Math.PI;
  return angleDiff(bearing, AIRLOCK.bearing) < half && y < AIRLOCK.y + AIRLOCK.r + 0.2 + margin;
}
/** How close a shell point is to a window (1 at its frame, 0 well clear): the fabric is stiffened there. */
function nearWindow(bearing: number, y: number) {
  let k = 0;
  for (const w of WINDOWS) {
    const cy = windowY(w);
    const da = (angleDiff(bearing, w.bearing) * Math.PI * 5.2) / 180 - w.w / 2,
      dy = Math.abs(y - cy) - w.h / 2;
    const d = Math.max(da, dy);
    k = Math.max(k, 1 - Math.min(1, Math.max(0, (d - 0.05) / 0.35)));
  }
  return k;
}

/** The pressurised shell: soft fabric that bulges between its restraint straps, like a quilted pillow, and lies flat round each window. */
function shellGeometry() {
  return geo("hab2-shell", () => {
    const g = new THREE.LatheGeometry(
      PROFILE.flatMap(([r, y], i) => {
        if (i === PROFILE.length - 1) return [new THREE.Vector2(r, y)];
        const [r1, y1] = PROFILE[i + 1];
        return [0, 0.2, 0.4, 0.6, 0.8].map((t) => new THREE.Vector2(r + (r1 - r) * t, y + (y1 - y) * t));
      }),
      192,
    );
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i),
        y = p.getY(i),
        z = p.getZ(i);
      const r = Math.hypot(x, z);
      if (r < 0.05) continue;
      const b = bearingOf(x, z);
      const gore = Math.abs(Math.sin(((b * Math.PI) / 180) * (STRAPS / 2))) ** 0.65;
      let band = 0;
      for (let k = 1; k < BANDS.length; k++)
        if (y >= BANDS[k - 1] && y <= BANDS[k]) band = Math.sin((Math.PI * (y - BANDS[k - 1])) / (BANDS[k] - BANDS[k - 1]));
      if (y > BANDS[BANDS.length - 1]) band = Math.sin(Math.min(1, (y - BANDS[BANDS.length - 1]) / 0.5) * Math.PI) * 0.5;
      const s = 1 + (0.011 * gore * (0.4 + 0.6 * band) + 0.004 * band) * (1 - nearWindow(b, y));
      p.setXYZ(i, x * s, y, z * s);
    }
    g.computeVertexNormals();
    // Openings behind the windows (hidden from outside by each window's frame plate), so you can see out from
    // inside and sunlight falls through them onto the floors.
    const idx = g.index!;
    const keepTris: number[] = [];
    for (let t = 0; t < idx.count; t += 3) {
      const a = idx.getX(t),
        b = idx.getX(t + 1),
        c = idx.getX(t + 2);
      const cx = (p.getX(a) + p.getX(b) + p.getX(c)) / 3,
        cy = (p.getY(a) + p.getY(b) + p.getY(c)) / 3,
        cz = (p.getZ(a) + p.getZ(b) + p.getZ(c)) / 3;
      if (!inWindow(bearingOf(cx, cz), cy, 0.08)) keepTris.push(a, b, c);
    }
    g.setIndex(keepTris);
    return g;
  });
}
/** Is a point on the shell inside a window's glass (plus a margin, metres)? */
function inWindow(bearing: number, y: number, margin: number) {
  return WINDOWS.some((w) => {
    const cy = windowY(w),
      half = (((w.w / 2 + margin) / shellRadius(cy)) * 180) / Math.PI;
    return angleDiff(bearing, w.bearing) < half && Math.abs(y - cy) < w.h / 2 + margin;
  });
}

/** A vertical restraint strap following the shell's curve, routed round any window in its way. */
function strapPieces(bearing: number) {
  return geo(`hab2-strap-${bearing}`, () => {
    const runs: THREE.Vector3[][] = [[]];
    for (let y = PROFILE[1][1]; y <= 7.6; y += 0.06) {
      if (inOpening(bearing, y, 0.02)) {
        if (runs[runs.length - 1].length) runs.push([]);
        continue;
      }
      const r = shellRadius(y) * 1.003 + 0.012;
      const p = polar(bearing, r);
      runs[runs.length - 1].push(new THREE.Vector3(p.x, y, p.z));
    }
    const tubes = runs.filter((pts) => pts.length > 3).map((pts) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length * 2, 0.03, 5, false));
    return mergeAll(tubes);
  });
}
function mergeAll(list: THREE.BufferGeometry[]) {
  // Tubes share their layout, so their attributes merge simply.
  const pos: number[] = [],
    nor: number[] = [],
    uv: number[] = [],
    idx: number[] = [];
  let base = 0;
  for (const g of list) {
    const ni = g.index!;
    for (let i = 0; i < ni.count; i++) idx.push(ni.getX(i) + base);
    pos.push(...(g.attributes.position.array as Float32Array));
    nor.push(...(g.attributes.normal.array as Float32Array));
    uv.push(...(g.attributes.uv.array as Float32Array));
    base += g.attributes.position.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  out.setIndex(idx);
  return out;
}

/** Regolith sandbags piled in courses over the shell, revealed from the bottom up as the shield is built. */
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
  // Big bags (about 0.85 m long), courses every 0.38 m, up over the dome to the cupola.
  const size = 1.35;
  let course = 0;
  for (let y = 0.5; y < 7.75; y += 0.38, course++) {
    const R = shellRadius(y) + 0.42;
    if (R < 1.55) break;
    const slope = Math.atan2(shellRadius(y - 0.1) - shellRadius(y + 0.1), 0.2);
    const n = Math.max(6, Math.floor((Math.PI * 2 * R) / (0.62 * size)));
    for (let i = 0; i < n; i++) {
      const bearing = ((i + (course % 2) * 0.5) / n) * 360;
      // Leave the windows, the airlock, the ladder and the antenna mast clear.
      if (inOpening(bearing, y, 0.35)) continue;
      if (angleDiff(bearing, LADDER) < 5.5 && y < 6.3) continue;
      if (angleDiff(bearing, MAST.bearing) < 9 && Math.abs(R - 0.42 - MAST.r) < 0.6) continue;
      const a = (bearing * Math.PI) / 180;
      // Turned along the ring, and leaning in with the dome.
      e.set(slope, -a, (r() - 0.5) * 0.08, "YXZ");
      q.setFromEuler(e);
      s.set(size * (0.95 + r() * 0.15), size * (0.95 + r() * 0.2), size * (0.95 + r() * 0.1));
      const p = polar(bearing, R);
      v.set(p.x, y + 0.03, p.z);
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

/** The stiffening plate round a window: a rounded slab with the window's shape cut out of it. */
function platePlate(w: number, h: number) {
  const shape = roundRect(w + 0.34, h + 0.34, 0.12);
  shape.holes.push(roundRect(w - 0.02, h - 0.02, Math.min(w, h) * 0.28, new THREE.Path()));
  return new THREE.ExtrudeGeometry(shape, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 2, curveSegments: 8 });
}

/** Turn an object on the shell so its +z faces outward at a bearing. */
const faceOut = (o: THREE.Object3D, bearing: number) => {
  o.rotation.y = Math.PI - (bearing * Math.PI) / 180;
  return o;
};

/**
 * The Mars home from outside: a two-storey inflatable on a rigid core, with a quilted shell, windows on
 * both floors, an airlock to the south, a cupola on the crown, radiators, a dish, a maintenance ladder
 * and a regolith shield. Everything that lines up with the inside comes from sim/home.ts.
 */
export function buildHabitat(view: ModuleView, planet: Planet) {
  const g = view.group;
  const shellMat = fabric("#e7e9ec", 0.92),
    strap = fabric("#c9ced6", 0.85),
    frame = metal("#a7afbb", 0.4),
    dark = metal("#5d6573", 0.5),
    seal = rubber("#3a3f47"),
    white = paint(C.white, 0.5, 0.1);
  contactShadow(g, 6.6, 6.6, 0.6, 0.02);
  // Foundation ring with anchors driven into the ground.
  lathe(g, "hab2-base", [[4.85, 0.02], [5.5, 0.02], [5.58, 0.09], [5.58, 0.32], [5.4, 0.4], [4.85, 0.4]], dark, 0, 0, 0, 96);
  for (let i = 0; i < 16; i++) {
    const b = (i / 16) * 360 + 11.25;
    const a = polar(b, 5.62),
      f = polar(b, 5.98);
    faceOut(rbox(g, 0.4, 0.28, 0.22, 0.03, frame, a.x, 0.18, a.z), b);
    strut(g, a.x, 0.32, a.z, f.x, 0.05, f.z, 0.04, frame);
    cyl(g, 0.15, 0.17, 0.05, dark, f.x, 0.025, f.z, 12);
  }
  // The shell, its straps and bands.
  mesh(shellGeometry(), shellMat, g);
  for (let i = 0; i < STRAPS; i++) mesh(strapPieces(i * (360 / STRAPS)), strap, g);
  for (const y of BANDS) torus(g, shellRadius(y) * 1.003 + 0.012, 0.036, strap, 0, y, 0).rotation.x = Math.PI / 2;
  torus(g, shellRadius(0.75) + 0.07, 0.05, paint(C.orange, 0.55), 0, 0.75, 0).rotation.x = Math.PI / 2;
  // The upper floor's line, marked with a narrow grey band.
  torus(g, shellRadius(HOME.floor[1]) + 0.05, 0.03, paint(C.grey, 0.6), 0, HOME.floor[1], 0).rotation.x = Math.PI / 2;

  // Windows on both floors: framed glass on a stiffened boss, with the lit room behind (warm at night).
  view.windows = new THREE.MeshStandardMaterial({ color: "#1c232e", emissive: "#ffc98a", emissiveIntensity: 0.6, roughness: 0.7, toneMapped: false });
  view.windowGlow = [];
  for (const w of WINDOWS) {
    const y = windowY(w),
      R = shellRadius(y) + 0.06;
    const p = polar(w.bearing, R);
    const pane = faceOut(windowPane(g, w.w, w.h, Math.min(w.w, w.h) * 0.3, frame, glass("#9fb8cc", 0.32), seal, p.x, y, p.z, 0.075), w.bearing);
    const glow = mesh(geo(`hab2-glow-${w.w}-${w.h}`, () => new THREE.ShapeGeometry(roundRect(w.w - 0.02, w.h - 0.02, Math.min(w.w, w.h) * 0.28), 8)), view.windows, pane, 0, 0, -0.06);
    glow.castShadow = false;
    view.windowGlow.push(glow);
    // A sun hood over each window, and a stiffening plate round the frame (open in the middle: you can see in and out).
    box(pane, w.w + 0.3, 0.05, 0.1, frame, 0, w.h / 2 + 0.16, 0.03);
    mesh(geo(`hab2-plate-${w.w}-${w.h}`, () => platePlate(w.w, w.h)), paint("#dfe2e6", 0.55, 0.1), pane, 0, 0, -0.05);
  }

  // Airlock tunnel toward the rover dock (south, +z).
  const tunnelLen = AIRLOCK.to - AIRLOCK.from,
    tz = (AIRLOCK.from + AIRLOCK.to) / 2;
  cyl(g, AIRLOCK.r, AIRLOCK.r, tunnelLen, white, 0, AIRLOCK.y, tz, 48).rotation.x = Math.PI / 2;
  for (const z of [5.5, 6.05, 6.6, 7.05]) torus(g, AIRLOCK.r + 0.015, 0.045, frame, 0, AIRLOCK.y, z);
  // Two suitports on the tunnel's flanks, for quick trips outside without bringing dust in.
  for (const sx of [-1, 1]) {
    const port = new THREE.Group();
    port.position.set(sx * (AIRLOCK.r + 0.02), AIRLOCK.y + 0.05, 6.35);
    port.rotation.y = (sx * Math.PI) / 2;
    g.add(port);
    torus(port, 0.32, 0.05, frame, 0, 0, 0);
    cyl(port, 0.29, 0.29, 0.05, paint(C.off, 0.5, 0.15), 0, 0, 0, 24).rotation.x = Math.PI / 2;
    label(port, "SUITPORT", 0.42, 0, 0.44, 0.03);
  }
  // The outer pressure door: a domed hatch in a reinforced frame, with gasket, hinges and a locking wheel.
  const hz = AIRLOCK.to + 0.03;
  torus(g, 0.84, 0.09, frame, 0, AIRLOCK.y, hz);
  torus(g, 0.74, 0.035, seal, 0, AIRLOCK.y, hz + 0.02);
  const hatch = lathe(g, "hatch", [[0, 0.08], [0.45, 0.07], [0.66, 0.035], [0.7, 0], [0.66, -0.03], [0, -0.03]], paint(C.off, 0.5, 0.2), 0, AIRLOCK.y, hz + 0.04, 40);
  hatch.rotation.x = Math.PI / 2;
  for (const dy of [-0.4, 0.4]) {
    rbox(g, 0.2, 0.18, 0.16, 0.03, dark, 0.86, AIRLOCK.y + dy, hz + 0.08);
    cyl(g, 0.035, 0.035, 0.26, frame, 0.86, AIRLOCK.y + dy, hz + 0.1, 10);
  }
  torus(g, 0.17, 0.022, frame, 0, AIRLOCK.y, hz + 0.19);
  for (let i = 0; i < 3; i++) strut(g, 0, AIRLOCK.y, hz + 0.19, Math.cos((i / 3) * Math.PI * 2) * 0.17, AIRLOCK.y + Math.sin((i / 3) * Math.PI * 2) * 0.17, hz + 0.19, 0.012, frame);
  cyl(g, 0.04, 0.04, 0.06, frame, 0, AIRLOCK.y, hz + 0.19, 10).rotation.x = Math.PI / 2;
  windowPane(g, 0.2, 0.2, 0.1, frame, glass("#9fb8cc", 0.4), seal, 0, AIRLOCK.y + 0.37, hz + 0.12, 0.04);
  // Entry deck and steps down to the ground.
  const dz = hz + 0.45;
  panel(g, 1.8, 0.8, 0.06, 0.02, paint("#4a5263", 0.8, 0.3), 0, 0.5, dz).rotation.x = -Math.PI / 2;
  grille(g, 1.6, 0.64, 9, dark, frame, 0, 0.535, dz).rotation.x = -Math.PI / 2;
  for (const [y, z] of [[0.32, dz + 0.52], [0.15, dz + 0.8]]) panel(g, 1.45, 0.3, 0.05, 0.02, paint("#4a5263", 0.8, 0.3), 0, y, z).rotation.x = -Math.PI / 2;
  for (const sx of [-1, 1]) {
    strut(g, sx * 0.86, 0.05, dz + 0.4, sx * 0.86, 0.5, dz + 0.4, 0.035, frame);
    pipe(g, [[sx * 1.0, 0.55, hz - 0.3], [sx * 1.0, 1.4, hz - 0.18], [sx * 0.94, 1.55, hz + 0.4], [sx * 0.86, 1.1, dz + 0.42], [sx * 0.86, 0.55, dz + 0.5]], 0.025, frame, 6);
  }
  // Porch light, status lamp and an access panel beside the door.
  box(g, 0.5, 0.08, 0.12, paint(C.dark, 0.5), 0, AIRLOCK.y + AIRLOCK.r + 0.12, hz - 0.08);
  box(g, 0.42, 0.04, 0.04, light("#fff1d6", 2.2), 0, AIRLOCK.y + AIRLOCK.r + 0.08, hz - 0.01);
  view.status = statusLamp(g, 0.66, AIRLOCK.y + AIRLOCK.r + 0.12, hz - 0.35);
  rbox(g, 0.32, 0.42, 0.08, 0.03, paint(C.grey, 0.5, 0.3), -0.95, AIRLOCK.y + 0.1, hz - 0.1);
  box(g, 0.2, 0.12, 0.01, light("#5ee0ff", 1.0), -0.95, AIRLOCK.y + 0.17, hz - 0.055);
  label(g, "AIRLOCK 1", 0.8, AIRLOCK.r + 0.015, AIRLOCK.y + 0.55, 5.75).rotation.y = Math.PI / 2;
  label(g, "AIRLOCK 1", 0.8, -AIRLOCK.r - 0.015, AIRLOCK.y + 0.55, 5.75).rotation.y = -Math.PI / 2;

  // Cupola on the crown: an eight-sided ring of windows with a top pane.
  const cy = 7.86;
  lathe(g, "hab2-cupola-base", [[1.28, cy - 0.06], [1.34, cy + 0.04], [1.12, cy + 0.2], [1.02, cy + 0.2], [1.02, cy - 0.06]], dark, 0, 0, 0, 48);
  const sides = mesh(geo("hab2-cupola-glass", () => new THREE.CylinderGeometry(0.62, 0.98, 0.5, 8, 1, true)), glass("#a8c4dc", 0.3), g, 0, cy + 0.45, 0);
  sides.castShadow = false;
  cyl(g, 0.63, 0.63, 0.06, frame, 0, cy + 0.71, 0, 8);
  const topPane = mesh(geo("hab2-cupola-top", () => new THREE.CircleGeometry(0.56, 8).rotateX(-Math.PI / 2)), glass("#a8c4dc", 0.3), g, 0, cy + 0.74, 0);
  topPane.castShadow = false;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    strut(g, Math.cos(a) * 1.0, cy + 0.2, Math.sin(a) * 1.0, Math.cos(a) * 0.64, cy + 0.69, Math.sin(a) * 0.64, 0.035, frame, 6);
  }
  const lit = mesh(geo("hab2-cupola-glow", () => new THREE.CircleGeometry(0.95, 24).rotateX(-Math.PI / 2)), view.windows, g, 0, cy + 0.22, 0);
  lit.castShadow = false;
  view.windowGlow.push(lit);

  // Radiator wings on short trusses at the back (north), shedding the life-support room's heat.
  for (const sx of [-1, 1]) {
    const b = sx * 26;
    const root = polar(b, shellRadius(5.4) - 0.05),
      tip = polar(b, 6.15);
    strut(g, root.x, 5.3, root.z, tip.x, 5.45, tip.z, 0.045, frame);
    strut(g, root.x, 4.6, root.z, tip.x, 5.2, tip.z, 0.03, frame);
    const wing = faceOut(panel(g, 1.55, 1.25, 0.05, 0.03, paint("#f1f3f5", 0.35, 0.05), tip.x, 5.45, tip.z), b + sx * 62);
    for (let k = 0; k < 7; k++) box(wing, 0.014, 1.12, 0.02, frame, -0.6 + k * 0.2, 0, 0.035);
  }
  // A vent for the life-support room's exhaust air, low on the north side.
  const vent = polar(8, shellRadius(2.0) + 0.06);
  faceOut(grille(g, 0.7, 0.42, 6, dark, frame, vent.x, 2.0, vent.z), 8);

  // High-gain antenna on the dome: mast, gimbal, a true parabolic dish with feed horn, and a beacon.
  const base = polar(MAST.bearing, MAST.r),
    by = shellHeightAt(MAST.r);
  cyl(g, 0.16, 0.2, 0.12, dark, base.x, by + 0.02, base.z, 16);
  cyl(g, 0.05, 0.07, 1.4, frame, base.x, by + 0.75, base.z, 10);
  rbox(g, 0.2, 0.16, 0.2, 0.03, dark, base.x, by + 1.48, base.z);
  const dishMat = addDetail(new THREE.MeshStandardMaterial({ color: "#eef0f3", roughness: 0.45, metalness: 0.1, side: THREE.DoubleSide }), DETAIL.paint);
  const dishPivot = new THREE.Group();
  dishPivot.position.set(base.x, by + 1.65, base.z);
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
  cyl(g, 0.05, 0.05, 0.08, beacon, base.x, by + 1.6, base.z + 0.18, 8);

  // A maintenance ladder up the east-south-east side, with stand-off brackets and a grab hoop at the top.
  for (const side of [-0.24, 0.24]) {
    const pts: [number, number, number][] = [];
    for (let y = 0.05; y <= 6.2; y += 0.4) {
      const p = polar(LADDER, shellRadius(Math.max(0.5, y)) + 0.24);
      const t = polar(LADDER + 90, side);
      pts.push([p.x + t.x, y, p.z + t.z]);
    }
    pipe(g, pts, 0.022, frame, 6);
  }
  for (let y = 0.3; y <= 6.0; y += 0.3) {
    const p = polar(LADDER, shellRadius(Math.max(0.5, y)) + 0.24),
      t = polar(LADDER + 90, 0.24);
    strut(g, p.x - t.x, y, p.z - t.z, p.x + t.x, y, p.z + t.z, 0.014, frame, 5);
    if (Math.round(y * 10) % 12 === 0) {
      const s = polar(LADDER, shellRadius(y) + 0.02);
      strut(g, s.x, y, s.z, p.x, y, p.z, 0.016, dark, 5);
    }
  }
  // EVA handholds round the shoulder of the shell, and an umbilical to the ground.
  for (let i = 0; i < 16; i++) {
    const b = (i / 16) * 360 + 6;
    const y = 6.12,
      R = shellRadius(y) + 0.07;
    const a = polar(b - 2.2, R - 0.05),
      a1 = polar(b - 1.6, R),
      b1 = polar(b + 1.6, R),
      b2 = polar(b + 2.2, R - 0.05);
    pipe(g, [[a.x, y, a.z], [a1.x, y, a1.z], [b1.x, y, b1.z], [b2.x, y, b2.z]], 0.018, paint("#f2c230", 0.5), 5);
  }
  const u0 = polar(100, 5.1),
    u1 = polar(100, 5.5),
    u2 = polar(100, 5.9),
    u3 = polar(100, 6.4);
  pipe(g, [[u0.x, 0.75, u0.z], [u1.x, 0.5, u1.z], [u2.x, 0.12, u2.z], [u3.x, 0.05, u3.z]], 0.07, rubber("#2b2f37"), 8);
  // Name on the north side, and a power junction box low on the south-east where the cables come in.
  const n = polar(0, shellRadius(3.0) + 0.06);
  faceOut(label(g, "ASTRA HAB-1", 1.6, n.x, 2.95, n.z), 0);
  const jb = polar(150, shellRadius(0.9) + 0.18);
  faceOut(rbox(g, 0.6, 0.5, 0.26, 0.04, paint(C.grey, 0.5, 0.3), jb.x, 0.85, jb.z), 150);
  shield(planet, view);
  view.top = 9.0;
}
