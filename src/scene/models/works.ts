import * as THREE from "three";
import type { Planet } from "../../sim/types";
import { addDetail, DETAIL } from "../surface";
import { ball, bolts, box, contactShadow, cyl, fabric, foil, geo, glass, keep, lathe, light, metal, mesh, paint, pipe, rbox, rng, rubber, shared, soil, strut, torus, visor, windowPane } from "../kit";
import { C, cabinet, hazard, label, radiationSign, sandbagGeometry, sandMaterial, skid, soilColor, statusLamp, type ModuleView } from "./common";

/** A helical auger flight: a flat spiral ribbon around a shaft, along y. */
function augerGeometry(len: number, r0: number, r1: number, pitch: number) {
  return geo(`auger${len},${r0},${r1},${pitch}`, () => {
    const turns = len / pitch,
      steps = Math.ceil(turns * 20);
    const pos: number[] = [],
      idx: number[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps,
        a = t * turns * Math.PI * 2,
        y = t * len;
      for (const r of [r0, r1]) pos.push(Math.cos(a) * r, y + (r === r1 ? -0.012 : 0), Math.sin(a) * r);
      if (i < steps) {
        const k = i * 2;
        idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  });
}

function iceMaterial() {
  return shared("ice-chunk", () => {
    const m = new THREE.MeshPhysicalMaterial({ color: "#d7e7f2", roughness: 0.28, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.2, envMapIntensity: 1.2 });
    return addDetail(m, { ...DETAIL.rock, bump: 0.5, grime: 0.15 });
  });
}

export function buildIceDrill(view: ModuleView, planet: Planet) {
  const g = view.group;
  contactShadow(g, 2.2, 2.2, 0.55, 0.02);
  const steel = metal("#9aa3b4", 0.38),
    tower = paint(C.orange, 0.5, 0.25),
    dark = paint(C.dark, 0.6, 0.3),
    white = paint(C.white, 0.45, 0.1);
  // Base frame on three outrigger feet.
  lathe(g, "drill-base", [[0, 0.18], [0.95, 0.18], [1.05, 0.26], [1.05, 0.42], [0.95, 0.48], [0, 0.48]], dark, 0, 0, 0, 6);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 2,
      c = Math.cos(a),
      s = Math.sin(a);
    strut(g, c * 0.9, 0.36, s * 0.9, c * 2.0, 0.1, s * 2.0, 0.06, steel);
    strut(g, c * 0.9, 0.22, s * 0.9, c * 2.0, 0.1, s * 2.0, 0.04, steel);
    cyl(g, 0.24, 0.28, 0.07, steel, c * 2.0, 0.035, s * 2.0, 16);
    cyl(g, 0.05, 0.05, 0.22, metal("#5d6573", 0.45), c * 2.0, 0.16, s * 2.0, 8);
  }
  // The mast: two rails with lattice bracing, a crown block and a drill carriage.
  const H = 4.6;
  for (const sx of [-1, 1]) {
    rbox(g, 0.12, H, 0.12, 0.02, tower, sx * 0.32, 0.48 + H / 2, 0);
    for (let y = 0.6; y < H; y += 0.5) strut(g, sx * 0.32, 0.48 + y, 0, -sx * 0.32, 0.48 + y + 0.5, 0, 0.018, steel, 4);
  }
  for (let y = 0.6; y < H; y += 0.5) box(g, 0.64, 0.03, 0.03, steel, 0, 0.48 + y, -0.06);
  rbox(g, 0.95, 0.32, 0.5, 0.04, tower, 0, 0.48 + H + 0.12, 0);
  label(g, "PRIME DRILL", 0.6, 0, 0.48 + H + 0.12, 0.26);
  for (const sx of [-1, 1]) strut(g, sx * 0.32, 0.48 + H - 0.4, 0, sx * 0.9, 0.42, sx * 0.4, 0.035, steel);
  strut(g, 0, 0.48 + H - 0.4, 0.06, 0, 0.42, -1.0, 0.035, steel);
  // Spinning drill string: shaft, auger flight and the motor head (it turns while working).
  const bit = keep(new THREE.Group());
  bit.position.set(0, 0, 0.3);
  g.add(bit);
  const shaft = metal("#c9ced8", 0.28);
  cyl(bit, 0.055, 0.055, 4.4, shaft, 0, 1.8, 0, 12);
  mesh(augerGeometry(2.0, 0.05, 0.15, 0.16), shaft, bit, 0, -0.35, 0);
  cyl(bit, 0.08, 0.04, 0.12, metal("#5d6573", 0.4), 0, -0.4, 0, 10);
  const head = rbox(bit, 0.42, 0.45, 0.42, 0.05, paint(C.grey, 0.5, 0.35), 0, 3.6, 0);
  head.rotation.y = Math.PI / 4;
  for (let i = 0; i < 6; i++) box(bit, 0.02, 0.32, 0.46, steel, 0, 3.6, 0).rotation.y = (i / 6) * Math.PI;
  view.spin.push(bit);
  // Carriage that holds the head on the rails.
  rbox(g, 0.8, 0.2, 0.2, 0.03, steel, 0, 3.92, 0.12);
  pipe(g, [[0.25, 3.95, 0.25], [0.6, 4.4, 0.1], [0.4, 4.9, -0.05]], 0.03, rubber("#2b2f37"), 6);
  // Work light, aimed down at the hole.
  const work = light("#fff3d6", 1);
  view.glow.push(work);
  rbox(g, 0.28, 0.12, 0.14, 0.03, dark, 0, 4.85, 0.32);
  box(g, 0.22, 0.02, 0.1, work, 0, 4.785, 0.32);
  // Ice processing: a heated hopper that sublimates the ice, a cold trap and a water tank.
  rbox(g, 1.1, 0.8, 0.9, 0.06, foil("#cfa04c"), 1.5, 0.4, 0.4);
  box(g, 1.12, 0.06, 0.92, hazard(), 1.5, 0.8, 0.4);
  rbox(g, 0.9, 0.25, 0.7, 0.04, paint(C.grey, 0.55, 0.3), 1.5, 0.93, 0.4);
  const ice = iceMaterial();
  const r = rng(9);
  for (let i = 0; i < 9; i++) {
    const chunk = mesh(geo(`ice${i % 3}`, () => new THREE.IcosahedronGeometry(0.11 + (i % 3) * 0.03, 1)), ice, g, 1.2 + r() * 0.6, 1.08, 0.2 + r() * 0.4);
    chunk.rotation.set(r() * 3, r() * 3, 0);
    chunk.scale.set(1, 0.7 + r() * 0.3, 1);
  }
  pipe(g, [[0.3, 0.6, 0.3], [0.7, 0.95, 0.4], [1.05, 1.15, 0.4]], 0.06, steel, 8);
  lathe(g, "water-tank", [[0, 0], [0.42, 0], [0.46, 0.05], [0.46, 1.05], [0.4, 1.15], [0.12, 1.2], [0, 1.2]], white, -1.3, 0, 0.45, 28);
  torus(g, 0.465, 0.03, paint(C.blue, 0.5), -1.3, 0.75, 0.45).rotation.x = Math.PI / 2;
  label(g, "H2O", 0.4, -1.3, 0.5, 0.92);
  pipe(g, [[-0.85, 0.6, 0.45], [-0.4, 0.55, 0.3], [-0.15, 0.5, 0.3]], 0.035, metal("#c3cad6", 0.3), 6);
  cabinet(g, 0.6, 0.8, 0.45, C.off, -0.5, 0, -1.25);
  view.status = statusLamp(g, -1.3, 1.28, 0.45);
  // A spoil heap of drill cuttings beside the hole.
  const spoil = mesh(geo("spoil", () => new THREE.SphereGeometry(0.6, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.35, 0.8)), soil(planet === "mars" ? "#7c4a35" : "#6c6b69"), g, -0.8, 0.0, 1.45);
  spoil.receiveShadow = true;
  view.top = 5.3;
}

/** A corrugated steel arch, half-buried under sacks of regolith: mass stops radiation. */
export function buildShelter(view: ModuleView, planet: Planet) {
  const g = view.group;
  contactShadow(g, 2.6, 2.2, 0.6, 0.02);
  const W = 3.6,
    D = 2.9,
    R = 1.45;
  // The corrugated arch (only the ends show beneath the sandbags).
  const arch = geo("shelter-arch", () => {
    const geom = new THREE.CylinderGeometry(R, R, D, 64, 1, true, -Math.PI / 2, Math.PI);
    const p = geom.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i),
        z = p.getZ(i);
      const a = Math.atan2(z, x);
      const k = 1 + Math.sin(a * 40) * 0.012;
      p.setX(i, x * k);
      p.setZ(i, z * k);
    }
    geom.computeVertexNormals();
    geom.rotateX(-Math.PI / 2);
    return geom;
  });
  const steel = metal("#8f98a8", 0.42);
  mesh(arch, steel, g, 0, 0.12, 0);
  lathe(g, "shelter-floor", [[0, 0], [1.6, 0], [1.6, 0.14], [0, 0.14]], paint("#5d6270", 0.85, 0.2), 0, 0, 0, 4).rotation.y = Math.PI / 4;
  // Front wall with a pressure door, facing +z (toward the habitat).
  const wall = paint(C.off, 0.55, 0.15);
  const front = new THREE.Shape();
  front.absarc(0, 0, R, 0, Math.PI, false);
  front.lineTo(R, 0);
  const doorHole = new THREE.Path();
  doorHole.moveTo(-0.45, 0.04);
  doorHole.lineTo(0.45, 0.04);
  doorHole.lineTo(0.45, 1.1);
  doorHole.quadraticCurveTo(0.45, 1.25, 0.3, 1.25);
  doorHole.lineTo(-0.3, 1.25);
  doorHole.quadraticCurveTo(-0.45, 1.25, -0.45, 1.1);
  doorHole.lineTo(-0.45, 0.04);
  front.holes.push(doorHole);
  mesh(geo("shelter-front", () => new THREE.ExtrudeGeometry(front, { depth: 0.1, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 2, curveSegments: 24 })), wall, g, 0, 0.12, D / 2 - 0.05);
  mesh(geo("shelter-back", () => new THREE.CircleGeometry(R, 32, 0, Math.PI)), wall, g, 0, 0.12, -D / 2 + 0.02).rotation.y = Math.PI;
  rbox(g, 0.86, 1.2, 0.08, 0.06, paint(C.grey, 0.5, 0.35), 0, 0.12 + 0.62, D / 2 + 0.0);
  rbox(g, 0.5, 0.06, 0.04, 0.02, metal("#c3cad6", 0.3), 0.15, 0.12 + 0.7, D / 2 + 0.06);
  windowPane(g, 0.22, 0.22, 0.1, metal("#c3cad6", 0.32), visor(), rubber(), 0, 0.12 + 1.0, D / 2 + 0.05, 0.035);
  const door = light("#c48bff", 1);
  view.glow.push(door);
  box(g, 0.7, 0.04, 0.04, door, 0, 0.12 + 1.4, D / 2 + 0.06);
  box(g, 0.42, 0.42, 0.02, radiationSign(), 0.9, 0.12 + 0.72, D / 2 + 0.07);
  label(g, "STORM SHELTER", 1.0, 0, 0.12 + 1.62, D / 2 + 0.07);
  // Sandbag cover: courses following the arch, leaving the door and the front wall clear.
  const bag = sandbagGeometry();
  const sand = sandMaterial(planet);
  const spots: THREE.Matrix4[] = [];
  const r = rng(44);
  const q = new THREE.Quaternion(),
    e = new THREE.Euler(),
    s = new THREE.Vector3(),
    v = new THREE.Vector3();
  const rows = Math.floor(D / 0.44);
  for (let layer = 0; layer < 2; layer++) {
    const RR = R + 0.17 + layer * 0.3;
    const n = Math.floor((Math.PI * RR) / 0.3);
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI;
      for (let k = 0; k < rows; k++) {
        const z = -D / 2 + 0.22 + k * ((D - 0.44) / (rows - 1)) + ((i + layer) % 2) * 0.1 - 0.05;
        e.set(0, 0, a - Math.PI / 2 + (r() - 0.5) * 0.05, "XYZ");
        q.setFromEuler(e).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2));
        s.set(0.95 + r() * 0.12, 1 + r() * 0.2, 0.95 + r() * 0.1);
        v.set(Math.cos(a) * RR, 0.12 + Math.sin(a) * RR, z);
        spots.push(new THREE.Matrix4().compose(v, q, s));
      }
    }
  }
  // Side berms of piled bags, end walls of stacked courses.
  for (let c = 0; c < 4; c++)
    for (let i = 0; i < 5; i++) {
      const x = -W / 2 + 0.3 + i * 0.6 + (c % 2) * 0.3;
      if (Math.abs(x) < 0.75) continue;
      v.set(x, 0.12 + c * 0.29, D / 2 + 0.3);
      q.setFromEuler(e.set(0, (r() - 0.5) * 0.1, 0));
      if (c < 2) spots.push(new THREE.Matrix4().compose(v.clone(), q.clone(), s.set(1, 1, 1)));
      v.z = -D / 2 - 0.3;
      spots.push(new THREE.Matrix4().compose(v.clone(), q.clone(), s));
    }
  const inst = new THREE.InstancedMesh(bag, sand, spots.length);
  const tint = new THREE.Color();
  spots.forEach((m, i) => {
    inst.setMatrixAt(i, m);
    inst.setColorAt(i, tint.setScalar(0.85 + r() * 0.25));
  });
  inst.castShadow = inst.receiveShadow = true;
  inst.computeBoundingSphere();
  g.add(keep(inst));
  // Loose regolith banked against the sides.
  for (const sx of [-1, 1]) {
    const bank = mesh(geo("shelter-bank", () => new THREE.SphereGeometry(1, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.9, 0.7, D * 0.6)), soil(soilColor(planet)), g, sx * (R + 0.35), 0, 0);
    bank.receiveShadow = true;
  }
  view.status = statusLamp(g, 0.62, 0.12 + 1.42, D / 2 + 0.12);
  view.top = 2.6;
}

/** A pressurised laboratory module on a cradle, with an instrument mast, a weather station and a sample glovebox. */
export function buildLab(view: ModuleView) {
  const g = view.group;
  contactShadow(g, 2.1, 1.6, 0.55, 0.02);
  const deck = skid(g, 3.6, 2.4);
  const steel = metal("#9aa3b4", 0.38),
    white = fabric("#edf0f3", 0.7),
    band = paint(C.off, 0.5, 0.15);
  for (const x of [-0.95, 0.95]) {
    const cradle = new THREE.Shape();
    cradle.moveTo(-0.85, 0);
    cradle.lineTo(0.85, 0);
    cradle.lineTo(0.85, 0.85);
    cradle.absarc(0, 1.15, 0.97, -0.25, Math.PI + 0.25, true);
    cradle.lineTo(-0.85, 0);
    mesh(geo("lab-cradle", () => new THREE.ExtrudeGeometry(cradle, { depth: 0.16, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 1, curveSegments: 18 }).translate(0, 0, -0.08).rotateY(Math.PI / 2)), metal("#6f7787", 0.45), g, x, deck, 0);
  }
  // The hull: a cylinder with domed ends, ribbed with rings; axis along x.
  const hy = deck + 1.15;
  const hull = lathe(g, "lab-hull", [[0, -1.95], [0.45, -1.88], [0.78, -1.7], [0.92, -1.45], [0.96, -1.2], [0.96, 1.2], [0.92, 1.45], [0.78, 1.7], [0.45, 1.88], [0, 1.95]], white, 0, hy, 0, 40);
  hull.rotation.z = Math.PI / 2;
  for (const x of [-1.2, -0.4, 0.4, 1.2]) torus(g, 0.965, 0.03, band, x, hy, 0).rotation.y = Math.PI / 2;
  // Windows on the south face (toward the habitat), lit from inside; a hatch on the west end.
  const win = light("#d9efff", 0.6);
  win.userData.glow = 0.45;
  view.glow.push(win);
  for (const x of [-0.6, 0.6]) windowPane(g, 0.42, 0.3, 0.08, metal("#c3cad6", 0.32), win, rubber(), x, hy + 0.19, 0.955, 0.04).rotation.x = -0.2;
  const hatch = new THREE.Group();
  hatch.position.set(-1.9, hy, 0);
  hatch.rotation.y = -Math.PI / 2;
  g.add(hatch);
  torus(hatch, 0.38, 0.05, steel, 0, 0, 0);
  cyl(hatch, 0.36, 0.36, 0.06, paint(C.grey, 0.5, 0.3), 0, 0, 0, 24).rotation.x = Math.PI / 2;
  bolts(hatch, 12, 0.3, steel, 0, 0, 0.04, 0.018);
  torus(hatch, 0.12, 0.018, steel, 0, 0, 0.06);
  label(g, "SCIENCE LAB", 1.1, 0, hy + 0.59, 0.785).rotation.x = -0.65;
  // Glovebox for samples on its own stand beside the east end.
  for (const [x, z] of [[1.95, 0.45], [2.45, 0.45], [1.95, 0.85], [2.45, 0.85]]) cyl(g, 0.025, 0.025, 0.7, steel, x, 0.35, z, 6);
  rbox(g, 0.62, 0.12, 0.52, 0.03, paint(C.grey, 0.5, 0.3), 2.2, 0.72, 0.65);
  const gb = keep(new THREE.Mesh(geo("glovebox", () => new THREE.BoxGeometry(0.56, 0.32, 0.46)), glass("#dff3ff", 0.25)));
  gb.position.set(2.2, 0.94, 0.65);
  g.add(gb);
  box(g, 0.58, 0.02, 0.48, steel, 2.2, 1.11, 0.65);
  for (const x of [2.07, 2.33]) torus(g, 0.055, 0.014, rubber(), x, 0.92, 0.885);
  // Instrument mast with a turning dish.
  cyl(g, 0.12, 0.16, 0.45, steel, 0.7, hy + 1.1, 0, 12);
  const mast = keep(new THREE.Group());
  mast.position.set(0.7, hy + 1.32, 0);
  g.add(mast);
  cyl(mast, 0.04, 0.05, 0.7, steel, 0, 0.35, 0, 8);
  const dishMat = shared("lab-dish", () => addDetail(new THREE.MeshStandardMaterial({ color: "#eef0f3", roughness: 0.45, metalness: 0.1, side: THREE.DoubleSide }), DETAIL.paint));
  const dish = lathe(mast, "lab-dish", [[0.0, 0.0], [0.2, 0.012], [0.4, 0.05], [0.58, 0.115], [0.62, 0.13]], dishMat, 0, 0.82, 0, 32);
  dish.rotation.x = Math.PI / 2 - 0.95;
  strut(mast, 0, 0.82, 0, 0, 1.05, -0.32, 0.012, steel, 4);
  ball(mast, 0.04, paint(C.dark, 0.5), 0, 1.06, -0.33, 8);
  view.spin.push(mast);
  // Weather station: a cup anemometer on a pole.
  cyl(g, 0.025, 0.03, 1.25, steel, -1.1, hy + 1.4, -0.55, 6);
  const wind = keep(new THREE.Group());
  wind.position.set(-1.1, hy + 2.02, -0.55);
  g.add(wind);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    strut(wind, 0, 0, 0, Math.cos(a) * 0.22, 0, Math.sin(a) * 0.22, 0.008, steel, 4);
    const cup = mesh(geo("anemo-cup", () => new THREE.SphereGeometry(0.05, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2)), paint(C.white, 0.45), wind, Math.cos(a) * 0.24, 0, Math.sin(a) * 0.24);
    cup.rotation.set(0, -a, Math.PI / 2);
  }
  view.spin.push(wind);
  rbox(g, 0.18, 0.1, 0.12, 0.02, band, -1.1, hy + 1.7, -0.55);
  cabinet(g, 0.9, 0.55, 0.45, C.grey, -0.9, deck, 1.0);
  pipe(g, [[-1.3, deck + 0.3, 1.1], [-1.6, 0.25, 1.3], [-1.8, 0.05, 1.6]], 0.035, rubber("#2b2f37"), 6);
  view.status = statusLamp(g, 1.55, deck + 0.05, 0.95);
  view.top = 3.9;
}
