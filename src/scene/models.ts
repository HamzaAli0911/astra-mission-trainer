import * as THREE from "three";
import { MODULES } from "../sim/modules";
import type { ModuleType, Planet } from "../sim/types";
import { ball, box, canvasTexture, capsule, cyl, dome, glass, light, paint, rbox, torus } from "./kit";

/** Procedural, original models. Everything faces north (−z) at rotation 0. */
const WHITE = "#e9eef6",
  GREY = "#b9c2d0",
  DARK = "#2b3346",
  METAL = "#8892a6";

export interface ModuleView {
  group: THREE.Group;
  /** Small status lamp: green working, amber idle or unpowered, red damaged. */
  status: THREE.MeshStandardMaterial;
  /** Materials that glow brighter when the module has power. */
  glow: THREE.MeshStandardMaterial[];
  /** Parts that spin while working. */
  spin: THREE.Object3D[];
  /** Solar tracking pivot (yaw) and panel (tilt). */
  yaw?: THREE.Object3D;
  tilt?: THREE.Object3D;
  /** Battery level bars, bottom to top. */
  bars?: THREE.MeshStandardMaterial[];
  /** Habitat regolith shield mound, scaled with build progress. */
  shield?: THREE.Object3D;
  /** Habitat windows (warm at night). */
  windows?: THREE.MeshStandardMaterial;
  /** Height of the model's top, for labels and effects. */
  top: number;
}

let cellTexture: THREE.Texture | null = null;
function cells() {
  if (cellTexture) return cellTexture;
  cellTexture = canvasTexture(256, 128, (c) => {
    const g = c.createLinearGradient(0, 0, 256, 128);
    g.addColorStop(0, "#1d3f7a");
    g.addColorStop(1, "#122a55");
    c.fillStyle = g;
    c.fillRect(0, 0, 256, 128);
    c.strokeStyle = "rgba(170,200,255,0.55)";
    c.lineWidth = 2;
    for (let x = 0; x <= 256; x += 32) {
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x, 128);
      c.stroke();
    }
    for (let y = 0; y <= 128; y += 32) {
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(256, y);
      c.stroke();
    }
  });
  cellTexture.userData.shared = true;
  return cellTexture;
}
let cellMat: THREE.MeshStandardMaterial | null = null;
const solarCells = () => {
  if (!cellMat) {
    cellMat = new THREE.MeshStandardMaterial({ map: cells(), roughness: 0.25, metalness: 0.55, emissive: "#0d2a66", emissiveIntensity: 0.25 });
    cellMat.userData.shared = true;
  }
  return cellMat;
};

function statusLamp(g: THREE.Object3D, x: number, y: number, z: number) {
  const m = light("#3ee39a", 2.4);
  ball(g, 0.13, m, x, y, z, 12);
  return m;
}

export function buildModule(type: ModuleType, planet: Planet): ModuleView {
  const g = new THREE.Group();
  const accent = MODULES[type].color;
  const view: ModuleView = { group: g, status: light("#3ee39a"), glow: [], spin: [], top: 2.5 };
  switch (type) {
    case "habitat": {
      cyl(g, 3.25, 3.4, 0.36, paint(DARK, 0.7, 0.3), 0, 0.18, 0, 40);
      cyl(g, 3, 3, 2.3, paint(WHITE, 0.55), 0, 1.5, 0, 48);
      const top = dome(g, 3, paint(WHITE, 0.55), 0, 2.64, 0);
      top.scale.y = 0.62;
      torus(g, 3.02, 0.07, paint("#ff8a3d", 0.5), 0, 0.85, 0).rotation.x = Math.PI / 2;
      torus(g, 3.02, 0.05, paint(GREY, 0.5), 0, 2.62, 0).rotation.x = Math.PI / 2;
      view.windows = light("#ffd28a", 0.6);
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + 0.31;
        if (Math.abs(Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2))) < 0.35) continue;
        const w = rbox(g, 0.85, 0.55, 0.14, 0.06, view.windows, Math.cos(a) * 3, 1.75, Math.sin(a) * 3);
        w.rotation.y = -a + Math.PI / 2;
      }
      // Airlock tunnel toward the rover dock (south).
      const tunnel = cyl(g, 0.95, 0.95, 2.3, paint(WHITE, 0.55), 0, 1.1, 3.8, 28);
      tunnel.rotation.x = Math.PI / 2;
      torus(g, 0.97, 0.06, paint("#ff8a3d", 0.5), 0, 1.1, 4.3);
      rbox(g, 1.1, 1.3, 0.2, 0.08, paint(DARK, 0.5, 0.3), 0, 1.05, 4.98);
      box(g, 0.7, 0.08, 0.06, light("#7fe6ff", 1.6), 0, 1.8, 5.1);
      // Antenna.
      cyl(g, 0.05, 0.07, 1.6, paint(METAL, 0.4, 0.6), 0.9, 4.15, -0.6, 8);
      const dish = dome(g, 0.45, paint(WHITE, 0.4), 0.9, 4.95, -0.6);
      dish.rotation.x = Math.PI * 0.85;
      ball(g, 0.08, light("#ff4d5e", 3), 0.9, 5.0, -0.6, 8);
      view.status = statusLamp(g, -2.2, 0.55, 2.2);
      // Regolith shield mound (hidden until built).
      const shield = new THREE.Group();
      const moundGeo = new THREE.SphereGeometry(3.85, 40, 16, 0, Math.PI * 2, 0, Math.PI / 2);
      const pos = moundGeo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i),
          y = pos.getY(i),
          z = pos.getZ(i);
        const n = 1 + Math.sin(x * 2.1 + z * 1.3) * 0.04 + Math.sin(z * 3.3 - x) * 0.03;
        pos.setXYZ(i, x * n, y * n * 0.85, z * n);
      }
      moundGeo.computeVertexNormals();
      const mound = new THREE.Mesh(moundGeo, paint(planet === "mars" ? "#9a5f45" : "#8d8c8a", 1));
      mound.castShadow = mound.receiveShadow = true;
      shield.add(mound);
      shield.visible = false;
      g.add(shield);
      view.shield = shield;
      view.top = 5;
      break;
    }
    case "solar": {
      cyl(g, 0.7, 0.9, 0.3, paint(DARK, 0.7, 0.3), 0, 0.15, 0, 20);
      cyl(g, 0.13, 0.16, 3.4, paint(METAL, 0.4, 0.6), 0, 1.85, 0, 12);
      const yaw = new THREE.Group();
      yaw.position.y = 3.55;
      g.add(yaw);
      const tilt = new THREE.Group();
      yaw.add(tilt);
      box(tilt, 4.4, 2.6, 0.06, solarCells(), 0, 0, 0);
      const frame = paint(WHITE, 0.5);
      box(tilt, 4.5, 0.1, 0.12, frame, 0, 1.33, 0);
      box(tilt, 4.5, 0.1, 0.12, frame, 0, -1.33, 0);
      box(tilt, 0.1, 2.7, 0.12, frame, 2.23, 0, 0);
      box(tilt, 0.1, 2.7, 0.12, frame, -2.23, 0, 0);
      box(tilt, 0.5, 0.4, 0.3, paint(DARK), 0, 0, 0.18);
      view.yaw = yaw;
      view.tilt = tilt;
      view.status = statusLamp(g, 0.75, 0.45, 0.4);
      view.top = 5;
      break;
    }
    case "battery": {
      rbox(g, 2.6, 0.3, 1.8, 0.08, paint(DARK, 0.7, 0.3), 0, 0.15, 0);
      rbox(g, 2.4, 1.4, 1.5, 0.14, paint(GREY, 0.5, 0.2), 0, 1.0, 0);
      box(g, 2.42, 0.12, 1.52, paint(accent, 0.5), 0, 1.55, 0);
      view.bars = [];
      for (let i = 0; i < 5; i++) {
        const m = light(accent, 0.2);
        view.bars.push(m);
        box(g, 0.32, 0.85, 0.06, m, -0.84 + i * 0.42, 0.95, 0.77);
      }
      for (let i = 0; i < 6; i++) box(g, 0.08, 0.32, 1.3, paint(METAL, 0.4, 0.6), -1 + i * 0.4, 1.86, 0);
      view.status = statusLamp(g, 1.05, 1.45, 0.78);
      view.top = 2.2;
      break;
    }
    case "oxygen": {
      rbox(g, 2.8, 0.4, 2, 0.1, paint(DARK, 0.7, 0.3), 0, 0.2, 0);
      for (const x of [-0.72, 0.72]) {
        capsule(g, 0.58, 1.3, paint(WHITE, 0.45), x, 1.6, 0.1);
        torus(g, 0.6, 0.05, paint(accent, 0.4), x, 1.25, 0.1).rotation.x = Math.PI / 2;
        torus(g, 0.6, 0.05, paint(accent, 0.4), x, 1.95, 0.1).rotation.x = Math.PI / 2;
      }
      const pipe = torus(g, 0.72, 0.07, paint(METAL, 0.4, 0.6), 0, 2.55, 0.1, Math.PI);
      pipe.rotation.y = 0;
      const orb = light(accent, 1.4);
      view.glow.push(orb);
      ball(g, 0.26, orb, 0, 0.75, 0.82, 16);
      rbox(g, 0.9, 0.55, 0.35, 0.06, paint(GREY), 0, 0.75, 0.65);
      view.status = statusLamp(g, 1.15, 0.55, 0.85);
      view.top = 3.2;
      break;
    }
    case "recycler": {
      rbox(g, 2.4, 0.35, 2.2, 0.08, paint(DARK, 0.7, 0.3), 0, 0.17, 0);
      cyl(g, 0.95, 1, 1.7, paint(WHITE, 0.45), -0.25, 1.15, 0, 28);
      torus(g, 0.97, 0.06, paint(accent, 0.4), -0.25, 1.5, 0).rotation.x = Math.PI / 2;
      const window = light("#4f95ff", 1.2);
      view.glow.push(window);
      rbox(g, 0.5, 0.7, 0.1, 0.05, window, -0.25, 1.05, 0.95);
      const rotor = new THREE.Group();
      rotor.position.set(-0.25, 2.1, 0);
      g.add(rotor);
      cyl(rotor, 0.14, 0.14, 0.25, paint(METAL, 0.4, 0.6), 0, 0, 0, 10);
      for (let i = 0; i < 3; i++) {
        const blade = box(rotor, 1.3, 0.05, 0.22, paint(GREY), 0, 0.1, 0);
        blade.rotation.y = (i / 3) * Math.PI;
      }
      view.spin.push(rotor);
      const side = cyl(g, 0.22, 0.22, 1.1, paint(METAL, 0.4, 0.6), 0.85, 0.8, 0, 12);
      side.rotation.z = Math.PI / 2;
      rbox(g, 0.6, 0.9, 0.9, 0.08, paint(GREY), 0.95, 0.75, 0);
      view.status = statusLamp(g, 0.95, 1.35, 0.46);
      view.top = 2.4;
      break;
    }
    case "greenhouse": {
      rbox(g, 4.6, 0.3, 3, 0.1, paint(DARK, 0.7, 0.3), 0, 0.15, 0);
      const shell = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.45, 4.3, 28, 1, true, -Math.PI / 2, Math.PI), glass("#bfe8ff", 0.28));
      shell.rotation.z = Math.PI / 2;
      shell.position.y = 0.3;
      g.add(shell);
      for (const x of [-2.1, -1.05, 0, 1.05, 2.1]) {
        const rib = torus(g, 1.47, 0.045, paint(WHITE, 0.4), x, 0.3, 0, Math.PI);
        rib.rotation.y = Math.PI / 2;
      }
      for (const x of [-2.15, 2.15]) {
        const cap = new THREE.Mesh(new THREE.CircleGeometry(1.45, 24, 0, Math.PI), glass("#bfe8ff", 0.28));
        cap.position.set(x, 0.3, 0);
        cap.rotation.y = Math.PI / 2;
        g.add(cap);
      }
      const leaf = paint(planet === "mars" ? "#4fbf5b" : "#56c463", 0.8);
      const leaf2 = paint("#8fdc5a", 0.8);
      for (let i = 0; i < 14; i++) {
        const x = -1.8 + (i % 7) * 0.6,
          z = i < 7 ? -0.55 : 0.55;
        ball(g, 0.26 + (i % 3) * 0.04, i % 2 ? leaf : leaf2, x, 0.62, z, 10);
      }
      rbox(g, 4, 0.18, 0.5, 0.05, paint("#6b4a32", 0.9), 0, 0.38, -0.55);
      rbox(g, 4, 0.18, 0.5, 0.05, paint("#6b4a32", 0.9), 0, 0.38, 0.55);
      const lamp = light("#ff5cd6", 2.2);
      view.glow.push(lamp);
      box(g, 3.9, 0.06, 0.16, lamp, 0, 1.6, -0.3);
      box(g, 3.9, 0.06, 0.16, lamp, 0, 1.6, 0.3);
      view.status = statusLamp(g, 2.15, 0.45, 1.3);
      view.top = 2.2;
      break;
    }
    case "icedrill": {
      cyl(g, 1.2, 1.35, 0.3, paint(DARK, 0.7, 0.3), 0, 0.15, 0, 18);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        const leg = cyl(g, 0.08, 0.1, 4.4, paint(METAL, 0.4, 0.6), Math.cos(a) * 0.85, 2.15, Math.sin(a) * 0.85, 8);
        leg.rotation.z = Math.cos(a) * 0.22;
        leg.rotation.x = -Math.sin(a) * 0.22;
      }
      rbox(g, 0.7, 0.5, 0.7, 0.08, paint(accent, 0.5), 0, 4.25, 0);
      const bit = new THREE.Group();
      bit.position.y = 2.2;
      g.add(bit);
      cyl(bit, 0.12, 0.12, 3.8, paint(METAL, 0.3, 0.7), 0, 0, 0, 10);
      for (let i = 0; i < 9; i++) {
        const fl = box(bit, 0.42, 0.06, 0.12, paint(GREY, 0.3, 0.7), 0, -1.6 + i * 0.32, 0);
        fl.rotation.y = i * 0.7;
      }
      view.spin.push(bit);
      rbox(g, 1.1, 0.7, 0.9, 0.08, paint(GREY), 1.35, 0.5, 0.3);
      const ice = light("#a8e6ff", 0.9);
      view.glow.push(ice);
      for (let i = 0; i < 5; i++) {
        const chunk = new THREE.Mesh(new THREE.IcosahedronGeometry(0.17 + (i % 2) * 0.06, 0), ice);
        chunk.position.set(1.15 + (i % 3) * 0.2, 0.92, 0.15 + Math.floor(i / 3) * 0.3);
        g.add(chunk);
      }
      view.status = statusLamp(g, -1.05, 0.45, 0.65);
      view.top = 4.6;
      break;
    }
    case "shelter": {
      const soil = paint(planet === "mars" ? "#8c5a44" : "#7f7f80", 1);
      rbox(g, 3.6, 1.8, 2.8, 0.35, soil, 0, 0.9, 0);
      const bag = paint(planet === "mars" ? "#b58a64" : "#b9ad93", 0.95);
      for (let i = 0; i < 6; i++) rbox(g, 0.58, 0.28, 0.4, 0.1, bag, -1.45 + i * 0.58, 1.92, -1.15);
      for (let i = 0; i < 6; i++) rbox(g, 0.58, 0.28, 0.4, 0.1, bag, -1.45 + i * 0.58, 1.92, 1.15);
      for (let i = 0; i < 3; i++) rbox(g, 0.58, 0.28, 0.4, 0.1, bag, -1.2 + i * 1.2, 2.18, 0);
      rbox(g, 1.1, 1.3, 0.2, 0.08, paint(DARK, 0.5, 0.3), 0, 0.75, 1.42);
      const door = light(accent, 1.6);
      view.glow.push(door);
      box(g, 0.8, 0.08, 0.06, door, 0, 1.5, 1.54);
      view.status = statusLamp(g, 1.45, 0.4, 1.45);
      view.top = 2.5;
      break;
    }
    case "lab": {
      rbox(g, 3.2, 0.3, 2.2, 0.1, paint(DARK, 0.7, 0.3), 0, 0.15, 0);
      const body = capsule(g, 0.95, 2.1, paint(WHITE, 0.45), 0, 1.2, 0);
      body.rotation.z = Math.PI / 2;
      torus(g, 0.97, 0.05, paint(accent, 0.4), -0.7, 1.2, 0).rotation.y = Math.PI / 2;
      torus(g, 0.97, 0.05, paint(accent, 0.4), 0.7, 1.2, 0).rotation.y = Math.PI / 2;
      const win = light(accent, 1.3);
      view.glow.push(win);
      for (const x of [-0.35, 0.35]) rbox(g, 0.45, 0.35, 0.1, 0.05, win, x, 1.35, 0.92);
      const mast = new THREE.Group();
      mast.position.set(0.6, 2.15, 0);
      g.add(mast);
      cyl(mast, 0.05, 0.06, 0.8, paint(METAL, 0.4, 0.6), 0, 0.4, 0, 8);
      const dish = dome(mast, 0.6, paint(WHITE, 0.4), 0, 0.95, 0);
      dish.rotation.x = Math.PI * 0.72;
      view.spin.push(mast);
      view.status = statusLamp(g, -1.4, 0.45, 0.85);
      view.top = 3.4;
      break;
    }
    case "reactor": {
      cyl(g, 2.1, 2.2, 0.25, paint(DARK, 0.7, 0.3), 0, 0.12, 0, 32);
      torus(g, 2.6, 0.12, paint("#ffb020", 0.5), 0, 0.06, 0).rotation.x = Math.PI / 2;
      cyl(g, 0.85, 1.05, 2.6, paint("#6c7486", 0.4, 0.6), 0, 1.5, 0, 24);
      const core = light(accent, 2.2);
      view.glow.push(core);
      cyl(g, 0.6, 0.7, 0.3, core, 0, 2.95, 0, 20);
      for (let i = 0; i < 4; i++) {
        const fin = box(g, 0.08, 2.8, 2.2, paint("#d9dee8", 0.35, 0.3), 0, 1.7, 0);
        fin.rotation.y = (i / 4) * Math.PI + Math.PI / 4;
        fin.position.set(Math.cos((i / 4) * Math.PI * 2 + Math.PI / 4) * 1.9, 1.7, Math.sin((i / 4) * Math.PI * 2 + Math.PI / 4) * 1.9);
        fin.rotation.y = -((i / 4) * Math.PI * 2 + Math.PI / 4);
      }
      view.status = statusLamp(g, 1.2, 0.45, 1.2);
      view.top = 3.3;
      break;
    }
  }
  view.group.userData.top = view.top;
  return view;
}

/** Scaffolding drawn while a module is under construction. */
export function scaffold(height: number) {
  const g = new THREE.Group();
  const pole = paint("#ffb020", 0.6, 0.3);
  for (const [x, z] of [
    [-1.6, -1.2],
    [1.6, -1.2],
    [-1.6, 1.2],
    [1.6, 1.2],
  ])
    cyl(g, 0.06, 0.06, height, pole, x, height / 2, z, 6);
  for (const y of [height * 0.35, height * 0.75]) {
    box(g, 3.3, 0.06, 0.06, pole, 0, y, -1.2);
    box(g, 3.3, 0.06, 0.06, pole, 0, y, 1.2);
    box(g, 0.06, 0.06, 2.5, pole, -1.6, y, 0);
    box(g, 0.06, 0.06, 2.5, pole, 1.6, y, 0);
  }
  return g;
}

export interface RoverView {
  group: THREE.Group;
  wheels: THREE.Object3D[];
  heads: THREE.MeshStandardMaterial;
  tail: THREE.MeshStandardMaterial;
  arm: THREE.Object3D;
}
export function buildRover(): RoverView {
  const g = new THREE.Group();
  rbox(g, 2.3, 0.45, 3.8, 0.15, paint(DARK, 0.6, 0.35), 0, 0.85, 0);
  rbox(g, 2.1, 1.25, 2.7, 0.38, paint(WHITE, 0.5), 0, 1.65, 0.15);
  rbox(g, 2.16, 0.48, 1.1, 0.18, paint("#14203a", 0.15, 0.6), 0, 1.85, -0.95);
  box(g, 2.14, 0.14, 2.4, paint("#ff8a3d", 0.5), 0, 1.25, 0.25);
  rbox(g, 1.6, 0.06, 1.4, 0.03, solarCells(), 0, 2.32, 0.55);
  cyl(g, 0.03, 0.03, 0.9, paint(METAL, 0.4, 0.6), -0.75, 2.75, 1.0, 6);
  ball(g, 0.06, light("#ff4d5e", 3), -0.75, 3.22, 1.0, 8);
  const heads = light("#fff3d6", 2.5);
  box(g, 0.42, 0.16, 0.06, heads, -0.62, 1.12, -1.91);
  box(g, 0.42, 0.16, 0.06, heads, 0.62, 1.12, -1.91);
  const tail = light("#ff5a3d", 1.8);
  box(g, 0.3, 0.12, 0.06, tail, -0.75, 1.0, 1.91);
  box(g, 0.3, 0.12, 0.06, tail, 0.75, 1.0, 1.91);
  const wheels: THREE.Object3D[] = [];
  for (const z of [-1.25, 0, 1.25])
    for (const x of [-1.25, 1.25]) {
      const w = new THREE.Group();
      w.position.set(x, 0.46, z);
      g.add(w);
      const tyre = cyl(w, 0.46, 0.46, 0.36, paint("#262b36", 0.95), 0, 0, 0, 18);
      tyre.rotation.z = Math.PI / 2;
      const hub = cyl(w, 0.22, 0.22, 0.38, paint(METAL, 0.35, 0.7), 0, 0, 0, 10);
      hub.rotation.z = Math.PI / 2;
      for (let i = 0; i < 6; i++) {
        const tread = box(w, 0.38, 0.06, 0.16, paint("#3a4150", 0.9), 0, 0, 0);
        const a = (i / 6) * Math.PI * 2;
        tread.position.set(0, Math.cos(a) * 0.45, Math.sin(a) * 0.45);
        tread.rotation.x = -a;
      }
      wheels.push(w);
    }
  const arm = new THREE.Group();
  arm.position.set(0.85, 1.2, -1.6);
  g.add(arm);
  const a1 = cyl(arm, 0.07, 0.07, 0.9, paint(METAL, 0.4, 0.6), 0, 0.2, -0.3, 8);
  a1.rotation.x = 0.9;
  ball(arm, 0.13, paint(DARK), 0, -0.1, -0.65, 10);
  return { group: g, wheels, heads, tail, arm };
}

export function buildAstronaut(visor = "#ffc35c") {
  const g = new THREE.Group();
  const suit = paint("#f4f6fb", 0.7);
  capsule(g, 0.27, 0.45, suit, 0, 1.0, 0);
  ball(g, 0.25, suit, 0, 1.55, 0, 16);
  const v = ball(g, 0.18, paint(visor, 0.1, 0.9), 0, 1.56, -0.12, 14);
  v.scale.set(1, 0.85, 0.8);
  rbox(g, 0.42, 0.5, 0.24, 0.06, paint(GREY, 0.6), 0, 1.08, 0.24);
  box(g, 0.44, 0.06, 0.02, paint("#ff8a3d"), 0, 1.25, -0.27);
  const legs: THREE.Object3D[] = [],
    arms: THREE.Object3D[] = [];
  for (const x of [-0.13, 0.13]) {
    const leg = new THREE.Group();
    leg.position.set(x, 0.72, 0);
    g.add(leg);
    capsule(leg, 0.11, 0.42, suit, 0, -0.32, 0);
    legs.push(leg);
  }
  for (const x of [-0.36, 0.36]) {
    const arm = new THREE.Group();
    arm.position.set(x, 1.28, 0);
    g.add(arm);
    capsule(arm, 0.08, 0.38, suit, 0, -0.27, 0);
    arms.push(arm);
  }
  g.userData.legs = legs;
  g.userData.arms = arms;
  return g;
}

/** Hexagonal build pad with an outline that lights up while you choose a pad. */
export function buildPad(planet: Planet, kind: "base" | "ice" | "far") {
  const g = new THREE.Group();
  const slab = cyl(g, 2.65, 2.85, 0.16, paint(planet === "mars" ? "#a07a66" : "#9ba0ab", 0.95), 0, 0.06, 0, 6);
  slab.receiveShadow = true;
  slab.castShadow = false;
  const color = kind === "ice" ? "#7fdcff" : kind === "far" ? "#ff9a57" : "#9fb3ff";
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.45, 2.72, 6, 1), light(color, 1.4));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.2;
  (ring.material as THREE.MeshStandardMaterial).transparent = true;
  (ring.material as THREE.MeshStandardMaterial).opacity = 0.35;
  g.add(ring);
  g.userData.ring = ring;
  return g;
}

let dockTexture: THREE.Texture | null = null;
export function buildDock(planet: Planet) {
  const g = new THREE.Group();
  if (!dockTexture) {
    dockTexture = canvasTexture(256, 256, (c) => {
      c.fillStyle = "#3a404f";
      c.fillRect(0, 0, 256, 256);
      c.strokeStyle = "#ffc94a";
      c.lineWidth = 10;
      c.strokeRect(14, 14, 228, 228);
      c.fillStyle = "#ffc94a";
      for (let i = 0; i < 3; i++) {
        c.beginPath();
        const y = 70 + i * 50;
        c.moveTo(80, y + 26);
        c.lineTo(128, y);
        c.lineTo(176, y + 26);
        c.lineTo(176, y + 40);
        c.lineTo(128, y + 14);
        c.lineTo(80, y + 40);
        c.fill();
      }
    });
    dockTexture.userData.shared = true;
  }
  const top = new THREE.MeshStandardMaterial({ map: dockTexture, roughness: 0.8 });
  top.userData.shared = true;
  const slab = new THREE.Mesh(new THREE.BoxGeometry(5, 0.18, 5), [paint(planet === "mars" ? "#6d5348" : "#5c6270"), paint(planet === "mars" ? "#6d5348" : "#5c6270"), top, paint("#3a404f"), paint("#5c6270"), paint("#5c6270")]);
  slab.position.y = 0.09;
  slab.receiveShadow = true;
  g.add(slab);
  cyl(g, 0.22, 0.28, 1.6, paint(GREY, 0.5), -2.9, 0.8, 0, 12);
  const plug = light("#3ee39a", 2);
  ball(g, 0.16, plug, -2.9, 1.7, 0, 10);
  g.userData.plug = plug;
  return g;
}

export function buildFlag() {
  const g = new THREE.Group();
  cyl(g, 0.04, 0.04, 2.2, paint(GREY, 0.4, 0.5), 0, 1.1, 0, 6);
  const cloth = box(g, 0.9, 0.55, 0.02, light("#7ef0c8", 0.9), 0.47, 1.9, 0);
  cloth.castShadow = true;
  return g;
}
