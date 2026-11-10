import * as THREE from "three";
import { building, built, CELLS, MEZZANINE, PORTALS, doorLocked, type Stage } from "../sim/base";
import { floorY, HOME, walkWalls, type Floor, type Where } from "../sim/home";
import type { NavPoint } from "../sim/nav";

/**
 * The debug visualiser (`?debug`, then the backquote key or `__astra.viz(true)`): what the walk and the crew really
 * use, drawn over the scene. On the floor you're on: every collision segment (walls white, furniture grey, sliding
 * doors blue, airlock doors orange, doors into unbuilt buildings red), each room tinted by its pressure zone
 * (pressurised green, airlock blue, unpressurised hangar orange) and brighter where its building is being drawn; the
 * walker's body (a ring the size of the collision circle) and the interaction ray to what E would use; and the crew's
 * and the tour's routes. Nothing here is used by the game; it only reads.
 */
export interface VizInput {
  walker: { x: number; z: number; where: Where; outside: boolean };
  stage: Stage;
  /** Buildings whose insides are drawn now. */
  shown: (id: string) => boolean;
  /** What E would use now (a point on it), or null. */
  target: { x: number; z: number } | null;
  /** Routes being walked: the crew's, the tour guide's. */
  paths: { points: NavPoint[]; color: string }[];
}
const level = (w: Where): Floor => (w === "stair" ? 0 : w === "hq-stair" ? 0 : w);

export function debugViz() {
  const group = new THREE.Group();
  group.name = "debug-viz";
  group.renderOrder = 999;
  const line = (color: string, opacity = 1) => new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthTest: false, depthWrite: false });
  const mats = {
    wall: line("#ffffff"),
    furniture: line("#9aa3b0", 0.8),
    door: line("#4fa3ff"),
    lock: line("#ff9f2e"),
    locked: line("#ff4d5e"),
    body: line("#ffe066"),
    ray: line("#3ee39a"),
  };
  // (Room tints lie on the floor, hidden behind furniture; the lines show through everything.)
  const zone = (color: string, opacity: number) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  let floorKey = "",
    statics: THREE.Object3D[] = [];
  const dynamic = new THREE.Group();
  group.add(dynamic);

  const segs = (list: number[], mat: THREE.LineBasicMaterial) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(list, 3));
    const l = new THREE.LineSegments(g, mat);
    l.renderOrder = 999;
    l.frustumCulled = false;
    return l;
  };
  /** The floor's walls, doors, furniture and rooms (rebuilt when you change floor or the mission's stage). */
  const buildFloor = (fl: Floor, stage: Stage) => {
    for (const o of statics) {
      group.remove(o);
      (o as THREE.Mesh).geometry?.dispose();
    }
    statics = [];
    const y = (fl === 2 ? MEZZANINE : HOME.floor[fl === 1 ? 1 : 0]) + 0.04;
    const buckets: Record<string, number[]> = { wall: [], furniture: [], door: [], lock: [], locked: [] };
    for (const s of walkWalls(fl)) {
      const p = s.door ? PORTALS.find((x) => x.id === s.door) : null;
      const kind = s.block ? "furniture" : !s.door ? "wall" : !p ? "door" : p.kind === "lock-inner" || p.kind === "lock-outer" ? "lock" : doorLocked(p, stage) ? "locked" : "door";
      buckets[kind].push(s.ax, y, s.az, s.bx, y, s.bz);
    }
    for (const [k, list] of Object.entries(buckets)) if (list.length) statics.push(segs(list, mats[k as keyof typeof mats]));
    // Rooms tinted by pressure zone (the campus's; Hab-1 is all pressurised).
    if (fl !== 1)
      for (const c of CELLS) {
        if ((fl === 2) !== (c.level === 2)) continue;
        const color = c.kind === "hangar" ? "#ff9f2e" : c.kind === "lock" ? "#4fa3ff" : "#3ee39a";
        const m = new THREE.Mesh(new THREE.PlaneGeometry(c.rect.x1 - c.rect.x0, c.rect.z1 - c.rect.z0).rotateX(-Math.PI / 2), zone(color, built(building(c.building), stage) ? 0.1 : 0.03));
        m.position.set((c.rect.x0 + c.rect.x1) / 2, y - 0.025, (c.rect.z0 + c.rect.z1) / 2);
        m.renderOrder = 998;
        m.userData.building = c.building;
        statics.push(m);
      }
    for (const o of statics) group.add(o);
  };
  const pathMats = new Map<string, THREE.LineBasicMaterial>();
  const pathMat = (c: string) => {
    let m = pathMats.get(c);
    if (!m) pathMats.set(c, (m = line(c)));
    return m;
  };

  return {
    group,
    update(v: VizInput) {
      const fl = v.walker.outside ? 0 : level(v.walker.where);
      const key = `${fl}|${v.stage}`;
      if (key !== floorKey) {
        floorKey = key;
        buildFloor(fl, v.stage);
      }
      // Rooms whose building is drawn now are brighter.
      for (const o of statics) {
        const b = o.userData.building as string | undefined;
        if (b) ((o as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = v.shown(b) ? 0.22 : 0.06;
      }
      for (const o of [...dynamic.children]) {
        dynamic.remove(o);
        (o as THREE.Mesh).geometry?.dispose();
      }
      const w = v.walker;
      const y = (v.walker.outside ? 0.5 : floorY({ x: w.x, z: w.z, where: w.where })) + 0.06;
      // The walker's collision circle and an upright line through it.
      const ring: number[] = [];
      for (let i = 0; i < 32; i++) {
        const a = (i / 32) * Math.PI * 2,
          b = ((i + 1) / 32) * Math.PI * 2;
        ring.push(w.x + Math.cos(a) * HOME.body, y, w.z + Math.sin(a) * HOME.body, w.x + Math.cos(b) * HOME.body, y, w.z + Math.sin(b) * HOME.body);
      }
      ring.push(w.x, y, w.z, w.x, y + HOME.eye, w.z);
      dynamic.add(segs(ring, mats.body));
      // The interaction ray, from the eye to what E would use.
      if (v.target) dynamic.add(segs([w.x, y + HOME.eye - 0.06, w.z, v.target.x, y + 0.9, v.target.z], mats.ray));
      // Routes.
      for (const p of v.paths) {
        const list: number[] = [];
        for (let i = 1; i < p.points.length; i++) {
          const a = p.points[i - 1],
            b = p.points[i];
          list.push(a.x, floorY(a) + 0.08, a.z, b.x, floorY(b) + 0.08, b.z);
        }
        if (list.length) dynamic.add(segs(list, pathMat(p.color)));
      }
    },
    dispose() {
      for (const o of [...statics, ...dynamic.children]) (o as THREE.Mesh).geometry?.dispose();
      for (const m of [...Object.values(mats), ...pathMats.values()]) m.dispose();
    },
  };
}
