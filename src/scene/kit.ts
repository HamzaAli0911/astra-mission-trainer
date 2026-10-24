import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { addDetail, DETAIL } from "./surface";

/** Shared materials, cached by key. Shared materials are never disposed with a model. */
const cache = new Map<string, THREE.Material>();
export function shared<T extends THREE.Material>(key: string, make: () => T): T {
  let m = cache.get(key) as T | undefined;
  if (!m) {
    m = make();
    m.userData.shared = true;
    cache.set(key, m);
  }
  return m;
}
export function paint(color: string, rough = 0.6, metal = 0.15) {
  return shared(`p:${color}:${rough}:${metal}`, () => addDetail(new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }), DETAIL.paint));
}
/** Brushed metal: picks up the environment map, with fine streaks. */
export function metal(color = "#9aa3b4", rough = 0.35) {
  return shared(`m:${color}:${rough}`, () => addDetail(new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.75 }), DETAIL.metal));
}
/** Woven white fabric: inflatable shells, thermal covers, suits. Never shiny. */
export function fabric(color = "#e9ecef", rough = 0.88) {
  return shared(`f:${color}:${rough}`, () => addDetail(new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0 }), DETAIL.fabric));
}
/** Rubber seals, tyres and hoses. */
export function rubber(color = "#22262e") {
  return shared(`r:${color}`, () => addDetail(new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0 }), DETAIL.rubber));
}
/** Crinkled gold multi-layer insulation foil. */
export function foil(color = "#d9a441") {
  return shared(`foil:${color}`, () =>
    addDetail(new THREE.MeshStandardMaterial({ color, roughness: 0.42, metalness: 1, emissive: "#3a2400", emissiveIntensity: 0.12 }), DETAIL.foil),
  );
}
/** Packed regolith, sandbags and berms. */
export function soil(color: string) {
  return shared(`s:${color}`, () => addDetail(new THREE.MeshStandardMaterial({ color, roughness: 1, metalness: 0 }), DETAIL.soil));
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
/** Clear glass: thin, slightly tinted, with a glossy coat that catches reflections. */
export function glass(color = "#9fd6ff", opacity = 0.3) {
  return shared(`g:${color}:${opacity}`, () => {
    const m = new THREE.MeshPhysicalMaterial({ color, roughness: 0.04, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03, transparent: true, opacity, depthWrite: false, envMapIntensity: 1.4 });
    return m;
  });
}
/** Dark tinted window glass that reflects the sky. */
export function visor(color = "#152238") {
  return shared(`v:${color}`, () => new THREE.MeshPhysicalMaterial({ color, roughness: 0.06, metalness: 0.6, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.3 }));
}

const geoCache = new Map<string, THREE.BufferGeometry>();
/** A geometry made once and shared by every model that asks for the same key. */
export function geo(key: string, make: () => THREE.BufferGeometry) {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    g.userData.shared = true;
    geoCache.set(key, g);
  }
  return g;
}

type Mat = THREE.Material;
/** Add a mesh of any geometry to a parent at a position (casts and receives shadows). */
export function mesh(g: THREE.BufferGeometry, m: Mat, parent: THREE.Object3D, x = 0, y = 0, z = 0) {
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

/** A rounded rectangle outline, centred on the origin. */
export function roundRect(w: number, h: number, r: number): THREE.Shape;
export function roundRect<T extends THREE.Path>(w: number, h: number, r: number, shape: T): T;
export function roundRect(w: number, h: number, r: number, shape: THREE.Path = new THREE.Shape()) {
  const x = -w / 2,
    y = -h / 2;
  r = Math.min(r, w / 2, h / 2);
  shape.moveTo(x + r, y);
  shape.lineTo(x + w - r, y);
  shape.quadraticCurveTo(x + w, y, x + w, y + r);
  shape.lineTo(x + w, y + h - r);
  shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  shape.lineTo(x + r, y + h);
  shape.quadraticCurveTo(x, y + h, x, y + h - r);
  shape.lineTo(x, y + r);
  shape.quadraticCurveTo(x, y, x + r, y);
  return shape;
}

/** A panel with softly bevelled edges (facing +z, centred, `d` deep). */
export const panel = (p: THREE.Object3D, w: number, h: number, d: number, r: number, m: Mat, x = 0, y = 0, z = 0) =>
  mesh(
    geo(`pn${w},${h},${d},${r}`, () => {
      const bevel = Math.min(0.025, d * 0.35, r * 0.6);
      const g = new THREE.ExtrudeGeometry(roundRect(w - bevel * 2, h - bevel * 2, Math.max(0.001, r - bevel)), {
        depth: Math.max(0.001, d - bevel * 2),
        bevelEnabled: true,
        bevelThickness: bevel,
        bevelSize: bevel,
        bevelSegments: 3,
        curveSegments: 6,
      });
      g.translate(0, 0, -d / 2 + bevel);
      return g;
    }),
    m,
    p,
    x,
    y,
    z,
  );

/** A window: a rounded frame with a rubber gasket and a recessed glass pane, facing +z. */
export function windowPane(p: THREE.Object3D, w: number, h: number, r: number, frameMat: Mat, glassMat: Mat, sealMat: Mat, x = 0, y = 0, z = 0, frame = 0.07) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  p.add(g);
  const ring = (outerW: number, outerH: number, inner: number, depth: number, rr: number, key: string) =>
    geo(key, () => {
      const shape = roundRect(outerW, outerH, rr + inner);
      shape.holes.push(roundRect(outerW - inner * 2, outerH - inner * 2, rr, new THREE.Path()));
      const e = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 2, curveSegments: 8 });
      e.translate(0, 0, -depth / 2);
      return e;
    });
  mesh(ring(w + frame * 2, h + frame * 2, frame, 0.06, r, `wf${w},${h},${r},${frame}`), frameMat, g);
  mesh(ring(w + 0.02, h + 0.02, 0.025, 0.05, r, `wg${w},${h},${r}`), sealMat, g, 0, 0, -0.01);
  const pane = mesh(geo(`wp${w},${h},${r}`, () => new THREE.ShapeGeometry(roundRect(w, h, r), 8)), glassMat, g, 0, 0, -0.012);
  pane.castShadow = false;
  return g;
}

/** A bent pipe, hose or cable through a list of points. */
export function pipe(p: THREE.Object3D, points: [number, number, number][], r: number, m: Mat, seg = 8) {
  const curve = new THREE.CatmullRomCurve3(points.map(([a, b, c]) => new THREE.Vector3(a, b, c)), false, "centripetal");
  return mesh(new THREE.TubeGeometry(curve, Math.max(6, points.length * 10), r, seg, false), m, p);
}

/** A ring of small hexagonal bolt heads around an axis (the ring faces +z unless rotated). */
export function bolts(p: THREE.Object3D, n: number, radius: number, m: Mat, x = 0, y = 0, z = 0, size = 0.03) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  p.add(g);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    cyl(g, size, size, size * 0.8, m, Math.cos(a) * radius, Math.sin(a) * radius, 0, 6).rotation.x = Math.PI / 2;
  }
  return g;
}

/** A vent grille: thin slats across a framed opening, facing +z. */
export function grille(p: THREE.Object3D, w: number, h: number, n: number, frameMat: Mat, slatMat: Mat, x = 0, y = 0, z = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  p.add(g);
  panel(g, w, h, 0.03, 0.02, frameMat, 0, 0, -0.01);
  for (let i = 0; i < n; i++) {
    const s = box(g, w * 0.9, 0.012, 0.05, slatMat, 0, -h * 0.42 + (i / Math.max(1, n - 1)) * h * 0.84, 0.02);
    s.rotation.x = -0.6;
  }
  return g;
}

let blobTexture: THREE.Texture | null = null;
/** A soft dark patch on the ground where an object meets it (cheap contact shadow / ambient occlusion). */
export function contactShadow(p: THREE.Object3D, rx: number, rz: number, strength = 0.55, y = 0.03) {
  if (!blobTexture) {
    blobTexture = canvasTexture(128, 128, (c) => {
      const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(0.55, "rgba(255,255,255,0.6)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      c.fillStyle = g;
      c.fillRect(0, 0, 128, 128);
    });
    blobTexture.userData.shared = true;
  }
  const mat = shared(`blob:${strength}`, () => new THREE.MeshBasicMaterial({ color: 0x000000, map: blobTexture, transparent: true, opacity: strength, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }));
  const o = mesh(geo("blob", () => new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2)), mat, p, 0, y, 0);
  o.scale.set(rx, 1, rz);
  o.castShadow = false;
  o.receiveShadow = false;
  o.renderOrder = 1;
  return o;
}

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
    // Keep geometry indexed (detailed parts share their vertices), adding a plain index where missing.
    const g = m.geometry.clone();
    if (!g.index) g.setIndex([...Array(g.attributes.position.count).keys()]);
    for (const name of Object.keys(g.attributes)) if (name !== "position" && name !== "normal" && name !== "uv") g.deleteAttribute(name);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.morphAttributes = {};
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
