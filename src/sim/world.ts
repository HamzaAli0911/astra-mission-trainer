import type { ModuleType, Planet } from "./types";

/**
 * Shared surface geography: the renderer, the rover and the simulation all read
 * from here, so the rover always drives on the ground the player sees.
 * Metres. North is −z, east is +x. The outpost is at the origin.
 */
export const WORLD = 150; // drivable half-width (a 300 m square)
export const FLAT = 27; // radius of the levelled outpost area

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

/**
 * Build pads: three rings around the habitat (the south is kept clear for the
 * rover's road), a pad on the edge of the icy crater and a far pad for a reactor.
 * A pad's id is its index.
 */
export const PADS: Pad[] = [
  ...ring(8.5, [30, 90, 150, 210, 270, 330], 0),
  ...ring(15, [0, 60, 120, 240, 300], 6),
  ...ring(21.5, [35, 95, 265, 325], 11),
  { id: 15, x: -45.5, z: -30.5, kind: "ice" },
  { id: 16, x: 36, z: 27, kind: "far" },
];

/** Which pad kinds a module may use. */
export function padFits(type: ModuleType, kind: PadKind) {
  if (type === "icedrill") return kind === "ice";
  if (type === "reactor") return kind === "far";
  return kind === "base";
}

/** The big crater whose floor never sees the Sun: the ice is down there. */
export const CRATER = { x: -72, z: -48, r: 28, depth: 9 };

export interface Crater {
  x: number;
  z: number;
  r: number;
  depth: number;
}

/** A fixed lander that brought the crew: scenery, and the rover drives around it. */
export const LANDER = { x: -16, z: 27, r: 4.2 };

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
    x: 78,
    z: -42,
    name: { moon: "Boulder Field", mars: "Rock Garden" },
    fact: {
      moon: "Regolith is the loose rock and dust covering the Moon. Builders can pile it up, sinter it or 3D-print it into parts.",
      mars: "Martian soil contains iron and silicon. Future crews could turn it into bricks and building parts.",
    },
  },
  {
    id: "layers",
    kind: "science",
    x: -26,
    z: -112,
    name: { moon: "Crater Wall Layers", mars: "Layered Mesa" },
    fact: {
      moon: "Each layer in a crater wall was laid down by a different impact or lava flow, like pages in a history book.",
      mars: "These layers formed in water long ago. Rovers like Curiosity read them to learn whether Mars was once habitable.",
    },
  },
  {
    id: "boulder",
    kind: "science",
    x: 104,
    z: 60,
    name: { moon: "Rolling Boulder", mars: "Blueberry Patch" },
    fact: {
      moon: "This boulder rolled downhill and left a track behind it. Moonquakes and impacts can set rocks in motion.",
      mars: "These little round pebbles are hematite 'blueberries'. The Opportunity rover found that they formed in water.",
    },
  },
  {
    id: "ray",
    kind: "science",
    x: -98,
    z: 68,
    name: { moon: "Bright Ray", mars: "Dust Devil Tracks" },
    fact: {
      moon: "Bright rays are fresh rock blasted out by an impact. Sunlight and space weather slowly darken them over time.",
      mars: "Dust devils sweep dark tracks across Mars. They have even cleaned the dusty solar panels of rovers!",
    },
  },
  {
    id: "skylight",
    kind: "science",
    x: 38,
    z: 116,
    name: { moon: "Lava Tube Skylight", mars: "Dune Field" },
    fact: {
      moon: "This pit is a skylight into an old lava tube. Tubes like this could one day shelter astronauts from radiation and wild temperature swings.",
      mars: "Martian dunes creep across the ground, pushed by thin but steady winds. Rovers steer around soft sand so they don't get stuck.",
    },
  },
  {
    id: "far",
    kind: "science",
    x: 126,
    z: -118,
    name: { moon: "Earthrise Ridge", mars: "Ancient Riverbed" },
    fact: {
      moon: "From high ridges near the south pole, Earth hangs low on the horizon. Seeing Earth matters: it means direct radio contact with Mission Control.",
      mars: "The rounded pebbles here were tumbled by flowing water billions of years ago. Curiosity found pebbles like these in Gale Crater.",
    },
  },
];
export const site = (id: string) => SITES.find((s) => s.id === id);
export const SITE_REACH = 4.5;

/** What one rover trip collects. */
export const HAUL = {
  ice: { water: 45 },
  regolith: { materials: 30 },
  science: { science: 15 },
};
/** Training hours of work at a site. */
export const COLLECT_TIME = 1;

/** Footprint radius of a module for collisions and spacing. */
export const FOOTPRINT: Record<ModuleType, number> = {
  habitat: HABITAT_RADIUS,
  solar: 1.8,
  battery: 1.5,
  oxygen: 1.7,
  recycler: 1.5,
  greenhouse: 2.4,
  icedrill: 1.8,
  shelter: 2.1,
  lab: 1.9,
  reactor: 2.2,
};

/* ---------- Terrain ---------- */

const smooth = (a: number, b: number, v: number) => {
  const x = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return x * x * (3 - 2 * x);
};
function hash(x: number, y: number) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
/** Smooth value noise in [0, 1]. */
export function noise(x: number, y: number) {
  const xi = Math.floor(x),
    yi = Math.floor(y),
    xf = x - xi,
    yf = y - yi;
  const u = xf * xf * (3 - 2 * xf),
    v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi),
    b = hash(xi + 1, yi),
    c = hash(xi, yi + 1),
    d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Scattered smaller craters (deterministic), kept away from the outpost, the sites and the roads. */
export const CRATERS: Crater[] = (() => {
  const out: Crater[] = [CRATER];
  let seed = 9173;
  const rand = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  for (let i = 0; out.length < 26 && i < 600; i++) {
    const x = (rand() * 2 - 1) * (WORLD - 8),
      z = (rand() * 2 - 1) * (WORLD - 8);
    const r = 3 + rand() ** 2 * 11;
    if (Math.hypot(x, z) < FLAT + r + 12) continue;
    if (SITES.some((s) => Math.hypot(s.x - x, s.z - z) < r + 9)) continue;
    if (out.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + r + 4)) continue;
    if (Math.hypot(x - LANDER.x, z - LANDER.z) < r + 10) continue;
    out.push({ x, z, r, depth: r * (0.18 + rand() * 0.12) });
  }
  return out;
})();

function crater(y: number, x: number, z: number, c: Crater) {
  const d = Math.hypot(x - c.x, z - c.z) / c.r;
  if (d >= 2.2) return y;
  const rim = c.depth * 0.32;
  if (d < 1) {
    // Bowl with a slightly flat floor, rising to the rim crest.
    const bowl = -c.depth * (1 - d * d) ** 1.15;
    return y * (0.35 + 0.65 * d) + bowl + rim * d ** 6;
  }
  return y + rim * Math.exp(-(((d - 1) / 0.38) ** 2));
}

/** Ground height in metres: flat at the outpost, rolling plains, craters, and mountains at the map edge. */
export function terrainHeight(x: number, z: number, planet: Planet = "moon") {
  const mars = planet === "mars";
  const p = mars ? 7.3 : 0;
  // Broad swells plus finer bumps.
  let y =
    (noise(x * 0.012 + p, z * 0.012) - 0.5) * 9 +
    (noise(x * 0.035 + 3 + p, z * 0.035 - 2) - 0.5) * 3.2 +
    (noise(x * 0.11 - p, z * 0.11 + 5) - 0.5) * 0.7;
  if (mars) {
    // Dunes to the north-east, a layered mesa to the south.
    const dunes = smooth(70, 30, Math.hypot(x - 40, z - 112));
    y += dunes * (Math.sin(x * 0.32 + z * 0.12) * 0.75 + Math.sin(x * 0.11 - z * 0.05) * 0.5);
    const mesa = smooth(30, 22, Math.hypot((x + 30) * 0.8, z + 132));
    y += mesa * 7 + (mesa > 0.05 && mesa < 0.95 ? Math.sin(mesa * 18) * 0.25 : 0);
  }
  const r = Math.hypot(x, z);
  y *= smooth(FLAT - 6, FLAT + 16, r);
  // Level ground under the lander.
  y *= smooth(5, 13, Math.hypot(x - LANDER.x, z - LANDER.z));
  for (const c of CRATERS) y = crater(y, x, z, c);
  // Skylight pit (Moon): a small steep hole beside the site.
  if (!mars) {
    const s = Math.hypot(x - 44, z - 121);
    if (s < 6) y -= 5 * (1 - (s / 6) ** 2);
  }
  // Mountains rise past the edge of the drivable area (a rounded square, with a wandering foot).
  const ax = Math.abs(x) / WORLD,
    az = Math.abs(z) / WORLD;
  const edge = WORLD * (ax ** 8 + az ** 8) ** 0.125 + (noise(x * 0.03 + 11, z * 0.03 - 7) - 0.5) * 14;
  if (edge > WORLD - 6) {
    const k = edge - (WORLD - 6);
    y += Math.min(32, k ** 1.4 * 0.45) * (0.6 + 0.4 * noise(x * 0.02 + p, z * 0.02));
  }
  return y;
}

/** Inside the permanently shadowed crater floor: cold and dark. */
export const inShadow = (x: number, z: number) =>
  Math.hypot(x - CRATER.x, z - CRATER.z) < CRATER.r * 0.85;

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
  const rand = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  const clear = (x: number, z: number, r: number) =>
    SITES.every((s) => Math.hypot(s.x - x, s.z - z) > r + 7) &&
    PADS.every((s) => Math.hypot(s.x - x, s.z - z) > r + 4) &&
    Math.hypot(x - LANDER.x, z - LANDER.z) > r + 6 &&
    Math.hypot(x - CRATER.x, z - CRATER.z) > CRATER.r * 0.55;
  for (let i = 0; rocks.length < 460 && i < 8000; i++) {
    const x = (rand() * 2 - 1) * (WORLD + 30),
      z = (rand() * 2 - 1) * (WORLD + 30);
    if (Math.hypot(x, z) < FLAT + 4) continue;
    // Keep the rover's road south of the dock clear.
    if (Math.abs(x) < 6 && z > 10 && z < 40) continue;
    const r = 0.25 + rand() ** 2.6 * 2.6;
    if (!clear(x, z, r)) continue;
    rocks.push({ x, z, r, solid: r > 0.8 });
  }
  // A cluster of boulders makes the regolith field look like one.
  const field = SITES[1];
  for (let i = 0; i < 26; i++) {
    const a = i * 2.39,
      d = 7 + (i % 5) * 2.2;
    rocks.push({ x: field.x + Math.cos(a) * d, z: field.z + Math.sin(a) * d, r: 0.5 + (i % 4) * 0.45, solid: i % 3 === 2 });
  }
  // The famous rolling boulder, and its friends.
  const b = SITES[3];
  rocks.push({ x: b.x + 6.5, z: b.z - 3, r: 3.2, solid: true });
  return rocks;
})();

/** Solid rocks in 8 m buckets, so collision checks stay fast on the big map. */
const BUCKET = 8;
const buckets = new Map<string, Rock[]>();
for (const k of ROCKS) {
  if (!k.solid) continue;
  const reach = k.r + 1.5;
  for (let bx = Math.floor((k.x - reach) / BUCKET); bx <= Math.floor((k.x + reach) / BUCKET); bx++)
    for (let bz = Math.floor((k.z - reach) / BUCKET); bz <= Math.floor((k.z + reach) / BUCKET); bz++) {
      const key = `${bx},${bz}`;
      const list = buckets.get(key);
      if (list) list.push(k);
      else buckets.set(key, [k]);
    }
}
export const rocksNear = (x: number, z: number) => buckets.get(`${Math.floor(x / BUCKET)},${Math.floor(z / BUCKET)}`) ?? [];
