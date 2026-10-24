import * as THREE from "three";
import type { Planet } from "../../sim/types";
import { addDetail, DETAIL } from "../surface";
import { bolts, box, contactShadow, cyl, foil, geo, glass, grille, keep, lathe, light, metal, mesh, paint, pipe, rbox, rng, rubber, shared, strut, torus } from "../kit";
import { C, cabinet, hazard, label, skid, sphereTank, statusLamp, type ModuleView } from "./common";

/** A stack of electrolysis cells between two end plates, held by tie rods; axis along x. */
function cellStack(g: THREE.Object3D, len: number, h: number, d: number, x: number, y: number, z: number) {
  const plate = metal("#6f7787", 0.45),
    cell = paint("#2b3446", 0.5, 0.4),
    rod = metal("#c3cad6", 0.3);
  for (const sx of [-1, 1]) rbox(g, 0.08, h + 0.12, d + 0.12, 0.02, plate, x + (sx * len) / 2, y, z);
  const n = Math.round(len / 0.06);
  for (let i = 0; i < n; i++) box(g, 0.04, h, d, i % 2 ? cell : paint("#3d4a62", 0.45, 0.4), x - len / 2 + 0.05 + i * ((len - 0.1) / (n - 1)), y, z);
  for (const sy of [-1, 1]) for (const sz of [-1, 1]) cyl(g, 0.018, 0.018, len + 0.22, rod, x, y + sy * (h / 2 + 0.03), z + sz * (d / 2 + 0.03), 6).rotation.z = Math.PI / 2;
}

export function buildOxygen(view: ModuleView, planet: Planet) {
  const g = view.group;
  contactShadow(g, 1.9, 1.5, 0.55, 0.02);
  const deck = skid(g, 3.2, 2.3);
  const steel = metal("#9aa3b4", 0.38),
    line = metal("#c3cad6", 0.3);
  const flow = light("#7fd7ff", 1);
  view.glow.push(flow);
  if (planet === "moon") {
    // Electrolysis of mined ice water: water in, oxygen and hydrogen out to separate tanks.
    cabinet(g, 1.0, 1.1, 0.8, C.off, -0.95, deck, 0.55);
    grille(g, 0.6, 0.3, 6, paint(C.dark, 0.6), steel, -0.95, deck + 0.3, 0.96);
    cellStack(g, 1.1, 0.5, 0.5, 0.45, deck + 0.5, 0.55);
    box(g, 1.3, 0.04, 0.7, steel, 0.45, deck + 0.2, 0.55);
    for (const sx of [-1, 1]) box(g, 0.06, 0.18, 0.6, steel, 0.45 + sx * 0.55, deck + 0.1, 0.55);
    sphereTank(g, 0.55, C.white, -0.7, deck + 1.3, -0.5);
    torus(g, 0.555, 0.03, paint(C.blue, 0.5), -0.7, deck + 1.3, -0.5).rotation.x = Math.PI / 2;
    label(g, "O2", 0.4, -0.7, deck + 1.3, 0.06);
    // Hydrogen: a long horizontal cylinder on saddles.
    const h2 = lathe(g, "h2-tank", [[0, -0.75], [0.2, -0.73], [0.3, -0.66], [0.33, -0.55], [0.33, 0.55], [0.3, 0.66], [0.2, 0.73], [0, 0.75]], paint("#e9e2d4", 0.45, 0.15), 0.75, deck + 0.98, -0.5, 28);
    h2.rotation.z = Math.PI / 2;
    for (const x of [0.35, 1.15]) rbox(g, 0.1, 0.5, 0.6, 0.02, steel, x, deck + 0.4, -0.5);
    torus(g, 0.335, 0.025, paint("#c94b3a", 0.5), 0.75, deck + 0.98, -0.5).rotation.y = Math.PI / 2;
    // Sight glass on the water line, which shows flow when working.
    box(g, 0.5, 0.08, 0.06, flow, -0.95, deck + 0.85, 0.97);
    pipe(g, [[-0.45, deck + 0.7, 0.55], [-0.2, deck + 0.9, 0.55], [-0.1, deck + 0.5, 0.55]], 0.035, line, 6);
    pipe(g, [[0.1, deck + 0.8, 0.55], [-0.2, deck + 1.2, 0.0], [-0.55, deck + 1.0, -0.35]], 0.03, line, 6);
    pipe(g, [[0.95, deck + 0.8, 0.55], [1.0, deck + 1.1, 0.0], [0.95, deck + 1.0, -0.4]], 0.03, line, 6);
    // A small vertical radiator for the stack's waste heat.
    for (let i = 0; i < 6; i++) box(g, 0.02, 1.0, 0.5, paint("#eef0f2", 0.5, 0.1), 1.45, deck + 0.85, 0.3 + (i - 2.5) * 0.09);
    view.status = statusLamp(g, -1.35, deck + 1.18, 0.75);
    view.top = 2.8;
  } else {
    // Oxygen from the Martian air (as NASA's MOXIE did): filter, compressor, then a hot solid-oxide cell stack.
    rbox(g, 0.9, 0.8, 0.8, 0.05, paint(C.grey, 0.55, 0.2), -1.0, deck + 0.4, 0.2);
    grille(g, 0.72, 0.62, 8, paint(C.dark, 0.6), steel, -1.0, deck + 0.4, 0.61);
    label(g, "CO2 INTAKE", 0.6, -1.0, deck + 0.9, 0.61);
    const fan = keep(new THREE.Group());
    fan.position.set(-1.0, deck + 0.82, 0.2);
    g.add(fan);
    for (let k = 0; k < 5; k++) {
      const arm = new THREE.Group();
      arm.rotation.y = (k / 5) * Math.PI * 2;
      fan.add(arm);
      box(arm, 0.3, 0.012, 0.09, metal("#8892a6", 0.4), 0.16, 0, 0).rotation.x = 0.4;
    }
    view.spin.push(fan);
    torus(g, 0.34, 0.03, steel, -1.0, deck + 0.82, 0.2).rotation.x = Math.PI / 2;
    // Scroll compressor: a finned drum.
    cyl(g, 0.28, 0.28, 0.55, paint(C.off, 0.5), -0.1, deck + 0.55, 0.2, 24).rotation.z = Math.PI / 2;
    for (let i = 0; i < 8; i++) torus(g, 0.29, 0.02, steel, -0.32 + i * 0.065, deck + 0.55, 0.2).rotation.y = Math.PI / 2;
    // The hot section: a gold-insulated box hiding the 800 °C cell stack.
    rbox(g, 1.0, 0.75, 0.8, 0.06, foil("#d6a24a"), 0.85, deck + 0.4, 0.2);
    box(g, 1.02, 0.06, 0.82, hazard(), 0.85, deck + 0.8, 0.2);
    label(g, "SOXE  HOT", 0.55, 0.85, deck + 0.52, 0.61);
    sphereTank(g, 0.5, C.white, 0.3, deck + 1.65, -0.55);
    torus(g, 0.505, 0.03, paint(C.blue, 0.5), 0.3, deck + 1.65, -0.55).rotation.x = Math.PI / 2;
    box(g, 0.4, 0.06, 0.05, flow, 0.85, deck + 0.95, 0.62);
    pipe(g, [[-0.55, deck + 0.55, 0.2], [-0.4, deck + 0.55, 0.2]], 0.05, line, 8);
    pipe(g, [[0.2, deck + 0.55, 0.2], [0.35, deck + 0.5, 0.2]], 0.04, line, 6);
    pipe(g, [[0.85, deck + 0.8, -0.1], [0.75, deck + 1.1, -0.4], [0.5, deck + 1.35, -0.55]], 0.03, line, 6);
    // Exhaust stack venting the leftover CO2 and CO.
    cyl(g, 0.06, 0.07, 1.4, steel, 1.3, deck + 1.0, -0.6, 10);
    cyl(g, 0.09, 0.09, 0.1, paint(C.dark, 0.5), 1.3, deck + 1.72, -0.6, 10);
    view.status = statusLamp(g, -1.35, deck + 0.95, -0.4);
    view.top = 2.6;
  }
}

export function buildRecycler(view: ModuleView) {
  const g = view.group;
  contactShadow(g, 1.8, 1.6, 0.55, 0.02);
  const deck = skid(g, 2.8, 2.4);
  const steel = metal("#9aa3b4", 0.38),
    line = metal("#c3cad6", 0.3),
    white = paint(C.white, 0.45, 0.1);
  // The distiller: a rotating drum boils dirty water at low pressure and condenses the vapour clean.
  lathe(g, "distiller", [[0, 0], [0.72, 0], [0.78, 0.08], [0.78, 1.3], [0.7, 1.42], [0.45, 1.52], [0, 1.54]], white, -0.45, deck, -0.1, 40);
  for (const y of [0.25, 0.75, 1.2]) torus(g, 0.785, 0.022, steel, -0.45, deck + y, -0.1).rotation.x = Math.PI / 2;
  bolts(g, 16, 0.6, steel, -0.45, deck + 1.46, -0.1, 0.02).rotation.x = -Math.PI / 2;
  label(g, "WATER RECOVERY", 0.9, -0.45, deck + 0.95, 0.69);
  // Motor housing and a cooling fan on top (spins while working).
  cyl(g, 0.26, 0.3, 0.3, paint(C.dark, 0.5, 0.3), -0.45, deck + 1.68, -0.1, 24);
  const rotor = keep(new THREE.Group());
  rotor.position.set(-0.45, deck + 1.86, -0.1);
  g.add(rotor);
  for (let k = 0; k < 6; k++) {
    const arm = new THREE.Group();
    arm.rotation.y = (k / 6) * Math.PI * 2;
    rotor.add(arm);
    box(arm, 0.22, 0.01, 0.07, metal("#8892a6", 0.4), 0.12, 0, 0).rotation.x = 0.4;
  }
  cyl(rotor, 0.04, 0.04, 0.04, steel, 0, 0, 0, 10);
  view.spin.push(rotor);
  torus(g, 0.27, 0.02, steel, -0.45, deck + 1.86, -0.1).rotation.x = Math.PI / 2;
  // Multifiltration beds in a rack, and the product water tank with a sight glass.
  for (let i = 0; i < 3; i++) {
    const z = -0.7 + i * 0.5;
    lathe(g, "bed", [[0, 0], [0.16, 0], [0.18, 0.04], [0.18, 0.86], [0.16, 0.9], [0.06, 0.94], [0, 0.94]], paint(C.off, 0.5, 0.15), 0.75, deck, z, 20);
    torus(g, 0.183, 0.02, paint(C.blue, 0.5), 0.75, deck + 0.7, z).rotation.x = Math.PI / 2;
    pipe(g, [[0.75, deck + 0.94, z], [0.75, deck + 1.06, z], [0.95, deck + 1.06, z]], 0.02, line, 5);
  }
  box(g, 0.05, 0.05, 1.3, line, 0.95, deck + 1.06, -0.2);
  rbox(g, 0.5, 0.95, 0.5, 0.06, white, 0.9, deck + 0.48, 0.75);
  const water = light("#4f95ff", 1);
  view.glow.push(water);
  box(g, 0.06, 0.7, 0.03, water, 0.9, deck + 0.5, 1.012);
  for (const y of [0.15, 0.85]) box(g, 0.12, 0.02, 0.03, steel, 0.9, deck + y, 1.012);
  pipe(g, [[-0.45, deck + 0.4, 0.68], [0.1, deck + 0.3, 0.9], [0.65, deck + 0.3, 0.8]], 0.035, line, 6);
  pipe(g, [[0.95, deck + 0.95, 0.75], [0.95, deck + 1.06, 0.5]], 0.025, line, 5);
  pipe(g, [[-1.0, deck + 0.3, 0.3], [-1.3, 0.25, 0.6], [-1.5, 0.05, 1.1]], 0.04, rubber("#2b2f37"), 6);
  view.status = statusLamp(g, -1.1, deck + 0.05, 0.95);
  view.top = 2.6;
}

/* ---------- Greenhouse plants ---------- */

/** One leaf: an ellipse, cupped across and curved along its length; its stem is at the origin and it points along +x. */
function leafGeometry(len: number, width: number, curl: number) {
  return geo(`leaf${len},${width},${curl}`, () => {
    const g = new THREE.PlaneGeometry(len, width, 6, 3);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const u = p.getX(i) / len + 0.5,
        v = p.getY(i) / (width / 2);
      // Ellipse-ish outline: narrow at the stem and the tip.
      const w = Math.sin(Math.min(1, u * 1.05) * Math.PI) ** 0.7;
      const x = u * len,
        y = v * w * (width / 2);
      const z = Math.abs(v) * w * width * 0.18 + u * u * curl * len;
      p.setXYZ(i, x, z, y);
    }
    g.computeVertexNormals();
    return g;
  });
}

function plantMaterial(color: string) {
  return shared(`leaf:${color}`, () => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0, side: THREE.DoubleSide });
    return addDetail(m, { ...DETAIL.fabric, bump: 0.18, grime: 0.12 });
  });
}

/** A lettuce or chard rosette of overlapping leaves. */
function rosette(g: THREE.Object3D, x: number, y: number, z: number, size: number, r: () => number, mats: THREE.Material[]) {
  const n = 9 + Math.floor(r() * 4);
  for (let i = 0; i < n; i++) {
    const a = i * 2.4 + r() * 0.4;
    const inner = i / n;
    const len = size * (0.9 - inner * 0.45);
    const leaf = mesh(leafGeometry(0.22, 0.13, -0.6), mats[(i + Math.floor(r() * 2)) % mats.length], g, x, y + inner * size * 0.12, z);
    leaf.scale.setScalar(len / 0.22);
    leaf.rotation.order = "YZX";
    leaf.rotation.set(0, a, 0.25 + inner * 0.95);
  }
}

/** A staked tomato vine with leaves and a few red fruit. */
function vine(g: THREE.Object3D, x: number, y: number, z: number, h: number, r: () => number, leafMats: THREE.Material[], fruit: THREE.Material, stem: THREE.Material) {
  cyl(g, 0.01, 0.012, h + 0.15, paint("#c9b48a", 0.8), x + 0.04, y + (h + 0.15) / 2, z, 5);
  const pts: [number, number, number][] = [];
  for (let k = 0; k <= 5; k++) pts.push([x + Math.sin(k * 1.7) * 0.03, y + (k / 5) * h, z + Math.cos(k * 1.3) * 0.03]);
  pipe(g, pts, 0.012, stem, 4);
  for (let k = 0; k < 7; k++) {
    const t = 0.15 + (k / 7) * 0.85;
    const leaf = mesh(leafGeometry(0.22, 0.13, -0.6), leafMats[k % leafMats.length], g, x, y + t * h, z);
    leaf.scale.setScalar(0.7 + r() * 0.35);
    leaf.rotation.order = "YZX";
    leaf.rotation.set(0, k * 2.2 + r(), 0.4 + r() * 0.4);
  }
  for (let k = 0; k < 3; k++) {
    const t = 0.25 + r() * 0.5;
    const tomato = mesh(geo("tomato", () => new THREE.SphereGeometry(0.045, 12, 8).scale(1, 0.85, 1)), fruit, g, x + (r() - 0.5) * 0.14, y + t * h, z + (r() - 0.5) * 0.14);
    tomato.scale.setScalar(0.8 + r() * 0.4);
  }
}

export function buildGreenhouse(view: ModuleView) {
  const g = view.group;
  contactShadow(g, 2.8, 1.9, 0.5, 0.02);
  const deck = skid(g, 4.9, 3.3, 0.3);
  const white = paint(C.white, 0.42, 0.12),
    steel = metal("#9aa3b4", 0.36),
    frameMat = metal("#d5dae2", 0.3);
  const L = 4.4,
    R = 1.5,
    y0 = deck;
  // A half-cylinder of glazing on arched ribs.
  const shell = keep(new THREE.Mesh(geo("gh-shell", () => new THREE.CylinderGeometry(R, R, L, 48, 1, true, -Math.PI / 2, Math.PI)), glass("#dff3ff", 0.16)));
  shell.rotation.z = Math.PI / 2;
  shell.position.y = y0;
  shell.renderOrder = 2;
  g.add(shell);
  for (const x of [-2.2, -1.1, 0, 1.1, 2.2]) torus(g, R + 0.02, 0.045, frameMat, x, y0, 0, Math.PI).rotation.y = Math.PI / 2;
  for (const a of [0.3, 0.75, 1.2, 1.57, 1.94, 2.39, 2.84]) box(g, L, 0.03, 0.03, frameMat, 0, y0 + Math.sin(a) * (R + 0.01), Math.cos(a) * (R + 0.01));
  // End walls: glass with a frame, an airlock door on the east end and the environmental unit on the west.
  for (const sx of [-1, 1]) {
    const cap = keep(new THREE.Mesh(geo("gh-cap", () => new THREE.CircleGeometry(R, 32, 0, Math.PI)), glass("#dff3ff", 0.16)));
    cap.position.set((sx * L) / 2, y0, 0);
    cap.rotation.y = Math.PI / 2;
    cap.renderOrder = 2;
    g.add(cap);
    for (const z of [-0.75, 0.75]) box(g, 0.04, Math.sqrt(R * R - z * z), 0.04, frameMat, (sx * L) / 2, y0 + Math.sqrt(R * R - z * z) / 2, z);
  }
  rbox(g, 0.16, 1.3, 0.9, 0.05, white, 2.26, y0 + 0.66, 0);
  rbox(g, 0.06, 1.1, 0.7, 0.04, paint(C.dark, 0.5, 0.3), 2.33, y0 + 0.6, 0);
  rbox(g, 0.05, 0.14, 0.04, 0.01, steel, 2.37, y0 + 0.65, 0.25);
  label(g, "GROW-1", 0.5, 2.36, y0 + 1.25, 0).rotation.y = Math.PI / 2;
  // Environmental control unit: fan, CO2 and nutrient tanks.
  cabinet(g, 0.55, 1.0, 1.2, C.off, -2.58, 0, 0);
  grille(g, 0.36, 0.36, 5, paint(C.dark, 0.6), steel, -2.58, 0.6, 0.62);
  const fan = keep(new THREE.Group());
  fan.position.set(-2.58, 1.06, 0);
  g.add(fan);
  for (let k = 0; k < 5; k++) {
    const arm = new THREE.Group();
    arm.rotation.y = (k / 5) * Math.PI * 2;
    fan.add(arm);
    box(arm, 0.2, 0.01, 0.07, metal("#8892a6", 0.4), 0.11, 0, 0).rotation.x = 0.4;
  }
  view.spin.push(fan);
  cyl(g, 0.12, 0.12, 0.9, paint("#7a8aa0", 0.45, 0.3), -2.58, 0.55, -0.8, 16);
  pipe(g, [[-2.3, 0.85, 0.3], [-2.0, 1.05, 0.3], [-1.9, y0 + 0.9, 0.3]], 0.03, steel, 6);
  // Interior: two grow troughs, irrigation lines and the LED light bars above them.
  const trough = paint("#e6e9ef", 0.55, 0.1),
    media = paint("#3e2c22", 0.98, 0);
  const rack = steel;
  for (const z of [-0.62, 0.62]) {
    rbox(g, 4.0, 0.3, 0.6, 0.04, trough, 0, y0 + 0.42, z);
    box(g, 3.92, 0.02, 0.52, media, 0, y0 + 0.58, z);
    for (const x of [-1.8, -0.6, 0.6, 1.8]) box(g, 0.04, 0.28, 0.04, rack, x, y0 + 0.14, z + 0.25);
    pipe(g, [[-1.95, y0 + 0.61, z + 0.2], [1.95, y0 + 0.61, z + 0.2]], 0.012, paint("#2b2f37", 0.6), 4);
  }
  const lamp = light("#ffb8ea", 1);
  view.glow.push(lamp);
  for (const z of [-0.5, 0.5]) {
    rbox(g, 4.0, 0.05, 0.16, 0.02, paint(C.dark, 0.5, 0.3), 0, y0 + 1.25, z);
    for (let i = 0; i < 8; i++) box(g, 0.4, 0.012, 0.08, lamp, -1.75 + i * 0.5, y0 + 1.222, z);
    for (const x of [-1.8, 1.8]) strut(g, x, y0 + 1.27, z, x, y0 + Math.sqrt(R * R - z * z) - 0.02, z, 0.008, steel, 4);
  }
  // Plants: lettuce rosettes and staked tomato vines.
  const r = rng(17);
  const greens = [plantMaterial("#4e9b3e"), plantMaterial("#6db24a"), plantMaterial("#3b8236")];
  const red = paint("#d8402f", 0.35, 0);
  const stem = paint("#4a7a34", 0.8, 0);
  for (let i = 0; i < 18; i++) {
    const x = -1.75 + (i % 9) * 0.44,
      z = i < 9 ? -0.62 : 0.62;
    if (i % 3 === 2) vine(g, x, y0 + 0.59, z, 0.6 + r() * 0.12, r, greens, red, stem);
    else rosette(g, x + (r() - 0.5) * 0.06, y0 + 0.59, z + (r() - 0.5) * 0.06, 0.26 + r() * 0.05, r, greens);
  }
  view.status = statusLamp(g, 2.3, y0 + 1.42, 0.65);
  view.top = 2.3;
}
