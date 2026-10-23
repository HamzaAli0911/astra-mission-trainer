import type { ModuleType, Planet } from "./types";

/**
 * Shared surface geography: the renderer, the rover and the simulation all read
 * from here, so the rover always drives on the ground the player sees.
 * Metres. North is −z, east is +x. The outpost is at the origin.
 */
export const WORLD = 66; // drivable half-width
export const FLAT = 22; // radius of the levelled outpost area

export const DOCK = { x: 0, z: 12 };
export const DOCK_RADIUS = 2.6;
export const HABITAT_RADIUS = 3.4;

export type PadKind = "base" | "ice" | "far";
export interface Pad {
  id: number;
  x: number;
  z: number;
  kind: PadKind;
}

const ring = (r: number, degrees: number[], from: number): Pad[] =>
  degrees.map((d, i) => ({
    id: from + i,
    x: +(Math.sin((d * Math.PI) / 180) * r).toFixed(2),
    z: +(-Math.cos((d * Math.PI) / 180) * r).toFixed(2),
    kind: "base" as const,
  }));

/** Build pads: an inner ring, an outer ring (the south is kept clear for the rover), a pad on the ice and one far pad for a reactor. */
export const PADS: Pad[] = [
  ...ring(8.5, [30, 90, 150, 210, 270, 330], 0),
  ...ring(15, [0, 60, 120, 240, 300], 6),
  { id: 11, x: -23.6, z: -12.6, kind: "ice" },
  { id: 12, x: 27, z: 21, kind: "far" },
];

/** Which pad kinds a module may use. */
export function padFits(type: ModuleType, kind: PadKind) {
  if (type === "icedrill") return kind === "ice";
  if (type === "reactor") return kind === "far";
  return kind === "base";
}

export const CRATER = { x: -36, z: -22, r: 13, depth: 4.2 };

export type SiteKind = "ice" | "regolith" | "science";
export interface Site {
  id: string;
  kind: SiteKind;
  x: number;
  z: number;
  name: Record<Planet, string>;
  /** What the crew learns at a science site. */
  fact: Record<Planet, string>;
}

export const SITES: Site[] = [
  {
    id: "ice",
    kind: "ice",
    x: CRATER.x,
    z: CRATER.z,
    name: { moon: "Shadow Crater", mars: "Ice Crater" },
    fact: {
      moon: "This crater floor never sees sunlight. At about −230 °C, water ice has stayed frozen here for billions of years.",
      mars: "Ice hides just under the dust here. Scientists have spotted buried ice like this across Mars from orbit.",
    },
  },
  {
    id: "regolith",
    kind: "regolith",
    x: 34,
    z: -20,
    name: { moon: "Boulder Field", mars: "Rock Garden" },
    fact: {
      moon: "Regolith is the loose rock and dust covering the Moon. Builders can pile it up, sinter it or 3D-print it into parts.",
      mars: "Martian soil contains iron and silicon. Future crews could turn it into bricks and building parts.",
    },
  },
  {
    id: "layers",
    kind: "science",
    x: -8,
    z: -47,
    name: { moon: "Crater Wall Layers", mars: "Layered Rocks" },
    fact: {
      moon: "Each layer in a crater wall was laid down by a different impact or lava flow, like pages in a history book.",
      mars: "These layers formed in water long ago. Rovers like Curiosity read them to learn whether Mars was once habitable.",
    },
  },
  {
    id: "boulder",
    kind: "science",
    x: 45,
    z: 24,
    name: { moon: "Rolling Boulder", mars: "Blueberry Patch" },
    fact: {
      moon: "This boulder rolled downhill and left a track behind it. Moonquakes and impacts can set rocks in motion.",
      mars: "These little round pebbles are hematite 'blueberries'. The Opportunity rover found that they formed in water.",
    },
  },
  {
    id: "ray",
    kind: "science",
    x: -42,
    z: 33,
    name: { moon: "Bright Ray", mars: "Dust Devil Tracks" },
    fact: {
      moon: "Bright rays are fresh rock blasted out by an impact. Sunlight and space weather slowly darken them over time.",
      mars: "Dust devils sweep dark tracks across Mars. They have even cleaned the dusty solar panels of rovers!",
    },
  },
];
export const site = (id: string) => SITES.find((s) => s.id === id);
export const SITE_REACH = 4.5;

/** What one rover trip collects. */
export const HAUL = {
  ice: { water: 40 },
  regolith: { materials: 30 },
  science: { science: 15 },
};
/** Training hours of work at a site. */
export const COLLECT_TIME = 1;

/** Footprint radius of a module for collisions and spacing. */
export const FOOTPRINT: Record<ModuleType, number> = {
  habitat: HABITAT_RADIUS,
  solar: 1.7,
  battery: 1.3,
  oxygen: 1.5,
  recycler: 1.4,
  greenhouse: 2.2,
  icedrill: 1.6,
  shelter: 1.9,
  lab: 1.8,
  reactor: 2,
};

const smooth = (a: number, b: number, v: number) => {
  const x = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return x * x * (3 - 2 * x);
};

/** Ground height in metres: flat at the outpost, rolling hills, a deep crater and walls at the map edge. */
export function terrainHeight(x: number, z: number, planet: Planet = "moon") {
  const p = planet === "mars" ? 1.9 : 0;
  let y =
    (Math.sin(x * 0.11 + p) * Math.cos(z * 0.09) +
      Math.sin(z * 0.19 + x * 0.06 + p) * 0.5 +
      Math.sin(x * 0.33) * Math.sin(z * 0.27) * 0.2) *
    (planet === "mars" ? 1.3 : 1.05);
  const r = Math.hypot(x, z);
  y *= smooth(FLAT - 4, FLAT + 10, r);
  const c = Math.hypot(x - CRATER.x, z - CRATER.z) / CRATER.r;
  if (c < 1) y = y * c * c - CRATER.depth * (1 - c * c) + 1.1 * c ** 6;
  else if (c < 2) y += 1.1 * Math.exp(-(((c - 1) / 0.32) ** 2));
  const edge = Math.max(Math.abs(x), Math.abs(z));
  if (edge > WORLD - 4)
    y +=
      Math.min(24, (edge - (WORLD - 4)) ** 1.5 * 0.42) *
      (0.75 + 0.25 * Math.sin(x * 0.05 + z * 0.07 + p));
  return y;
}

/** Inside the permanently shadowed crater floor: cold and dark. */
export const inShadow = (x: number, z: number) =>
  Math.hypot(x - CRATER.x, z - CRATER.z) < CRATER.r * 0.82;

export interface Rock {
  x: number;
  z: number;
  r: number;
  solid: boolean;
}

/** Deterministic boulders. Big rocks block the rover; pebbles are scenery. */
export const ROCKS: Rock[] = (() => {
  const rocks: Rock[] = [];
  let seed = 4111;
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const clear = (x: number, z: number, r: number) =>
    SITES.every((s) => Math.hypot(s.x - x, s.z - z) > r + 6) &&
    PADS.every((s) => Math.hypot(s.x - x, s.z - z) > r + 4) &&
    Math.hypot(x - CRATER.x, z - CRATER.z) > CRATER.r * 0.5;
  for (let i = 0; rocks.length < 130 && i < 3000; i++) {
    const x = (rand() * 2 - 1) * (WORLD + 20),
      z = (rand() * 2 - 1) * (WORLD + 20);
    if (Math.hypot(x, z) < FLAT + 3) continue;
    // Keep a clear lane from the dock to each site so autopilot routes stay simple.
    const r = 0.25 + rand() ** 2.4 * 2.1;
    if (!clear(x, z, r)) continue;
    rocks.push({ x, z, r, solid: r > 0.75 });
  }
  // A cluster of boulders makes the regolith field look like one.
  const field = SITES[1];
  for (let i = 0; i < 14; i++) {
    const a = i * 2.4,
      d = 6 + (i % 4) * 1.6;
    rocks.push({
      x: field.x + Math.cos(a) * d,
      z: field.z + Math.sin(a) * d,
      r: 0.5 + (i % 3) * 0.35,
      solid: i % 3 === 2,
    });
  }
  return rocks;
})();
