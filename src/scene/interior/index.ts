import * as THREE from "three";
import { BLOCKS, HOME, polar, rad, type Block } from "../../sim/home";
import { box, dispose, finalize, keep } from "../kit";
import { insideLight, ipaint } from "./lighting";
import { buildStructure, type Door } from "./structure";

export { insideLight } from "./lighting";
export type { Door } from "./structure";

export interface Interior {
  /** Everything inside, in habitat-local metres: place it at the habitat's origin. */
  group: THREE.Group;
  doors: Door[];
  /** The lamps' lit faces (dimmed with the lights). */
  lit: THREE.MeshStandardMaterial;
  dispose: () => void;
}

/** Which layer the inside lives on: the 3D view draws it, but clicks on the outpost never test it. */
export const INSIDE_LAYER = 1;

/** The inside of the Mars home: built once, shown while you are in or near it. */
export function buildInterior(): Interior {
  const group = new THREE.Group();
  group.name = "interior";
  const { doors, lit } = buildStructure(group);
  for (const k of BLOCKS) furniture(group, k);
  finalize(group);
  group.traverse((o) => o.layers.set(INSIDE_LAYER));
  return {
    group,
    doors,
    lit,
    dispose: () => dispose(group),
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
/** A piece of furniture in its box from the floor plan (detailed models replace these room by room). */
function furniture(g: THREE.Group, k: Block) {
  const at = polar(k.bearing, k.r);
  const piece = new THREE.Group();
  piece.position.set(at.x, HOME.floor[k.level], at.z);
  piece.rotation.y = -rad(k.bearing + (k.turn ?? 0));
  piece.name = k.id;
  g.add(piece);
  box(piece, k.w, k.h, k.d, ipaint(TONE[k.room] ?? (k.id.startsWith("q") ? "#cfc8bd" : "#c4c8ce"), 0.7), 0, k.h / 2, 0);
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
