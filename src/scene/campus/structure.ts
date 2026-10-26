import * as THREE from "three";
import {
  BUILDINGS,
  built,
  cellById,
  cellEdges,
  CELLS,
  COMPOUND_PARTS,
  FLOOR,
  HQ_STAIR,
  MEZZANINE,
  openingFaces,
  PORTALS,
  WALL,
  type Building,
  type BuildingId,
  type Cell,
  type Edge,
  type Portal,
  type Stage,
} from "../../sim/base";
import type { Planet } from "../../sim/types";
import { glass, metal, paint, soil } from "../kit";
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
/** A vertical quad along an edge, on a room's side of it (facing into the room), from a to b and y0 to y1. */
function edgeQuad(m: CampusMesher, mat: THREE.Material, e: Edge, a: number, b: number, y0: number, y1: number, color: string, cell: number, offset = 0) {
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
        const wall = (a: number, bb: number, from: number, to: number) => {
          if (c !== hall) return edgeQuad(m, mat, e, a, bb, from, to, tone.wall, k);
          // In the hall, the walls above the mezzanine are the mezzanine's.
          const mz = CELL_INDEX.get(mezz.id)!;
          const inMezz = (lo: number, hi: number) => {
            edgeQuad(m, mat, e, lo, hi, from, Math.min(to, under), tone.wall, k);
            edgeQuad(m, mat, e, lo, hi, Math.max(from, MEZZANINE), to, tone.wall, mz);
          };
          if (e.side === "s") return inMezz(a, bb);
          if (e.side === "n") return edgeQuad(m, mat, e, a, bb, from, to, tone.wall, k);
          const split = mezz.rect.z0;
          if (bb <= split) return edgeQuad(m, mat, e, a, bb, from, to, tone.wall, k);
          if (a >= split) return inMezz(a, bb);
          edgeQuad(m, mat, e, a, split, from, to, tone.wall, k);
          inMezz(split, bb);
        };
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
    const mine = holes
      .filter((p) => (s === "n" || s === "s" ? p.along === "x" && Math.abs(p.z - (s === "n" ? r.z0 : r.z1)) < 0.45 : p.along === "z" && Math.abs(p.x - (s === "w" ? r.x0 : r.x1)) < 0.45))
      .map((p) => ({ at: p.along === "x" ? p.x : p.z, half: p.width / 2, h: openingHeight(p) }))
      .sort((p, q) => p.at - q.at);
    const lo = Math.min(fixed, outer),
      hi = Math.max(fixed, outer);
    const piece = (a: number, bb: number, y0: number, y1: number) => {
      if (s === "n" || s === "s") m.box(shell, a, y0, lo, bb, y1, hi, "#ffffff");
      else m.box(shell, lo, y0, a, hi, y1, bb, "#ffffff");
    };
    let at = from;
    for (const hole of mine) {
      piece(at, hole.at - hole.half, base, b.height);
      piece(hole.at - hole.half, hole.at + hole.half, base + (hangar ? 0 : 0.05) + hole.h, b.height);
      at = hole.at + hole.half;
    }
    piece(at, to, base, b.height);
  };
  for (const s of ["n", "s", "w", "e"] as const) side(s);
  // The roof, and over it a metre of packed regolith against radiation and micrometeoroids (kept back from the edge).
  m.box(shell, r.x0 - t, b.height - 0.3, r.z0 - t, r.x1 + t, b.height, r.z1 + t, "#ffffff", 0, "-y");
  if (b.id !== "link" && b.id !== "w1" && b.id !== "e1") m.box(roof, r.x0 + 0.2, b.height, r.z0 + 0.2, r.x1 - 0.2, b.height + 0.9, r.z1 - 0.2, "#ffffff", 0, "-y");
  else m.box(roof, r.x0 - 0.1, b.height, r.z0 - 0.1, r.x1 + 0.1, b.height + 0.6, r.z1 + 0.1, "#ffffff", 0, "-y");
  for (const o of m.meshes()) g.add(o);
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
