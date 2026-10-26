import * as THREE from "three";

type V3 = [number, number, number];
interface Bucket {
  mat: THREE.Material;
  pos: number[];
  nor: number[];
  uv: number[];
  col: number[];
  cell: number[];
  idx: number[];
}

/**
 * Collects quads and boxes into one geometry per material, each vertex carrying its colour and (for the campus's
 * own lighting, campus/lighting.ts) the room it belongs to. Metre-scale UVs along each quad's edges.
 */
export class CampusMesher {
  buckets = new Map<THREE.Material, Bucket>();
  private c = new THREE.Color();

  quad(mat: THREE.Material, a: V3, b: V3, c: V3, d: V3, n: V3, color: string, cell = 0) {
    let k = this.buckets.get(mat);
    if (!k) {
      k = { mat, pos: [], nor: [], uv: [], col: [], cell: [], idx: [] };
      this.buckets.set(mat, k);
    }
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]],
      e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cx = e1[1] * e2[2] - e1[2] * e2[1],
      cy = e1[2] * e2[0] - e1[0] * e2[2],
      cz = e1[0] * e2[1] - e1[1] * e2[0];
    const pts = cx * n[0] + cy * n[1] + cz * n[2] >= 0 ? [a, b, c, d] : [a, d, c, b];
    const ex = Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1], pts[1][2] - pts[0][2]),
      ey = Math.hypot(pts[3][0] - pts[0][0], pts[3][1] - pts[0][1], pts[3][2] - pts[0][2]);
    const uvs = [
      [0, 0],
      [ex, 0],
      [ex, ey],
      [0, ey],
    ];
    this.c.set(color);
    const base = k.pos.length / 3;
    pts.forEach((p, i) => {
      k.pos.push(...p);
      k.nor.push(...n);
      k.uv.push(...uvs[i]);
      k.col.push(this.c.r, this.c.g, this.c.b);
      k.cell.push(cell);
    });
    k.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  /** An axis-aligned box; `skip` leaves out faces nobody sees (by their outward direction). */
  box(mat: THREE.Material, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: string, cell = 0, skip = "") {
    if (x1 - x0 < 1e-6 || y1 - y0 < 1e-6 || z1 - z0 < 1e-6) return;
    if (!skip.includes("-x")) this.quad(mat, [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], color, cell);
    if (!skip.includes("+x")) this.quad(mat, [x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], [1, 0, 0], color, cell);
    if (!skip.includes("-y")) this.quad(mat, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], color, cell);
    if (!skip.includes("+y")) this.quad(mat, [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], [0, 1, 0], color, cell);
    if (!skip.includes("-z")) this.quad(mat, [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [0, 0, -1], color, cell);
    if (!skip.includes("+z")) this.quad(mat, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], color, cell);
  }

  /** One mesh per material. */
  meshes(shadows = true) {
    const out: THREE.Mesh[] = [];
    for (const k of this.buckets.values()) {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(k.pos, 3));
      g.setAttribute("normal", new THREE.Float32BufferAttribute(k.nor, 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(k.uv, 2));
      g.setAttribute("color", new THREE.Float32BufferAttribute(k.col, 3));
      g.setAttribute("cell", new THREE.Float32BufferAttribute(k.cell, 1));
      g.setIndex(k.idx);
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, k.mat);
      m.castShadow = shadows && !(k.mat as THREE.Material).transparent;
      m.receiveShadow = true;
      out.push(m);
    }
    this.buckets.clear();
    return out;
  }
}
