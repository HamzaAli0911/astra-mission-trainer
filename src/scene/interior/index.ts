import * as THREE from "three";
import { BLOCKS, HOME, polar, rad, type Block } from "../../sim/home";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { box, dispose, finalize, keep } from "../kit";
import { activeHazard, capacity, flows } from "../../sim/core";
import { clockOf, dayOf, PLANETS } from "../../sim/planets";
import type { GameState, Planet } from "../../sim/types";
import { dress } from "./dressing";
import { buildPiece, living, placeInstances, resetLiving } from "./furniture";
import { finishMaterial, insideLight, ipaint } from "./lighting";
import { beginLabels, finishLabels, screens, type Screen, type ScreenData } from "./parts";
import { buildStructure, type Door } from "./structure";

export { insideLight } from "./lighting";
export type { Door } from "./structure";
export type { ScreenData } from "./parts";

export interface Interior {
  /** Everything inside, in habitat-local metres: place it at the habitat's origin. */
  group: THREE.Group;
  doors: Door[];
  /** The lamps' lit faces (dimmed with the lights). */
  lit: THREE.MeshStandardMaterial;
  /** Screens showing live data, and the things that change with the mission. */
  screens: Screen[];
  living: typeof living;
  /** Redraw the screens (call a few times a second). */
  redraw: (data: ScreenData) => void;
  dispose: () => void;
}

/** What the screens inside show, from the mission. */
export function screenData(g: GameState): ScreenData {
  const f = flows(g);
  return {
    planet: g.planet,
    time: `${PLANETS[g.planet].dayWord.toUpperCase()} ${dayOf(g.t)} · ${clockOf(g.t)}`,
    power: g.res.power,
    powerMax: capacity(g).power,
    o2: g.res.o2,
    water: g.res.water,
    food: g.res.food,
    foodDays: g.res.food / Math.max(0.01, f.food.used * 24),
    dose: Math.max(0, ...g.crew.map((c) => c.dose)),
    storm: !!activeHazard(g, "storm"),
    sheltering: g.sheltering,
    // Light takes 3 to 22 minutes each way between Mars and Earth, depending on where they are in their orbits.
    delay: g.planet === "mars" ? "≈12 MIN" : "1.3 S",
    crew: g.crew.map((c) => ({ name: c.name, place: c.place, health: c.health })),
    samples: g.stats.sites.length,
    modules: [],
  };
}

/** Which layer the inside lives on: the 3D view draws it, but clicks on the outpost never test it. */
export const INSIDE_LAYER = 1;

/** The inside of the Mars home: built once, shown while you are in or near it. */
export function buildInterior(planet: Planet = "mars"): Interior {
  const group = new THREE.Group();
  group.name = "interior";
  screens.length = 0;
  resetLiving();
  beginLabels();
  const { doors, lit } = buildStructure(group);
  for (const k of BLOCKS) furniture(group, k);
  dress(group, planet);
  placeInstances(group);
  finishLabels();
  bake(group);
  finalize(group);
  group.traverse((o) => o.layers.set(INSIDE_LAYER));
  const own = [...screens];
  return {
    group,
    doors,
    lit,
    screens: own,
    living: { ...living },
    redraw: (data) => {
      for (const s of own) {
        if (!s.canvas || !s.texture) continue;
        s.draw(s.canvas.getContext("2d")!, s.canvas.width, s.canvas.height, data);
        s.texture.needsUpdate = true;
      }
    },
    dispose: () => {
      for (const s of own) s.texture?.dispose();
      dispose(group);
    },
  };
}

const TONE: Record<string, string> = {
  suit: "#c9ccd2",
  galley: "#d8cfc2",
  hygiene: "#cdd6dc",
  eclss: "#b9c3cf",
  lab: "#d3d6cf",
  medical: "#dfe3e6",
  shelter: "#9fb3c6",
  garden: "#b9cfae",
  exercise: "#c7c3d6",
  command: "#b8c1cf",
};
/**
 * Merge every painted, fabric, metal, plastic and rubber part by its finish, with each part's colour carried per
 * vertex: a few dozen draw calls for the whole home instead of one per colour. Moving parts (kept) merge within
 * themselves. Anything else (labels, glass, lamps, screens) is left for finalize().
 */
function bake(root: THREE.Object3D) {
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
      const mat = m.material as THREE.MeshStandardMaterial;
      if (!m.isMesh || (m as THREE.InstancedMesh).isInstancedMesh || Array.isArray(m.material) || !mat.userData?.finish) return;
      for (let a: THREE.Object3D | null = m; a && a !== r; a = a.parent) if (a.userData.keep) return;
      const g = m.geometry.index ? m.geometry.clone() : m.geometry.clone();
      if (!g.index) g.setIndex([...Array(g.attributes.position.count).keys()]);
      for (const name of Object.keys(g.attributes)) if (name !== "position" && name !== "normal" && name !== "uv") g.deleteAttribute(name);
      if (!g.attributes.normal) g.computeVertexNormals();
      if (!g.attributes.uv) g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      const n = g.attributes.position.count,
        c = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) c.set([mat.color.r, mat.color.g, mat.color.b], i * 3);
      g.setAttribute("color", new THREE.Float32BufferAttribute(c, 3));
      g.morphAttributes = {};
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
      const key = `${mat.userData.finish}|${m.castShadow}`;
      const list = groups.get(key);
      if (list) list.push(g);
      else groups.set(key, [g]);
      drop.push(m);
    });
    for (const m of drop) m.parent?.remove(m);
    for (const [key, list] of groups) {
      const merged = mergeGeometries(list, false);
      for (const g of list) g.dispose();
      if (!merged) continue;
      const out = new THREE.Mesh(merged, finishMaterial(key.slice(0, key.lastIndexOf("|"))));
      out.castShadow = key.endsWith("true");
      out.receiveShadow = true;
      // Already merged (finalize() would drop its colours).
      out.userData.keep = true;
      r.add(out);
    }
  }
}

/** A piece of furniture in its box from the floor plan (detailed models replace these room by room). */
function furniture(g: THREE.Group, k: Block) {
  const at = polar(k.bearing, k.r);
  const piece = new THREE.Group();
  piece.position.set(at.x, HOME.floor[k.level], at.z);
  piece.rotation.y = -rad(k.bearing + (k.turn ?? 0));
  piece.name = k.id;
  g.add(piece);
  if (!buildPiece(piece, k)) box(piece, k.w, k.h, k.d, ipaint(TONE[k.room] ?? (k.id.startsWith("q") ? "#cfc8bd" : "#c4c8ce"), 0.7), 0, k.h / 2, 0);
  return piece;
}

/** A plain 1.75 m figure for judging scale in review shots. */
export function scaleFigure() {
  const g = keep(new THREE.Group());
  const skin = ipaint("#c58f6d", 0.7),
    cloth = ipaint("#3a6ea5", 0.85),
    legs = ipaint("#2f3540", 0.85);
  const capsule = (r: number, len: number, m: THREE.Material, y: number, x = 0) => {
    const c = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 12), m);
    c.position.set(x, y, 0);
    g.add(c);
    return c;
  };
  capsule(0.075, 0.72, legs, 0.43, -0.1);
  capsule(0.075, 0.72, legs, 0.43, 0.1);
  box(g, 0.42, 0.6, 0.24, cloth, 0, 1.17, 0);
  capsule(0.055, 0.5, cloth, 1.12, -0.27);
  capsule(0.055, 0.5, cloth, 1.12, 0.27);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.105, 16, 12), skin);
  head.position.set(0, 1.645, 0);
  g.add(head);
  g.traverse((o) => o.layers.set(INSIDE_LAYER));
  return g;
}

/** Keep the lighting's idea of where the home is in step with the model. */
export function placeInterior(i: Interior, x: number, y: number, z: number) {
  i.group.position.set(x, y, z);
  insideLight.uHome.value.set(x, y, z);
}
