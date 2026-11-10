import * as THREE from "three";
import {
  BERMS,
  bermDepth,
  BUILDINGS,
  built,
  CAMPUS_WINDOWS,
  cellById,
  cellEdges,
  CELLS,
  COMPOUND_PARTS,
  FLOOR,
  HQ_STAIR,
  LOCK_PANELS,
  MEZZANINE,
  openingFaces,
  PORCHES,
  PORTALS,
  WALL,
  windowsOn,
  type Berm,
  type Building,
  type BuildingId,
  type Cell,
  type Edge,
  type Portal,
  type Stage,
  type Win,
} from "../../sim/base";
import type { Planet } from "../../sim/types";
import { box, cyl, glass, light, metal, paint, soil, strut } from "../kit";
import { label } from "../models/common";
import type { DoorView } from "../walk";
import { CAMPUS_LAMPS, CELL_INDEX, cellCeiling, cellFloor, FINISH } from "./lighting";
import { CampusMesher } from "./mesher";

/**
 * The campus's buildings in 3D, from the plan in sim/base.ts: what you see is exactly where you can walk. Inside:
 * floors, ceilings, the wall skins of every room with reveals and lintels round each opening, sliding doors, ceiling
 * lamps, the HQ's mezzanine and stair. Outside: each building's shell on its plinth with a regolith-covered roof,
 * foundations and scaffolding for what isn't built yet, and the outdoor compounds' fences and equipment.
 */

/** Height of an ordinary doorway, and of an airlock's hatch. */
const DOOR_H = 2.15,
  LOCK_H = 2.05;
/** Colours of each building's rooms (walls, floor, ceiling, trim and doors). */
interface Tone {
  wall: string;
  floor: string;
  ceiling: string;
  trim: string;
  door: string;
}
const NEUTRAL: Tone = { wall: "#d9dcdf", floor: "#5c636d", ceiling: "#e4e6e8", trim: "#8e98a6", door: "#c3cad3" };
const TONES: Partial<Record<BuildingId, Partial<Tone>>> = {
  link: { wall: "#cfd5db", floor: "#4f5660", door: "#b9c3ce" },
  w1: { wall: "#cfd5db", floor: "#4f5660" },
  e1: { wall: "#cfd5db", floor: "#4f5660" },
  hq: { wall: "#d6d9dc", floor: "#3f454e", trim: "#56627a", door: "#a9b4c3" },
  lifesupport: { wall: "#cbd5dd", floor: "#56606a", trim: "#4f86a8" },
  clinic: { wall: "#e6eaec", floor: "#9aa4ad", trim: "#5aa3a0" },
  shelter: { wall: "#a7b8c8", floor: "#4b5563", trim: "#d69a2b" },
  greenhouse: { wall: "#dfe4da", floor: "#5d6658", trim: "#6ea35b" },
  logistics: { wall: "#d5d2c9", floor: "#5a5a58", trim: "#c08a2e" },
  yard: { wall: "#d2d6da", floor: "#4b525c", trim: "#d0a03a" },
  science: { wall: "#dde0e2", floor: "#6a717a", trim: "#7d6fb3" },
  garage: { wall: "#9da3aa", floor: "#6f6c66", ceiling: "#a7acb2", trim: "#d3a12f", door: "#c9a541" },
  eva: { wall: "#d4d8dc", floor: "#4a5059", trim: "#d0a03a", door: "#c9cfd6" },
  engineering: { wall: "#cfd3d6", floor: "#53575c", trim: "#c4702e" },
};
export const toneOf = (b: BuildingId): Tone => ({ ...NEUTRAL, ...TONES[b] });

/** How tall an opening is: doors and hatches, archways as tall as the lower room, the garage's vehicle door. */
export function openingHeight(p: Portal) {
  if (p.kind === "vehicle") return 6;
  if (p.kind === "lock-inner" || p.kind === "lock-outer") return LOCK_H;
  if (p.kind === "door") return p.width > 2.5 ? 2.6 : DOOR_H;
  const hs = [p.a, p.b].map((id) => cellById(id)).filter((c): c is Cell => !!c).map((c) => c.height);
  return Math.min(...hs, 3);
}

type V3 = [number, number, number];
/** A rectangle (along an edge, and up) with holes cut out, as the rectangles left over. */
function cutOut(rect: [number, number, number, number], holes: [number, number, number, number][]) {
  let parts = [rect];
  for (const [h0, v0, h1, v1] of holes)
    parts = parts.flatMap(([a0, b0, a1, b1]) => {
      if (h0 >= a1 || h1 <= a0 || v0 >= b1 || v1 <= b0) return [[a0, b0, a1, b1] as [number, number, number, number]];
      const out: [number, number, number, number][] = [
        [a0, b0, h0, b1],
        [h1, b0, a1, b1],
        [Math.max(a0, h0), b0, Math.min(a1, h1), v0],
        [Math.max(a0, h0), v1, Math.min(a1, h1), b1],
      ];
      return out.filter(([p0, q0, p1, q1]) => p1 - p0 > 1e-6 && q1 - q0 > 1e-6);
    });
  return parts;
}
/** The windows in a room's edge, as holes (along the edge, and up). */
const windowHoles = (cell: string, side: Edge["side"]) => windowsOn(cell, side).map((w): [number, number, number, number] => [w.at - w.width / 2, w.y0, w.at + w.width / 2, w.y1]);

/** A vertical quad along an edge, on a room's side of it (facing into the room), from a to b and y0 to y1. */
function edgeQuad(m: CampusMesher, mat: THREE.Material, e: Edge, a: number, b: number, y0: number, y1: number, color: string, cell: number, offset = 0, holes: [number, number, number, number][] = []) {
  if (holes.length) {
    for (const [p0, q0, p1, q1] of cutOut([a, y0, b, y1], holes)) edgeQuad(m, mat, e, p0, p1, q0, q1, color, cell, offset);
    return;
  }
  if (b - a < 1e-6 || y1 - y0 < 1e-6) return;
  const f = e.fixed + offset;
  if (e.side === "n" || e.side === "s") {
    const n: V3 = [0, 0, e.side === "n" ? 1 : -1];
    m.quad(mat, [a, y0, f], [b, y0, f], [b, y1, f], [a, y1, f], n, color, cell);
  } else {
    const n: V3 = [e.side === "w" ? 1 : -1, 0, 0];
    m.quad(mat, [f, y0, a], [f, y0, b], [f, y1, b], [f, y1, a], n, color, cell);
  }
}

export interface CampusModel {
  group: THREE.Group;
  /** Each building's inside (lit by its own lamps) and outside, for showing only what's near. */
  parts: Map<BuildingId, { inside: THREE.Group; outside: THREE.Group }>;
  doors: DoorView[];
  /** The lamps' lit faces (dimmed with the lights). */
  lit: THREE.MeshStandardMaterial;
}

export function buildCampus(planet: Planet, stage: Stage): CampusModel {
  const group = new THREE.Group();
  group.name = "campus";
  const parts = new Map<BuildingId, { inside: THREE.Group; outside: THREE.Group }>();
  const doors: DoorView[] = [];
  const lit = new THREE.MeshStandardMaterial({ color: "#fff6e8", emissive: "#fff3e0", emissiveIntensity: 2.2, roughness: 0.4, toneMapped: false });
  const wallMat = FINISH.paint("wall"),
    linerMat = FINISH.paint("liner"),
    floorMat = FINISH.rubber("floor"),
    ceilingMat = FINISH.paint("ceiling"),
    trimMat = FINISH.metal(0.42),
    doorMat = FINISH.paint(undefined, 0.48);
  const shell = paint(planet === "mars" ? "#d8d2c8" : "#d9dad8", 0.82, 0.05),
    plinth = paint("#6d7178", 0.9, 0.1),
    roof = soil(planet === "mars" ? "#8f5a42" : "#807f7d"),
    steel = metal("#8d949e", 0.5),
    slab = paint("#8a8d90", 0.95, 0);
  const hall = cellById("hq-hall")!,
    mezz = cellById("hq-mezzanine")!;
  const under = MEZZANINE - 0.3;

  for (const b of BUILDINGS) {
    if (b.id === "hab") continue;
    const inside = new THREE.Group(),
      outside = new THREE.Group();
    inside.name = `${b.id}-inside`;
    outside.name = `${b.id}-outside`;
    group.add(inside, outside);
    parts.set(b.id, { inside, outside });
    if (b.kind === "compound") {
      compound(outside, b, steel, shell, slab);
      continue;
    }
    if (!built(b, stage)) {
      scaffold(outside, b, steel, slab);
      continue;
    }
    const tone = toneOf(b.id);
    const m = new CampusMesher();
    for (const c of CELLS) {
      if (c.building !== b.id) continue;
      const k = CELL_INDEX.get(c.id)!;
      const r = c.rect,
        y0 = cellFloor(c),
        y1 = cellCeiling(c);
      if (c === mezz) {
        // The mezzanine's floor is the top of its slab; its walls are the hall's (above the slab), its ceiling the hall's.
        m.box(FINISH.paint(), r.x0, under, r.z0, r.x1, MEZZANINE, r.z1, tone.floor, CELL_INDEX.get(hall.id)!, "+y-x+x+z");
        m.quad(floorMat, [r.x0, MEZZANINE, r.z0], [r.x1, MEZZANINE, r.z0], [r.x1, MEZZANINE, r.z1], [r.x0, MEZZANINE, r.z1], [0, 1, 0], tone.floor, k);
        rail(m, r, k);
        continue;
      }
      // Floor and ceiling (the hall's ceiling above the mezzanine belongs to the mezzanine).
      m.quad(floorMat, [r.x0, y0, r.z0], [r.x1, y0, r.z0], [r.x1, y0, r.z1], [r.x0, y0, r.z1], [0, 1, 0], tone.floor, k);
      const ceil = (z0: number, z1: number, cell: number) => m.quad(ceilingMat, [r.x0, y1, z0], [r.x1, y1, z0], [r.x1, y1, z1], [r.x0, y1, z1], [0, -1, 0], tone.ceiling, cell);
      if (c === hall) {
        ceil(r.z0, mezz.rect.z0, k);
        ceil(mezz.rect.z0, r.z1, CELL_INDEX.get(mezz.id)!);
      } else ceil(r.z0, r.z1, k);
      // Walls: corridors have a ribbed liner, rooms painted panels; round each opening a lintel above it.
      const mat = c.kind === "corridor" ? linerMat : wallMat;
      for (const e of cellEdges(c)) {
        const holes = windowHoles(c.id, e.side);
        const wall = (a: number, bb: number, from: number, to: number) => {
          if (c !== hall) return edgeQuad(m, mat, e, a, bb, from, to, tone.wall, k, 0, holes);
          // In the hall, the walls above the mezzanine are the mezzanine's.
          const mz = CELL_INDEX.get(mezz.id)!;
          const inMezz = (lo: number, hi: number) => {
            edgeQuad(m, mat, e, lo, hi, from, Math.min(to, under), tone.wall, k, 0, holes);
            edgeQuad(m, mat, e, lo, hi, Math.max(from, MEZZANINE), to, tone.wall, mz, 0, holes);
          };
          if (e.side === "s") return inMezz(a, bb);
          if (e.side === "n") return edgeQuad(m, mat, e, a, bb, from, to, tone.wall, k, 0, holes);
          const split = mezz.rect.z0;
          if (bb <= split) return edgeQuad(m, mat, e, a, bb, from, to, tone.wall, k, 0, holes);
          if (a >= split) return inMezz(a, bb);
          edgeQuad(m, mat, e, a, split, from, to, tone.wall, k, 0, holes);
          inMezz(split, bb);
        };
        // Each window: its reveal through the wall, a frame and mullions inside, and the glass.
        for (const w of windowsOn(c.id, e.side)) windowIn(m, w, e, w.y0 > MEZZANINE && c === hall ? CELL_INDEX.get(mezz.id)! : k, mat, tone, trimMat);
        for (const [a, bb] of e.runs) wall(a, bb, y0, y1);
        for (const g of e.gaps) {
          const h = openingHeight(g.portal);
          if (h < y1 - y0) wall(g.at - g.half, g.at + g.half, y0 + h, y1);
          // A metal frame round the opening, on this side.
          if (g.portal.kind !== "vehicle" && g.portal.kind !== "open") frame(m, trimMat, e, g.at, g.half, y0, y0 + h, tone.trim, k);
        }
      }
      // The reveals and thresholds of this room's openings (each opening is built once, from its first room).
      for (const p of PORTALS) {
        if (p.a !== c.id || p.level !== c.level) continue;
        reveal(m, p, y0, mat, floorMat, tone, k);
        if (p.kind === "door" || p.kind === "lock-inner" || p.kind === "lock-outer") doors.push(slidingDoor(inside, p, y0, doorMat, tone, k));
      }
      if (c.kind === "hangar") {
        const v = PORTALS.find((p) => p.id === "garage-vehicle")!;
        doors.push(vehicleDoor(inside, v, tone, k));
      }
    }
    if (b.id === "hq") stair(m, CELL_INDEX.get(hall.id)!, toneOf("hq"));
    // Lamps on the ceilings.
    const lampsAt = new CampusMesher();
    for (const l of CAMPUS_LAMPS) {
      const c = CELLS[l.cell];
      if (c.building !== b.id) continue;
      const w = c.kind === "corridor" ? (c.rect.x1 - c.rect.x0 > c.rect.z1 - c.rect.z0 ? [1.2, 0.16] : [0.16, 1.2]) : c.kind === "hall" || c.kind === "hangar" ? [0.7, 0.7] : [0.62, 0.62];
      lampsAt.box(lit, l.x - w[0] / 2, l.y - 0.02, l.z - w[1] / 2, l.x + w[0] / 2, l.y + 0.03, l.z + w[1] / 2, "#ffffff", l.cell, "+y");
    }
    for (const o of [...m.meshes(), ...lampsAt.meshes(false)]) inside.add(o);
    exterior(outside, b, shell, plinth, roof);
  }
  return { group, parts, doors, lit };

  /** The glass rail along the mezzanine's open edge, with a gap at the top of the stair. */
  function rail(m: CampusMesher, r: { x0: number; x1: number; z0: number }, k: number) {
    const spans: [number, number][] = [
      [r.x0, HQ_STAIR.x0],
      [HQ_STAIR.x1, r.x1],
    ];
    const glassMat = glass("#cfe8ff", 0.16);
    for (const [a, b] of spans) {
      m.box(glassMat, a, MEZZANINE, r.z0 - 0.012, b, MEZZANINE + 1.0, r.z0 + 0.012, "#ffffff", k);
      m.box(trimMat, a, MEZZANINE + 1.0, r.z0 - 0.03, b, MEZZANINE + 1.06, r.z0 + 0.03, "#9aa3b0", k);
      for (let x = a; x <= b + 1e-6; x += Math.max(0.5, (b - a) / Math.max(1, Math.round((b - a) / 1.5)))) m.box(trimMat, x - 0.025, MEZZANINE, r.z0 - 0.025, x + 0.025, MEZZANINE + 1.0, r.z0 + 0.025, "#7f8996", k);
    }
  }

  /** The HQ's open stair: 24 treads, two steel stringers and handrails. */
  function stair(m: CampusMesher, k: number, tone: Tone) {
    const s = HQ_STAIR,
      n = 24,
      run = (s.z1 - s.z0) / n,
      rise = (MEZZANINE - FLOOR) / n;
    for (let i = 0; i < n; i++) {
      const y = FLOOR + rise * (i + 1);
      m.box(FINISH.paint(undefined, 0.7), s.x0 + 0.06, y - 0.05, s.z0 + run * i, s.x1 - 0.06, y, s.z0 + run * (i + 1) + 0.02, tone.floor, k);
    }
    for (const x of [s.x0, s.x1 - 0.06]) {
      // A stringer: a sloped steel beam, drawn as steps of box so it follows the treads.
      for (let i = 0; i < n; i++) {
        const y = FLOOR + rise * (i + 1);
        m.box(trimMat, x, y - 0.32, s.z0 + run * i, x + 0.06, y + 0.02, s.z0 + run * (i + 1), "#6f7885", k);
      }
      for (let i = 0; i < n; i += 2) {
        const y = FLOOR + rise * (i + 1);
        m.box(trimMat, x + 0.02, y, s.z0 + run * i, x + 0.04, y + 0.95, s.z0 + run * i + 0.03, "#8f99a6", k);
      }
      for (let i = 0; i < n; i++) {
        const y = FLOOR + rise * (i + 1) + 0.92;
        m.box(trimMat, x - 0.01, y, s.z0 + run * i, x + 0.07, y + 0.05, s.z0 + run * (i + 1) + 0.005, "#a7b0bc", k);
      }
    }
  }
}

/** The metal frame round a doorway on one side of its wall. */
function frame(m: CampusMesher, mat: THREE.Material, e: Edge, at: number, half: number, y0: number, top: number, color: string, k: number) {
  const t = 0.07,
    proud = 0.018;
  const off = e.side === "n" || e.side === "w" ? proud : -proud;
  const f = e.fixed;
  const piece = (a: number, b: number, lo: number, hi: number) => {
    if (e.side === "n" || e.side === "s") m.box(mat, a, lo, Math.min(f, f + off), b, hi, Math.max(f, f + off), color, k);
    else m.box(mat, Math.min(f, f + off), lo, a, Math.max(f, f + off), hi, b, color, k);
  };
  piece(at - half - t, at - half, y0, top + t);
  piece(at + half, at + half + t, y0, top + t);
  piece(at - half, at + half, top, top + t);
}

/** An opening's reveal: its two jambs and soffit through the wall's thickness, and a threshold plate on the floor. */
function reveal(m: CampusMesher, p: Portal, y0: number, wallMat: THREE.Material, floorMat: THREE.Material, tone: Tone, k: number) {
  const faced = openingFaces(p);
  if (!faced || p.a === "hab" || p.b === "hab" || p.a === "hq-stair") return;
  const [u0, u1] = faced[0] < faced[1] ? faced : [faced[1], faced[0]];
  if (u1 - u0 < 1e-3) return;
  const h = openingHeight(p),
    half = p.width / 2;
  if (p.along === "x") {
    m.quad(wallMat, [p.x - half, y0, u0], [p.x - half, y0, u1], [p.x - half, y0 + h, u1], [p.x - half, y0 + h, u0], [1, 0, 0], tone.wall, k);
    m.quad(wallMat, [p.x + half, y0, u0], [p.x + half, y0, u1], [p.x + half, y0 + h, u1], [p.x + half, y0 + h, u0], [-1, 0, 0], tone.wall, k);
    m.quad(wallMat, [p.x - half, y0 + h, u0], [p.x + half, y0 + h, u0], [p.x + half, y0 + h, u1], [p.x - half, y0 + h, u1], [0, -1, 0], tone.ceiling, k);
    m.quad(floorMat, [p.x - half, y0, u0], [p.x + half, y0, u0], [p.x + half, y0, u1], [p.x - half, y0, u1], [0, 1, 0], tone.trim, k);
  } else {
    m.quad(wallMat, [u0, y0, p.z - half], [u1, y0, p.z - half], [u1, y0 + h, p.z - half], [u0, y0 + h, p.z - half], [0, 0, 1], tone.wall, k);
    m.quad(wallMat, [u0, y0, p.z + half], [u1, y0, p.z + half], [u1, y0 + h, p.z + half], [u0, y0 + h, p.z + half], [0, 0, -1], tone.wall, k);
    m.quad(wallMat, [u0, y0 + h, p.z - half], [u1, y0 + h, p.z - half], [u1, y0 + h, p.z + half], [u0, y0 + h, p.z + half], [0, -1, 0], tone.ceiling, k);
    m.quad(floorMat, [u0, y0, p.z - half], [u1, y0, p.z - half], [u1, y0, p.z + half], [u0, y0, p.z + half], [0, 1, 0], tone.trim, k);
  }
}

/** Which way is out from a room's edge (+1: towards larger x or z). */
const outward = (side: Edge["side"]) => (side === "s" || side === "e" ? 1 : -1);
/** A point on an edge: `u` along it, `v` out from it (positive: outside), at height y. */
function onEdge(e: Edge, u: number, v: number, y: number): V3 {
  const f = e.fixed + outward(e.side) * v;
  return e.side === "n" || e.side === "s" ? [u, y, f] : [f, y, u];
}
/**
 * A window: its reveal through the whole outer wall (sill, head and jambs), a metal frame with mullions on the room
 * side, and the glass in the middle of the wall (seen from both sides). The view out is the real outside.
 */
function windowIn(m: CampusMesher, w: Win, e: Edge, k: number, wallMat: THREE.Material, tone: Tone, trimMat: THREE.Material) {
  const t = WALL.outer - 0.02;
  const a = w.at - w.width / 2,
    b = w.at + w.width / 2;
  const nOut = outward(e.side);
  const along: V3 = e.side === "n" || e.side === "s" ? [1, 0, 0] : [0, 0, 1];
  const across: V3 = e.side === "n" || e.side === "s" ? [0, 0, nOut] : [nOut, 0, 0];
  const quad = (p: V3, q: V3, r: V3, s2: V3, n: V3, color: string) => m.quad(wallMat, p, q, r, s2, n, color, k);
  // Sill (facing up), head (down), jambs (facing the window's middle).
  quad(onEdge(e, a, 0, w.y0), onEdge(e, b, 0, w.y0), onEdge(e, b, t, w.y0), onEdge(e, a, t, w.y0), [0, 1, 0], tone.trim);
  quad(onEdge(e, a, 0, w.y1), onEdge(e, b, 0, w.y1), onEdge(e, b, t, w.y1), onEdge(e, a, t, w.y1), [0, -1, 0], tone.wall);
  quad(onEdge(e, a, 0, w.y0), onEdge(e, a, t, w.y0), onEdge(e, a, t, w.y1), onEdge(e, a, 0, w.y1), along, tone.wall);
  quad(onEdge(e, b, 0, w.y0), onEdge(e, b, t, w.y0), onEdge(e, b, t, w.y1), onEdge(e, b, 0, w.y1), [-along[0], 0, -along[2]], tone.wall);
  // The frame on the room side, mullions at most 1.7 m apart, and a transom.
  const bar = (u0: number, u1: number, y0: number, y1: number, depth = 0.05) => {
    const p = onEdge(e, u0, -0.012, y0),
      q = onEdge(e, u1, depth, y1);
    m.box(trimMat, Math.min(p[0], q[0]), y0, Math.min(p[2], q[2]), Math.max(p[0], q[0]), y1, Math.max(p[2], q[2]), tone.trim, k);
  };
  const fw = 0.06;
  bar(a, a + fw, w.y0, w.y1);
  bar(b - fw, b, w.y0, w.y1);
  bar(a, b, w.y0, w.y0 + fw);
  bar(a, b, w.y1 - fw, w.y1);
  const panes = Math.max(1, Math.ceil(w.width / 1.7));
  for (let i = 1; i < panes; i++) {
    const u = a + (w.width * i) / panes;
    bar(u - fw / 2, u + fw / 2, w.y0, w.y1, 0.12);
  }
  // Glass, a little in from the wall's middle (both faces, so it shows from inside and out).
  const gm = glass("#bfd6ea", 0.14);
  for (const s2 of [1, -1]) {
    const v = t / 2;
    m.quad(gm, onEdge(e, a, v, w.y0), onEdge(e, b, v, w.y0), onEdge(e, b, v, w.y1), onEdge(e, a, v, w.y1), [across[0] * s2, 0, across[2] * s2], "#ffffff", k);
  }
}

/** A pair of leaves that part sideways into the wall's thickness. */
function slidingDoor(parent: THREE.Group, p: Portal, y0: number, mat: THREE.Material, tone: Tone, k: number): DoorView {
  const h = openingHeight(p) - 0.01,
    half = p.width / 2,
    t = 0.05;
  const lock = p.kind !== "door";
  const leaves: { o: THREE.Object3D; dir: number }[] = [];
  for (const dir of [-1, 1]) {
    const m = new CampusMesher();
    // Each leaf: a panel with a darker edge and (on airlock hatches) a small window; drawn round its own centre.
    const w = half + 0.02;
    if (p.along === "x") {
      m.box(mat, -w / 2, 0, -t / 2, w / 2, h, t / 2, lock ? tone.trim : tone.door, k);
      m.box(mat, (dir > 0 ? -w / 2 : w / 2 - 0.03) - 0.001, 0.02, -t / 2 - 0.004, (dir > 0 ? -w / 2 + 0.03 : w / 2) + 0.001, h - 0.02, t / 2 + 0.004, "#3a414b", k);
    } else {
      m.box(mat, -t / 2, 0, -w / 2, t / 2, h, w / 2, lock ? tone.trim : tone.door, k);
      m.box(mat, -t / 2 - 0.004, 0.02, (dir > 0 ? -w / 2 : w / 2 - 0.03) - 0.001, t / 2 + 0.004, h - 0.02, (dir > 0 ? -w / 2 + 0.03 : w / 2) + 0.001, "#3a414b", k);
    }
    const leaf = new THREE.Group();
    for (const o of m.meshes()) leaf.add(o);
    leaf.position.set(p.along === "x" ? p.x + (dir * w) / 2 : p.x, y0, p.along === "x" ? p.z : p.z + (dir * w) / 2);
    leaf.userData.closed = leaf.position.clone();
    parent.add(leaf);
    leaves.push({ o: leaf, dir });
  }
  return {
    id: p.id,
    level: p.level,
    x: p.x,
    z: p.z,
    set: (open) => {
      for (const { o, dir } of leaves) {
        const c = o.userData.closed as THREE.Vector3;
        o.position.copy(c);
        if (p.along === "x") o.position.x += dir * open * (half + 0.01);
        else o.position.z += dir * open * (half + 0.01);
      }
    },
  };
}

/** The garage's big door: panels that roll up into the lintel (it opens as a rover comes near). */
function vehicleDoor(parent: THREE.Group, p: Portal, tone: Tone, k: number): DoorView {
  const m = new CampusMesher();
  const half = p.width / 2,
    h = openingHeight(p);
  const mat = FINISH.paint(undefined, 0.55);
  for (let i = 0; i < 12; i++) m.box(mat, p.x - half, (i * h) / 12 + 0.01, p.z - 0.04, p.x + half, ((i + 1) * h) / 12 - 0.01, p.z + 0.04, i % 2 ? tone.door : "#b8953a", k);
  const door = new THREE.Group();
  for (const o of m.meshes()) door.add(o);
  parent.add(door);
  return { id: p.id, level: p.level, x: p.x, z: p.z, set: (open) => (door.position.y = open * (h - 0.4)) };
}

/** A building's outside: plinth, walls (with its doorways to the surface), and a roof under a layer of regolith. */
function exterior(g: THREE.Group, b: Building, shell: THREE.Material, plinth: THREE.Material, roof: THREE.Material) {
  const m = new CampusMesher();
  const r = b.rect,
    t = WALL.outer,
    gap = 0.08;
  const hangar = b.kind === "hangar";
  const base = hangar ? 0 : FLOOR - 0.05;
  if (!hangar) m.box(plinth, r.x0 - t, 0, r.z0 - t, r.x1 + t, base, r.z1 + t, "#ffffff");
  // Openings in the outer walls: doors to the surface, and the corridors' joins (which run between buildings).
  const holes = PORTALS.filter((p) => {
    const ids = [p.a, p.b];
    if (p.level !== 0) return false;
    const mine = ids.map((id) => cellById(id)).filter((c) => c?.building === b.id);
    const other = ids.map((id) => (id === "outside" ? "outside" : cellById(id)?.building ?? id)).find((x) => x !== b.id);
    return mine.length > 0 && other !== undefined;
  });
  const side = (s: "n" | "s" | "w" | "e") => {
    // (Stopping just short of the wall's full thickness, so it never shares a face with the next building's room.)
    const fixed = s === "n" ? r.z0 - gap : s === "s" ? r.z1 + gap : s === "w" ? r.x0 - gap : r.x1 + gap;
    const outer = s === "n" ? r.z0 - t + 0.02 : s === "s" ? r.z1 + t - 0.02 : s === "w" ? r.x0 - t + 0.02 : r.x1 + t - 0.02;
    const from = s === "n" || s === "s" ? r.x0 - t : r.z0 - t,
      to = s === "n" || s === "s" ? r.x1 + t : r.z1 + t;
    const edge = s === "n" ? r.z0 : s === "s" ? r.z1 : s === "w" ? r.x0 : r.x1;
    const cut: [number, number, number, number][] = holes
      .filter((p) => (s === "n" || s === "s" ? p.along === "x" && Math.abs(p.z - edge) < 0.45 : p.along === "z" && Math.abs(p.x - edge) < 0.45))
      .map((p) => {
        const at = p.along === "x" ? p.x : p.z;
        return [at - p.width / 2, base - 1, at + p.width / 2, base + (hangar ? 0 : 0.05) + openingHeight(p)];
      });
    // Windows of this building's rooms that sit in this outer wall.
    for (const w of CAMPUS_WINDOWS) {
      const c = cellById(w.cell)!;
      if (c.building !== b.id || w.side !== s) continue;
      const cf = s === "n" ? c.rect.z0 : s === "s" ? c.rect.z1 : s === "w" ? c.rect.x0 : c.rect.x1;
      if (Math.abs(cf - edge) > 0.01) continue;
      cut.push([w.at - w.width / 2, w.y0, w.at + w.width / 2, w.y1]);
      outsideWindow(m, w, s, edge, shell);
    }
    const lo = Math.min(fixed, outer),
      hi = Math.max(fixed, outer);
    for (const [a, y0, bb, y1] of cutOut([from, base, to, b.height], cut)) {
      if (s === "n" || s === "s") m.box(shell, a, y0, lo, bb, y1, hi, "#ffffff");
      else m.box(shell, lo, y0, a, hi, y1, bb, "#ffffff");
    }
  };
  for (const s of ["n", "s", "w", "e"] as const) side(s);
  // The roof, and over it a metre of packed regolith against radiation and micrometeoroids (kept back from the edge).
  m.box(shell, r.x0 - t, b.height - 0.3, r.z0 - t, r.x1 + t, b.height, r.z1 + t, "#ffffff", 0, "-y");
  if (b.id !== "link" && b.id !== "w1" && b.id !== "e1") m.box(roof, r.x0 + 0.2, b.height, r.z0 + 0.2, r.x1 - 0.2, b.height + 0.9, r.z1 - 0.2, "#ffffff", 0, "-y");
  else m.box(roof, r.x0 - 0.1, b.height, r.z0 - 0.1, r.x1 + 0.1, b.height + 0.6, r.z1 + 0.1, "#ffffff", 0, "-y");
  // Regolith banked against the walls.
  for (const bm of BERMS) if (bm.building === b.id) berm(m, bm, roof);
  for (const o of m.meshes()) g.add(o);
  // Porches outside the airlocks, and each building's own outside details.
  for (const q of PORCHES) if (cellById(PORTALS.find((p) => p.id === q.door)!.a)?.building === b.id) porch(g, q);
  if (b.id === "hq") hqOutside(g, b);
  if (b.id === "eva") evaOutside(g, b);
}

/** A window from outside: a sill that sheds dust, and a frame round the opening. */
function outsideWindow(m: CampusMesher, w: Win, s: Edge["side"], edge: number, mat: THREE.Material) {
  const t = WALL.outer;
  const o = s === "s" || s === "e" ? 1 : -1;
  const face = edge + o * t;
  const piece = (u0: number, u1: number, y0: number, y1: number, d0: number, d1: number) => {
    const p0 = face + o * d0,
      p1 = face + o * d1;
    if (s === "n" || s === "s") m.box(mat, u0, y0, Math.min(p0, p1), u1, y1, Math.max(p0, p1), "#ffffff");
    else m.box(mat, Math.min(p0, p1), y0, u0, Math.max(p0, p1), y1, u1, "#ffffff");
  };
  const a = w.at - w.width / 2,
    b = w.at + w.width / 2;
  piece(a - 0.12, b + 0.12, w.y0 - 0.1, w.y0, -0.02, 0.14);
  piece(a - 0.12, b + 0.12, w.y1, w.y1 + 0.1, -0.02, 0.06);
  piece(a - 0.12, a, w.y0, w.y1, -0.02, 0.06);
  piece(b, b + 0.12, w.y0, w.y1, -0.02, 0.06);
}

/** A bank of regolith against a wall: a flat top, sloping off at its angle of repose, the ends hipped. */
function berm(m: CampusMesher, b: Berm, mat: THREE.Material) {
  const d = bermDepth(b),
    o = b.side === "s" || b.side === "e" ? 1 : -1;
  const run = d - 0.4;
  // In the bank's own terms: u along the wall, v out from it, y up.
  const P = (u: number, v: number, y: number): V3 => (b.side === "n" || b.side === "s" ? [u, y, b.face + o * v] : [b.face + o * v, y, u]);
  const u0 = b.from,
    u1 = b.to,
    v = 0.4;
  const top = [P(u0 + run, 0, b.h), P(u1 - run, 0, b.h), P(u1 - run, v, b.h), P(u0 + run, v, b.h)];
  const foot = [P(u0, 0, 0), P(u1, 0, 0), P(u1, d, 0), P(u0, d, 0)];
  const n = (x: number, y: number, z: number): V3 => {
    const l = Math.hypot(x, y, z);
    return [x / l, y / l, z / l];
  };
  const outN: V3 = b.side === "n" || b.side === "s" ? n(0, run, o * b.h) : n(o * b.h, run, 0);
  m.quad(mat, top[0], top[1], top[2], top[3], [0, 1, 0], "#ffffff");
  m.quad(mat, top[3], top[2], foot[2], foot[3], outN, "#ffffff");
  // The hipped ends.
  const endN = (dir: number): V3 => (b.side === "n" || b.side === "s" ? n(dir * b.h, run, 0) : n(0, run, dir * b.h));
  m.quad(mat, foot[0], top[0], top[3], foot[3], endN(-1), "#ffffff");
  m.quad(mat, foot[1], top[1], top[2], foot[2], endN(1), "#ffffff");
}

/** An airlock's porch: a grated landing level with the chamber, a ramp down, rails, a floodlight and a sign. */
function porch(g: THREE.Group, q: (typeof PORCHES)[number]) {
  const steel = metal("#8d949e", 0.45),
    deck = paint("#4a5263", 0.8, 0.3),
    grate = metal("#6f7884", 0.5);
  const o = q.out;
  // Local frame: u across the door, v out from the wall face.
  const P = (u: number, v: number): [number, number] => (q.along === "x" ? [q.centre + u, q.face + o * v] : [q.face + o * v, q.centre + u]);
  const m = new CampusMesher();
  const span = (u0: number, u1: number, v0: number, v1: number, y0: number, y1: number, mat: THREE.Material) => {
    const [ax, az] = P(u0, v0),
      [bx, bz] = P(u1, v1);
    m.box(mat, Math.min(ax, bx), y0, Math.min(az, bz), Math.max(ax, bx), y1, Math.max(az, bz), "#ffffff");
  };
  span(-q.half, q.half, 0, q.landing, 0, FLOOR - 0.04, deck);
  for (let u = -q.half + 0.06; u <= q.half - 0.06; u += 0.08) span(u - 0.015, u + 0.015, 0.05, q.landing - 0.03, FLOOR - 0.04, FLOOR, grate);
  // The ramp: steps of plate following the slope (so its edge reads clearly), with anti-slip bars.
  const steps = 12;
  for (let i = 0; i < steps; i++) {
    const v0 = q.landing + (q.ramp * i) / steps,
      v1 = q.landing + (q.ramp * (i + 1)) / steps;
    const y = FLOOR * (1 - (i + 0.5) / steps);
    span(-q.half, q.half, v0, v1 + 0.01, 0, Math.max(0.02, y), deck);
    span(-q.half + 0.05, q.half - 0.05, v0 + 0.02, v0 + 0.05, Math.max(0.02, y), Math.max(0.02, y) + 0.012, grate);
  }
  for (const um of m.meshes()) g.add(um);
  // Rails both sides, the length of the landing and the ramp.
  for (const side of [-1, 1]) {
    const u = side * (q.half - 0.04);
    const posts: [number, number][] = [
      [0.15, FLOOR],
      [q.landing, FLOOR],
      [q.landing + q.ramp * 0.5, FLOOR * 0.5],
      [q.landing + q.ramp - 0.1, 0.02],
    ];
    for (const [v, y] of posts) {
      const [x, z] = P(u, v);
      strut(g, x, y, z, x, y + 1.0, z, 0.025, steel, 8);
    }
    for (let i = 0; i < posts.length - 1; i++) {
      const [x0, z0] = P(u, posts[i][0]),
        [x1, z1] = P(u, posts[i + 1][0]);
      strut(g, x0, posts[i][1] + 1.0, z0, x1, posts[i + 1][1] + 1.0, z1, 0.022, steel, 8);
    }
  }
  // A floodlight over the door and the panel beside it.
  const [lx, lz] = P(0, 0.25);
  box(g, 0.5, 0.1, 0.22, paint("#3b414b", 0.5), lx, FLOOR + LOCK_H + 0.5, lz);
  box(g, 0.42, 0.03, 0.16, light("#fff1d6", 2.4), lx, FLOOR + LOCK_H + 0.44, lz);
  const panel = LOCK_PANELS.find((p) => PORTALS.find((x) => x.id === q.door)?.a === `${p.airlock === "eva" ? "eva" : "yard"}-lock`);
  if (panel) {
    box(g, q.along === "x" ? 0.36 : 0.08, 0.5, q.along === "x" ? 0.08 : 0.36, paint("#c9ced5", 0.5, 0.2), panel.outside.x, FLOOR + 1.25, panel.outside.z);
    box(g, q.along === "x" ? 0.1 : 0.03, 0.1, q.along === "x" ? 0.03 : 0.1, light("#e8b425", 1.5), panel.outside.x, FLOOR + 1.32, panel.outside.z + (q.along === "x" ? o * 0.05 : 0));
  }
}

/** The HQ's outside: the Earth-link dish and a mast on the roof, air handling, and its name in big letters. */
function hqOutside(g: THREE.Group, b: Building) {
  const r = b.rect,
    top = b.height + 0.9;
  const white = paint("#e6e8eb", 0.5, 0.1),
    steel = metal("#a7afbb", 0.4),
    dark = paint("#3b414b", 0.55, 0.2);
  // The dish points at Earth: low over the northern horizon at the Moon's south pole (and up into the sky on Mars).
  const dish = new THREE.Group();
  dish.position.set(r.x0 + 6, top, r.z0 + 6);
  g.add(dish);
  cyl(dish, 0.35, 0.5, 1.6, white, 0, 0.8, 0, 16);
  const head = new THREE.Group();
  head.position.y = 1.9;
  head.rotation.x = 1.2;
  dish.add(head);
  const bowl = new THREE.Mesh(new THREE.SphereGeometry(2.0, 32, 12, 0, Math.PI * 2, 0, 0.62), white);
  bowl.rotation.x = Math.PI;
  bowl.position.y = 1.6;
  head.add(bowl);
  strut(head, 0, 0.1, 0, 0, 1.4, 0, 0.04, steel, 8);
  box(head, 0.18, 0.18, 0.18, dark, 0, 1.45, 0);
  // A mast with a beacon, and air handlers.
  strut(g, r.x1 - 3, top, r.z0 + 3, r.x1 - 3, top + 5.5, r.z0 + 3, 0.07, steel, 10);
  box(g, 0.14, 0.14, 0.14, light("#ff4d5e", 3), r.x1 - 3, top + 5.6, r.z0 + 3);
  for (const [x, z] of [
    [r.x1 - 6, r.z1 - 5],
    [r.x0 + 5, r.z1 - 5],
  ]) {
    box(g, 2.6, 1.0, 1.6, paint("#d0d4d9", 0.6, 0.2), x, top + 0.5, z);
    for (let i = 0; i < 2; i++) cyl(g, 0.45, 0.45, 0.06, dark, x - 0.6 + i * 1.2, top + 1.03, z, 20);
  }
  // Its name on the north face (towards Hab-1) and the south face (towards the apron).
  const n = label(g, "COMMAND HQ", 6.4, 0, b.height - 1.1, r.z0 - WALL.outer - 0.03);
  n.rotation.y = Math.PI;
  label(g, "COMMAND HQ", 6.4, 0, b.height - 1.1, r.z1 + WALL.outer + 0.03);
}

/** The EVA complex's outside: its name over the door, a radiator on the roof. */
function evaOutside(g: THREE.Group, b: Building) {
  const r = b.rect;
  label(g, "EVA 1", 2.2, 66, b.height - 0.8, r.z1 + WALL.outer + 0.03);
  const top = b.height + 0.9;
  for (let i = 0; i < 3; i++) {
    const x = r.x0 + 4 + i * 2.6;
    box(g, 2.2, 1.4, 0.06, paint("#e6e8eb", 0.45, 0.2), x, top + 0.75, r.z0 + 3);
    strut(g, x, top, r.z0 + 3, x, top + 0.1, r.z0 + 3, 0.05, metal("#a7afbb", 0.4), 6);
  }
}

/** A building that isn't built yet: its foundation slab, and scaffolding round where its walls will go. */
function scaffold(g: THREE.Group, b: Building, steel: THREE.Material, slab: THREE.Material) {
  const m = new CampusMesher();
  const r = b.rect,
    t = WALL.outer;
  m.box(slab, r.x0 - t, 0, r.z0 - t, r.x1 + t, 0.28, r.z1 + t, "#ffffff");
  const poles: [number, number][] = [];
  const along = (a: number, bb: number, fixed: number, x: boolean) => {
    const n = Math.max(1, Math.round((bb - a) / 3.5));
    for (let i = 0; i <= n; i++) poles.push(x ? [a + ((bb - a) * i) / n, fixed] : [fixed, a + ((bb - a) * i) / n]);
  };
  along(r.x0 - t, r.x1 + t, r.z0 - t - 0.6, true);
  along(r.x0 - t, r.x1 + t, r.z1 + t + 0.6, true);
  along(r.z0 - t, r.z1 + t, r.x0 - t - 0.6, false);
  along(r.z0 - t, r.z1 + t, r.x1 + t + 0.6, false);
  const top = Math.min(b.height, 4.5);
  for (const [x, z] of poles) m.box(steel, x - 0.03, 0, z - 0.03, x + 0.03, top, z + 0.03, "#ffffff");
  for (const y of [1.2, 2.6, top - 0.05]) {
    m.box(steel, r.x0 - t, y, r.z0 - t - 0.63, r.x1 + t, y + 0.05, r.z0 - t - 0.57, "#ffffff");
    m.box(steel, r.x0 - t, y, r.z1 + t + 0.57, r.x1 + t, y + 0.05, r.z1 + t + 0.63, "#ffffff");
    m.box(steel, r.x0 - t - 0.63, y, r.z0 - t, r.x0 - t - 0.57, y + 0.05, r.z1 + t, "#ffffff");
    m.box(steel, r.x1 + t + 0.57, y, r.z0 - t, r.x1 + t + 0.63, y + 0.05, r.z1 + t, "#ffffff");
  }
  for (const o of m.meshes()) g.add(o);
}

/** An outdoor compound: its fence and the equipment inside. */
function compound(g: THREE.Group, b: Building, steel: THREE.Material, shell: THREE.Material, slab: THREE.Material) {
  const m = new CampusMesher();
  const r = b.rect;
  m.box(slab, r.x0, 0, r.z0, r.x1, 0.06, r.z1, "#ffffff");
  for (const p of COMPOUND_PARTS) {
    if (p.building !== b.id) continue;
    const q = p.rect;
    if (p.kind === "fence") {
      // Posts every 2.5 m, two rails and a mesh of thin wires (drawn as a few strands).
      const len = Math.max(q.x1 - q.x0, q.z1 - q.z0),
        alongX = q.x1 - q.x0 > q.z1 - q.z0;
      const n = Math.max(1, Math.round(len / 2.5));
      for (let i = 0; i <= n; i++) {
        const u = i / n;
        const x = alongX ? q.x0 + (q.x1 - q.x0) * u : (q.x0 + q.x1) / 2,
          z = alongX ? (q.z0 + q.z1) / 2 : q.z0 + (q.z1 - q.z0) * u;
        m.box(steel, x - 0.04, 0, z - 0.04, x + 0.04, p.height, z + 0.04, "#ffffff");
      }
      for (const y of [0.15, 1.2, p.height - 0.06]) m.box(steel, q.x0, y, q.z0, q.x1, y + 0.05, q.z1, "#ffffff");
      continue;
    }
    m.box(p.kind === "radiator" ? shell : p.kind === "battery" ? shell : steel, q.x0, 0.06, q.z0, q.x1, p.height, q.z1, "#ffffff");
  }
  for (const o of m.meshes()) g.add(o);
}
