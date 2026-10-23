import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

/** Shared materials, cached by key. Shared materials are never disposed with a model. */
const cache = new Map<string, THREE.Material>();
export function paint(color: string, rough = 0.6, metal = 0.15) {
  const key = `p:${color}:${rough}:${metal}`;
  let m = cache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
    m.userData.shared = true;
    cache.set(key, m);
  }
  return m;
}
/** An emissive material owned by one model, so it can be dimmed or recoloured on its own. */
export function light(color: string, intensity = 2) {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: intensity,
    roughness: 0.35,
    toneMapped: false,
  });
}
export function glass(color = "#9fd6ff", opacity = 0.32) {
  const key = `g:${color}:${opacity}`;
  let m = cache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.08,
      metalness: 0.1,
      transparent: true,
      opacity,
      depthWrite: false,
    });
    m.userData.shared = true;
    cache.set(key, m);
  }
  return m;
}

const geoCache = new Map<string, THREE.BufferGeometry>();
function geo(key: string, make: () => THREE.BufferGeometry) {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    g.userData.shared = true;
    geoCache.set(key, g);
  }
  return g;
}

type Mat = THREE.Material;
function mesh(g: THREE.BufferGeometry, m: Mat, parent: THREE.Object3D, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  o.castShadow = true;
  o.receiveShadow = true;
  parent.add(o);
  return o;
}

export const box = (p: THREE.Object3D, w: number, h: number, d: number, m: Mat, x = 0, y = 0, z = 0) =>
  mesh(geo(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d)), m, p, x, y, z);
export const rbox = (p: THREE.Object3D, w: number, h: number, d: number, r: number, m: Mat, x = 0, y = 0, z = 0) =>
  mesh(geo(`rb${w},${h},${d},${r}`, () => new RoundedBoxGeometry(w, h, d, 3, r)), m, p, x, y, z);
export const cyl = (p: THREE.Object3D, rt: number, rb: number, h: number, m: Mat, x = 0, y = 0, z = 0, seg = 28) =>
  mesh(geo(`c${rt},${rb},${h},${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg)), m, p, x, y, z);
export const ball = (p: THREE.Object3D, r: number, m: Mat, x = 0, y = 0, z = 0, seg = 24) =>
  mesh(geo(`s${r},${seg}`, () => new THREE.SphereGeometry(r, seg, Math.max(8, seg / 2))), m, p, x, y, z);
export const dome = (p: THREE.Object3D, r: number, m: Mat, x = 0, y = 0, z = 0) =>
  mesh(geo(`d${r}`, () => new THREE.SphereGeometry(r, 32, 14, 0, Math.PI * 2, 0, Math.PI / 2)), m, p, x, y, z);
export const capsule = (p: THREE.Object3D, r: number, len: number, m: Mat, x = 0, y = 0, z = 0) =>
  mesh(geo(`k${r},${len}`, () => new THREE.CapsuleGeometry(r, len, 6, 14)), m, p, x, y, z);
export const torus = (p: THREE.Object3D, r: number, tube: number, m: Mat, x = 0, y = 0, z = 0, arc = Math.PI * 2) =>
  mesh(geo(`t${r},${tube},${arc}`, () => new THREE.TorusGeometry(r, tube, 10, 40, arc)), m, p, x, y, z);

/** Dispose geometries and materials a model owns (shared ones are kept). */
export function dispose(root: THREE.Object3D) {
  root.traverse((o) => {
    const any = o as THREE.Mesh;
    if (any.geometry && !any.geometry.userData.shared) any.geometry.dispose();
    const mats = any.material ? (Array.isArray(any.material) ? any.material : [any.material]) : [];
    for (const m of mats) {
      if (m.userData.shared) continue;
      for (const v of Object.values(m)) if (v instanceof THREE.Texture && !v.userData.shared) v.dispose();
      m.dispose();
    }
  });
}

/** A canvas texture drawn once. */
export function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void, srgb = true) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
