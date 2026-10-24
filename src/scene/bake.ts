import * as THREE from "three";
import type { Planet } from "../sim/types";
import { CRATER, cratersNear, FLAT, LANDER, noise, SITES, terrainHeight, WORLD } from "../sim/world";
import { rng } from "./kit";

/**
 * The slow, pure part of building a planet: ground and hill meshes, the
 * ground's detail textures, Earth's surface and the minimap relief. It runs in
 * a web worker (see prebake.ts) while the player reads the title screen, and
 * only returns plain arrays.
 */

const smooth = (a: number, b: number, v: number) => {
  const x = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return x * x * (3 - 2 * x);
};
const fbm = (x: number, y: number) => noise(x, y) * 0.5 + noise(x * 2.1, y * 2.1) * 0.27 + noise(x * 4.3, y * 4.3) * 0.15 + noise(x * 8.7, y * 8.7) * 0.08;

/** Where the detailed ground ends and the distant hills begin. */
export const HORIZON = WORLD + 85;
/** Metres from the centre to the edge of the minimap. */
export const MAP_SPAN = WORLD + 10;
export const RELIEF_SIZE = 200;
export const DETAIL_SIZE = 512;

export const PALETTE = {
  moon: { ground: "#9d9ea3", dark: "#55585f", light: "#c6c6c8", crater: "#2f3440", rim: "#d3d3d4", rock: "#80828a", track: "#3c3e44" },
  mars: { ground: "#b46b45", dark: "#6b3322", light: "#d69a6a", crater: "#5d3a33", rim: "#d8a275", rock: "#8a4c35", track: "#5a2c1c" },
};

export interface MeshArrays {
  position: Float32Array;
  normal: Float32Array;
  color: Float32Array;
  uv?: Float32Array;
  index: Uint32Array;
}

/** The playable ground, coloured by geology. */
function terrainArrays(planet: Planet): MeshArrays {
  const size = HORIZON * 2,
    seg = 340;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  // The ground is round: past the horizon radius it sinks under the distant hills.
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i),
      z = pos.getZ(i);
    pos.setY(i, terrainHeight(x, z, planet) - 40 * smooth(HORIZON - 1, HORIZON + 2, Math.hypot(x, z)));
  }
  geo.computeVertexNormals();
  const nrm = geo.attributes.normal;
  const P = PALETTE[planet];
  const base = new THREE.Color(P.ground),
    dark = new THREE.Color(P.dark),
    bright = new THREE.Color(P.light),
    crater = new THREE.Color(P.crater),
    rim = new THREE.Color(P.rim),
    c = new THREE.Color(),
    tmp = new THREE.Color();
  const colors = new Float32Array(pos.count * 3);
  const ray = SITES.find((s) => s.id === "ray")!;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i),
      z = pos.getZ(i),
      y = pos.getY(i);
    const n = fbm(x * 0.03 + 10, z * 0.03 - 4);
    c.copy(base).lerp(n > 0.5 ? bright : dark, Math.abs(n - 0.5) * (planet === "mars" ? 1.2 : 1));
    // Steep ground shows darker, fresher rock.
    const slope = 1 - nrm.getY(i);
    c.lerp(dark, Math.min(0.55, slope * 2.2));
    // The outpost area is trampled and a little brighter.
    const r = Math.hypot(x, z);
    c.lerp(bright, (1 - smooth(FLAT - 10, FLAT + 4, r)) * 0.22);
    for (const k of cratersNear(x, z)) {
      const d = Math.hypot(x - k.x, z - k.z) / k.r;
      if (d < 0.95) c.lerp(crater, (1 - smooth(0.5, 0.95, d)) * (k === CRATER ? 0.9 : 0.35));
      else if (d < 1.35) c.lerp(rim, Math.exp(-(((d - 1.05) / 0.15) ** 2)) * 0.35);
    }
    if (planet === "moon") {
      // Bright rays of fresh ejecta around the Bright Ray site.
      const dx = x - ray.x,
        dz = z - ray.z,
        d = Math.hypot(dx, dz);
      if (d < 46) {
        const a = Math.atan2(dz, dx);
        const rays = Math.max(0, Math.sin(a * 9 + Math.sin(a * 3) * 1.5)) ** 3;
        c.lerp(tmp.set("#e6e6e8"), rays * (1 - d / 46) * 0.75 + (d < 7 ? 0.5 : 0));
      }
    } else {
      // Dark dust devil tracks, and banded layers on the mesa.
      const dd = Math.hypot(x - ray.x, z - ray.z);
      if (dd < 50) {
        const streak = Math.abs(Math.sin(x * 0.09 + Math.sin(z * 0.05) * 3 + z * 0.02));
        if (streak < 0.12) c.lerp(dark, (1 - streak / 0.12) * (1 - dd / 50) * 0.7);
      }
      if (y > 1.5 && Math.hypot((x + 30) * 0.8, z + 132) < 32) c.lerp(tmp.set(Math.sin(y * 3.1) > 0 ? "#c98a62" : "#8a4a33"), 0.5);
      c.lerp(tmp.set("#c4805a"), smooth(70, 25, Math.hypot(x - 40, z - 112)) * 0.4);
    }
    // Around the lander: a blast-scoured patch.
    const ld = Math.hypot(x - LANDER.x, z - LANDER.z);
    if (ld < 14) c.lerp(planet === "moon" ? bright : tmp.set("#c48a62"), (1 - ld / 14) * 0.35);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  return {
    position: pos.array as Float32Array,
    normal: nrm.array as Float32Array,
    color: colors,
    uv: geo.attributes.uv.array as Float32Array,
    index: Uint32Array.from(geo.index!.array),
  };
}

/** Distant hills and mountains all around, beyond the drivable area. */
function horizonArrays(planet: Planet): MeshArrays {
  const inner = HORIZON - 3,
    outer = 1500,
    radial = 384,
    rings = 40;
  const positions: number[] = [],
    colors: number[] = [],
    index: number[] = [];
  const P = PALETTE[planet];
  const near = new THREE.Color(P.ground),
    far = new THREE.Color(planet === "moon" ? "#8d8e93" : "#b0704c"),
    c = new THREE.Color();
  const rise = planet === "moon" ? 42 : 36;
  for (let j = 0; j <= rings; j++) {
    const t = j / rings,
      rad = inner + (outer - inner) * t ** 1.6;
    for (let i = 0; i < radial; i++) {
      const a = (i / radial) * Math.PI * 2;
      const x = Math.cos(a) * rad,
        z = Math.sin(a) * rad;
      const n = noise(x * 0.005 + 50, z * 0.005 + 50) * 0.62 + noise(x * 0.014, z * 0.014) * 0.3 + noise(x * 0.035, z * 0.035) * 0.08;
      const peaks = n ** 2.2 * rise * 2.2;
      const envelope = smooth(0, 0.3, t) * (1 - smooth(0.55, 1, t) * 0.5);
      const y = terrainHeight(x, z, planet) + peaks * envelope - smooth(0.88, 1, t) * 120 - (j === 0 ? 0.4 : 0);
      positions.push(x, y, z);
      c.copy(near).lerp(far, Math.min(1, t * 1.5)).multiplyScalar(0.85 + n * 0.3);
      colors.push(c.r, c.g, c.b);
    }
  }
  for (let j = 0; j < rings; j++)
    for (let i = 0; i < radial; i++) {
      const a = j * radial + i,
        b = j * radial + ((i + 1) % radial),
        d = (j + 1) * radial + i,
        e = (j + 1) * radial + ((i + 1) % radial);
      index.push(a, d, b, b, d, e);
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(index);
  geo.computeVertexNormals();
  return {
    position: geo.attributes.position.array as Float32Array,
    normal: geo.attributes.normal.array as Float32Array,
    color: new Float32Array(colors),
    index: Uint32Array.from(index),
  };
}

/** Tileable detail: small craters, grit and pebbles, as colour and normal pixels. */
function detailPixels(planet: Planet) {
  const N = DETAIL_SIZE;
  const h = new Float32Array(N * N);
  const r = rng(planet === "moon" ? 11 : 29);
  const tile = (x: number, y: number) => ((y + N) % N) * N + ((x + N) % N);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      // Periodic noise so the texture tiles without seams.
      const u = (x / N) * Math.PI * 2,
        v = (y / N) * Math.PI * 2;
      const nx = Math.cos(u) * 4 + 10,
        ny = Math.sin(u) * 4 + 10,
        nz = Math.cos(v) * 4 + 20,
        nw = Math.sin(v) * 4 + 20;
      h[y * N + x] = noise(nx + nz, ny + nw) * 0.5 + noise((nx - nw) * 2.3, (ny + nz) * 2.3) * 0.3 + r() * 0.12;
    }
  // Craterlets: a bowl with a raised rim.
  for (let i = 0; i < 70; i++) {
    const cx = r() * N,
      cy = r() * N,
      rad = 2 + r() ** 4 * 40;
    const R = Math.ceil(rad * 1.6);
    for (let dy = -R; dy <= R; dy++)
      for (let dx = -R; dx <= R; dx++) {
        const d = Math.hypot(dx, dy) / rad;
        if (d > 1.6) continue;
        const k = tile(Math.round(cx + dx), Math.round(cy + dy));
        h[k] += d < 1 ? -(1 - d * d) * 0.35 * (rad / 40 + 0.25) : Math.exp(-(((d - 1) / 0.25) ** 2)) * 0.15 * (rad / 40 + 0.25);
      }
  }
  // Pebbles: tiny bumps.
  for (let i = 0; i < 2600; i++) {
    const cx = Math.floor(r() * N),
      cy = Math.floor(r() * N),
      rad = 1 + r() * 2.2;
    for (let dy = -3; dy <= 3; dy++)
      for (let dx = -3; dx <= 3; dx++) {
        const d = Math.hypot(dx, dy) / rad;
        if (d < 1) h[tile(cx + dx, cy + dy)] += (1 - d * d) * 0.25;
      }
  }
  const color = new Uint8ClampedArray(N * N * 4),
    normal = new Uint8ClampedArray(N * N * 4);
  const strength = 2.4;
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      const dx = (h[tile(x + 1, y)] - h[tile(x - 1, y)]) * strength,
        dy = (h[tile(x, y + 1)] - h[tile(x, y - 1)]) * strength;
      const len = Math.hypot(dx, dy, 1);
      normal[i * 4] = ((-dx / len) * 0.5 + 0.5) * 255;
      normal[i * 4 + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      normal[i * 4 + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      normal[i * 4 + 3] = 255;
      const v = 205 + (h[i] - 0.5) * 50 + (r() - 0.5) * 14;
      color[i * 4] = color[i * 4 + 1] = color[i * 4 + 2] = Math.max(120, Math.min(255, v));
      color[i * 4 + 3] = 255;
    }
  return { color, normal };
}

/** A small procedural Earth: oceans, continents, ice caps and clouds (512 × 256 pixels). */
function earthPixels() {
  const W = 512,
    H = 256;
  const out = new Uint8ClampedArray(W * H * 4);
  const land = new THREE.Color(),
    sea = new THREE.Color("#163f7a"),
    deep = new THREE.Color("#0c2650"),
    green = new THREE.Color("#3d7a3a"),
    desert = new THREE.Color("#b49a64"),
    ice = new THREE.Color("#f2f6fb");
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const lon = (x / W) * Math.PI * 2,
        lat = (y / H - 0.5) * Math.PI;
      const px = Math.cos(lat) * Math.cos(lon),
        py = Math.sin(lat),
        pz = Math.cos(lat) * Math.sin(lon);
      const n = noise(px * 2.2 + 5, pz * 2.2 + py * 1.3) * 0.55 + noise(py * 4 + px * 3, pz * 4 - 2) * 0.3 + noise(px * 9, py * 9 + pz * 7) * 0.15;
      const cloud = noise(px * 5 + pz * 2, py * 7 + 11) * 0.6 + noise(px * 13, pz * 13 + py * 5) * 0.4;
      if (n > 0.53) land.copy(Math.abs(lat) < 0.45 && noise(px * 6, pz * 6) > 0.5 ? desert : green).lerp(desert, Math.max(0, n - 0.65) * 2);
      else land.copy(deep).lerp(sea, Math.min(1, (n / 0.53) ** 3));
      if (Math.abs(lat) > 1.2 + noise(lon * 3, 1) * 0.15) land.copy(ice);
      if (cloud > 0.58) land.lerp(ice, Math.min(0.85, (cloud - 0.58) * 4));
      const i = (y * W + x) * 4;
      out[i] = land.r * 255;
      out[i + 1] = land.g * 255;
      out[i + 2] = land.b * 255;
      out[i + 3] = 255;
    }
  return out;
}

const hex = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

/** A shaded relief map of the whole area for the minimap. */
function reliefPixels(planet: Planet) {
  const N = RELIEF_SIZE;
  const out = new Uint8ClampedArray(N * N * 4);
  const P = PALETTE[planet];
  const base = hex(P.ground),
    dark = hex(P.crater);
  const step = (MAP_SPAN * 2) / N;
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const wx = -MAP_SPAN + (x + 0.5) * step,
        wz = -MAP_SPAN + (y + 0.5) * step;
      const h = terrainHeight(wx, wz, planet);
      // Light from the north-west, like a printed relief map.
      const shade = (terrainHeight(wx - step, wz - step, planet) - terrainHeight(wx + step, wz + step, planet)) / step;
      let k = 0.62 + shade * 0.55 + h * 0.012;
      const inCrater = Math.hypot(wx - CRATER.x, wz - CRATER.z) < CRATER.r * 0.85;
      const edge = Math.max(Math.abs(wx), Math.abs(wz)) > WORLD - 4;
      if (edge) k *= 0.55;
      k = Math.max(0.2, Math.min(1.25, k));
      const col = inCrater ? dark : base;
      const i = (y * N + x) * 4;
      out[i] = col[0] * k;
      out[i + 1] = col[1] * k;
      out[i + 2] = col[2] * k;
      out[i + 3] = 255;
    }
  return out;
}

export interface Baked {
  planet: Planet;
  terrain: MeshArrays;
  horizon: MeshArrays;
  detail: { color: Uint8ClampedArray; normal: Uint8ClampedArray };
  earth: Uint8ClampedArray | null;
  relief: Uint8ClampedArray;
}

export function bakePlanet(planet: Planet): Baked {
  return {
    planet,
    terrain: terrainArrays(planet),
    horizon: horizonArrays(planet),
    detail: detailPixels(planet),
    earth: planet === "moon" ? earthPixels() : null,
    relief: reliefPixels(planet),
  };
}

/** Every buffer in a bake, to hand over to the main thread without copying. */
export function buffersOf(b: Baked): ArrayBuffer[] {
  const list: ArrayBufferLike[] = [b.detail.color.buffer, b.detail.normal.buffer, b.relief.buffer];
  for (const m of [b.terrain, b.horizon]) {
    list.push(m.position.buffer, m.normal.buffer, m.color.buffer, m.index.buffer);
    if (m.uv) list.push(m.uv.buffer);
  }
  if (b.earth) list.push(b.earth.buffer);
  return list as ArrayBuffer[];
}
