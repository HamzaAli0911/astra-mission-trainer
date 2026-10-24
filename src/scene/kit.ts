import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/** Shared materials, cached by key. Shared materials are never disposed with a model. */
const cache = new Map<string, THREE.Material>();
function shared<T extends THREE.Material>(key: string, make: () => T): T {
  let m = cache.get(key) as T | undefined;
  if (!m) {
    m = make();
    m.userData.shared = true;
    cache.set(key, m);
  }
  return m;
}
export function paint(color: string, rough = 0.6, metal = 0.15) {
  return shared(`p:${color}:${rough}:${metal}`, () => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }));
}
/** Brushed metal: picks up the environment map. */
export function metal(color = "#9aa3b4", rough = 0.35) {
  return shared(`m:${color}:${rough}`, () => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.85 }));
}
/** Gold multi-layer insulation foil. */
export function foil() {
  return shared("foil", () => new THREE.MeshStandardMaterial({ color: "#d9a441", roughness: 0.28, metalness: 1, emissive: "#3a2400", emissiveIntensity: 0.2 }));
}
/** An emissive material owned by one model, so it can be dimmed or recoloured on its own. Bright values bloom. */
export function light(color: string, intensity = 2) {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: intensity,
    roughness: 0.35,
    toneMapped: false,
  });
}
export function glass(color = "#9fd6ff", opacity = 0.3) {
  return shared(`g:${color}:${opacity}`, () => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.05, metalness: 0.4, transparent: true, opacity, depthWrite: false });
    return m;
  });
}
/** Dark tinted window glass that reflects the sky. */
export function visor(color = "#152238") {
  return shared(`v:${color}`, () => new THREE.MeshStandardMaterial({ color, roughness: 0.08, metalness: 0.9 }));
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
  mesh(geo(`k${r},${len}`, () => new THREE.CapsuleGeometry(r, len, 6, 16)), m, p, x, y, z);
export const torus = (p: THREE.Object3D, r: number, tube: number, m: Mat, x = 0, y = 0, z = 0, arc = Math.PI * 2) =>
  mesh(geo(`t${r},${tube},${arc}`, () => new THREE.TorusGeometry(r, tube, 10, 48, arc)), m, p, x, y, z);
export const cone = (p: THREE.Object3D, r: number, h: number, m: Mat, x = 0, y = 0, z = 0, seg = 28, open = false) =>
  mesh(geo(`n${r},${h},${seg},${open}`, () => new THREE.ConeGeometry(r, h, seg, 1, open)), m, p, x, y, z);
/** A solid of revolution from a profile of [radius, height] points. */
export const lathe = (p: THREE.Object3D, key: string, points: [number, number][], m: Mat, x = 0, y = 0, z = 0, seg = 48) =>
  mesh(geo(`l${key}`, () => new THREE.LatheGeometry(points.map(([r, h]) => new THREE.Vector2(r, h)), seg)), m, p, x, y, z);

/** A round bar from one point to another: legs, struts, trusses. */
export function strut(p: THREE.Object3D, ax: number, ay: number, az: number, bx: number, by: number, bz: number, r: number, m: Mat, seg = 6) {
  const a = new THREE.Vector3(ax, ay, az),
    b = new THREE.Vector3(bx, by, bz);
  const o = mesh(geo(`c${r},${r},1,${seg}`, () => new THREE.CylinderGeometry(r, r, 1, seg)), m, p);
  o.position.copy(a).add(b).multiplyScalar(0.5);
  o.scale.y = a.distanceTo(b);
  o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.sub(a).normalize());
  return o;
}

/** Mark a part that moves or changes on its own; finalize() leaves it (and its children) alone. */
export function keep<T extends THREE.Object3D>(o: T) {
  o.userData.keep = true;
  return o;
}

/**
 * Merge every static mesh of a model into one mesh per material: a detailed
 * module becomes a handful of draw calls. Parts marked with keep() stay separate.
 */
export function finalize<T extends THREE.Object3D>(root: T): T {
  const kept: THREE.Object3D[] = [];
  root.traverse((o) => {
    if (o !== root && o.userData.keep && !(o as THREE.Mesh).isMesh) kept.push(o);
  });
  merge(root);
  for (const k of kept) merge(k);
  return root;
}
function merge(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const groups = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const drop: THREE.Mesh[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || Array.isArray(m.material)) return;
    for (let a: THREE.Object3D | null = m; a && a !== root; a = a.parent) if (a.userData.keep) return;
    let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    for (const name of Object.keys(g.attributes)) if (name !== "position" && name !== "normal" && name !== "uv") g.deleteAttribute(name);
    if (!g.attributes.uv) g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array((g.attributes.position.count) * 2), 2));
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
    const list = groups.get(m.material);
    if (list) list.push(g);
    else groups.set(m.material, [g]);
    drop.push(m);
  });
  for (const m of drop) m.parent?.remove(m);
  for (const [material, list] of groups) {
    const merged = mergeGeometries(list, false);
    for (const g of list) g.dispose();
    if (!merged) continue;
    const out = new THREE.Mesh(merged, material);
    out.castShadow = !material.transparent;
    out.receiveShadow = true;
    root.add(out);
  }
}

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
  t.anisotropy = 8;
  return t;
}

/** Deterministic pseudo-random numbers for procedural art. */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}
