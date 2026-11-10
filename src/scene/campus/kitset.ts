import * as THREE from "three";
import { cellById, PORTALS, type BuildingId, type Furniture, type Side } from "../../sim/base";
import type { ModuleType, Planet } from "../../sim/types";
import { box, cyl, strut } from "../kit";
import { ifabric, imetal, ipaint, iplastic, irubber } from "../interior/lighting";
import { ilabel, type Screen } from "../interior/parts";
import { CELL_INDEX, cellCeiling, cellFloor } from "./lighting";
import { openingHeight } from "./structure";

/**
 * The shared kit for dressing the campus's rooms (campus/dress.ts, campus/rooms.ts): where a piece goes, the inside
 * palette, signs, rails, gratings, and what the dressing hands back for the scene to keep in step with the mission.
 */

/** What the scene keeps in step with the mission: the parts of the dressing that show live state. */
export interface CampusDressing {
  /** Each built building's furniture and fittings, to add to its inside. */
  groups: Map<BuildingId, THREE.Group>;
  screens: Screen[];
  /** Alex's suit on its rack in the EVA complex: it goes when Alex is outside. */
  alexSuit: THREE.Object3D | null;
  /** Each airlock's warning beacon (turns while it cycles), and the lights over its doors (green: may open). */
  beacons: { airlock: string; o: THREE.Object3D; mat: THREE.MeshStandardMaterial }[];
  doorLights: { door: string; mat: THREE.MeshStandardMaterial }[];
  /** The server racks' status lights. */
  leds: THREE.MeshStandardMaterial;
  /** Machines' status lamps, by what they show: a module type's state, or life support's power, or damage anywhere. */
  status: { bind: StatusBind; mat: THREE.MeshStandardMaterial }[];
  /** Gauges (a bar scaled upright from 0 to 1): a store's fill, or the shelter's water walls. */
  gauges: { res: GaugeRes; o: THREE.Object3D }[];
  /** The greenhouse's plants (grown with the greenhouse modules) and its grow lights. */
  plants: { mesh: THREE.InstancedMesh; base: THREE.Matrix4[] }[];
  growLights: THREE.MeshStandardMaterial | null;
  /** Crates and containers on the stores' shelves: as many as the stock fills. */
  stock: { res: "food" | "water" | "materials"; mesh: THREE.InstancedMesh; total: number }[];
  /** Doors and lids on equipment that swing open while its station's card is open (`t` 0 shut – 1 open). */
  opening: { station: string; o: THREE.Object3D; t: number }[];
}
export type StatusBind = ModuleType | "lifesupport" | "damage";
export type GaugeRes = "o2" | "water" | "food" | "materials" | "shelter";



export const P = {
  white: () => ipaint("#e4e7ea", 0.5),
  panel: () => ipaint("#c9ced5", 0.55),
  grey: () => ipaint("#8d949e", 0.55),
  dark: () => ipaint("#363c46", 0.55),
  navy: () => ipaint("#33405c", 0.5),
  steel: () => imetal("#b9c0ca", 0.32),
  gun: () => imetal("#5d6573", 0.45),
  black: () => iplastic("#1b1f26", 0.45),
  cushion: () => ifabric("#4c5a6e", 0.9),
  rubber: () => irubber("#2a2e36"),
};

/** A group in a room at a point, its +z turned to face `face` (n faces −z, s faces +z, e faces +x, w faces −x). */
export function place(parent: THREE.Group, cell: string, x: number, y: number, z: number, face: Side) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = face === "s" ? 0 : face === "n" ? Math.PI : face === "e" ? Math.PI / 2 : -Math.PI / 2;
  g.userData.cell = CELL_INDEX.get(cell);
  parent.add(g);
  return g;
}
/** A group on a room's wall, `out` from its face, its +z facing into the room; local x runs along the wall. */
export function onWall(parent: THREE.Group, cell: string, side: Side, at: number, y: number, out = 0) {
  const r = cellById(cell)!.rect;
  const face: Side = side === "n" ? "s" : side === "s" ? "n" : side === "w" ? "e" : "w";
  if (side === "n") return place(parent, cell, at, y, r.z0 + out, face);
  if (side === "s") return place(parent, cell, at, y, r.z1 - out, face);
  if (side === "w") return place(parent, cell, r.x0 + out, y, at, face);
  return place(parent, cell, r.x1 - out, y, at, face);
}
/** A piece of furniture in its box, its front facing the way the plan says (back at −D/2, front at +D/2). */
export function inBox(parent: THREE.Group, f: Furniture) {
  const c = cellById(f.cell)!;
  const r = f.rect;
  const g = place(parent, f.cell, (r.x0 + r.x1) / 2, cellFloor(c), (r.z0 + r.z1) / 2, f.face);
  g.name = f.id;
  const across = f.face === "n" || f.face === "s";
  return { g, W: across ? r.x1 - r.x0 : r.z1 - r.z0, D: across ? r.z1 - r.z0 : r.x1 - r.x0 };
}

export type Build = (g: THREE.Group, W: number, D: number, H: number, f: Furniture, ctx: Ctx) => void;
export interface Ctx {
  planet: Planet;
  out: CampusDressing;
}

/** An operations console: a long desk with a seat for every 1.9 m, two live screens at each seat, a status rail. */
/** A sign hanging from the ceiling, readable from both sides. */
export function hangingSign(parent: THREE.Group, cell: string, x: number, z: number, face: Side, lines: string[], width = 1.6) {
  const c = cellById(cell)!;
  const y = cellCeiling(c) - 0.42;
  const g = place(parent, cell, x, y, z, face);
  const h = 0.12 + lines.length * 0.2;
  box(g, width + 0.06, h + 0.06, 0.04, P.dark(), 0, 0, 0);
  for (const s of [1, -1]) {
    const side = new THREE.Group();
    side.rotation.y = s > 0 ? 0 : Math.PI;
    g.add(side);
    lines.forEach((t, i) => ilabel(side, t, width, 0, h / 2 - 0.16 - i * 0.2 + 0.02, 0.022, "#ffffff", null));
  }
  for (const dx of [-width / 2 + 0.1, width / 2 - 0.1]) strut(g, dx, h / 2 + 0.03, 0, dx, 0.42 + h / 2 - 0.03, 0, 0.008, P.steel(), 6);
}
/** A sign on a wall above a door, facing into the room. */
export function doorSign(parent: THREE.Group, cell: string, side: Side, at: number, text: string, ink = "#1d222b", plate = "#eceff2") {
  const c = cellById(cell)!;
  // Above the doorway (a tall double door's too), under the ceiling.
  const door = PORTALS.find((p) => (p.a === cell || p.b === cell) && Math.abs((p.along === "x" ? p.x : p.z) - at) < 0.05);
  const y = Math.min(cellFloor(c) + (door ? openingHeight(door) : 2.15) + 0.3, cellCeiling(c) - 0.14);
  const g = onWall(parent, cell, side, at, y, 0.01);
  ilabel(g, text, Math.min(1.6, 0.18 + text.length * 0.065), 0, 0, 0, ink, plate);
}
/** A handrail along a wall on stand-offs, at 0.9 m. */
export function handrail(parent: THREE.Group, cell: string, side: Side, from: number, to: number) {
  if (to - from < 0.5) return;
  const c = cellById(cell)!;
  const g = onWall(parent, cell, side, (from + to) / 2, cellFloor(c) + 0.92, 0);
  const len = to - from;
  cyl(g, 0.022, 0.022, len, P.steel(), 0, 0, 0.075, 10).rotation.z = Math.PI / 2;
  for (let x = -len / 2 + 0.2; x <= len / 2 - 0.19; x += Math.max(0.6, (len - 0.4) / Math.max(1, Math.round((len - 0.4) / 1.4)))) strut(g, x, 0, 0.005, x, 0, 0.075, 0.012, P.gun(), 6);
}

/** The runs of a room's wall that are clear of its doors and windows (for rails, trays, ribs). */
export function clearRuns(cell: string, side: Side, margin = 0.3) {
  const c = cellById(cell)!;
  const r = c.rect;
  const [from, to] = side === "n" || side === "s" ? [r.x0, r.x1] : [r.z0, r.z1];
  const fixed = side === "n" ? r.z0 : side === "s" ? r.z1 : side === "w" ? r.x0 : r.x1;
  const holes: [number, number][] = [];
  for (const p of PORTALS) {
    if (p.level !== c.level || (p.a !== cell && p.b !== cell)) continue;
    const onSide = side === "n" || side === "s" ? p.along === "x" && Math.abs(p.z - fixed) < 0.45 : p.along === "z" && Math.abs(p.x - fixed) < 0.45;
    if (onSide) holes.push([(p.along === "x" ? p.x : p.z) - p.width / 2 - margin, (p.along === "x" ? p.x : p.z) + p.width / 2 + margin]);
  }
  const runs: [number, number][] = [];
  let at = from + margin;
  for (const [a, b] of holes.sort((p, q) => p[0] - q[0])) {
    if (a > at) runs.push([at, a]);
    at = Math.max(at, b);
  }
  if (to - margin > at) runs.push([at, to - margin]);
  return runs;
}

/** A floor grating (dust falls through to a tray below): slats on a dark frame, a hand's height over the floor. */
export function grating(parent: THREE.Group, cell: string, x0: number, z0: number, x1: number, z1: number) {
  const c = cellById(cell)!;
  const g = place(parent, cell, (x0 + x1) / 2, cellFloor(c), (z0 + z1) / 2, "s");
  const w = x1 - x0,
    d = z1 - z0;
  box(g, w, 0.01, d, ipaint("#1d2026", 0.9), 0, 0.005, 0);
  for (let x = -w / 2 + 0.04; x <= w / 2 - 0.04; x += 0.07) box(g, 0.025, 0.02, d - 0.04, imetal("#7d8592", 0.5), x, 0.02, 0);
}


/** A small status lamp (facing +z) whose colour the scene sets from the mission (see CampusDressing.status). */
export function statusLamp(g: THREE.Object3D, ctx: Ctx, bind: StatusBind, x: number, y: number, z: number, size = 0.05) {
  const mat = new THREE.MeshStandardMaterial({ color: "#14301f", emissive: "#3ee39a", emissiveIntensity: 1.6, roughness: 0.3, toneMapped: false });
  const m = new THREE.Mesh(new THREE.BoxGeometry(size, size, 0.02), mat);
  m.position.set(x, y, z);
  m.userData.keep = true;
  g.add(m);
  ctx.out.status.push({ bind, mat });
  return m;
}
/** An upright gauge (facing +z): a dark slot with a coloured bar that the scene fills from the mission. */
export function gauge(g: THREE.Object3D, ctx: Ctx, res: GaugeRes, x: number, y: number, z: number, w: number, h: number, color: string) {
  box(g, w + 0.04, h + 0.04, 0.02, ipaint("#1b1f26", 0.5), x, y + h / 2, z);
  const bar = new THREE.Group();
  bar.position.set(x, y, z + 0.012);
  bar.userData.keep = true;
  box(bar, w, h, 0.012, ipaint(color, 0.4), 0, h / 2, 0);
  g.add(bar);
  ctx.out.gauges.push({ res, o: bar });
  return bar;
}
