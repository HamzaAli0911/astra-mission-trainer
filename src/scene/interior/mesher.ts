import * as THREE from "three";
import { polar } from "../../sim/home";

type V = [number, number, number];

/** Collects flat quads and curved wall patches into one geometry, with normals and metre-scale UVs. */
export class Mesher {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];
  idx: number[] = [];

  /** A quad from four corners (in order round its edge); it is turned to face `n`. */
  quad(a: V, b: V, c: V, d: V, n: V) {
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]],
      e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cx = e1[1] * e2[2] - e1[2] * e2[1],
      cy = e1[2] * e2[0] - e1[0] * e2[2],
      cz = e1[0] * e2[1] - e1[1] * e2[0];
    const pts = cx * n[0] + cy * n[1] + cz * n[2] >= 0 ? [a, b, c, d] : [a, d, c, b];
    // UVs in metres along the quad's two edges, so surface detail keeps its scale.
    const ex = [pts[1][0] - pts[0][0], pts[1][1] - pts[0][1], pts[1][2] - pts[0][2]],
      ey = [pts[3][0] - pts[0][0], pts[3][1] - pts[0][1], pts[3][2] - pts[0][2]];
    const lx = Math.hypot(ex[0], ex[1], ex[2]),
      ly = Math.hypot(ey[0], ey[1], ey[2]);
    const base = this.pos.length / 3;
    const uvs = [
      [0, 0],
      [lx, 0],
      [lx, ly],
      [0, ly],
    ];
    pts.forEach((p, i) => {
      this.pos.push(...p);
      this.nor.push(...n);
      this.uv.push(...uvs[i]);
    });
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  /** A curved wall face on a circle of radius r, between two bearings and two heights, facing in or out. */
  arc(r: number, from: number, to: number, y0: number, y1: number, inward: boolean, step = 0.18) {
    const n = Math.max(1, Math.ceil(((to - from) * Math.PI * r) / 180 / step));
    for (let i = 0; i < n; i++) {
      const b0 = from + ((to - from) * i) / n,
        b1 = from + ((to - from) * (i + 1)) / n;
      const p0 = polar(b0, r),
        p1 = polar(b1, r),
        m = polar((b0 + b1) / 2, inward ? -1 : 1);
      this.quad([p0.x, y0, p0.z], [p1.x, y0, p1.z], [p1.x, y1, p1.z], [p0.x, y1, p0.z], [m.x, 0, m.z]);
    }
  }

  /** A flat ring (or disc) between two radii, facing up or down, between two bearings. */
  annulus(r0: number, r1: number, y: number, up: boolean, from = 0, to = 360, step = 0.2) {
    const n = Math.max(3, Math.ceil(((to - from) * Math.PI * r1) / 180 / step));
    for (let i = 0; i < n; i++) {
      const b0 = from + ((to - from) * i) / n,
        b1 = from + ((to - from) * (i + 1)) / n;
      const a = polar(b0, r0),
        b = polar(b1, r0),
        c = polar(b1, r1),
        d = polar(b0, r1);
      this.quad([a.x, y, a.z], [b.x, y, b.z], [c.x, y, c.z], [d.x, y, d.z], [0, up ? 1 : -1, 0]);
    }
  }

  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}
