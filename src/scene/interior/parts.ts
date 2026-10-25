import * as THREE from "three";
import { box, canvasTexture, cyl, geo, keep, mesh, strut } from "../kit";
import { inside, imetal, ipaint, iplastic } from "./lighting";

/** The crew's colours (as in the HUD), for suit stripes, quarters and mugs. */
export const CREW_COLOR: Record<string, string> = { maya: "#ff8a3d", alex: "#5ee0ff", sam: "#63d471", noor: "#c48bff" };

/**
 * Every label inside is drawn into one shared texture (an atlas of 5 × 21 cells), so all of them together cost a
 * single draw call. Call beginLabels() before building and finishLabels() after.
 */
const ATLAS = { size: 2048, cw: 384, ch: 96, cols: 5, rows: 21 };
let atlas: { ctx: CanvasRenderingContext2D; texture: THREE.CanvasTexture; mat: THREE.MeshStandardMaterial; cells: Map<string, number> } | null = null;
export function beginLabels() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = ATLAS.size;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const mat = inside(new THREE.MeshStandardMaterial({ map: texture, transparent: true, roughness: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  atlas = { ctx: canvas.getContext("2d")!, texture, mat, cells: new Map() };
}
export function finishLabels() {
  if (atlas) atlas.texture.needsUpdate = true;
  atlas = null;
}
/**
 * A printed label or sign, lit like everything else inside: text on a plate (or straight on the surface with no
 * `plate`). Facing +z; `w` wide, a quarter as tall.
 */
export function ilabel(p: THREE.Object3D, text: string, w: number, x: number, y: number, z: number, ink = "#1d222b", plate: string | null = "#eceff2") {
  if (!atlas) beginLabels();
  const a = atlas!;
  const key = `${text}:${ink}:${plate}`;
  let cell = a.cells.get(key);
  if (cell === undefined) {
    cell = Math.min(a.cells.size, ATLAS.cols * ATLAS.rows - 1);
    a.cells.set(key, cell);
    const c = a.ctx,
      cx = (cell % ATLAS.cols) * ATLAS.cw,
      cy = Math.floor(cell / ATLAS.cols) * ATLAS.ch;
    c.save();
    c.translate(cx, cy);
    c.clearRect(0, 0, ATLAS.cw, ATLAS.ch);
    if (plate) {
      c.fillStyle = plate;
      c.beginPath();
      c.roundRect(4, 4, ATLAS.cw - 8, ATLAS.ch - 8, 14);
      c.fill();
      c.strokeStyle = ink;
      c.globalAlpha = 0.35;
      c.lineWidth = 3;
      c.stroke();
      c.globalAlpha = 1;
    }
    c.fillStyle = ink;
    c.font = "700 48px Lexend Variable, system-ui, sans-serif";
    const fit = Math.min(1, (ATLAS.cw - 40) / Math.max(1, c.measureText(text).width));
    c.font = `700 ${Math.floor(48 * fit)}px Lexend Variable, system-ui, sans-serif`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(text, ATLAS.cw / 2, ATLAS.ch / 2 + 3);
    c.restore();
  }
  const g = new THREE.PlaneGeometry(w, w / 4);
  // Point the plane's corners at this label's cell (a pixel in from its edges, so neighbours never bleed in).
  const u0 = ((cell % ATLAS.cols) * ATLAS.cw + 2) / ATLAS.size,
    u1 = ((cell % ATLAS.cols) * ATLAS.cw + ATLAS.cw - 2) / ATLAS.size,
    v1 = 1 - (Math.floor(cell / ATLAS.cols) * ATLAS.ch + 2) / ATLAS.size,
    v0 = 1 - (Math.floor(cell / ATLAS.cols) * ATLAS.ch + ATLAS.ch - 2) / ATLAS.size;
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) ? u1 : u0, uv.getY(i) ? v1 : v0);
  const o = mesh(g, a.mat, p, x, y, z);
  o.castShadow = false;
  return o;
}

/** A screen showing live data: redrawn a few times a second from whatever `draw` is given. */
export interface Screen {
  mesh: THREE.Mesh;
  /** Stays on in a power shortage (life support, the dosimeter). */
  essential: boolean;
  draw: (c: CanvasRenderingContext2D, w: number, h: number, data: ScreenData) => void;
  canvas: HTMLCanvasElement | null;
  texture: THREE.CanvasTexture | null;
}
/** What the screens show (filled in by the 3D view from the mission). */
export interface ScreenData {
  planet: "moon" | "mars";
  time: string;
  power: number;
  powerMax: number;
  o2: number;
  water: number;
  food: number;
  foodDays: number;
  dose: number;
  storm: boolean;
  sheltering: boolean;
  delay: string;
  crew: { name: string; place: string; health: number }[];
  samples: number;
  modules: { name: string; ok: boolean }[];
  /** Power is short: only life support's screens stay on. */
  essentialOnly?: boolean;
  [k: string]: unknown;
}
export const screens: Screen[] = [];
/** A flat screen in a dark bezel (facing +z), `w` × `h` metres, its picture drawn by `draw`. */
export function screen(p: THREE.Object3D, w: number, h: number, x: number, y: number, z: number, draw: Screen["draw"], px = 320, essential = false) {
  const bezel = iplastic("#1b1f27", 0.4);
  box(p, w + 0.04, h + 0.04, 0.025, bezel, x, y, z - 0.012);
  const canvas = typeof document === "undefined" ? null : document.createElement("canvas");
  let texture: THREE.CanvasTexture | null = null;
  if (canvas) {
    canvas.width = px;
    canvas.height = Math.round((px * h) / w);
    texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
  }
  const mat = new THREE.MeshStandardMaterial({ color: "#000", emissive: "#fff", emissiveMap: texture, emissiveIntensity: 0.9, roughness: 0.3, toneMapped: false });
  const m = keep(mesh(new THREE.PlaneGeometry(w, h), mat, p, x, y, z + 0.002));
  m.castShadow = false;
  const s: Screen = { mesh: m, draw, canvas, texture, essential };
  screens.push(s);
  return s;
}

/** A tubular grab handle on stand-offs (facing +z), `len` long, horizontal or (with `upright`) vertical. */
export function handle(p: THREE.Object3D, len: number, x: number, y: number, z: number, upright = false) {
  const m = imetal("#c4cad3", 0.3);
  const [ax, ay] = upright ? [0, len / 2] : [len / 2, 0];
  strut(p, x - ax, y - ay, z + 0.06, x + ax, y + ay, z + 0.06, 0.016, m, 8);
  for (const s of [-1, 1]) strut(p, x + s * ax * 0.85, y + s * ay * 0.85, z, x + s * ax * 0.85, y + s * ay * 0.85, z + 0.06, 0.012, m, 6);
}

/** An air vent: a slatted grille in a frame (facing +z). */
export function vent(p: THREE.Object3D, w: number, h: number, x: number, y: number, z: number) {
  const frame = ipaint("#d5d9de", 0.5),
    slot = ipaint("#3a4049", 0.7);
  box(p, w, h, 0.02, frame, x, y, z);
  const n = Math.max(3, Math.round(h / 0.035));
  for (let i = 0; i < n; i++) box(p, w - 0.04, 0.012, 0.012, slot, x, y - h / 2 + 0.03 + ((h - 0.06) * i) / Math.max(1, n - 1), z + 0.012);
}

/** A cable tray along a wall (facing +z): an open channel with a few bundled cables. */
export function cableTray(p: THREE.Object3D, len: number, x: number, y: number, z: number) {
  const tray = imetal("#9aa2ad", 0.45);
  box(p, len, 0.012, 0.12, tray, x, y - 0.04, z + 0.06);
  box(p, len, 0.08, 0.01, tray, x, y, z + 0.005);
  box(p, len, 0.05, 0.01, tray, x, y - 0.015, z + 0.12);
  const colors = ["#2b3038", "#c24b3a", "#3b6fb3", "#2b3038"];
  colors.forEach((c, i) => cyl(p, 0.011, 0.011, len - 0.04, ipaint(c, 0.6), x, y - 0.022, z + 0.025 + i * 0.022, 8).rotateZ(Math.PI / 2));
}

/** A fire extinguisher in a wall bracket, with its sign above (facing +z). */
export function extinguisher(p: THREE.Object3D, x: number, y: number, z: number) {
  const red = ipaint("#c8322a", 0.35, 0.1);
  cyl(p, 0.065, 0.065, 0.42, red, x, y, z + 0.08, 16);
  cyl(p, 0.03, 0.04, 0.06, imetal("#2b2f36"), x, y + 0.24, z + 0.08, 10);
  box(p, 0.16, 0.05, 0.03, imetal("#9aa2ad"), x, y - 0.05, z + 0.015);
  ilabel(p, "FIRE", 0.2, x, y + 0.38, z + 0.004, "#ffffff", "#c8322a");
}

/** Yellow and black warning stripes on a strip (facing +z). */
export function hazard(p: THREE.Object3D, w: number, h: number, x: number, y: number, z: number) {
  const key = `hz${w},${h}`;
  const tex = (hazardTex ??= (() => {
    const t = canvasTexture(128, 32, (c) => {
      c.fillStyle = "#e8b425";
      c.fillRect(0, 0, 128, 32);
      c.fillStyle = "#1d1f24";
      for (let i = -2; i < 8; i++) {
        c.beginPath();
        c.moveTo(i * 24, 32);
        c.lineTo(i * 24 + 12, 32);
        c.lineTo(i * 24 + 32, 0);
        c.lineTo(i * 24 + 20, 0);
        c.fill();
      }
    });
    t.wrapS = THREE.RepeatWrapping;
    t.userData.shared = true;
    return t;
  })());
  const m = (hazardMats.get(key) as THREE.MeshStandardMaterial | undefined) ?? inside(new THREE.MeshStandardMaterial({ map: tex.clone(), roughness: 0.6 }));
  if (!hazardMats.has(key)) {
    m.map!.repeat.set(w / (h * 4), 1);
    m.map!.needsUpdate = true;
    m.userData.shared = true;
    hazardMats.set(key, m);
  }
  return mesh(geo(`hzg${w},${h}`, () => new THREE.PlaneGeometry(w, h)), m, p, x, y, z);
}
let hazardTex: THREE.Texture | null = null;
const hazardMats = new Map<string, THREE.Material>();

/** A soft dark patch on the floor under something standing on it (grounds furniture without extra lights). */
export function footShadow(p: THREE.Object3D, w: number, d: number, x = 0, z = 0, strength = 0.5) {
  const tex = (shadowTex ??= (() => {
    const t = canvasTexture(64, 64, (c) => {
      const g = c.createRadialGradient(32, 32, 4, 32, 32, 32);
      g.addColorStop(0, "rgba(0,0,0,1)");
      g.addColorStop(0.55, "rgba(0,0,0,0.6)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      c.fillStyle = g;
      c.fillRect(0, 0, 64, 64);
    });
    t.userData.shared = true;
    return t;
  })());
  const m = (shadowMats.get(strength) as THREE.MeshBasicMaterial | undefined) ?? new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: strength, depthWrite: false, color: "#000", polygonOffset: true, polygonOffsetFactor: -1 });
  if (!shadowMats.has(strength)) {
    m.userData.shared = true;
    shadowMats.set(strength, m);
  }
  const o = mesh(geo("fs1", () => new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)), m, p, x, 0.004, z);
  o.scale.set(w * 1.25, 1, d * 1.25);
  o.castShadow = o.receiveShadow = false;
  return o;
}
let shadowTex: THREE.Texture | null = null;
const shadowMats = new Map<number, THREE.Material>();

/** Clear glass inside (a door's window, a freezer lid, a glovebox): thin and faintly reflective. */
export function iglass(tint = "#bcd8e6", opacity = 0.18) {
  const key = `${tint}:${opacity}`;
  let m = glassMats.get(key);
  if (!m) {
    m = inside(new THREE.MeshPhysicalMaterial({ color: tint, roughness: 0.05, metalness: 0, transparent: true, opacity, depthWrite: false, clearcoat: 1, clearcoatRoughness: 0.05 }));
    m.envMapIntensity = 0.8;
    m.userData.shared = true;
    glassMats.set(key, m);
  }
  return m;
}
const glassMats = new Map<string, THREE.MeshPhysicalMaterial>();
