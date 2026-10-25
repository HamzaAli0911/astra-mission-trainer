import * as THREE from "three";
import { HOME, hallWalls, partitions, polar, rad, ROOMS, STAIR, stairPoint, WINDOWS, windowY, within, type Level } from "../../sim/home";
import { ball, box, keep, mesh, roundRect, strut } from "../kit";
import { Mesher } from "./mesher";
import { ifabric, imetal, ipaint, irubber, lampFace, LAMPS } from "./lighting";

/** Height of a doorway above its floor. */
export const DOOR_H = 2.05;
/** The inner airlock hatch: an opening in the padded wall at the airlock's bearing. */
export const HATCH = { bearing: 180, w: 0.92, h: 1.95 };

/** A sliding door (or the hatch): set how far open it is, 0 to 1. */
export interface Door {
  id: string;
  level: Level;
  /** Where its doorway is (habitat-local), for opening it as you come near. */
  x: number;
  z: number;
  set: (open: number) => void;
}

const asinDeg = (x: number) => (Math.asin(Math.min(1, x)) * 180) / Math.PI;
const norm = (b: number) => ((b % 360) + 360) % 360;

/** The walls, floors, ceilings, stair, doors and light fittings of both floors. */
export function buildStructure(g: THREE.Group) {
  const lining = ifabric("#d4cfc5"),
    panels = ipaint("#bcc3cc", 0.72),
    ceiling = ipaint("#d9dbde", 0.85),
    floor = irubber("#3f4551"),
    deckEdge = ipaint("#8b929c", 0.6),
    water = ipaint("#a9bfd3", 0.6),
    command = ipaint("#c4cad3", 0.65),
    trim = ipaint("#eef0f2", 0.5),
    rail = imetal("#b4bcc7", 0.32),
    dark = imetal("#5d6573", 0.45);
  const doors: Door[] = [];

  for (const level of [0, 1] as const) {
    const y0 = HOME.floor[level],
      y1 = HOME.ceiling[level];

    // The padded wall, with openings for the windows (and the airlock hatch downstairs).
    const opens = WINDOWS.filter((w) => w.level === level).map((w) => {
      const half = asinDeg((w.w + 0.28) / 2 / HOME.lining),
        cy = windowY(w);
      return { from: w.bearing - half, to: w.bearing + half, y0: cy - (w.h + 0.28) / 2, y1: cy + (w.h + 0.28) / 2 };
    });
    if (level === 0) {
      // (A little smaller than the hatch's frame, so the padding laps over its edges.)
      const half = asinDeg((HATCH.w + 0.24) / 2 / HOME.lining);
      opens.push({ from: HATCH.bearing - half, to: HATCH.bearing + half, y0: y0 - 0.1, y1: y0 + HATCH.h + 0.08 });
    }
    const cuts = new Set<number>();
    for (let b = 0; b <= 360; b += 3) cuts.add(b);
    for (const o of opens) cuts.add(norm(o.from)).add(norm(o.to));
    const cols = [...cuts].sort((a, b) => a - b);
    const wall = new Mesher();
    for (let i = 0; i < cols.length - 1; i++) {
      const mid = (cols[i] + cols[i + 1]) / 2;
      let spans: [number, number][] = [[y0, y1]];
      for (const o of opens)
        if (within(mid, o.from, o.to))
          spans = spans.flatMap(([a, b]): [number, number][] => (o.y1 <= a || o.y0 >= b ? [[a, b]] : [[a, Math.max(a, o.y0)], [Math.min(b, o.y1), b]].filter(([p, q]) => q - p > 1e-4) as [number, number][]));
      for (const [a, b] of spans) wall.arc(HOME.lining, cols[i], cols[i + 1], a, b, true, 1);
    }
    mesh(wall.geometry(), lining, g);

    // A framed reveal through the wall's thickness round each window, out to the glass in the shell.
    for (const w of WINDOWS.filter((x) => x.level === level)) {
      const frame = mesh(revealGeometry(w.w, w.h), trim, g);
      const p = polar(w.bearing, HOME.lining - 0.02);
      frame.position.set(p.x, windowY(w), p.z);
      frame.rotation.y = Math.PI - rad(w.bearing);
    }

    // Floor and ceiling (the upper deck has the stairwell cut out of it).
    const flr = level === 0 ? discGeometry(y0, true) : deckGeometry(y0, true);
    mesh(flr, floor, g).castShadow = false;
    mesh(level === 0 ? deckGeometry(y1, false) : discGeometry(y1, false), ceiling, g);

    // Partitions between rooms.
    for (const e of partitions(level)) {
      const a = HOME.hall,
        b = HOME.lining + 0.04;
      const m = box(g, HOME.wall, y1 - y0, b - a, panels);
      const c = polar(e, (a + b) / 2);
      m.position.set(c.x, (y0 + y1) / 2, c.z);
      m.rotation.y = -rad(e);
    }

    // The wall along the hall in front of each closed room, with its doorway.
    for (const m of hallWalls(level)) {
      const ms = new Mesher();
      const half = ((0.45 / HOME.hall) * 180) / Math.PI;
      // (Rooms that run past north have their door bearing counted on from the room's start.)
      const door = m.from + norm(m.door! - m.from);
      const d0 = door - half,
        d1 = door + half,
        top = y0 + DOOR_H;
      for (const [r, inward] of [
        [HOME.hall - HOME.wall / 2, true],
        [HOME.hall + HOME.wall / 2, false],
      ] as const) {
        ms.arc(r, m.from, d0, y0, y1, inward);
        ms.arc(r, d1, m.to, y0, y1, inward);
        ms.arc(r, d0, d1, top, y1, inward);
      }
      for (const [b, side] of [
        [d0, 1],
        [d1, -1],
      ] as const) {
        const p = polar(b, HOME.hall - HOME.wall / 2),
          q = polar(b, HOME.hall + HOME.wall / 2),
          t = polar(b + 90, side);
        ms.quad([p.x, y0, p.z], [q.x, y0, q.z], [q.x, top, q.z], [p.x, top, p.z], [t.x, 0, t.z]);
      }
      ms.annulus(HOME.hall - HOME.wall / 2, HOME.hall + HOME.wall / 2, top, false, d0, d1, 0.1);
      mesh(ms.geometry(), panels, g);
      doors.push(slidingDoor(g, m.id, level, m.door!, HOME.hall - HOME.wall / 2 - 0.035, trim, dark));
    }

    // The core: the storm shelter's water walls downstairs, the command room upstairs.
    const coreRoom = ROOMS.find((m) => m.core && m.level === level)!;
    const inner = level === 0 ? HOME.shelter : HOME.command;
    mesh(coreGeometry(inner, coreRoom.door!, y0, y1), level === 0 ? water : command, g);
    doors.push(slidingDoor(g, coreRoom.id, level, coreRoom.door!, HOME.core + 0.035, trim, dark));
  }

  // The airlock's inner hatch: a deep frame through the wall, and the hatch itself.
  const hatchFrame = mesh(hatchFrameGeometry(), trim, g);
  const hp = polar(HATCH.bearing, HOME.lining - 0.02);
  hatchFrame.position.set(hp.x, HOME.floor[0], hp.z);
  hatchFrame.rotation.y = Math.PI - rad(HATCH.bearing);
  doors.push(hatchDoor(g, panels, dark));

  // The deck's edge round the stairwell.
  const edge = new Mesher();
  const s = STAIR;
  const c = (u: number, w: number) => stairPoint(u, w);
  const ring: [number, number][] = [
    [-s.half, s.inner],
    [s.half, s.inner],
    [s.half, s.outer],
    [-s.half, s.outer],
  ];
  for (let i = 0; i < 4; i++) {
    const [ua, wa] = ring[i],
      [ub, wb] = ring[(i + 1) % 4];
    const a = c(ua, wa),
      b = c(ub, wb),
      mid = c((ua + ub) / 2, (wa + wb) / 2),
      ctr = c(0, (s.inner + s.outer) / 2);
    edge.quad([a.x, HOME.ceiling[0], a.z], [b.x, HOME.ceiling[0], b.z], [b.x, HOME.floor[1], b.z], [a.x, HOME.floor[1], a.z], [ctr.x - mid.x, 0, ctr.z - mid.z]);
  }
  mesh(edge.geometry(), deckEdge, g);
  buildStair(g, panels, rail, dark);

  // Light fittings on the ceilings.
  const lit = lampFace();
  const frameMat = trim;
  for (const l of LAMPS) {
    const fit = new THREE.Group();
    fit.position.set(l.x, l.y, l.z);
    fit.rotation.y = -Math.atan2(l.x, -l.z);
    g.add(fit);
    const [w, d] = l.strip ? [1.1, 0.16] : [0.6, 0.6];
    if (l.y < HOME.ceiling[0] - 0.3) {
      // The wall light by the stair: a small sconce facing the flight.
      box(fit, 0.34, 0.14, 0.08, frameMat, 0, 0, 0.02);
      box(fit, 0.28, 0.02, 0.06, lit, 0, -0.075, 0.0);
      continue;
    }
    box(fit, w + 0.06, 0.035, d + 0.06, frameMat, 0, 0.012, 0);
    box(fit, w, 0.012, d, lit, 0, -0.008, 0);
  }
  return { doors, lit };
}

/**
 * A sliding door on the hall side of a curved wall: two leaves that part to either side, following the curve
 * (a room's wall isn't long enough for one leaf to slide clear of a 0.9 m doorway).
 */
function slidingDoor(g: THREE.Group, id: string, level: Level, bearing: number, r: number, face: THREE.Material, handle: THREE.Material): Door {
  const y = HOME.floor[level];
  const leaves = [-1, 1].map((side) => {
    const pivot = keep(new THREE.Group());
    pivot.rotation.y = -rad(bearing);
    g.add(pivot);
    const leaf = new THREE.Group();
    leaf.position.set(side * 0.24, y, -r);
    pivot.add(leaf);
    box(leaf, 0.49, DOOR_H + 0.02, 0.045, face, 0, (DOOR_H + 0.02) / 2, 0);
    // A narrow window in each leaf, and a pull at the meeting edge.
    box(leaf, 0.1, 0.5, 0.05, handle, side * 0.08, 1.45, 0);
    box(leaf, 0.025, 0.4, 0.04, handle, -side * 0.205, 1.05, 0.035);
    return { pivot, side };
  });
  const slide = ((0.47 / r) * 180) / Math.PI;
  const p = polar(bearing, r);
  return { id, level, x: p.x, z: p.z, set: (open) => leaves.forEach((l) => (l.pivot.rotation.y = -rad(bearing + l.side * slide * open))) };
}

/** The airlock hatch's frame: a rounded doorway 0.92 m wide, its sill at the floor, as deep as the wall. */
function hatchFrameGeometry() {
  const W = HATCH.w + 0.34,
    H = HATCH.h + 0.14;
  const outer = new THREE.Shape();
  outer.moveTo(-W / 2, 0);
  outer.lineTo(W / 2, 0);
  outer.lineTo(W / 2, H);
  outer.lineTo(-W / 2, H);
  outer.lineTo(-W / 2, 0);
  const hole = roundRect(HATCH.w, HATCH.h, 0.3, new THREE.Path());
  // roundRect is centred: lift it so its sill sits 2 cm above the floor.
  outer.holes.push(new THREE.Path(hole.getPoints(12).map((p) => new THREE.Vector2(p.x, p.y + HATCH.h / 2 + 0.02))));
  return new THREE.ExtrudeGeometry(outer, { depth: 0.36, bevelEnabled: false, curveSegments: 10 });
}

/** The inner hatch: it slides aside along the wall to let you into the airlock (only for a walk outside). */
function hatchDoor(g: THREE.Group, face: THREE.Material, dark: THREE.Material): Door {
  const pivot = keep(new THREE.Group());
  pivot.rotation.y = -rad(HATCH.bearing);
  g.add(pivot);
  const r = HOME.lining - 0.07;
  const panel = new THREE.Group();
  panel.position.set(0, HOME.floor[0], -r);
  pivot.add(panel);
  box(panel, HATCH.w + 0.1, HATCH.h + 0.06, 0.07, face, 0, HATCH.h / 2 + 0.02, 0);
  // A porthole and a locking wheel.
  mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.08, 20).rotateX(Math.PI / 2), dark, panel, 0, 1.55, 0);
  mesh(new THREE.TorusGeometry(0.13, 0.018, 8, 24), dark, panel, 0, 1.05, 0.06);
  const slide = ((1.0 / r) * 180) / Math.PI;
  const p = polar(HATCH.bearing, r);
  return { id: "airlock", level: 0, x: p.x, z: p.z, set: (open) => (pivot.rotation.y = -rad(HATCH.bearing - slide * open)) };
}

/** A rail of straight tubes between points, welded at the bends. */
function tube(p: THREE.Object3D, pts: [number, number, number][], r: number, m: THREE.Material) {
  for (let i = 0; i < pts.length - 1; i++) strut(p, ...pts[i], ...pts[i + 1], r, m, 8);
  for (const q of pts.slice(1, -1)) ball(p, r, m, ...q, 8);
}

/** The window's reveal: a frame round the glass, as deep as the wall, its face flush with the padding. */
function revealGeometry(w: number, h: number) {
  const outer = new THREE.Shape();
  const W = w + 0.34,
    H = h + 0.34;
  outer.moveTo(-W / 2, -H / 2);
  outer.lineTo(W / 2, -H / 2);
  outer.lineTo(W / 2, H / 2);
  outer.lineTo(-W / 2, H / 2);
  outer.lineTo(-W / 2, -H / 2);
  outer.holes.push(roundRect(w + 0.04, h + 0.04, Math.min(w, h) * 0.3, new THREE.Path()));
  return new THREE.ExtrudeGeometry(outer, { depth: 0.34, bevelEnabled: false, curveSegments: 10 });
}

/** A flat disc covering a whole floor, facing up (a floor) or down (a ceiling). */
function discGeometry(y: number, up: boolean) {
  const m = new Mesher();
  m.annulus(0.001, HOME.lining + 0.02, y, up, 0, 360, 0.3);
  return m.geometry();
}
/** The deck between the floors: a disc with the stairwell cut out. */
function deckGeometry(y: number, up: boolean) {
  const shape = new THREE.Shape();
  const n = 128;
  for (let i = 0; i <= n; i++) {
    const p = polar((i / n) * 360, HOME.lining + 0.02);
    if (i === 0) shape.moveTo(p.x, p.z);
    else shape.lineTo(p.x, p.z);
  }
  const hole = new THREE.Path();
  const s = STAIR;
  const pts = [stairPoint(-s.half, s.inner), stairPoint(s.half, s.inner), stairPoint(s.half, s.outer), stairPoint(-s.half, s.outer)];
  hole.moveTo(pts[0].x, pts[0].z);
  for (const p of pts.slice(1)) hole.lineTo(p.x, p.z);
  hole.lineTo(pts[0].x, pts[0].z);
  shape.holes.push(hole);
  const flat = new THREE.ShapeGeometry(shape, 1);
  // The shape lies in x/y; stand it in x/z at height y. Swapping axes mirrors it, so it now faces down: flip for a floor.
  const src = flat.attributes.position;
  const pos = new Float32Array(src.count * 3),
    nor = new Float32Array(src.count * 3),
    uv = new Float32Array(src.count * 2);
  for (let i = 0; i < src.count; i++) {
    pos.set([src.getX(i), y, src.getY(i)], i * 3);
    nor.set([0, up ? 1 : -1, 0], i * 3);
    uv.set([src.getX(i), src.getY(i)], i * 2);
  }
  const index = [...flat.index!.array];
  if (up) for (let i = 0; i < index.length; i += 3) [index[i + 1], index[i + 2]] = [index[i + 2], index[i + 1]];
  flat.dispose();
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  out.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  out.setIndex(index);
  out.computeBoundingSphere();
  return out;
}

/** The core's wall, from its inner face out to the hall, with a doorway whose sides are straight and 0.9 m apart. */
function coreGeometry(inner: number, door: number, y0: number, y1: number) {
  const m = new Mesher();
  const top = y0 + DOOR_H;
  const hIn = asinDeg(0.45 / inner),
    hOut = asinDeg(0.45 / HOME.core);
  for (const [r, h, inward] of [
    [inner, hIn, true],
    [HOME.core, hOut, false],
  ] as const) {
    m.arc(r, door + h, door + 360 - h, y0, y1, inward);
    m.arc(r, door - h, door + h, top, y1, inward);
  }
  const n = polar(door, 1),
    t = { x: -n.z, z: n.x };
  const along = (r: number) => Math.sqrt(r * r - 0.45 * 0.45);
  for (const side of [-1, 1]) {
    const a = { x: n.x * along(inner) + t.x * 0.45 * side, z: n.z * along(inner) + t.z * 0.45 * side },
      b = { x: n.x * along(HOME.core) + t.x * 0.45 * side, z: n.z * along(HOME.core) + t.z * 0.45 * side };
    m.quad([a.x, y0, a.z], [b.x, y0, b.z], [b.x, top, b.z], [a.x, top, a.z], [-t.x * side, 0, -t.z * side]);
  }
  // The underside of the lintel.
  const ai = { x: n.x * along(inner), z: n.z * along(inner) },
    ao = { x: n.x * along(HOME.core), z: n.z * along(HOME.core) };
  m.quad(
    [ai.x - t.x * 0.45, top, ai.z - t.z * 0.45],
    [ai.x + t.x * 0.45, top, ai.z + t.z * 0.45],
    [ao.x + t.x * 0.45, top, ao.z + t.z * 0.45],
    [ao.x - t.x * 0.45, top, ao.z - t.z * 0.45],
    [0, -1, 0],
  );
  return m.geometry();
}

/**
 * The straight flight between the floors: 14 treads and 15 risers of 0.19 m, closed underneath on the ground
 * floor (a cupboard under the stairs), a wall on its outer side and a handrail on the hall side.
 */
function buildStair(g: THREE.Group, panels: THREE.Material, rail: THREE.Material, dark: THREE.Material) {
  const s = STAIR;
  const rise = (HOME.floor[1] - HOME.floor[0]) / s.risers,
    run = (2 * s.half) / (s.risers - 1);
  const frame = new THREE.Group();
  const mid = stairPoint(0, (s.inner + s.outer) / 2);
  frame.position.set(mid.x, 0, mid.z);
  // Local x runs up the flight, local z points in towards the habitat's centre (the hall side).
  frame.rotation.y = -rad(s.bearing);
  g.add(frame);
  const width = s.outer - s.inner;
  const tread = irubber("#3d434e"),
    nose = imetal("#c9a227", 0.4);
  for (let i = 1; i < s.risers; i++) {
    const u0 = -s.half + (i - 1) * run,
      top = HOME.floor[0] + i * rise;
    box(frame, run + 0.02, 0.05, width - 0.06, tread, u0 + run / 2, top - 0.025, 0);
    box(frame, 0.03, 0.012, width - 0.08, nose, u0 + 0.02, top + 0.002, 0);
    box(frame, 0.02, rise, width - 0.06, panels, u0, top - rise / 2, 0);
  }
  box(frame, 0.02, rise, width - 0.06, panels, s.half, HOME.floor[1] - rise / 2, 0);
  // The sides: closed underneath on the hall side, a full wall on the outer side (storage behind it).
  const side = new Mesher();
  const slope = (u: number) => HOME.floor[0] + ((u + s.half) / (2 * s.half)) * (HOME.floor[1] - HOME.floor[0]);
  const hallSide = width / 2 + 0.01;
  for (let k = 0; k < 16; k++) {
    const ua = -s.half + (k / 16) * 2 * s.half,
      ub = -s.half + ((k + 1) / 16) * 2 * s.half;
    side.quad([ua, HOME.floor[0], hallSide], [ub, HOME.floor[0], hallSide], [ub, slope(ub) - 0.05, hallSide], [ua, slope(ua) - 0.05, hallSide], [0, 0, 1]);
  }
  side.quad([-s.half, HOME.floor[0], -hallSide], [s.half, HOME.floor[0], -hallSide], [s.half, HOME.ceiling[0], -hallSide], [-s.half, HOME.ceiling[0], -hallSide], [0, 0, 1]);
  side.quad([s.half, HOME.floor[0], -hallSide], [s.half, HOME.floor[0], hallSide], [s.half, HOME.ceiling[0], hallSide], [s.half, HOME.ceiling[0], -hallSide], [1, 0, 0]);
  mesh(side.geometry(), panels, frame);
  // A stringer and a handrail along the hall side; a rail on the outer wall.
  const len = Math.hypot(2 * s.half, HOME.floor[1] - HOME.floor[0]);
  const ang = Math.atan2(HOME.floor[1] - HOME.floor[0], 2 * s.half);
  const stringer = box(frame, len, 0.26, 0.05, dark, 0, (HOME.floor[0] + HOME.floor[1]) / 2 - 0.08, hallSide + 0.01);
  stringer.rotation.z = ang;
  for (const z of [hallSide + 0.02, -hallSide + 0.06]) {
    const h = 0.92;
    tube(
      frame,
      [
        [-s.half - 0.25, HOME.floor[0] + h, z],
        [-s.half, HOME.floor[0] + h, z],
        [s.half, HOME.floor[1] + h, z],
        [s.half + 0.25, HOME.floor[1] + h, z],
      ],
      0.022,
      rail,
    );
  }
  for (let k = 0; k <= 6; k++) {
    const u = -s.half + 0.12 + (k / 6) * (2 * s.half - 0.24);
    strut(frame, u, slope(u) + 0.02, hallSide + 0.02, u, slope(u) + 0.9, hallSide + 0.02, 0.016, rail, 6);
  }
  // Upstairs: rails round the stairwell, open at the top of the flight.
  const upper = HOME.floor[1];
  const railAt = (pts: [number, number][]) => {
    tube(
      frame,
      pts.map(([u, z]): [number, number, number] => [u, upper + 1.0, z]),
      0.024,
      rail,
    );
    tube(
      frame,
      pts.map(([u, z]): [number, number, number] => [u, upper + 0.5, z]),
      0.014,
      rail,
    );
    for (const [u, z] of pts) strut(frame, u, upper, z, u, upper + 1.0, z, 0.022, rail, 6);
    for (let i = 0; i < pts.length - 1; i++) {
      const [ua, za] = pts[i],
        [ub, zb] = pts[i + 1];
      const n = Math.ceil(Math.hypot(ub - ua, zb - za) / 1.0);
      for (let k = 1; k < n; k++) strut(frame, ua + ((ub - ua) * k) / n, upper, za + ((zb - za) * k) / n, ua + ((ub - ua) * k) / n, upper + 1.0, za + ((zb - za) * k) / n, 0.016, rail, 6);
      const kick = box(frame, Math.hypot(ub - ua, zb - za), 0.1, 0.02, dark, (ua + ub) / 2, upper + 0.05, (za + zb) / 2);
      kick.rotation.y = -Math.atan2(zb - za, ub - ua);
    }
  };
  railAt([
    [s.half, -width / 2 - 0.03],
    [-s.half - 0.03, -width / 2 - 0.03],
    [-s.half - 0.03, width / 2 + 0.03],
    [s.half, width / 2 + 0.03],
  ]);
}
