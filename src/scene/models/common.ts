import * as THREE from "three";
import type { Planet } from "../../sim/types";
import { addDetail, DETAIL } from "../surface";
import { ball, bolts, box, canvasTexture, cyl, geo, light, metal, mesh, paint, panel, rbox, rubber, shared, strut } from "../kit";

/** Procedural, original models. Everything faces north (−z) at rotation 0; local +z faces the habitat. */
export const C = {
  white: "#e8ecf2",
  off: "#d3d9e2",
  grey: "#a9b2c0",
  steel: "#8b94a3",
  dark: "#2a3140",
  orange: "#ff8a3d",
  blue: "#2f6fd6",
};

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
  /** Battery charge indicator segments, bottom to top. */
  bars?: THREE.MeshStandardMaterial[];
  /** Habitat regolith shield, shown as it is built. */
  shield?: THREE.Object3D;
  /** Reveal the shield to a fraction of its full build (0 to 1). */
  shieldProgress?: (p: number) => void;
  /** Habitat windows (warm at night). */
  windows?: THREE.MeshStandardMaterial;
  /** Height of the model's top, for labels and effects. */
  top: number;
}

export const soilColor = (planet: Planet) => (planet === "mars" ? "#8f5a42" : "#807f7d");

/** A small status lamp in a housing: its colour shows the module's state. */
export function statusLamp(g: THREE.Object3D, x: number, y: number, z: number) {
  const m = light("#3ee39a", 2.4);
  ball(g, 0.09, m, x, y + 0.04, z, 12);
  cyl(g, 0.12, 0.14, 0.1, paint(C.dark, 0.5, 0.3), x, y - 0.04, z, 14);
  cyl(g, 0.105, 0.105, 0.02, metal(), x, y + 0.01, z, 14);
  return m;
}

/** An equipment skid: two steel rails on levelling feet, with a deck plate. */
export function skid(g: THREE.Object3D, w: number, d: number, h = 0.3) {
  const steel = metal("#6f7787", 0.5),
    deck = paint("#3a4150", 0.75, 0.3);
  for (const sx of [-1, 1]) {
    box(g, 0.14, h * 0.6, d, steel, (sx * (w - 0.16)) / 2, h * 0.3 + 0.04, 0);
    box(g, 0.2, 0.03, d, steel, (sx * (w - 0.16)) / 2, h * 0.62, 0);
  }
  panel(g, w, d, 0.06, 0.04, deck, 0, h * 0.68, 0).rotation.x = -Math.PI / 2;
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const fx = (sx * (w - 0.2)) / 2,
        fz = (sz * (d - 0.2)) / 2;
      cyl(g, 0.11, 0.13, 0.05, rubber(), fx, 0.025, fz, 12);
      cyl(g, 0.035, 0.035, h * 0.4, steel, fx, 0.05 + h * 0.2, fz, 8);
    }
  return h * 0.71;
}

/** A painted equipment cabinet with a door seam, hinges, a latch and a vent. */
export function cabinet(g: THREE.Object3D, w: number, h: number, d: number, color: string, x = 0, y = 0, z = 0) {
  const body = paint(color, 0.55, 0.15),
    steel = metal("#9aa3b4", 0.4);
  rbox(g, w, h, d, Math.min(0.06, w * 0.08), body, x, y + h / 2, z);
  // Door outline and hardware on the front (+z) face.
  const fz = z + d / 2 + 0.006;
  box(g, w * 0.86, 0.012, 0.012, paint(C.dark, 0.6), x, y + h * 0.92, fz);
  box(g, w * 0.86, 0.012, 0.012, paint(C.dark, 0.6), x, y + h * 0.08, fz);
  box(g, 0.012, h * 0.84, 0.012, paint(C.dark, 0.6), x - w * 0.43, y + h / 2, fz);
  box(g, 0.012, h * 0.84, 0.012, paint(C.dark, 0.6), x + w * 0.43, y + h / 2, fz);
  for (const k of [0.25, 0.75]) cyl(g, 0.018, 0.018, 0.09, steel, x - w * 0.43, y + h * k, fz + 0.01, 8);
  rbox(g, 0.05, 0.14, 0.03, 0.01, steel, x + w * 0.36, y + h * 0.55, fz + 0.012);
}

let cellImage: THREE.Texture | null = null;
const cellMats = new Map<string, THREE.MeshStandardMaterial>();
/**
 * Solar cells: rows of pseudo-square monocrystalline cells (clipped corners),
 * fine silver fingers and two bus bars on each, white backsheet showing between
 * them. Tiled `rx` × `ry` times over a panel. `dust` greys them (Mars).
 */
export function cells(rx: number, ry: number, dust = 0) {
  if (!cellImage) {
    const N = 512,
      n = 4,
      s = N / n,
      gap = 5,
      cut = 12;
    cellImage = canvasTexture(N, N, (c) => {
      c.fillStyle = "#c9ced6";
      c.fillRect(0, 0, N, N);
      for (let y = 0; y < n; y++)
        for (let x = 0; x < n; x++) {
          const px = x * s + gap,
            py = y * s + gap,
            w = s - gap * 2;
          const g = c.createLinearGradient(px, py, px + w, py + w);
          g.addColorStop(0, "#1a2c55");
          g.addColorStop(0.5, "#13234a");
          g.addColorStop(1, "#0d1a3a");
          c.fillStyle = g;
          c.beginPath();
          c.moveTo(px + cut, py);
          c.lineTo(px + w - cut, py);
          c.lineTo(px + w, py + cut);
          c.lineTo(px + w, py + w - cut);
          c.lineTo(px + w - cut, py + w);
          c.lineTo(px + cut, py + w);
          c.lineTo(px, py + w - cut);
          c.lineTo(px, py + cut);
          c.closePath();
          c.fill();
          c.fillStyle = "rgba(190,200,220,0.28)";
          for (let k = 1; k < 40; k++) c.fillRect(px + 2, py + (k * w) / 40, w - 4, 1);
          c.fillStyle = "rgba(215,222,235,0.85)";
          c.fillRect(px + w * 0.32, py + 2, 3, w - 4);
          c.fillRect(px + w * 0.68, py + 2, 3, w - 4);
        }
    });
    cellImage.userData.shared = true;
    cellImage.anisotropy = 16;
  }
  const key = `${rx},${ry},${dust}`;
  let m = cellMats.get(key);
  if (!m) {
    const t = cellImage.clone();
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx, ry);
    t.needsUpdate = true;
    t.userData.shared = true;
    const tint = new THREE.Color(1, 1, 1).lerp(new THREE.Color("#c99a7a"), dust);
    m = new THREE.MeshPhysicalMaterial({ map: t, color: tint, roughness: 0.16 + dust * 0.4, metalness: 0.35, clearcoat: 1 - dust * 0.7, clearcoatRoughness: 0.05 + dust * 0.3 });
    m.userData.shared = true;
    cellMats.set(key, m);
  }
  return m;
}

let signMat: THREE.MeshStandardMaterial | null = null;
/** A yellow radiation trefoil sign. */
export function radiationSign() {
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

/** Yellow-and-black hazard striping. */
export function hazard() {
  return shared("hazard", () => {
    const t = canvasTexture(128, 32, (c) => {
      c.fillStyle = "#1b1d22";
      c.fillRect(0, 0, 128, 32);
      c.fillStyle = "#f2b81d";
      for (let i = -2; i < 10; i++) {
        c.beginPath();
        c.moveTo(i * 16, 32);
        c.lineTo(i * 16 + 8, 32);
        c.lineTo(i * 16 + 24, 0);
        c.lineTo(i * 16 + 16, 0);
        c.fill();
      }
    });
    t.wrapS = THREE.RepeatWrapping;
    t.userData.shared = true;
    return addDetail(new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 }), DETAIL.paint);
  });
}

const labelMats = new Map<string, THREE.MeshStandardMaterial>();
/** A small painted stencil label (technical marking), on a plane facing +z. */
export function label(p: THREE.Object3D, text: string, w: number, x: number, y: number, z: number, color = "#1d222b") {
  const key = `${text}:${color}`;
  let m = labelMats.get(key);
  if (!m) {
    const t = canvasTexture(256, 64, (c) => {
      c.clearRect(0, 0, 256, 64);
      c.fillStyle = color;
      // Shrink long text to fit the plate.
      c.font = "700 40px Lexend Variable, system-ui, sans-serif";
      const fit = Math.min(1, 236 / Math.max(1, c.measureText(text).width));
      c.font = `700 ${Math.floor(40 * fit)}px Lexend Variable, system-ui, sans-serif`;
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText(text, 128, 34);
    });
    t.userData.shared = true;
    m = new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.7, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    m.userData.shared = true;
    labelMats.set(key, m);
  }
  const o = mesh(new THREE.PlaneGeometry(w, w / 4), m, p, x, y, z);
  o.castShadow = false;
  return o;
}

/** A spherical pressure tank on a ring stand. */
export function sphereTank(g: THREE.Object3D, r: number, color: string, x: number, y: number, z: number) {
  ball(g, r, paint(color, 0.45, 0.2), x, y, z, 28);
  const steel = metal("#8892a6", 0.45);
  cyl(g, r * 0.62, r * 0.7, 0.06, steel, x, y - r * 0.82, z, 20);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    strut(g, x + Math.cos(a) * r * 0.66, y - r * 0.82, z + Math.sin(a) * r * 0.66, x + Math.cos(a) * r * 0.9, y - r - 0.3, z + Math.sin(a) * r * 0.9, 0.025, steel);
  }
  bolts(g, 10, r * 0.5, steel, x, y + r * 0.86, z, 0.018).rotation.x = -Math.PI / 2;
  cyl(g, 0.05, 0.05, 0.12, steel, x, y + r + 0.04, z, 10);
}

/** A filled regolith sack (about 0.62 × 0.3 × 0.42 m): flattened, squared-off ends, a slight sag in the middle. */
export function sandbagGeometry() {
  return geo("sandbag", () => {
    const g = new THREE.SphereGeometry(1, 14, 8);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i),
        y = p.getY(i),
        z = p.getZ(i);
      const sq = (v: number) => Math.sign(v) * Math.abs(v) ** 0.55;
      p.setXYZ(i, sq(x) * 0.31, y * 0.15 * (1 - 0.15 * x * x), sq(z) * 0.21);
    }
    g.computeVertexNormals();
    return g;
  });
}

/** Woven sacks filled with local regolith: dusty, matte, coloured like the ground. */
export function sandMaterial(planet: Planet) {
  return shared(`sand:${planet}`, () =>
    addDetail(new THREE.MeshStandardMaterial({ color: planet === "mars" ? "#a7714f" : "#a7a296", roughness: 1 }), { ...DETAIL.fabric, bump: 0.6, grime: 0.6 }),
  );
}
