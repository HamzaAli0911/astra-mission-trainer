import * as THREE from "three";
import type { Block } from "../../sim/home";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { ball, box, capsule, cyl, keep, rbox, strut, torus } from "../kit";
import { ifabric, imetal, ipaint, iplastic, irubber } from "./lighting";
import { CREW_COLOR, footShadow, iglass, ilabel } from "./parts";

/**
 * Detailed furniture, each built inside its box from the floor plan (what you bump into is what you see).
 * Every builder works in the piece's own frame: x across its front (width W), z from its back (−D/2, against the
 * wall) to its front (+D/2, facing the room), y up from the floor.
 */
type Build = (g: THREE.Group, W: number, D: number, H: number, k: Block) => void;

/** Places for many small, identical things (drawn together, one draw call per kind): food packs, plants, tomatoes. */
interface Spot {
  o: THREE.Object3D;
  color: string;
}
const spots = { food: [] as Spot[], plants: [] as Spot[], tomatoes: [] as Spot[] };
/** Things that change with the mission, for the 3D view to update. */
export const living = {
  /** Food packs on the store's shelves: show as many as there is food. */
  food: null as THREE.InstancedMesh | null,
  /** Lettuce and tomato plants on the food wall, and where each one sits when fully grown. */
  plants: null as THREE.InstancedMesh | null,
  tomatoes: null as THREE.InstancedMesh | null,
  plantBase: [] as THREE.Matrix4[],
  /** Water tank levels (scaled 0–1 up the gauge) and the racks' status strips. */
  levels: [] as THREE.Object3D[],
  status: [] as THREE.Mesh[],
  fans: [] as THREE.Object3D[],
  /** The walker's own suit (it goes when you go outside). */
  mySuit: null as THREE.Object3D | null,
  growLights: [] as THREE.MeshStandardMaterial[],
};
export function resetLiving() {
  Object.assign(living, { food: null, plants: null, tomatoes: null, plantBase: [], levels: [], status: [], fans: [], mySuit: null, growLights: [] });
  for (const v of Object.values(spots)) v.length = 0;
}
const spot = (g: THREE.Object3D, list: Spot[], color: string, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) => {
  const o = new THREE.Object3D();
  o.position.set(x, y, z);
  o.scale.set(sx, sy, sz);
  g.add(o);
  list.push({ o, color });
};
/** A head of lettuce: a ball of crinkled leaves (a lumpy, flattened sphere). */
function lettuce() {
  const g = new THREE.IcosahedronGeometry(0.07, 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      y = p.getY(i),
      z = p.getZ(i);
    const k = 1 + 0.18 * Math.sin(x * 90 + z * 40) * Math.cos(y * 70 + x * 30) + 0.08 * Math.sin(z * 150);
    p.setXYZ(i, x * k, y * k * 0.8, z * k);
  }
  g.computeVertexNormals();
  return g;
}

/** Turn the recorded places into instanced meshes (call once everything is built, before merging). */
export function placeInstances(root: THREE.Group) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const make = (list: Spot[], geo: THREE.BufferGeometry, mat: THREE.Material) => {
    const inst = keep(new THREE.InstancedMesh(geo, mat, Math.max(1, list.length)));
    const c = new THREE.Color();
    list.forEach((sp, i) => {
      inst.setMatrixAt(i, new THREE.Matrix4().multiplyMatrices(inv, sp.o.matrixWorld));
      inst.setColorAt(i, c.set(sp.color));
      sp.o.parent?.remove(sp.o);
    });
    inst.count = list.length;
    inst.castShadow = inst.receiveShadow = true;
    inst.computeBoundingSphere();
    root.add(inst);
    return inst;
  };
  if (spots.food.length) living.food = make(spots.food, new RoundedBoxGeometry(0.075, 0.16, 0.3, 2, 0.02), ipaint("#ffffff", 0.7));
  if (spots.plants.length) {
    living.plants = make(spots.plants, lettuce(), ipaint("#ffffff", 0.75));
    living.plantBase = spots.plants.map((_, i) => {
      const m = new THREE.Matrix4();
      living.plants!.getMatrixAt(i, m);
      return m;
    });
  }
  if (spots.tomatoes.length) living.tomatoes = make(spots.tomatoes, new THREE.SphereGeometry(0.03, 8, 6), ipaint("#ffffff", 0.4));
}

const SUITS: Record<string, [string, string][]> = {
  "suit-rack-e": [
    ["maya", "M. CHEN"],
    ["alex", "A. RIVERA"],
  ],
  "suit-rack-w": [
    ["sam", "S. OKAFOR"],
    ["noor", "N. AL-HASSAN"],
  ],
};
const QUARTERS: Record<string, [string, string]> = { q1: ["maya", "MAYA"], q2: ["alex", "ALEX"], q3: ["sam", "SAM"], q4: ["noor", "NOOR"] };

// The palette inside: warm off-whites, cool greys, a few strong colours for purpose (red for safety, blue for water).
const M = {
  white: () => ipaint("#e6e8eb", 0.5),
  off: () => ipaint("#d9d4ca", 0.6),
  grey: () => ipaint("#8d949e", 0.55),
  dark: () => ipaint("#3b414b", 0.55),
  steel: () => imetal("#b9c0ca", 0.32),
  gun: () => imetal("#5d6573", 0.45),
  black: () => iplastic("#1e2229", 0.45),
  cushion: () => ifabric("#4c5a6e", 0.9),
  water: () => ipaint("#4f86c6", 0.35),
};

/** An open-fronted cabinet: back, sides, top and bottom, `t` thick (things inside stay visible). */
function carcass(g: THREE.Group, W: number, H: number, D: number, m: THREE.Material, t = 0.025) {
  box(g, W, H, t, m, 0, H / 2, -D / 2 + t / 2);
  for (const x of [-W / 2 + t / 2, W / 2 - t / 2]) box(g, t, H, D, m, x, H / 2, 0);
  box(g, W, t, D, m, 0, H - t / 2, 0);
  box(g, W, 0.08, D, m, 0, 0.04, 0);
}

/** A hanging spacesuit, its back to the rack (local frame: facing +z), with the crew member's colour stripes. */
function suit(g: THREE.Group, x: number, color: string, name: string) {
  const s = new THREE.Group();
  s.position.set(x, 0, 0.02);
  g.add(s);
  const cloth = ifabric("#eceae4", 0.85),
    stripe = ipaint(color, 0.6),
    boot = irubber("#5b616b"),
    visor = imetal("#c99a3c", 0.12);
  rbox(s, 0.44, 0.34, 0.2, 0.06, M.white(), 0, 1.38, -0.12); // life-support pack
  rbox(s, 0.46, 0.6, 0.3, 0.12, cloth, 0, 1.3, 0.02); // torso
  ball(s, 0.15, cloth, 0, 1.72, 0.04, 20); // helmet
  // The gold sun visor: a cap over the helmet's front.
  const v = new THREE.Mesh(new THREE.SphereGeometry(0.154, 20, 12, Math.PI / 2 - 0.85, 1.7, Math.PI / 2 - 0.5, 0.95), visor);
  v.position.set(0, 1.72, 0.04);
  s.add(v);
  torus(s, 0.13, 0.02, M.steel(), 0, 1.6, 0.03).rotation.x = Math.PI / 2; // neck ring
  for (const side of [-1, 1]) {
    capsule(s, 0.07, 0.42, cloth, side * 0.25, 1.18, 0.03).rotation.z = side * 0.06;
    cyl(s, 0.075, 0.075, 0.05, stripe, side * 0.26, 1.35, 0.03, 14).rotation.z = side * 0.06;
    capsule(s, 0.085, 0.5, cloth, side * 0.12, 0.62, 0.03);
    cyl(s, 0.09, 0.09, 0.05, stripe, side * 0.12, 0.78, 0.03, 14);
    rbox(s, 0.13, 0.12, 0.24, 0.04, boot, side * 0.12, 0.2, 0.06);
    ball(s, 0.06, ifabric("#c8c3b8", 0.9), side * 0.27, 0.9, 0.04, 12); // gloves
  }
  box(s, 0.1, 0.06, 0.02, stripe, -0.12, 1.45, 0.175);
  ilabel(s, name, 0.3, 0, 2.02, -0.2, "#1d222b");
  // The engineer walks outside in Phase 2: their suit stays a separate piece so it can leave the rack.
  if (name === "A. RIVERA") living.mySuit = keep(s);
}

const B: Record<string, Build> = {
  // ---- Suit room ----
  "suit-rack": (g, W, D, _H, k) => {
    const frame = M.gun();
    for (const x of [-W / 2 + 0.04, W / 2 - 0.04]) box(g, 0.05, 2.0, 0.05, frame, x, 1.0, -D / 2 + 0.06);
    box(g, W, 0.05, 0.08, frame, 0, 1.97, -D / 2 + 0.06);
    box(g, W - 0.04, 0.03, D - 0.05, irubber("#30353d"), 0, 0.015, 0); // drip tray / boot grate
    for (let i = 0; i < 9; i++) box(g, 0.012, 0.012, D - 0.08, M.steel(), -W / 2 + 0.08 + (i * (W - 0.16)) / 8, 0.035, 0);
    const crew = SUITS[k.id] ?? [];
    crew.forEach(([id, name], i) => suit(g, (i - 0.5) * 0.64, CREW_COLOR[id], name));
    footShadow(g, W, D, 0, 0, 0.45);
  },
  "suit-bench": (g, W, D) => {
    rbox(g, W, 0.08, D, 0.03, M.cushion(), 0, 0.42, 0);
    for (const x of [-W / 2 + 0.06, W / 2 - 0.06]) box(g, 0.04, 0.4, D - 0.06, M.gun(), x, 0.2, 0);
    // Boot brushes under the seat, for dust before it gets into the home.
    box(g, W - 0.16, 0.05, D - 0.1, ipaint("#2e3238", 0.9), 0, 0.025, 0);
    for (let i = 0; i < 6; i++) box(g, 0.05, 0.035, D - 0.14, ipaint("#c78a3a", 0.95), -W / 2 + 0.14 + i * 0.065, 0.06, 0);
    footShadow(g, W, D);
  },

  // ---- Galley ----
  "galley-store": (g, W, D, H) => {
    carcass(g, W, H, D, M.white());
    // Clear doors over five shelves of food packs; the packs show how much food is left.
    box(g, W - 0.06, H - 0.12, 0.01, iglass("#d6e6ee", 0.16), 0, H / 2, D / 2 + 0.006);
    box(g, 0.012, H - 0.12, 0.02, M.steel(), 0, H / 2, D / 2 + 0.01);
    const colors = ["#e3a33c", "#d86a4b", "#7fb069", "#e9d8a6", "#6aa2d8"];
    // Shelves from the bottom up; packs fill from the bottom shelf, so a low stock leaves the top shelves bare.
    for (let s = 0; s < 5; s++) {
      const y = 0.22 + s * ((H - 0.4) / 4.4);
      box(g, W - 0.08, 0.015, D - 0.08, M.grey(), 0, y - 0.01, 0.02);
      const n = Math.max(1, Math.floor((W - 0.12) / 0.085));
      for (let i = 0; i < n; i++) spot(g, spots.food, colors[(i + s) % 5], -W / 2 + 0.06 + ((W - 0.12) / n) * (i + 0.5), y + 0.085, 0.02, 1, 1, (D - 0.16) / 0.3);
    }
    box(g, W - 0.04, 0.12, 0.02, M.white(), 0, H - 0.07, D / 2 - 0.005);
    ilabel(g, "FOOD STORE", 0.36, 0, H - 0.07, D / 2 + 0.006, "#1d222b", null);
    footShadow(g, W, D);
  },
  "galley-counter": (g, W, D) => {
    const top = 0.92;
    // Base units: drawers and a hot-and-cold oven, a worktop with a rehydration station and a small sink.
    rbox(g, W, top - 0.06, D - 0.02, 0.02, M.off(), 0, (top - 0.06) / 2, -0.01);
    box(g, W - 0.06, 0.08, 0.02, M.dark(), 0, 0.04, D / 2 - 0.03); // kick plate
    for (let i = 0; i < 3; i++) {
      box(g, 0.44, 0.22, 0.012, M.white(), -W / 2 + 0.27, 0.25 + i * 0.24, D / 2 - 0.01);
      box(g, 0.16, 0.02, 0.025, M.steel(), -W / 2 + 0.27, 0.32 + i * 0.24, D / 2 + 0.005);
    }
    box(g, 0.56, 0.5, 0.012, M.dark(), 0.18, 0.5, D / 2 - 0.01); // oven door
    box(g, 0.44, 0.24, 0.014, iglass("#30343b", 0.6), 0.18, 0.52, D / 2 - 0.002);
    box(g, 0.4, 0.02, 0.025, M.steel(), 0.18, 0.71, D / 2 + 0.006);
    rbox(g, W, 0.04, D, 0.012, ipaint("#c9ccd1", 0.35), 0, top - 0.02, 0); // worktop
    // Sink.
    box(g, 0.36, 0.012, 0.3, M.steel(), -W / 2 + 0.3, top + 0.002, -0.02);
    cyl(g, 0.012, 0.012, 0.24, M.steel(), -W / 2 + 0.3, top + 0.12, -0.2, 8);
    strut(g, -W / 2 + 0.3, top + 0.24, -0.2, -W / 2 + 0.3, top + 0.24, -0.06, 0.01, M.steel(), 6);
    // Rehydration station: hot water through a needle into the food pouch, with a small screen.
    rbox(g, 0.32, 0.36, 0.26, 0.03, M.white(), W / 2 - 0.24, top + 0.18, -0.08);
    box(g, 0.2, 0.08, 0.01, iplastic("#20262e"), W / 2 - 0.24, top + 0.28, 0.055);
    cyl(g, 0.01, 0.01, 0.08, M.steel(), W / 2 - 0.24, top + 0.06, 0.02, 6);
    ilabel(g, "REHYDRATE", 0.2, W / 2 - 0.24, top + 0.42, -0.08 + 0.131, "#1d222b", null);
    box(g, W - 0.04, 0.44, 0.01, ipaint("#cfd4da", 0.4), 0, top + 0.24, -D / 2 + 0.005); // splashback
    ilabel(g, "GALLEY", 0.4, -0.2, top + 0.56, -D / 2 + 0.012, "#1d222b");
    footShadow(g, W, D);
  },
  "galley-table": (g, W, D, H) => {
    rbox(g, W, 0.04, D, 0.02, ipaint("#e2ddd3", 0.45), 0, H - 0.02, 0);
    box(g, W - 0.1, 0.03, D - 0.1, M.gun(), 0, H - 0.055, 0);
    cyl(g, 0.05, 0.06, H - 0.07, M.steel(), 0, (H - 0.07) / 2, 0, 16);
    rbox(g, 0.6, 0.03, 0.36, 0.01, M.gun(), 0, 0.015, 0);
    // A water pouch and two food trays left out.
    rbox(g, 0.22, 0.02, 0.16, 0.01, iplastic("#d5dbe1"), -0.3, H + 0.01, 0.12);
    rbox(g, 0.22, 0.02, 0.16, 0.01, iplastic("#d5dbe1"), 0.32, H + 0.01, -0.1);
    rbox(g, 0.08, 0.14, 0.05, 0.02, iplastic("#7fb2d8", 0.3), 0.05, H + 0.07, 0.05);
    footShadow(g, W, D, 0, 0, 0.35);
  },
  "galley-chair": (g, W, D) => {
    rbox(g, W - 0.04, 0.06, D - 0.06, 0.025, M.cushion(), 0, 0.45, 0.01);
    rbox(g, W - 0.06, 0.38, 0.05, 0.02, M.cushion(), 0, 0.7, -D / 2 + 0.04);
    for (const [x, z] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ])
      cyl(g, 0.014, 0.014, 0.42, M.steel(), x * (W / 2 - 0.05), 0.21, z * (D / 2 - 0.05), 8);
    footShadow(g, W, D, 0, 0, 0.3);
  },
  "galley-fridge": (g, W, D, H) => {
    rbox(g, W, H, D, 0.025, M.white(), 0, H / 2, 0);
    box(g, W - 0.02, 0.01, 0.02, M.grey(), 0, H * 0.62, D / 2);
    for (const y of [H * 0.35, H * 0.8]) box(g, 0.025, 0.3, 0.03, M.steel(), W / 2 - 0.08, y, D / 2 + 0.015);
    box(g, 0.14, 0.05, 0.01, iplastic("#12161c"), -W / 2 + 0.14, H * 0.9, D / 2 + 0.006);
    ilabel(g, "FRIDGE · FREEZER", 0.32, 0, H - 0.08, D / 2 + 0.003, "#1d222b", null);
    footShadow(g, W, D);
  },

  // ---- Hygiene ----
  "hygiene-toilet": (g, W, D, H) => {
    // A compartment with its own door (it's a shared room), and the toilet inside: a seat with an air-flow funnel.
    const wall = M.white();
    box(g, 0.05, H, D, wall, -W / 2 + 0.025, H / 2, 0);
    box(g, 0.05, H, D, wall, W / 2 - 0.025, H / 2, 0);
    box(g, W, 0.05, D, wall, 0, H - 0.025, 0);
    box(g, W - 0.1, H - 0.12, 0.04, ipaint("#c7d3dc", 0.5), 0, (H - 0.12) / 2 + 0.06, D / 2 - 0.02);
    box(g, 0.025, 0.3, 0.03, M.steel(), -W / 2 + 0.16, 1.0, D / 2 + 0.005);
    box(g, 0.1, 0.05, 0.01, ipaint("#3ea86a", 0.5), W / 2 - 0.16, 1.5, D / 2 + 0.002); // vacant
    ilabel(g, "WC", 0.16, 0, 1.75, D / 2 + 0.003, "#1d222b");
    cyl(g, 0.18, 0.2, 0.42, M.white(), 0, 0.21, -0.1, 20);
    torus(g, 0.16, 0.025, iplastic("#2c3138"), 0, 0.43, -0.1).rotation.x = Math.PI / 2;
    strut(g, 0.12, 0.45, -0.25, 0.25, 0.9, -D / 2 + 0.08, 0.025, irubber("#3a3f47"), 8);
  },
  "hygiene-shower": (g, W, D, H) => {
    // A water-saving shower stall: frosted panels, a low-flow head, a drain that recovers the water.
    const frame = M.steel();
    for (const x of [-W / 2 + 0.02, W / 2 - 0.02]) box(g, 0.03, H, 0.03, frame, x, H / 2, D / 2 - 0.02);
    box(g, W, 0.03, 0.03, frame, 0, H - 0.015, D / 2 - 0.02);
    box(g, W - 0.04, H - 0.25, 0.012, iglass("#dbe9f0", 0.32), 0, (H - 0.25) / 2 + 0.12, D / 2 - 0.02);
    box(g, 0.012, H - 0.1, D - 0.04, iglass("#dbe9f0", 0.28), -W / 2 + 0.02, H / 2, 0);
    box(g, W - 0.04, 0.06, D - 0.04, ipaint("#cfd6dc", 0.4), 0, 0.03, 0);
    cyl(g, 0.05, 0.05, 0.012, M.steel(), 0, 0.065, 0, 16);
    cyl(g, 0.012, 0.012, 0.5, M.steel(), 0.1, 1.85, -D / 2 + 0.05, 8);
    cyl(g, 0.07, 0.05, 0.03, M.steel(), 0.1, 2.0, -D / 2 + 0.12, 16).rotation.x = 0.5;
    ilabel(g, "SHOWER · 4 L", 0.26, 0, 1.95, D / 2 - 0.012, "#1d222b");
  },
  "hygiene-sink": (g, W, D, H) => {
    rbox(g, W, H - 0.06, D - 0.04, 0.02, M.off(), 0, (H - 0.06) / 2, -0.02);
    rbox(g, W, 0.05, D, 0.02, M.white(), 0, H - 0.025, 0);
    cyl(g, 0.15, 0.12, 0.05, ipaint("#f2f4f5", 0.25), 0, H - 0.01, 0.02, 20);
    strut(g, 0, H + 0.18, -D / 2 + 0.05, 0, H + 0.18, -0.02, 0.012, M.steel(), 6);
    cyl(g, 0.012, 0.012, 0.18, M.steel(), 0, H + 0.09, -D / 2 + 0.05, 6);
    // A mirror above, and towel hooks with one towel per crew member.
    box(g, W - 0.06, 0.5, 0.012, imetal("#e4eaee", 0.04), 0, H + 0.55, -D / 2 + 0.01);
    box(g, W - 0.02, 0.54, 0.008, M.steel(), 0, H + 0.55, -D / 2 + 0.002);
  },

  // ---- Life support ----
  "eclss-rack": (g, W, D, H, k) => {
    const body = ipaint("#d7dbe0", 0.5);
    carcass(g, W, H, D, body, 0.035);
    // A header across the top front with the rack's name and a status strip.
    box(g, W, 0.36, 0.04, body, 0, H - 0.18, D / 2 - 0.02);
    box(g, W - 0.06, 0.5, 0.012, M.grey(), 0, 0.35, -D / 2 + 0.05);
    const status = keep(box(g, W * 0.5, 0.04, 0.01, new THREE.MeshStandardMaterial({ color: "#3ee39a", emissive: "#3ee39a", emissiveIntensity: 1.2, toneMapped: false }), 0, H - 0.06, D / 2 + 0.005));
    living.status.push(status);
    const name = k.id === "eclss-o2" ? "O2 SUPPLY" : k.id === "eclss-co2" ? "CO2 SCRUBBER" : "WATER RECOVERY";
    ilabel(g, name, W * 0.8, 0, H - 0.26, D / 2 + 0.004, "#1d222b");
    if (k.id === "eclss-o2") {
      // Oxygen arrives by pipe from the plant outside (MOXIE on Mars, electrolysis on the Moon).
      for (let i = 0; i < 3; i++) cyl(g, 0.09, 0.09, 0.7, ipaint("#2f6fb0", 0.35, 0.2), -0.3 + i * 0.3, 0.75, 0.12, 16);
      strut(g, -0.3, 1.25, 0.12, 0.3, 1.25, 0.12, 0.022, M.steel(), 8);
      strut(g, 0.3, 1.25, 0.12, 0.3, H - 0.05, 0.12, 0.022, M.steel(), 8);
      ilabel(g, "OXYGEN IN", 0.22, -0.05, 1.4, D / 2 + 0.004, "#2f6fb0", null);
    } else if (k.id === "eclss-co2") {
      // Two beds of sorbent take turns: one soaks up CO2 while the other is baked clean and vented outside.
      for (const x of [-0.22, 0.22]) {
        cyl(g, 0.15, 0.15, 0.85, ipaint("#c9ced5", 0.4, 0.2), x, 0.9, 0.08, 20);
        torus(g, 0.15, 0.015, M.gun(), x, 1.33, 0.08).rotation.x = Math.PI / 2;
        torus(g, 0.15, 0.015, M.gun(), x, 0.47, 0.08).rotation.x = Math.PI / 2;
      }
      const fan = keep(new THREE.Group());
      fan.position.set(0, 1.72, D / 2 + 0.02);
      g.add(fan);
      for (let i = 0; i < 5; i++) {
        const blade = new THREE.Group();
        blade.rotation.z = (i / 5) * Math.PI * 2;
        fan.add(blade);
        box(blade, 0.05, 0.17, 0.01, M.gun(), 0, 0.1, 0).rotation.y = 0.4;
      }
      fan.position.set(0, 1.5, D / 2 - 0.06);
      torus(g, 0.21, 0.02, M.gun(), 0, 1.5, D / 2 - 0.06);
      living.fans.push(fan);
    } else {
      // Water recovery: a spinning distiller for urine, then filters; about 98% of the water comes back.
      cyl(g, 0.22, 0.22, 0.32, M.steel(), -0.18, 1.0, 0.06, 24).rotation.x = Math.PI / 2;
      for (let i = 0; i < 4; i++) cyl(g, 0.045, 0.045, 0.42, ipaint("#e8edf1", 0.4), 0.14 + (i % 2) * 0.12, 0.6 + Math.floor(i / 2) * 0.48, 0.12, 12);
      ilabel(g, "98% RECOVERED", 0.3, 0.12, 1.42, D / 2 + 0.004, "#2f6fb0", null);
    }
    footShadow(g, W, D);
  },
  "eclss-tanks": (g, W, D, H) => {
    // Two water tanks with sight gauges (the level shows the water you have).
    for (const x of [-W / 4, W / 4]) {
      cyl(g, W / 4 - 0.01, W / 4 - 0.01, H - 0.1, ipaint("#d3dde7", 0.4, 0.15), x, (H - 0.1) / 2 + 0.05, 0, 24);
      ball(g, W / 4 - 0.01, ipaint("#d3dde7", 0.4, 0.15), x, H - 0.05, 0, 18).scale.y = 0.35;
      box(g, 0.04, H - 0.4, 0.02, iglass("#cfe6f5", 0.35), x, H / 2, W / 4 - 0.005);
      // The level: a blue bar that grows up from the bottom of the sight glass.
      const level = keep(new THREE.Group());
      level.position.set(x, 0.2, W / 4 - 0.004);
      g.add(level);
      box(level, 0.026, H - 0.4, 0.012, M.water(), 0, (H - 0.4) / 2, 0);
      living.levels.push(level);
    }
    box(g, W - 0.04, 0.06, D - 0.04, M.gun(), 0, 0.03, 0);
    // A label on each tank's front.
    for (const x of [-W / 4, W / 4]) ilabel(g, "POTABLE WATER", W / 2 - 0.12, x, H - 0.35, W / 4 - 0.004, "#2f6fb0");
    footShadow(g, W, D);
  },

  // ---- Lab ----
  "lab-bench": (g, W, D) => {
    const top = 0.92;
    rbox(g, W, 0.045, D, 0.012, ipaint("#cdd2d6", 0.35), 0, top - 0.022, 0);
    // A sample freezer under one end, drawers under the other, knee space between.
    rbox(g, 0.5, top - 0.06, D - 0.04, 0.02, M.white(), -W / 2 + 0.27, (top - 0.06) / 2, -0.01);
    box(g, 0.14, 0.05, 0.01, iplastic("#0f1318"), -W / 2 + 0.27, top - 0.2, D / 2 - 0.025);
    ilabel(g, "SAMPLES −80 °C", 0.3, -W / 2 + 0.27, top - 0.32, D / 2 - 0.029, "#1d222b");
    rbox(g, 0.42, top - 0.06, D - 0.04, 0.02, M.off(), W / 2 - 0.23, (top - 0.06) / 2, -0.01);
    for (let i = 0; i < 3; i++) box(g, 0.14, 0.018, 0.02, M.steel(), W / 2 - 0.23, 0.2 + i * 0.25, D / 2 - 0.02);
    // Glovebox: work on rocks and dust without breathing the perchlorates.
    rbox(g, 0.62, 0.42, 0.42, 0.03, iglass("#cfe0e8", 0.22), -0.12, top + 0.21, -0.04);
    box(g, 0.64, 0.03, 0.44, M.gun(), -0.12, top + 0.43, -0.04);
    for (const x of [-0.26, 0.02]) torus(g, 0.065, 0.015, irubber("#2a2e35"), x, top + 0.2, 0.18);
    // Microscope.
    box(g, 0.16, 0.03, 0.2, M.dark(), 0.42, top + 0.015, -0.05);
    strut(g, 0.42, top, -0.12, 0.42, top + 0.3, -0.12, 0.022, M.dark(), 10);
    cyl(g, 0.03, 0.025, 0.16, M.black(), 0.42, top + 0.28, -0.05, 12).rotation.x = -0.6;
    ilabel(g, "LAB · GLOVEBOX", 0.4, -0.12, top + 0.62, -D / 2 + 0.02, "#1d222b");
    footShadow(g, W, D, 0, 0, 0.35);
  },
  "lab-stool": (g, W) => {
    cyl(g, W / 2 - 0.02, W / 2 - 0.02, 0.06, M.cushion(), 0, 0.6, 0, 20);
    cyl(g, 0.02, 0.02, 0.56, M.steel(), 0, 0.29, 0, 8);
    cyl(g, W / 2 - 0.04, W / 2 - 0.02, 0.03, M.gun(), 0, 0.015, 0, 18);
  },
  "lab-printer": (g, W, D, H) => {
    rbox(g, W, 0.62, D, 0.02, M.dark(), 0, 0.31, 0);
    // The printer: an enclosure with a glass door, a print bed and a part being printed.
    const y0 = 0.62;
    const enclosure = new THREE.Group();
    enclosure.position.y = y0;
    g.add(enclosure);
    carcass(enclosure, W - 0.04, H - y0, D - 0.04, M.white(), 0.02);
    box(g, W - 0.08, H - y0 - 0.1, 0.012, iglass("#cfe0e8", 0.25), 0, y0 + (H - y0) / 2, D / 2 - 0.025);
    box(g, W - 0.16, 0.012, D - 0.16, M.gun(), 0, y0 + 0.08, 0);
    rbox(g, 0.12, 0.08, 0.1, 0.02, ipaint("#e08a3c", 0.5), 0, y0 + 0.13, 0);
    torus(g, 0.08, 0.03, ipaint("#3f8fd0", 0.5), 0, H - 0.08, -D / 2 + 0.05);
    ilabel(g, "PARTS PRINTER", W * 0.8, 0, 0.5, D / 2 + 0.004, "#ffffff", null);
    footShadow(g, W, D);
  },

  // ---- Medical bay ----
  "medical-couch": (g, W, D, H) => {
    rbox(g, W, 0.12, D, 0.04, ifabric("#6b8fa8", 0.85), 0, H - 0.06, 0);
    const back = rbox(g, 0.6, 0.1, D - 0.04, 0.04, ifabric("#6b8fa8", 0.85), -W / 2 + 0.32, H + 0.2, 0);
    back.rotation.z = -0.55;
    box(g, W - 0.3, H - 0.16, D - 0.2, M.white(), 0, (H - 0.16) / 2, 0);
    rbox(g, 0.3, 0.07, 0.24, 0.03, ifabric("#e9ecef", 0.9), -W / 2 + 0.18, H + 0.42, 0);
    box(g, 0.012, 0.012, D, M.steel(), W / 2 - 0.1, H + 0.02, 0);
    footShadow(g, W, D);
  },
  "medical-cabinet": (g, W, D, H) => {
    carcass(g, W, H, D, M.white());
    box(g, W, 0.66, D - 0.02, M.white(), 0, 0.33, 0);
    box(g, W - 0.06, H * 0.55, 0.01, iglass("#dceaf0", 0.2), 0, H * 0.68, D / 2 + 0.006);
    for (let s = 0; s < 3; s++) {
      box(g, W - 0.08, 0.012, D - 0.08, M.grey(), 0, H * 0.45 + s * 0.3, 0.01);
      for (let i = 0; i < 4; i++) rbox(g, 0.07, 0.12, 0.08, 0.01, ipaint(["#e9ecef", "#7fb2d8", "#e3a33c", "#d86a4b"][(i + s) % 4], 0.6), -W / 2 + 0.1 + i * 0.09, H * 0.45 + s * 0.3 + 0.07, 0.02);
    }
    for (let i = 0; i < 2; i++) box(g, W - 0.06, 0.32, 0.012, M.off(), 0, 0.2 + i * 0.36, D / 2 + 0.006);
    // The first-aid sign (a white cross on green, the standard safety sign).
    box(g, 0.2, 0.2, 0.008, ipaint("#1f8a4c", 0.5), 0, H - 0.18, D / 2 + 0.01);
    box(g, 0.13, 0.04, 0.01, M.white(), 0, H - 0.18, D / 2 + 0.014);
    box(g, 0.04, 0.13, 0.01, M.white(), 0, H - 0.18, D / 2 + 0.014);
    ilabel(g, "MEDICAL", W * 0.9, 0, H - 0.36, D / 2 + 0.012, "#1d222b");
    footShadow(g, W, D);
  },

  // ---- Storm shelter ----
  "shelter-seat": (g, W, D) => {
    rbox(g, W, 0.07, D - 0.04, 0.03, ifabric("#c0512f", 0.85), 0, 0.42, 0.02);
    rbox(g, W, 0.5, 0.06, 0.03, ifabric("#c0512f", 0.85), 0, 0.72, -D / 2 + 0.03);
    box(g, W - 0.1, 0.38, 0.04, M.gun(), 0, 0.2, -D / 2 + 0.08);
    for (const x of [-0.12, 0.12]) box(g, 0.04, 0.5, 0.012, ifabric("#2b3038", 0.8), x, 0.72, -D / 2 + 0.065);
    footShadow(g, W, D, 0, 0, 0.35);
  },
  "shelter-locker": (g, W, D, H) => {
    rbox(g, W, H, D, 0.02, ipaint("#e1a13a", 0.5), 0, H / 2, 0);
    box(g, 0.012, H - 0.1, 0.012, M.dark(), 0, H / 2, D / 2 + 0.003);
    for (const x of [-0.04, 0.04]) box(g, 0.02, 0.18, 0.03, M.steel(), x, H * 0.55, D / 2 + 0.01);
    ilabel(g, "EMERGENCY", W * 0.9, 0, H - 0.18, D / 2 + 0.006, "#1d222b", null);
    ilabel(g, "WATER · FOOD · MEDS", W * 0.9, 0, H - 0.3, D / 2 + 0.006, "#1d222b", null);
    footShadow(g, W, D);
  },

  // ---- Crew quarters ----
  bunk: (g, W, D, H, k) => {
    const [crew] = QUARTERS[k.room] ?? ["maya", ""];
    // A bed with storage drawers under it, a blanket in the crew member's colour, a reading light.
    rbox(g, W, H - 0.2, D, 0.02, M.off(), 0, (H - 0.2) / 2, 0);
    for (const x of [-W / 4, W / 4]) box(g, W / 2 - 0.08, 0.2, 0.012, M.white(), x, 0.18, D / 2 + 0.003);
    rbox(g, W - 0.04, 0.16, D - 0.04, 0.05, ifabric("#e8e6e0", 0.9), 0, H - 0.12, 0);
    rbox(g, W * 0.62, 0.05, D - 0.02, 0.03, ifabric(CREW_COLOR[crew], 0.9), W * 0.17, H - 0.02, 0);
    rbox(g, 0.42, 0.1, D - 0.3, 0.04, ifabric("#f2f1ec", 0.9), -W / 2 + 0.28, H - 0.0, 0);
    // The reading light on a stem at the head of the bed.
    strut(g, -W / 2 + 0.06, H - 0.05, -D / 2 + 0.08, -W / 2 + 0.06, H + 0.62, -D / 2 + 0.08, 0.012, M.steel(), 8);
    strut(g, -W / 2 + 0.06, H + 0.62, -D / 2 + 0.08, -W / 2 + 0.2, H + 0.66, -D / 2 + 0.14, 0.012, M.steel(), 8);
    const lamp = box(g, 0.14, 0.05, 0.1, M.white(), -W / 2 + 0.24, H + 0.64, -D / 2 + 0.16);
    lamp.rotation.x = 0.35;
    footShadow(g, W, D);
  },
  desk: (g, W, D, H, k) => {
    const [crew, name] = QUARTERS[k.room] ?? ["maya", ""];
    rbox(g, W, 0.035, D, 0.01, ipaint("#cbb89a", 0.55), 0, H - 0.018, 0);
    box(g, W - 0.04, H - 0.04, 0.03, M.white(), 0, (H - 0.04) / 2, -D / 2 + 0.02);
    box(g, 0.03, H - 0.04, D - 0.04, M.white(), -W / 2 + 0.02, (H - 0.04) / 2, 0);
    // A tablet, a photo from home, a mug, a little plant.
    box(g, 0.24, 0.012, 0.17, M.black(), 0.02, H + 0.006, 0.02);
    const photo = rbox(g, 0.12, 0.15, 0.015, 0.005, M.white(), -0.12, H + 0.09, -D / 2 + 0.08);
    photo.rotation.x = -0.2;
    cyl(g, 0.035, 0.03, 0.09, ipaint(CREW_COLOR[crew], 0.4), 0.22, H + 0.045, -0.1, 12);
    cyl(g, 0.04, 0.035, 0.07, ipaint("#b56a45", 0.8), -0.25, H + 0.035, 0.15, 12);
    ball(g, 0.06, ipaint("#4f9a4a", 0.8), -0.25, H + 0.1, 0.15, 10);
    // A shelf above with books.
    box(g, W - 0.06, 0.02, 0.2, M.white(), 0, H + 0.62, -D / 2 + 0.11);
    for (let i = 0; i < 5; i++) box(g, 0.035, 0.2 - (i % 2) * 0.03, 0.15, ipaint(["#9b4f4f", "#4f6f9b", "#c9a227", "#5f8f5f", "#7b5f9b"][i], 0.7), -W / 2 + 0.12 + i * 0.045, H + 0.73 - (i % 2) * 0.015, -D / 2 + 0.1);
    ilabel(g, name, 0.24, 0.12, H + 0.25, -D / 2 + 0.036, "#1d222b", null);
    footShadow(g, W, D, 0, 0, 0.3);
  },
  locker: (g, W, D, H) => {
    rbox(g, W, H, D, 0.02, ipaint("#bfc7d0", 0.5), 0, H / 2, 0);
    box(g, 0.012, H - 0.08, 0.012, M.dark(), 0, H / 2, D / 2 + 0.002);
    for (const x of [-0.05, 0.05]) box(g, 0.02, 0.2, 0.03, M.steel(), x, H * 0.52, D / 2 + 0.01);
    for (let i = 0; i < 3; i++) box(g, W * 0.3, 0.01, 0.006, M.dark(), -W / 4, H - 0.15 - i * 0.03, D / 2 + 0.003);
    footShadow(g, W, D);
  },

  // ---- Exercise ----
  "exercise-treadmill": (g, W, D, H) => {
    // A treadmill with a harness that pulls you down onto the belt (in 0.38 g you weigh too little to run well).
    box(g, W - 0.1, 0.16, D - 0.2, M.dark(), 0, 0.08, -0.02);
    box(g, W - 0.3, 0.012, D - 0.32, irubber("#1f2329"), 0, 0.166, -0.02);
    for (const x of [W / 2 - 0.12]) {
      box(g, 0.05, H - 0.1, 0.05, M.gun(), x, (H - 0.1) / 2, -D / 2 + 0.08);
      box(g, 0.05, H - 0.1, 0.05, M.gun(), x, (H - 0.1) / 2, D / 2 - 0.08);
    }
    box(g, 0.05, 0.05, D - 0.1, M.gun(), W / 2 - 0.12, H - 0.08, 0);
    rbox(g, 0.18, 0.28, D - 0.3, 0.02, M.white(), W / 2 - 0.12, H - 0.25, 0);
    box(g, 0.012, 0.16, 0.24, iplastic("#0f1318"), W / 2 - 0.215, H - 0.24, 0);
    for (const z of [-0.2, 0.2]) strut(g, W / 2 - 0.15, H - 0.12, z, 0, 1.15, z * 0.4, 0.012, irubber("#2b3038"), 6);
    rbox(g, 0.3, 0.16, 0.24, 0.05, ifabric("#3d4b5e", 0.85), 0, 1.1, 0);
    ilabel(g, "TREADMILL · HARNESS", 0.4, 0, 0.3, D / 2 - 0.09, "#ffffff", null);
    footShadow(g, W, D);
  },
  "exercise-cycle": (g, W, D) => {
    // The rider faces the window; the cycle stands radially (its length is the box's depth).
    box(g, 0.1, 0.06, D - 0.1, M.gun(), 0, 0.03, 0);
    strut(g, 0, 0.06, 0.25, 0, 0.62, 0.18, 0.03, M.gun(), 8);
    rbox(g, 0.26, 0.06, 0.32, 0.03, M.cushion(), 0, 0.66, 0.2);
    strut(g, 0, 0.06, -0.3, 0, 1.0, -0.38, 0.03, M.gun(), 8);
    box(g, 0.44, 0.03, 0.06, M.steel(), 0, 1.0, -0.38);
    cyl(g, 0.2, 0.2, 0.05, M.dark(), 0, 0.32, -0.12, 24).rotation.z = Math.PI / 2;
    box(g, 0.18, 0.12, 0.02, iplastic("#0f1318"), 0, 1.08, -0.42).rotation.x = -0.4;
    ilabel(g, "ERGOMETER", 0.24, 0, 0.18, -0.06, "#ffffff", null).rotation.y = Math.PI / 2;
    footShadow(g, W, D);
  },
  "exercise-frame": (g, W, D, H) => {
    // A resistance frame like the station's weight machine: vacuum cylinders instead of heavy weights.
    box(g, W, 0.08, D, M.dark(), 0, 0.04, 0);
    for (const x of [-W / 2 + 0.06, W / 2 - 0.06]) {
      box(g, 0.06, H - 0.1, 0.06, M.gun(), x, (H - 0.1) / 2 + 0.08, -D / 2 + 0.1);
      cyl(g, 0.07, 0.07, 0.8, M.steel(), x, 0.6, -D / 2 + 0.24, 16);
    }
    box(g, W, 0.06, 0.06, M.gun(), 0, H - 0.05, -D / 2 + 0.1);
    box(g, W * 0.9, 0.035, 0.035, M.steel(), 0, 1.45, 0.05);
    for (const x of [-0.42, 0.42]) cyl(g, 0.11, 0.11, 0.05, M.dark(), x, 1.45, 0.05, 20).rotation.z = Math.PI / 2;
    box(g, W - 0.2, 0.02, D * 0.5, irubber("#2a2e35"), 0, 0.09, 0.15);
    ilabel(g, "RESISTANCE", 0.3, 0, H - 0.2, -D / 2 + 0.135, "#1d222b");
    footShadow(g, W, D);
  },

  // ---- Garden ----
  "garden-rack": (g, W, D, H) => {
    // Four tiers of trays under grow lights, with hydroponic tubes: lettuce and dwarf tomatoes.
    const frame = M.steel();
    for (const x of [-W / 2 + 0.03, W / 2 - 0.03]) for (const z of [-D / 2 + 0.03, D / 2 - 0.03]) box(g, 0.035, H, 0.035, frame, x, H / 2, z);
    // One grow-light material for both racks (dimmed together when the power runs short).
    const grow = (living.growLights[0] ??= new THREE.MeshStandardMaterial({ color: "#ffd8f2", emissive: "#ff6fd2", emissiveIntensity: 1.6, roughness: 0.4, toneMapped: false }));
    const leaf = "#5fae4c",
      dark = "#3f8a3a",
      tomato = "#d8432f";
    for (let t = 0; t < 4; t++) {
      const y = 0.25 + t * ((H - 0.35) / 4);
      box(g, W - 0.08, 0.06, D - 0.1, M.white(), 0, y, 0);
      cyl(g, 0.025, 0.025, W - 0.1, ipaint("#f2f4f5", 0.4), 0, y + 0.02, -D / 2 + 0.09, 8).rotation.z = Math.PI / 2;
      box(g, W - 0.12, 0.012, 0.05, grow, 0, y + (H - 0.35) / 4 - 0.04, 0);
      for (let i = 0; i < 6; i++) {
        const x = -W / 2 + 0.1 + ((W - 0.2) * i) / 5;
        spot(g, spots.plants, (i + t) % 2 ? leaf : dark, x, y + 0.09, 0.02, 1.15, 0.75, 1);
        if (t % 2 === 1 && i % 2 === 0) spot(g, spots.tomatoes, tomato, x + 0.04, y + 0.13, 0.06);
      }
    }
    box(g, W - 0.04, 0.12, 0.02, M.white(), 0, H - 0.07, D / 2 - 0.01);
    ilabel(g, "FOOD WALL", W * 0.5, 0, H - 0.07, D / 2 + 0.001, "#2e6b2b", null);
    footShadow(g, W, D);
  },

  // ---- Command ----
  "command-desk": (g, W, D, H) => {
    rbox(g, W, 0.04, D, 0.015, ipaint("#4a5263", 0.5), 0, H - 0.02, 0);
    box(g, W - 0.06, H - 0.04, D - 0.12, M.dark(), 0, (H - 0.04) / 2, -0.04);
    box(g, W * 0.7, 0.02, 0.16, M.black(), 0, H + 0.01, 0.1);
    for (let i = 0; i < 8; i++) box(g, 0.04, 0.012, 0.03, iplastic(i % 3 === 0 ? "#f2b84b" : "#8fd3ff"), -W * 0.3 + i * 0.075, H + 0.026, 0.12);
  },
  "command-chair": (g, W, D) => {
    cyl(g, 0.03, 0.03, 0.42, M.steel(), 0, 0.21, 0, 10);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      strut(g, 0, 0.05, 0, Math.cos(a) * 0.22, 0.03, Math.sin(a) * 0.22, 0.015, M.gun(), 6);
    }
    rbox(g, W - 0.06, 0.08, D - 0.06, 0.03, M.cushion(), 0, 0.46, 0);
    rbox(g, W - 0.08, 0.5, 0.06, 0.03, M.cushion(), 0, 0.76, -D / 2 + 0.06);
    footShadow(g, W, D, 0, 0, 0.3);
  },
  "command-ladder": (g, W, _D, H) => {
    // Up to the cupola, through a hatch in the ceiling.
    for (const x of [-W / 2 + 0.06, W / 2 - 0.06]) box(g, 0.05, H, 0.05, M.steel(), x, H / 2, 0);
    for (let i = 1; i < 9; i++) cyl(g, 0.016, 0.016, W - 0.12, M.steel(), 0, i * 0.29, 0, 8).rotation.z = Math.PI / 2;
    torus(g, 0.42, 0.04, M.gun(), 0, H - 0.04, 0).rotation.x = Math.PI / 2;
    ilabel(g, "CUPOLA ↑", 0.28, 0, 1.9, 0.04, "#1d222b");
  },
};

/** Which builder makes a piece (several pieces share one: chairs, racks, quarters). */
const builderFor = (id: string): Build | undefined => {
  if (B[id]) return B[id];
  const base = id.replace(/-\d+$/, "").replace(/^q\d-/, "");
  if (id.startsWith("suit-rack")) return B["suit-rack"];
  if (id.startsWith("eclss-") && id !== "eclss-tanks") return B["eclss-rack"];
  if (id.startsWith("garden-rack")) return B["garden-rack"];
  return B[base];
};

/** Build a piece of furniture in its box; returns false if there's no model for it. */
export function buildPiece(piece: THREE.Group, k: Block) {
  const build = builderFor(k.id);
  if (!build) return false;
  // Turn so the piece's front faces where the plan says; a side-on piece swaps its width and depth.
  const front = new THREE.Group();
  front.rotation.y = ((k.face ?? 0) * Math.PI) / 180;
  piece.add(front);
  const side = Math.abs(k.face ?? 0) === 90;
  build(front, side ? k.d : k.w, side ? k.w : k.d, k.h, k);
  return true;
}

