import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { campusFinish, campusTwin } from "./lighting";

/**
 * Furniture and fittings for the campus are built with the same kit as Hab-1's (scene/interior: ipaint, imetal,
 * ilabel, screens, vents...), which is lit by Hab-1's own plan. This re-lights them for the campus: every piece
 * carries the room it stands in (`userData.cell` on it or a parent), its painted, metal, plastic, rubber and fabric
 * parts are merged by finish into campus materials (colour per vertex, the room per vertex), and its other inside
 * materials (labels, glass, stripes) get campus-lit twins. Screens and lamps (self-lit) are left as they are.
 * Parts marked keep() (they move, or show and hide) merge within themselves.
 */
export function bakeProps(root: THREE.Object3D) {
  const kept: THREE.Object3D[] = [];
  root.traverse((o) => {
    if (o !== root && o.userData.keep && !(o as THREE.Mesh).isMesh) kept.push(o);
  });
  for (const r of [root, ...kept]) {
    r.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(r.matrixWorld).invert();
    const groups = new Map<string, THREE.BufferGeometry[]>();
    const drop: THREE.Mesh[] = [];
    r.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || Array.isArray(m.material)) return;
      // (Inside another kept part: that part's own pass deals with it.)
      for (let a: THREE.Object3D | null = m.parent; a && a !== r; a = a.parent) if (a.userData.keep) return;
      const mat = m.material as THREE.MeshStandardMaterial;
      const cell = cellOf(m);
      if (mat.userData?.finish) {
        const g = coloured(m.geometry, mat.color, cell);
        if (m.userData.keep) {
          // A part that moves on its own: re-lit where it is, not merged.
          m.geometry = g;
          m.material = campusFinish(mat.userData.finish);
          return;
        }
        g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
        const key = `${mat.userData.finish}|${m.castShadow}`;
        const list = groups.get(key);
        if (list) list.push(g);
        else groups.set(key, [g]);
        drop.push(m);
      } else if (mat.userData?.insideLit) {
        // Its own geometry (shared ones stay untouched), with the room it's in.
        const g = m.geometry.userData.shared ? m.geometry.clone() : m.geometry;
        g.setAttribute("cell", new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count).fill(cell), 1));
        m.geometry = g;
        m.material = campusTwin(mat);
      }
    });
    for (const m of drop) m.parent?.remove(m);
    for (const [key, list] of groups) {
      const merged = mergeGeometries(list, false);
      for (const g of list) g.dispose();
      if (!merged) continue;
      const out = new THREE.Mesh(merged, campusFinish(key.slice(0, key.lastIndexOf("|"))));
      out.castShadow = key.endsWith("true");
      out.receiveShadow = true;
      r.add(out);
    }
  }
}

/** A copy of a geometry ready to merge: position, normal and uv only, plus its colour and its room on every vertex. */
function coloured(src: THREE.BufferGeometry, color: THREE.Color, cell: number) {
  const g = src.clone();
  if (!g.index) g.setIndex([...Array(g.attributes.position.count).keys()]);
  for (const name of Object.keys(g.attributes)) if (name !== "position" && name !== "normal" && name !== "uv") g.deleteAttribute(name);
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  const n = g.attributes.position.count;
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.set([color.r, color.g, color.b], i * 3);
  g.setAttribute("color", new THREE.Float32BufferAttribute(c, 3));
  g.setAttribute("cell", new THREE.Float32BufferAttribute(new Float32Array(n).fill(cell), 1));
  g.morphAttributes = {};
  return g;
}

/** The room a piece stands in: set on it or on a parent. */
function cellOf(o: THREE.Object3D) {
  for (let a: THREE.Object3D | null = o; a; a = a.parent) if (typeof a.userData.cell === "number") return a.userData.cell as number;
  return 0;
}
