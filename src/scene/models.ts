import * as THREE from "three";
import { MODULES } from "../sim/modules";
import type { ModuleType, Planet } from "../sim/types";
import { ball, box, canvasTexture, capsule, cone, cyl, dome, finalize, foil, glass, keep, lathe, light, metal, paint, rbox, rng, strut, torus, visor } from "./kit";

/** Procedural, original models. Everything faces north (−z) at rotation 0. */
const WHITE = "#e8ecf2",
  OFF = "#d3d9e2",
  GREY = "#a9b2c0",
  DARK = "#2a3140",
  ORANGE = "#ff8a3d";

export interface ModuleView {
  group: THREE.Group;
  /** Small status lamp: green working, amber idle or unpowered, red damaged. */
  status: THREE.MeshStandardMaterial;
  /** Materials that glow brighter when the module has power. */
  glow: THREE.MeshStandardMaterial[];
  /** Parts that spin (about their vertical axis) while working. */
  spin: THREE.Object3D[];
  /** Blinking beacon lights. */
  blink: THREE.MeshStandardMaterial[];
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

let cellImage: THREE.Texture | null = null;
const cellMats = new Map<string, THREE.MeshStandardMaterial>();
/** Solar cells: a deep blue grid with silver bus bars, tiled `rx` × `ry` times over a panel. */
function cells(rx: number, ry: number) {
  if (!cellImage) {
    cellImage = canvasTexture(256, 256, (c) => {
      const g = c.createLinearGradient(0, 0, 256, 256);
      g.addColorStop(0, "#14306a");
      g.addColorStop(1, "#0b1d45");
      c.fillStyle = g;
      c.fillRect(0, 0, 256, 256);
      for (let y = 0; y < 4; y++)
        for (let x = 0; x < 4; x++) {
          const px = x * 64,
            py = y * 64;
          c.fillStyle = (x + y) % 2 ? "rgba(40,80,170,0.25)" : "rgba(20,50,130,0.25)";
          c.fillRect(px + 3, py + 3, 58, 58);
          c.fillStyle = "rgba(200,215,240,0.35)";
          c.fillRect(px + 21, py + 3, 1.5, 58);
          c.fillRect(px + 42, py + 3, 1.5, 58);
        }
      c.strokeStyle = "rgba(190,205,235,0.6)";
      c.lineWidth = 3;
      for (let i = 0; i <= 4; i++) {
        c.beginPath();
        c.moveTo(i * 64, 0);
        c.lineTo(i * 64, 256);
        c.moveTo(0, i * 64);
        c.lineTo(256, i * 64);
        c.stroke();
      }
    });
    cellImage.userData.shared = true;
  }
  const key = `${rx},${ry}`;
  let m = cellMats.get(key);
  if (!m) {
    const t = cellImage.clone();
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx, ry);
    t.needsUpdate = true;
    t.userData.shared = true;
    m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.18, metalness: 0.7, emissive: "#0a1d4a", emissiveIntensity: 0.2 });
    m.userData.shared = true;
    cellMats.set(key, m);
  }
  return m;
}

let signMat: THREE.MeshStandardMaterial | null = null;
/** A yellow radiation trefoil sign. */
function radiationSign() {
  if (signMat) return signMat;
  const t = canvasTexture(128, 128, (c) => {
    c.fillStyle = "#ffcc1a";
    c.fillRect(0, 0, 128, 128);
    c.strokeStyle = "#111";
    c.lineWidth = 6;
    c.strokeRect(5, 5, 118, 118);
    c.fillStyle = "#111";
    c.beginPath();
    c.arc(64, 64, 9, 0, Math.PI * 2);
    c.fill();
    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI * 2) / 3 - Math.PI / 2;
      c.beginPath();
      c.moveTo(64 + Math.cos(a - 0.52) * 15, 64 + Math.sin(a - 0.52) * 15);
      c.arc(64, 64, 46, a - 0.52, a + 0.52);
      c.arc(64, 64, 15, a + 0.52, a - 0.52, true);
      c.fill();
    }
  });
  t.userData.shared = true;
  signMat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 });
  signMat.userData.shared = true;
  return signMat;
}

const soil = (planet: Planet) => (planet === "mars" ? "#8f5a42" : "#807f7d");

function statusLamp(g: THREE.Object3D, x: number, y: number, z: number) {
  const m = light("#3ee39a", 2.4);
  ball(g, 0.12, m, x, y, z, 12);
  cyl(g, 0.15, 0.17, 0.08, paint(DARK, 0.5, 0.3), x, y - 0.12, z, 12);
  return m;
}
const skid = (g: THREE.Object3D, w: number, d: number, h = 0.3) => {
  rbox(g, w, h, d, 0.08, paint(DARK, 0.7, 0.3), 0, h / 2, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) rbox(g, 0.36, 0.1, 0.36, 0.03, metal("#6f7787", 0.5), (sx * (w - 0.3)) / 2, 0.05, (sz * (d - 0.3)) / 2);
};

export function buildModule(type: ModuleType, planet: Planet): ModuleView {
  const g = new THREE.Group();
  const accent = MODULES[type].color;
  const view: ModuleView = { group: g, status: light("#3ee39a"), glow: [], spin: [], blink: [], top: 2.5 };
  switch (type) {
    case "habitat": {
      // An inflatable habitat: soft-goods shell with straps, a cupola and an airlock to the south.
      const shell = paint(WHITE, 0.78, 0.04),
        strap = paint(OFF, 0.6, 0.1);
      cyl(g, 3.3, 3.45, 0.32, paint(DARK, 0.7, 0.3), 0, 0.16, 0, 48);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        rbox(g, 0.5, 0.2, 0.5, 0.05, metal("#6f7787", 0.5), Math.cos(a) * 3.3, 0.1, Math.sin(a) * 3.3);
      }
      lathe(
        g,
        "hab",
        [
          [0, 0.3],
          [3.02, 0.3],
          [3.14, 0.45],
          [3.2, 0.9],
          [3.22, 1.6],
          [3.2, 2.3],
          [3.1, 2.75],
          [2.9, 3.1],
          [2.5, 3.48],
          [1.85, 3.78],
          [1.0, 3.95],
          [0, 4.0],
        ],
        shell,
        0,
        0,
        0,
        72,
      );
      for (const [y, r] of [
        [1.05, 3.215],
        [1.95, 3.215],
        [2.75, 3.105],
        [3.45, 2.53],
      ])
        torus(g, r, 0.045, strap, 0, y, 0).rotation.x = Math.PI / 2;
      torus(g, 3.17, 0.075, paint(ORANGE, 0.5), 0, 0.62, 0).rotation.x = Math.PI / 2;
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        rbox(g, 0.1, 2.3, 0.06, 0.02, strap, Math.cos(a) * 3.23, 1.55, Math.sin(a) * 3.23).rotation.y = -a + Math.PI / 2;
      }
      view.windows = light("#ffd9a0", 0.6);
      const frame = metal("#9aa3b4", 0.45);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
        if (Math.abs(Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2))) < 0.5) continue;
        rbox(g, 0.98, 0.64, 0.1, 0.06, frame, Math.cos(a) * 3.24, 1.62, Math.sin(a) * 3.24).rotation.y = -a + Math.PI / 2;
        rbox(g, 0.8, 0.48, 0.1, 0.05, view.windows, Math.cos(a) * 3.27, 1.62, Math.sin(a) * 3.27).rotation.y = -a + Math.PI / 2;
      }
      // Airlock tunnel toward the rover dock.
      cyl(g, 1.0, 1.0, 2.0, shell, 0, 1.25, 3.7, 36).rotation.x = Math.PI / 2;
      for (const z of [3.2, 4.05]) torus(g, 1.015, 0.05, strap, 0, 1.25, z);
      torus(g, 1.03, 0.07, paint(ORANGE, 0.5), 0, 1.25, 4.6);
      rbox(g, 1.3, 1.6, 0.18, 0.14, paint(GREY, 0.5, 0.4), 0, 1.22, 4.72);
      rbox(g, 1.0, 1.3, 0.12, 0.1, paint(DARK, 0.45, 0.4), 0, 1.18, 4.8);
      ball(g, 0.16, visor(), 0, 1.5, 4.84, 16).scale.z = 0.4;
      box(g, 0.9, 0.07, 0.05, light("#7fe6ff", 2.4), 0, 2.08, 4.82);
      view.status = statusLamp(g, 0.55, 2.38, 4.0);
      // Cupola on the roof.
      cyl(g, 0.95, 1.05, 0.38, paint(OFF, 0.5, 0.2), 0, 4.08, 0, 32);
      ball(g, 0.6, view.windows, 0, 4.2, 0, 20);
      dome(g, 0.86, glass("#9fd6ff", 0.4), 0, 4.27, 0);
      torus(g, 0.88, 0.05, frame, 0, 4.27, 0).rotation.x = Math.PI / 2;
      // Antenna mast and dish.
      cyl(g, 0.05, 0.07, 1.9, frame, 1.6, 4.4, -1.0, 8);
      const dish = cyl(g, 0.62, 0.1, 0.2, paint(WHITE, 0.4), 1.6, 5.35, -1.0, 28);
      dish.rotation.x = 0.85;
      const beacon = light("#ff4d5e", 3);
      view.blink.push(beacon);
      ball(g, 0.08, beacon, 1.6, 5.55, -1.0, 8);
      // Handrails.
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.3;
        box(g, 0.05, 0.05, 0.9, frame, Math.cos(a) * 2.75, 3.15, Math.sin(a) * 2.75).rotation.y = -a;
      }
      // Regolith shield mound (hidden until built): piled bags in courses.
      const shield = keep(new THREE.Group());
      const moundGeo = new THREE.SphereGeometry(4.6, 56, 20, 0, Math.PI * 2, 0, Math.PI / 2);
      const pos = moundGeo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i),
          y = pos.getY(i),
          z = pos.getZ(i);
        // Bumps only push outward, so the habitat never pokes through.
        const n = 1 + (Math.sin(x * 2.1 + z * 1.3) + 1) * 0.015 + (Math.sin(z * 3.3 - x) + 1) * 0.012 + Math.abs(Math.sin(y * 7)) * 0.03;
        pos.setXYZ(i, x * n, y * n * 0.97, z * n);
      }
      moundGeo.computeVertexNormals();
      const mound = new THREE.Mesh(moundGeo, paint(soil(planet), 1));
      mound.castShadow = mound.receiveShadow = true;
      shield.add(mound);
      shield.visible = false;
      g.add(shield);
      view.shield = shield;
      view.top = 5.5;
      break;
    }
    case "solar": {
      const frame = metal("#c3cad6", 0.35);
      const yaw = keep(new THREE.Group()),
        tilt = keep(new THREE.Group());
      if (planet === "moon") {
        // Near the lunar pole the Sun skims the horizon, so arrays stand tall and vertical and turn to follow it.
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * Math.PI * 2 + 0.5;
          strut(g, Math.cos(a) * 0.35, 0.5, Math.sin(a) * 0.35, Math.cos(a) * 1.55, 0.08, Math.sin(a) * 1.55, 0.06, frame);
          rbox(g, 0.4, 0.1, 0.4, 0.03, paint(DARK, 0.6, 0.3), Math.cos(a) * 1.55, 0.05, Math.sin(a) * 1.55);
        }
        cyl(g, 0.42, 0.52, 0.65, paint(DARK, 0.6, 0.3), 0, 0.33, 0, 18);
        torus(g, 0.43, 0.04, paint(accent, 0.5), 0, 0.62, 0).rotation.x = Math.PI / 2;
        view.status = statusLamp(g, 0.32, 0.82, 0.25);
        yaw.position.y = 0.6;
        g.add(yaw);
        cyl(yaw, 0.09, 0.12, 6.1, frame, 0, 3.05, 0, 10);
        rbox(yaw, 0.6, 0.38, 0.45, 0.05, paint(OFF, 0.5), 0, 1.1, -0.15);
        tilt.position.set(0, 3.8, -0.16);
        yaw.add(tilt);
        box(tilt, 1.8, 5.0, 0.04, cells(1.5, 4.2), 0, 0, -0.01);
        box(tilt, 1.82, 5.02, 0.02, paint("#d8dce4", 0.6), 0, 0, 0.02);
        for (const x of [-0.92, 0.92]) box(tilt, 0.05, 5.05, 0.08, frame, x, 0, 0);
        for (const y of [-2.52, 0, 2.52]) box(tilt, 1.9, 0.07, 0.09, frame, 0, y, 0.01);
        const beacon = light("#ff4d5e", 3);
        view.blink.push(beacon);
        ball(yaw, 0.09, beacon, 0, 6.2, 0, 8);
        view.top = 7.2;
      } else {
        // On Mars the Sun climbs high: a table array that tilts toward it.
        cyl(g, 0.55, 0.65, 0.3, paint(DARK, 0.6, 0.3), 0, 0.15, 0, 18);
        view.status = statusLamp(g, 0.45, 0.42, 0.3);
        yaw.position.y = 0.3;
        g.add(yaw);
        cyl(yaw, 0.12, 0.15, 1.6, frame, 0, 0.8, 0, 10);
        cyl(yaw, 0.16, 0.16, 0.6, frame, 0, 1.65, 0, 10).rotation.z = Math.PI / 2;
        tilt.position.y = 1.65;
        yaw.add(tilt);
        box(tilt, 4.2, 2.6, 0.05, cells(4, 2.5), 0, 0, -0.03);
        box(tilt, 4.22, 2.62, 0.02, paint("#d8dce4", 0.6), 0, 0, 0.01);
        for (const x of [-2.12, 2.12]) box(tilt, 0.06, 2.66, 0.09, frame, x, 0, 0);
        for (const y of [-1.32, 1.32]) box(tilt, 4.3, 0.06, 0.09, frame, 0, y, 0);
        for (const x of [-1.05, 1.05]) box(tilt, 0.08, 2.5, 0.12, frame, x, 0, 0.08);
        view.top = 3.6;
      }
      view.yaw = yaw;
      view.tilt = tilt;
      break;
    }
    case "battery": {
      skid(g, 2.8, 2.0, 0.25);
      rbox(g, 2.5, 1.55, 1.65, 0.1, paint(OFF, 0.55, 0.15), 0, 1.0, 0);
      for (const x of [-0.62, 0, 0.62]) box(g, 0.03, 1.35, 1.67, paint(DARK, 0.6), x, 1.0, 0);
      box(g, 2.52, 0.14, 1.67, paint(accent, 0.5), 0, 1.68, 0);
      for (let i = 0; i < 7; i++)
        for (const x of [-1.38, 1.38]) box(g, 0.28, 1.2, 0.05, metal("#c3cad6", 0.4), x, 1.0, -0.6 + i * 0.2);
      view.bars = [];
      for (let i = 0; i < 5; i++) {
        const m = light(accent, 0.2);
        view.bars.push(m);
        for (const z of [-0.84, 0.84]) box(g, 0.3, 0.9, 0.04, m, -0.84 + i * 0.42, 0.95, z);
      }
      for (const x of [-0.6, 0.6]) {
        cyl(g, 0.48, 0.5, 0.2, paint(DARK, 0.6, 0.3), x, 1.86, 0, 24);
        torus(g, 0.48, 0.03, metal(), x, 1.97, 0).rotation.x = Math.PI / 2;
        const fan = keep(new THREE.Group());
        fan.position.set(x, 1.95, 0);
        g.add(fan);
        for (let k = 0; k < 5; k++) box(fan, 0.85, 0.03, 0.15, metal("#8892a6"), 0, 0, 0).rotation.y = (k / 5) * Math.PI;
        view.spin.push(fan);
      }
      view.status = statusLamp(g, 1.08, 1.98, 0.66);
      view.top = 2.3;
      break;
    }
    case "oxygen": {
      skid(g, 3.0, 2.2);
      for (const x of [-0.8, 0.8]) {
        capsule(g, 0.55, 1.4, paint(WHITE, 0.4, 0.1), x, 1.6, -0.35);
        for (const y of [1.15, 2.05]) torus(g, 0.56, 0.05, paint(accent, 0.4), x, y, -0.35).rotation.x = Math.PI / 2;
        cyl(g, 0.12, 0.12, 0.3, metal(), x, 2.75, -0.35, 10);
      }
      torus(g, 0.8, 0.06, metal(), 0, 2.85, -0.35, Math.PI);
      rbox(g, 1.9, 0.95, 0.85, 0.08, paint(GREY, 0.5, 0.3), 0, 0.78, 0.58);
      for (let i = 0; i < 6; i++) box(g, 1.6, 0.03, 0.06, paint(DARK), 0, 1.27, 0.3 + i * 0.1);
      const orb = light(accent, 1.4);
      view.glow.push(orb);
      rbox(g, 1.1, 0.3, 0.06, 0.04, orb, 0, 0.85, 1.02);
      for (const x of [-0.35, 0, 0.35]) ball(g, 0.06, orb, x, 0.5, 1.02, 8);
      ball(g, 0.38, paint(accent, 0.45, 0.2), 1.2, 0.72, 0.62, 20);
      cyl(g, 0.06, 0.06, 1.4, metal(), 0, 1.55, 0.25, 8);
      strut(g, 0.95, 0.9, 0.62, 0.8, 1.2, -0.35, 0.05, metal());
      view.status = statusLamp(g, -1.25, 0.47, 0.85);
      view.top = 3.3;
      break;
    }
    case "recycler": {
      skid(g, 2.6, 2.3);
      cyl(g, 0.9, 0.95, 1.7, paint(WHITE, 0.45, 0.1), -0.35, 1.15, 0, 36);
      const cap = dome(g, 0.9, paint(WHITE, 0.45, 0.1), -0.35, 2.0, 0);
      cap.scale.y = 0.4;
      torus(g, 0.93, 0.06, paint(accent, 0.4), -0.35, 1.55, 0).rotation.x = Math.PI / 2;
      torus(g, 0.95, 0.05, metal(), -0.35, 0.5, 0).rotation.x = Math.PI / 2;
      const water = light("#4f95ff", 1.2);
      view.glow.push(water);
      for (const z of [-0.93, 0.93]) rbox(g, 0.34, 1.0, 0.08, 0.04, water, -0.35, 1.1, z);
      const rotor = keep(new THREE.Group());
      rotor.position.set(-0.35, 2.42, 0);
      g.add(rotor);
      cyl(rotor, 0.32, 0.32, 0.3, metal(), 0, 0, 0, 18);
      for (let i = 0; i < 4; i++) box(rotor, 0.95, 0.22, 0.05, paint(GREY, 0.4, 0.4), 0, 0, 0).rotation.y = (i / 4) * Math.PI;
      view.spin.push(rotor);
      for (const z of [-0.65, 0, 0.65]) {
        cyl(g, 0.24, 0.24, 1.0, paint(OFF, 0.5), 0.85, 0.82, z, 16);
        cyl(g, 0.25, 0.25, 0.12, paint(accent, 0.45), 0.85, 1.35, z, 16);
      }
      box(g, 0.1, 0.1, 1.6, metal(), 0.55, 1.55, 0);
      strut(g, 0.55, 1.55, 0, 0.2, 1.8, 0, 0.05, metal());
      view.status = statusLamp(g, 1.0, 0.47, 1.0);
      view.top = 2.8;
      break;
    }
    case "greenhouse": {
      skid(g, 4.9, 3.3);
      const shell = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 4.4, 36, 1, true, -Math.PI / 2, Math.PI), glass("#d6f1ff", 0.22));
      shell.rotation.z = Math.PI / 2;
      shell.position.y = 0.3;
      g.add(shell);
      const white = paint(WHITE, 0.4, 0.2);
      for (const x of [-2.2, -1.1, 0, 1.1, 2.2]) torus(g, 1.52, 0.05, white, x, 0.3, 0, Math.PI).rotation.y = Math.PI / 2;
      for (const a of [0.35, 0.95, 1.57, 2.19, 2.79]) box(g, 4.4, 0.04, 0.04, white, 0, 0.3 + Math.sin(a) * 1.52, Math.cos(a) * 1.52);
      for (const x of [-2.2, 2.2]) {
        const cap = new THREE.Mesh(new THREE.CircleGeometry(1.5, 28, 0, Math.PI), glass("#d6f1ff", 0.22));
        cap.position.set(x, 0.3, 0);
        cap.rotation.y = Math.PI / 2;
        g.add(cap);
      }
      rbox(g, 0.14, 1.25, 0.85, 0.05, paint(GREY, 0.5, 0.3), 2.24, 0.95, 0);
      const trough = paint("#e6e9ef", 0.6),
        dirt = paint("#4c3526", 0.95);
      for (const z of [-0.62, 0.62]) {
        rbox(g, 4.0, 0.36, 0.62, 0.05, trough, 0, 0.5, z);
        box(g, 3.9, 0.04, 0.52, dirt, 0, 0.69, z);
      }
      const r = rng(17);
      const greens = [paint("#4fbf5b", 0.8), paint("#7fd35a", 0.8), paint("#2f9a4c", 0.8)];
      const red = paint("#e2483a", 0.5);
      for (let i = 0; i < 18; i++) {
        const x = -1.75 + (i % 9) * 0.44,
          z = i < 9 ? -0.62 : 0.62;
        if (i % 3 === 2) {
          // Tomato vine on a stake.
          cyl(g, 0.015, 0.015, 0.9, paint("#c9b48a", 0.8), x, 1.1, z, 5);
          for (let k = 0; k < 3; k++) ball(g, 0.14, greens[2], x + (r() - 0.5) * 0.15, 0.85 + k * 0.22, z + (r() - 0.5) * 0.15, 8);
          for (let k = 0; k < 3; k++) ball(g, 0.055, red, x + (r() - 0.5) * 0.25, 0.85 + r() * 0.5, z + (r() - 0.5) * 0.2, 8);
        } else ball(g, 0.2 + r() * 0.06, greens[i % 2], x, 0.78, z, 10).scale.y = 0.6;
      }
      const lamp = light("#ff5cd6", 2.2);
      view.glow.push(lamp);
      for (const z of [-0.45, 0.45]) box(g, 4.0, 0.05, 0.12, lamp, 0, 1.58, z);
      rbox(g, 0.5, 0.85, 1.1, 0.06, paint(GREY, 0.5, 0.3), -2.52, 0.72, 0);
      const fan = keep(new THREE.Group());
      fan.position.set(-2.52, 1.17, 0);
      g.add(fan);
      for (let k = 0; k < 4; k++) box(fan, 0.4, 0.02, 0.08, metal(), 0, 0, 0).rotation.y = (k / 4) * Math.PI;
      view.spin.push(fan);
      view.status = statusLamp(g, 2.3, 0.47, 1.45);
      view.top = 2.3;
      break;
    }
    case "icedrill": {
      cyl(g, 1.4, 1.5, 0.3, paint(DARK, 0.7, 0.3), 0, 0.15, 0, 6);
      const frame = metal("#9aa3b4", 0.4),
        tower = paint(accent, 0.45, 0.35);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + 0.3;
        strut(g, Math.cos(a) * 1.2, 0.25, Math.sin(a) * 1.2, Math.cos(a) * 2.0, 0.05, Math.sin(a) * 2.0, 0.07, frame);
        rbox(g, 0.45, 0.1, 0.45, 0.03, paint(DARK, 0.6, 0.3), Math.cos(a) * 2.0, 0.05, Math.sin(a) * 2.0);
      }
      // A lattice derrick.
      const corners = [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ];
      const hw = (y: number) => 0.75 - ((y - 0.3) / 4.3) * 0.5;
      for (const [cx, cz] of corners) strut(g, cx * 0.75, 0.3, cz * 0.75, cx * 0.25, 4.6, cz * 0.25, 0.05, tower);
      const levels = [0.3, 1.4, 2.5, 3.6, 4.6];
      for (let l = 0; l < levels.length; l++) {
        const y = levels[l],
          w = hw(y);
        for (let k = 0; k < 4; k++) {
          const [ax, az] = corners[k],
            [bx, bz] = corners[(k + 1) % 4];
          if (l) strut(g, ax * w, y, az * w, bx * w, y, bz * w, 0.03, tower);
          if (l < levels.length - 1) {
            const y2 = levels[l + 1],
              w2 = hw(y2);
            strut(g, ax * w, y, az * w, bx * w2, y2, bz * w2, 0.022, frame);
          }
        }
      }
      rbox(g, 0.8, 0.45, 0.8, 0.06, tower, 0, 4.82, 0);
      const work = light("#fff3d6", 2.5);
      box(g, 0.25, 0.12, 0.08, work, 0, 4.3, 0.3);
      const bit = keep(new THREE.Group());
      g.add(bit);
      cyl(bit, 0.1, 0.1, 5.0, metal("#c9ced8", 0.3), 0, 2.2, 0, 10);
      for (let y = 0.4; y < 2.7; y += 0.09) box(bit, 0.5, 0.035, 0.13, metal("#c9ced8", 0.3), 0, y, 0).rotation.y = y * 5;
      rbox(bit, 0.45, 0.4, 0.45, 0.05, paint(GREY, 0.5, 0.4), 0, 4.35, 0);
      view.spin.push(bit);
      rbox(g, 1.1, 0.7, 0.9, 0.08, paint(GREY, 0.5, 0.3), 1.45, 0.62, 0.45);
      const ice = light("#a8e6ff", 0.9);
      view.glow.push(ice);
      const r = rng(9);
      for (let i = 0; i < 7; i++) {
        const chunk = new THREE.Mesh(new THREE.IcosahedronGeometry(0.15 + r() * 0.08, 0), ice);
        chunk.position.set(1.2 + r() * 0.5, 1.02, 0.2 + r() * 0.5);
        chunk.rotation.set(r() * 3, r() * 3, 0);
        g.add(chunk);
      }
      cyl(g, 0.45, 0.45, 1.1, paint(WHITE, 0.45, 0.1), -1.3, 0.85, 0.4, 20);
      torus(g, 0.46, 0.05, paint(accent, 0.4), -1.3, 1.1, 0.4).rotation.x = Math.PI / 2;
      strut(g, -0.85, 1.2, 0.4, -0.2, 0.6, 0.2, 0.05, frame);
      view.status = statusLamp(g, -1.3, 1.55, 0.4);
      view.top = 5.3;
      break;
    }
    case "shelter": {
      // A storm shelter buried under sandbags of regolith: mass stops radiation.
      const core = paint(soil(planet), 1);
      const bags = [paint(planet === "mars" ? "#b88d68" : "#b8ad95", 0.95), paint(planet === "mars" ? "#a27a58" : "#a19883", 0.95)];
      rbox(g, 3.8, 1.9, 3.0, 0.45, core, 0, 0.95, 0);
      for (let c = 0; c < 3; c++) {
        const y = 0.3 + c * 0.5,
          shift = (c % 2) * 0.35;
        for (let i = 0; i < 5; i++) {
          const x = -1.45 + i * 0.72 + shift;
          if (x > 1.75) continue;
          rbox(g, 0.66, 0.42, 0.44, 0.12, bags[(i + c) % 2], x, y, -1.55);
          if (Math.abs(x) > 0.75) rbox(g, 0.66, 0.42, 0.44, 0.12, bags[(i + c + 1) % 2], x, y, 1.55);
        }
        for (let i = 0; i < 3; i++) for (const sx of [-1, 1]) rbox(g, 0.44, 0.42, 0.66, 0.12, bags[(i + c) % 2], sx * 1.95, y, -0.75 + i * 0.75 + shift * 0.5);
      }
      for (let i = 0; i < 4; i++) for (let k = 0; k < 3; k++) rbox(g, 0.7, 0.32, 0.6, 0.12, bags[(i + k) % 2], -1.15 + i * 0.77, 1.98, -0.8 + k * 0.8);
      rbox(g, 1.3, 1.5, 0.22, 0.1, paint(GREY, 0.5, 0.4), 0, 0.8, 1.58);
      rbox(g, 1.0, 1.25, 0.12, 0.08, paint(DARK, 0.45, 0.4), 0, 0.72, 1.66);
      const door = light(accent, 1.6);
      view.glow.push(door);
      box(g, 0.95, 0.08, 0.06, door, 0, 1.62, 1.72);
      box(g, 0.42, 0.42, 0.03, radiationSign(), 0.95, 1.15, 1.79);
      view.status = statusLamp(g, 1.5, 2.3, 1.2);
      view.top = 2.6;
      break;
    }
    case "lab": {
      skid(g, 3.4, 2.4);
      for (const x of [-0.9, 0.9]) rbox(g, 0.3, 0.6, 1.6, 0.05, metal("#6f7787", 0.5), x, 0.55, 0);
      const body = capsule(g, 0.95, 2.0, paint(WHITE, 0.5, 0.1), 0, 1.35, 0);
      body.rotation.z = Math.PI / 2;
      for (const x of [-0.65, 0.65]) torus(g, 0.97, 0.05, paint(accent, 0.4), x, 1.35, 0).rotation.y = Math.PI / 2;
      const win = light(accent, 1.3);
      view.glow.push(win);
      for (const z of [-0.92, 0.92]) for (const x of [-0.3, 0.3]) rbox(g, 0.42, 0.34, 0.1, 0.05, win, x, 1.52, z);
      torus(g, 0.42, 0.06, metal(), -1.92, 1.35, 0).rotation.y = Math.PI / 2;
      cyl(g, 0.4, 0.4, 0.06, paint(GREY, 0.5, 0.3), -1.92, 1.35, 0, 20).rotation.z = Math.PI / 2;
      cyl(g, 0.12, 0.16, 0.5, metal(), 0.7, 2.45, 0, 10);
      const mast = keep(new THREE.Group());
      mast.position.set(0.7, 2.7, 0);
      g.add(mast);
      cyl(mast, 0.05, 0.06, 0.6, metal(), 0, 0.3, 0, 8);
      const dish = cyl(mast, 0.65, 0.12, 0.22, paint(WHITE, 0.4), 0, 0.75, 0, 28);
      dish.rotation.x = 0.95;
      strut(mast, 0, 0.75, 0, 0, 1.0, -0.38, 0.02, metal());
      view.spin.push(mast);
      cyl(g, 0.03, 0.04, 1.6, metal(), -1.0, 2.9, -0.35, 6);
      const wind = keep(new THREE.Group());
      wind.position.set(-1.0, 3.7, -0.35);
      g.add(wind);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        box(wind, 0.4, 0.02, 0.02, metal(), Math.cos(a) * 0.2, 0, Math.sin(a) * 0.2).rotation.y = -a;
        ball(wind, 0.06, paint(WHITE), Math.cos(a) * 0.4, 0, Math.sin(a) * 0.4, 8);
      }
      view.spin.push(wind);
      rbox(g, 0.9, 0.6, 0.5, 0.05, paint(GREY, 0.5, 0.3), 0.6, 0.6, 1.1);
      view.status = statusLamp(g, 1.55, 0.47, 1.05);
      view.top = 3.9;
      break;
    }
    case "reactor": {
      // A small fission power plant: shielded core below, a cone of radiator panels above.
      cyl(g, 2.1, 2.35, 0.55, paint(soil(planet), 1), 0, 0.27, 0, 40);
      torus(g, 2.6, 0.1, paint("#ffb020", 0.5), 0, 0.06, 0).rotation.x = Math.PI / 2;
      cyl(g, 0.75, 0.9, 1.4, metal("#8c95a6", 0.35), 0, 1.0, 0, 28);
      for (const y of [0.6, 1.2]) torus(g, 0.84, 0.04, metal("#6f7787", 0.4), 0, y, 0).rotation.x = Math.PI / 2;
      const core = light(accent, 2.2);
      view.glow.push(core);
      cyl(g, 0.62, 0.62, 0.16, core, 0, 1.78, 0, 28);
      const heat = light("#ff7a3d", 1);
      view.glow.push(heat);
      const panel = paint("#e4e8ef", 0.4, 0.25);
      for (let i = 0; i < 10; i++) {
        const p = new THREE.Group();
        p.rotation.y = -(i / 10) * Math.PI * 2;
        g.add(p);
        const plate = box(p, 0.05, 3.0, 0.72, panel, 1.22, 3.25, 0);
        plate.rotation.z = -0.42;
        const pipe = box(p, 0.04, 2.9, 0.06, heat, 1.25, 3.26, 0);
        pipe.rotation.z = -0.42;
      }
      cyl(g, 0.12, 0.12, 3.0, metal(), 0, 3.3, 0, 10);
      torus(g, 1.85, 0.05, metal(), 0, 4.65, 0).rotation.x = Math.PI / 2;
      torus(g, 0.62, 0.05, metal(), 0, 1.92, 0).rotation.x = Math.PI / 2;
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        rbox(g, 0.55, 0.5, 0.4, 0.05, paint(GREY, 0.5, 0.3), Math.cos(a) * 1.25, 0.8, Math.sin(a) * 1.25).rotation.y = -a;
      }
      for (const a of [0.8, 2.6]) {
        cyl(g, 0.03, 0.03, 1.2, metal(), Math.cos(a) * 2.45, 0.6, Math.sin(a) * 2.45, 6);
        box(g, 0.4, 0.4, 0.03, radiationSign(), Math.cos(a) * 2.45, 1.25, Math.sin(a) * 2.45).rotation.y = -a + Math.PI / 2;
      }
      view.status = statusLamp(g, Math.cos(Math.PI / 4) * 1.25, 1.17, Math.sin(Math.PI / 4) * 1.25);
      view.top = 4.9;
      break;
    }
  }
  finalize(g);
  view.group.userData.top = view.top;
  return view;
}

/** Scaffolding and a small crane drawn while a module is under construction. */
export function scaffold(height: number) {
  const g = new THREE.Group();
  const pole = paint("#ffb020", 0.6, 0.3),
    steel = metal("#9aa3b4", 0.4);
  const xs = [-1.7, 1.7],
    zs = [-1.3, 1.3];
  for (const x of xs) for (const z of zs) cyl(g, 0.06, 0.06, height, pole, x, height / 2, z, 6);
  for (const y of [height * 0.33, height * 0.7, height]) {
    for (const z of zs) box(g, 3.5, 0.06, 0.06, pole, 0, y, z);
    for (const x of xs) box(g, 0.06, 0.06, 2.7, pole, x, y, 0);
  }
  for (const z of zs) strut(g, -1.7, 0.1, z, 1.7, height * 0.33, z, 0.03, steel);
  rbox(g, 3.5, 0.06, 0.6, 0.02, paint("#c9ced8", 0.7), 0, height * 0.7 + 0.05, -1.0);
  cyl(g, 0.09, 0.12, height + 1.6, steel, 1.7, (height + 1.6) / 2, -1.3, 8);
  strut(g, 1.7, height + 1.5, -1.3, -0.4, height + 1.2, 0.2, 0.06, pole);
  cyl(g, 0.012, 0.012, 1.4, paint(DARK), -0.4, height + 0.5, 0.2, 4);
  box(g, 0.2, 0.15, 0.2, paint(DARK), -0.4, height - 0.2, 0.2);
  const lamp = light("#fff1d6", 3);
  for (const x of xs) box(g, 0.22, 0.12, 0.1, lamp, x, height + 0.12, 1.3);
  return finalize(g);
}

export interface RoverView {
  group: THREE.Group;
  wheels: THREE.Object3D[];
  heads: THREE.MeshStandardMaterial;
  tail: THREE.MeshStandardMaterial;
  beacon: THREE.MeshStandardMaterial;
  arm: THREE.Object3D;
}
/** A small pressurised rover: the crew drive in shirt-sleeves and step out through suitports at the back. */
export function buildRover(): RoverView {
  const g = new THREE.Group();
  const white = paint(WHITE, 0.5, 0.1),
    dark = paint(DARK, 0.6, 0.35),
    frame = metal("#9aa3b4", 0.4);
  rbox(g, 2.2, 0.42, 4.0, 0.12, dark, 0, 0.86, 0);
  rbox(g, 2.1, 1.38, 3.0, 0.45, white, 0, 1.7, 0.3);
  rbox(g, 2.0, 0.85, 1.1, 0.32, white, 0, 1.42, -1.3);
  const glassFront = rbox(g, 1.86, 0.6, 0.7, 0.2, visor(), 0, 1.98, -1.08);
  glassFront.rotation.x = -0.38;
  for (const x of [-1.06, 1.06]) rbox(g, 0.05, 0.42, 0.95, 0.04, visor(), x, 2.0, -0.2);
  box(g, 2.13, 0.13, 3.0, paint(ORANGE, 0.5), 0, 1.32, 0.3);
  box(g, 2.03, 0.08, 1.1, paint(ORANGE, 0.5), 0, 1.6, -1.3);
  rbox(g, 1.7, 0.06, 1.6, 0.02, frame, 0, 2.4, 0.75);
  box(g, 1.6, 0.04, 1.5, cellsMaterial(), 0, 2.44, 0.75);
  const heads = light("#fff3d6", 2.5);
  for (const x of [-0.62, 0.62]) {
    rbox(g, 0.46, 0.2, 0.08, 0.04, paint(DARK, 0.4), x, 1.12, -1.97);
    box(g, 0.38, 0.13, 0.04, heads, x, 1.12, -2.02);
  }
  rbox(g, 1.3, 0.12, 0.16, 0.04, paint(DARK, 0.4), 0, 2.44, -0.55);
  box(g, 1.2, 0.07, 0.04, heads, 0, 2.44, -0.64);
  const tail = light("#ff5a3d", 1.8);
  for (const x of [-0.8, 0.8]) box(g, 0.28, 0.12, 0.05, tail, x, 1.0, 2.01);
  // Suitports on the back wall.
  for (const x of [-0.48, 0.48]) {
    torus(g, 0.33, 0.06, frame, x, 1.75, 1.82);
    cyl(g, 0.3, 0.3, 0.06, paint(OFF, 0.5), x, 1.75, 1.82, 20).rotation.x = Math.PI / 2;
  }
  cyl(g, 0.03, 0.03, 1.0, frame, -0.75, 2.9, 1.3, 6);
  const beacon = light("#ff4d5e", 3);
  ball(g, 0.07, beacon, -0.75, 3.42, 1.3, 8);
  const dish = cyl(g, 0.3, 0.06, 0.1, paint(WHITE, 0.4), 0.7, 2.62, 1.45, 16);
  dish.rotation.x = 0.6;
  for (const z of [-1.3, 0, 1.3]) for (const x of [-1.16, 1.16]) rbox(g, 0.5, 0.07, 1.0, 0.03, dark, x, 1.0, z);
  const tyre = paint("#232832", 0.95),
    tread = paint("#3a4150", 0.9),
    hub = metal("#b8c0cc", 0.35);
  const wheels: THREE.Object3D[] = [];
  for (const z of [-1.3, 0, 1.3])
    for (const x of [-1.2, 1.2]) {
      const w = keep(new THREE.Group());
      w.position.set(x, 0.47, z);
      g.add(w);
      cyl(w, 0.47, 0.47, 0.36, tyre, 0, 0, 0, 20).rotation.z = Math.PI / 2;
      cyl(w, 0.25, 0.25, 0.38, hub, 0, 0, 0, 12).rotation.z = Math.PI / 2;
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const t = box(w, 0.38, 0.05, 0.13, tread, 0, Math.cos(a) * 0.47, Math.sin(a) * 0.47);
        t.rotation.x = -a;
      }
      for (let i = 0; i < 5; i++) box(w, 0.4, 0.05, 0.42, hub, 0, 0, 0).rotation.x = (i / 5) * Math.PI;
      wheels.push(w);
    }
  const arm = keep(new THREE.Group());
  arm.position.set(0.85, 1.2, -1.75);
  g.add(arm);
  strut(arm, 0, 0, 0, 0, 0.35, -0.45, 0.06, frame);
  strut(arm, 0, 0.35, -0.45, 0, -0.15, -0.75, 0.05, frame);
  ball(arm, 0.12, dark, 0, -0.18, -0.77, 10);
  finalize(g);
  return { group: g, wheels, heads, tail, beacon, arm };
}
const cellsMaterial = () => cells(1.5, 1.4);

/** An astronaut in a white surface suit. `stripe` marks who is who (commanders wear red stripes). */
export function buildAstronaut(stripe = "#ff8a3d") {
  const g = new THREE.Group();
  const suit = paint("#f2f4f8", 0.78),
    joint = paint("#c9ced8", 0.6),
    boot = paint("#3a3f4a", 0.8),
    mark = paint(stripe, 0.5);
  const torso = capsule(g, 0.27, 0.42, suit, 0, 1.08, 0);
  torso.scale.z = 0.85;
  torus(g, 0.25, 0.04, joint, 0, 0.82, 0).rotation.x = Math.PI / 2;
  rbox(g, 0.3, 0.2, 0.08, 0.03, paint(GREY, 0.5), 0, 1.14, -0.24);
  ball(g, 0.025, light("#3ee39a", 2), -0.08, 1.16, -0.29, 6);
  ball(g, 0.025, light("#ffb020", 2), 0.0, 1.16, -0.29, 6);
  rbox(g, 0.48, 0.62, 0.26, 0.06, paint("#e0e4ea", 0.6), 0, 1.16, 0.27);
  box(g, 0.3, 0.06, 0.02, mark, 0, 1.38, 0.41);
  ball(g, 0.25, suit, 0, 1.58, 0, 20);
  const v = ball(g, 0.2, foil(), 0, 1.6, -0.1, 18);
  v.scale.set(1, 0.85, 0.75);
  box(g, 0.08, 0.05, 0.08, light("#fff3d6", 2), 0.17, 1.76, -0.08);
  const legs: THREE.Object3D[] = [],
    arms: THREE.Object3D[] = [];
  for (const x of [-0.13, 0.13]) {
    const leg = keep(new THREE.Group());
    leg.position.set(x, 0.74, 0);
    g.add(leg);
    capsule(leg, 0.11, 0.38, suit, 0, -0.3, 0);
    torus(leg, 0.11, 0.025, joint, 0, -0.3, 0).rotation.x = Math.PI / 2;
    rbox(leg, 0.2, 0.14, 0.32, 0.04, boot, 0, -0.66, -0.04);
    legs.push(leg);
  }
  for (const x of [-0.36, 0.36]) {
    const a = keep(new THREE.Group());
    a.position.set(x, 1.28, 0);
    g.add(a);
    capsule(a, 0.08, 0.36, suit, 0, -0.26, 0);
    torus(a, 0.085, 0.022, mark, 0, -0.08, 0).rotation.x = Math.PI / 2;
    ball(a, 0.08, joint, 0, -0.55, 0, 10);
    arms.push(a);
  }
  finalize(g);
  g.userData.legs = legs;
  g.userData.arms = arms;
  return g;
}

/** The lander that brought the crew: scenery beside the outpost. */
export function buildLander(planet: Planet) {
  const g = new THREE.Group();
  const frame = metal("#9aa3b4", 0.4),
    white = paint(WHITE, 0.5, 0.1);
  const beacon = light("#ff4d5e", 3);
  if (planet === "moon") {
    cyl(g, 1.9, 1.9, 1.4, foil(), 0, 2.05, 0, 8);
    cyl(g, 1.95, 1.95, 0.08, paint(DARK, 0.5), 0, 2.78, 0, 8);
    cyl(g, 1.95, 1.95, 0.08, paint(DARK, 0.5), 0, 1.33, 0, 8);
    lathe(
      g,
      "bell",
      [
        [0.75, 0.55],
        [0.6, 0.8],
        [0.42, 1.1],
        [0.35, 1.32],
      ],
      metal("#3a3f4a", 0.5),
    );
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const c = Math.cos(a),
        s = Math.sin(a);
      strut(g, c * 1.75, 2.4, s * 1.75, c * 3.4, 0.25, s * 3.4, 0.09, frame);
      strut(g, c * 1.6, 1.4, s * 1.6, c * 3.4, 0.25, s * 3.4, 0.06, frame);
      cyl(g, 0.5, 0.55, 0.12, metal("#c9ced8", 0.4), c * 3.4, 0.1, s * 3.4, 16);
      for (let k = 1; k < 5; k++) {
        const t = k / 5;
        box(g, 0.4, 0.04, 0.06, frame, c * (1.75 + 1.65 * t), 2.4 - 2.15 * t, s * (1.75 + 1.65 * t)).rotation.y = -a + Math.PI / 2;
      }
    }
    rbox(g, 2.4, 2.1, 2.2, 0.4, white, 0, 3.85, 0);
    box(g, 2.42, 0.14, 2.22, paint(ORANGE, 0.5), 0, 3.0, 0);
    for (const x of [-0.5, 0.5]) rbox(g, 0.55, 0.45, 0.1, 0.06, visor(), x, 4.25, -1.11);
    rbox(g, 0.8, 1.0, 0.1, 0.06, paint(GREY, 0.5, 0.3), 0, 3.6, 1.11);
    for (const [x, z] of [
      [-1.2, -1.1],
      [1.2, -1.1],
      [-1.2, 1.1],
      [1.2, 1.1],
    ]) {
      rbox(g, 0.28, 0.28, 0.28, 0.04, paint(DARK, 0.5, 0.3), x, 4.3, z);
      cone(g, 0.07, 0.18, metal("#3a3f4a"), x + Math.sign(x) * 0.2, 4.3, z, 8);
    }
    cyl(g, 0.55, 0.55, 0.5, paint(OFF, 0.5), 0, 5.15, 0, 20);
    cyl(g, 0.04, 0.04, 1.2, frame, 0.8, 5.4, 0.6, 6);
    const dish = cyl(g, 0.45, 0.08, 0.15, white, 0.8, 6.0, 0.6, 20);
    dish.rotation.x = 0.7;
    ball(g, 0.07, beacon, -0.9, 5.05, -0.5, 8);
  } else {
    // A squat Mars lander: its heat shield underneath, landing legs and a capsule on top.
    lathe(
      g,
      "marslander",
      [
        [0, 1.0],
        [2.7, 1.05],
        [2.75, 1.3],
        [2.5, 1.7],
        [1.7, 3.5],
        [1.15, 4.1],
        [0.9, 4.25],
        [0, 4.3],
      ],
      white,
    );
    cyl(g, 2.75, 2.6, 0.3, paint("#4a3b35", 0.9), 0, 1.0, 0, 48);
    torus(g, 2.62, 0.07, paint(ORANGE, 0.5), 0, 1.55, 0).rotation.x = Math.PI / 2;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const c = Math.cos(a),
        s = Math.sin(a);
      strut(g, c * 2.3, 1.2, s * 2.3, c * 3.5, 0.2, s * 3.5, 0.11, frame);
      strut(g, c * 1.8, 1.0, s * 1.8, c * 3.5, 0.2, s * 3.5, 0.07, frame);
      cyl(g, 0.45, 0.5, 0.12, metal("#c9ced8", 0.4), c * 3.5, 0.08, s * 3.5, 16);
    }
    for (const a of [-0.35, 0.35]) {
      const w = rbox(g, 0.5, 0.42, 0.1, 0.06, visor(), Math.sin(a) * 2.0, 2.95, -Math.cos(a) * 2.0);
      w.rotation.set(-0.45, -a, 0);
    }
    rbox(g, 0.9, 1.1, 0.12, 0.08, paint(GREY, 0.5, 0.3), 0, 2.2, 2.45).rotation.x = 0.4;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      rbox(g, 0.3, 0.2, 0.3, 0.04, paint(DARK, 0.5, 0.3), Math.cos(a) * 1.35, 3.85, Math.sin(a) * 1.35).rotation.y = -a;
    }
    cyl(g, 0.04, 0.04, 1.3, frame, 0.5, 4.9, 0.3, 6);
    ball(g, 0.07, beacon, 0.5, 5.6, 0.3, 8);
  }
  finalize(g);
  g.userData.beacon = beacon;
  return g;
}

/** Hexagonal build pad of sintered regolith with an outline that lights up while you choose a pad. */
export function buildPad(planet: Planet, kind: "base" | "ice" | "far") {
  const g = new THREE.Group();
  cyl(g, 2.75, 2.95, 0.18, paint(planet === "mars" ? "#9c735f" : "#979ca6", 0.95), 0, 0.07, 0, 6);
  cyl(g, 2.3, 2.3, 0.2, paint(planet === "mars" ? "#a98270" : "#a5aab3", 0.9), 0, 0.08, 0, 6);
  for (let i = 0; i < 3; i++) box(g, 4.0, 0.21, 0.04, paint(planet === "mars" ? "#8a6553" : "#868b95", 0.9), 0, 0.08, 0).rotation.y = (i * Math.PI) / 3;
  const color = kind === "ice" ? "#7fdcff" : kind === "far" ? "#ff9a57" : "#9fb3ff";
  const marker = light(color, 0.8);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    box(g, 0.16, 0.08, 0.16, marker, Math.cos(a) * 2.55, 0.2, Math.sin(a) * 2.55);
  }
  const ring = keep(new THREE.Mesh(new THREE.RingGeometry(2.5, 2.8, 6, 1), light(color, 1.4)));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.24;
  (ring.material as THREE.MeshStandardMaterial).transparent = true;
  (ring.material as THREE.MeshStandardMaterial).opacity = 0.35;
  g.add(ring);
  finalize(g);
  for (const o of g.children) o.castShadow = false;
  g.userData.ring = ring;
  return g;
}

let dockTexture: THREE.Texture | null = null;
/** The rover's charging pad, with guide lights and a charging post. */
export function buildDock(planet: Planet) {
  const g = new THREE.Group();
  if (!dockTexture) {
    dockTexture = canvasTexture(256, 256, (c) => {
      c.fillStyle = "#3a404f";
      c.fillRect(0, 0, 256, 256);
      c.fillStyle = "rgba(255,255,255,0.04)";
      for (let i = 0; i < 400; i++) c.fillRect((i * 97) % 256, (i * 61) % 256, 3, 3);
      c.strokeStyle = "#ffc94a";
      c.lineWidth = 9;
      c.strokeRect(14, 14, 228, 228);
      c.setLineDash([16, 12]);
      c.lineWidth = 4;
      c.strokeRect(34, 34, 188, 188);
      c.setLineDash([]);
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
  const top = new THREE.MeshStandardMaterial({ map: dockTexture, roughness: 0.75, metalness: 0.2 });
  top.userData.shared = true;
  const side = paint(planet === "mars" ? "#6d5348" : "#5c6270", 0.8);
  const slab = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.2, 5.2), [side, side, top, side, side, side]);
  slab.position.y = 0.1;
  slab.receiveShadow = true;
  g.add(slab);
  const guide = light("#ffc94a", 1.5);
  for (const x of [-2.5, 2.5]) for (const z of [-2.5, 2.5]) box(g, 0.2, 0.08, 0.2, guide, x, 0.22, z);
  rbox(g, 0.5, 1.9, 0.5, 0.08, paint(OFF, 0.5, 0.2), -3.0, 0.95, 0);
  box(g, 0.52, 0.12, 0.52, paint(ORANGE, 0.5), -3.0, 1.6, 0);
  strut(g, -3.0, 1.75, 0, -2.4, 1.45, 0, 0.05, metal());
  const plug = light("#3ee39a", 2);
  ball(g, 0.16, plug, -2.35, 1.45, 0, 12);
  rbox(g, 0.3, 0.3, 0.06, 0.03, plug, -3.0, 1.25, 0.26);
  finalize(g);
  g.userData.plug = plug;
  g.userData.guide = guide;
  return g;
}

/** A marker the crew leave at a site they have surveyed. */
export function buildFlag() {
  const g = new THREE.Group();
  cyl(g, 0.035, 0.04, 2.2, metal("#c9ced8", 0.4), 0, 1.1, 0, 6);
  box(g, 0.9, 0.55, 0.02, light("#7ef0c8", 0.9), 0.47, 1.9, 0);
  rbox(g, 0.45, 0.25, 0.32, 0.04, paint(OFF, 0.5), 0.35, 0.13, 0.3);
  return finalize(g);
}
