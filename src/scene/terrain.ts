import * as THREE from "three";
import type { Planet } from "../sim/types";
import { CRATER, CRATERS, FLAT, LANDER, noise, ROCKS, SITES, terrainHeight, WORLD } from "../sim/world";
import { rng } from "./kit";

const smooth = (a: number, b: number, v: number) => {
  const x = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return x * x * (3 - 2 * x);
};
const fbm = (x: number, y: number) => noise(x, y) * 0.5 + noise(x * 2.1, y * 2.1) * 0.27 + noise(x * 4.3, y * 4.3) * 0.15 + noise(x * 8.7, y * 8.7) * 0.08;

/** Where the detailed ground ends and the distant hills begin. */
const HORIZON = WORLD + 85;

export const PALETTE = {
  moon: { ground: "#9d9ea3", dark: "#55585f", light: "#c6c6c8", crater: "#2f3440", rim: "#d3d3d4", rock: "#80828a", track: "#3c3e44" },
  mars: { ground: "#b46b45", dark: "#6b3322", light: "#d69a6a", crater: "#5d3a33", rim: "#d8a275", rock: "#8a4c35", track: "#5a2c1c" },
};

/** Tileable detail: small craters, grit and pebbles, as a colour map and a normal map. */
function detailMaps(planet: Planet) {
  const N = 512;
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
  const color = document.createElement("canvas"),
    normal = document.createElement("canvas");
  color.width = color.height = normal.width = normal.height = N;
  const ci = color.getContext("2d")!.createImageData(N, N),
    ni = normal.getContext("2d")!.createImageData(N, N);
  const strength = 2.4;
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      const dx = (h[tile(x + 1, y)] - h[tile(x - 1, y)]) * strength,
        dy = (h[tile(x, y + 1)] - h[tile(x, y - 1)]) * strength;
      const len = Math.hypot(dx, dy, 1);
      ni.data[i * 4] = ((-dx / len) * 0.5 + 0.5) * 255;
      ni.data[i * 4 + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      ni.data[i * 4 + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      ni.data[i * 4 + 3] = 255;
      const v = 205 + (h[i] - 0.5) * 50 + (r() - 0.5) * 14;
      ci.data[i * 4] = ci.data[i * 4 + 1] = ci.data[i * 4 + 2] = Math.max(120, Math.min(255, v));
      ci.data[i * 4 + 3] = 255;
    }
  color.getContext("2d")!.putImageData(ci, 0, 0);
  normal.getContext("2d")!.putImageData(ni, 0, 0);
  const map = new THREE.CanvasTexture(color),
    nmap = new THREE.CanvasTexture(normal);
  for (const t of [map, nmap]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
  }
  map.colorSpace = THREE.SRGBColorSpace;
  return { map, nmap };
}

/** The playable ground, coloured by geology. */
export function buildTerrain(planet: Planet) {
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
    for (const k of CRATERS) {
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
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const { map, nmap } = detailMaps(planet);
  map.repeat.set(size / 16, size / 16);
  nmap.repeat.copy(map.repeat);
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    map,
    normalMap: nmap,
    normalScale: new THREE.Vector2(0.6, 0.6),
    roughness: 0.97,
    metalness: 0,
  });
  // Blend the detail at two scales so its tiling doesn't show.
  mat.onBeforeCompile = (shader) => {
    const second = "vec2(0.17, 0.53)";
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <map_fragment>",
        `diffuseColor *= mix(texture2D(map, vMapUv), texture2D(map, vMapUv * 0.31 + ${second}), 0.5);`,
      )
      .replace(
        "#include <normal_fragment_maps>",
        THREE.ShaderChunk.normal_fragment_maps
          .split("texture2D( normalMap, vNormalMapUv )")
          .join(`mix(texture2D( normalMap, vNormalMapUv ), texture2D( normalMap, vNormalMapUv * 0.31 + ${second} ), 0.5)`),
      );
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = "terrain";
  return mesh;
}

/** Distant hills and mountains all around, beyond the drivable area. */
export function buildHorizon(planet: Planet) {
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
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(index);
  geo.computeVertexNormals();
  // A touch of glow so slopes facing away from the Sun don't turn into a black wall.
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, emissive: far, emissiveIntensity: planet === "moon" ? 0.06 : 0.1 }));
  mesh.receiveShadow = false;
  return mesh;
}

function rockGeometry(seed: number, detail: number, squash: number) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.attributes.position;
  const r = rng(seed);
  const bumps = Array.from({ length: 6 }, () => new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize());
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.set(p.getX(i), p.getY(i), p.getZ(i));
    let k = 0.85;
    for (const b of bumps) k += Math.max(0, v.dot(b)) ** 3 * 0.22;
    k += (noise(v.x * 3 + seed, v.z * 3 + v.y * 2) - 0.5) * 0.25;
    v.multiplyScalar(k);
    p.setXYZ(i, v.x, v.y * squash, v.z);
  }
  g.computeVertexNormals();
  return g;
}

/** Boulders (three shapes, instanced) and thousands of scattered pebbles. */
export function buildRocks(planet: Planet, pebbles = true) {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.92, flatShading: true });
  // Small rocks share two simple shapes; big boulders get two detailed ones.
  const shapes = [rockGeometry(3, 1, 0.75), rockGeometry(8, 1, 0.6), rockGeometry(15, 2, 0.85), rockGeometry(27, 2, 0.7)];
  const m = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    e = new THREE.Euler(),
    s = new THREE.Vector3(),
    v = new THREE.Vector3(),
    color = new THREE.Color();
  const r = rng(77);
  const base = new THREE.Color(PALETTE[planet].rock);
  shapes.forEach((shape, k) => {
    const list = ROCKS.filter((rock, i) => (rock.r > 1.3 ? 2 + (i % 2) : i % 2) === k);
    const inst = new THREE.InstancedMesh(shape, mat, list.length);
    list.forEach((rock, i) => {
      e.set(r() * 0.6, r() * Math.PI * 2, r() * 0.5);
      q.setFromEuler(e);
      s.set(rock.r * (0.9 + r() * 0.4), rock.r * (0.75 + r() * 0.45), rock.r * (0.9 + r() * 0.3));
      v.set(rock.x, terrainHeight(rock.x, rock.z, planet) + rock.r * 0.15, rock.z);
      m.compose(v, q, s);
      inst.setMatrixAt(i, m);
      color.copy(base).multiplyScalar(0.75 + r() * 0.45);
      inst.setColorAt(i, color);
    });
    inst.castShadow = inst.receiveShadow = true;
    group.add(inst);
  });
  if (pebbles) {
    const count = 3600;
    const pebble = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), mat, count);
    let n = 0;
    for (let i = 0; i < count * 3 && n < count; i++) {
      const x = (r() * 2 - 1) * (WORLD + 40),
        z = (r() * 2 - 1) * (WORLD + 40);
      const d = Math.hypot(x, z);
      if (d < 9 || (d < FLAT && r() < 0.75)) continue;
      const size = 0.05 + r() ** 3 * 0.32;
      e.set(r() * 3, r() * 3, r() * 3);
      q.setFromEuler(e);
      s.set(size, size * 0.7, size);
      v.set(x, terrainHeight(x, z, planet) + size * 0.2, z);
      m.compose(v, q, s);
      pebble.setMatrixAt(n, m);
      color.copy(base).multiplyScalar(0.7 + r() * 0.6);
      pebble.setColorAt(n++, color);
    }
    pebble.count = n;
    pebble.receiveShadow = true;
    group.add(pebble);
  }
  return group;
}

/** Ice in the dark crater: frosty blocks and glints. */
export function buildIce(planet: Planet) {
  const group = new THREE.Group();
  const r = rng(5);
  const ice = new THREE.MeshStandardMaterial({ color: "#d8f2ff", roughness: 0.25, metalness: 0.1, emissive: "#3a7dbb", emissiveIntensity: 0.35 });
  const count = 90;
  const inst = new THREE.InstancedMesh(rockGeometry(21, 0, 0.55), ice, count);
  const m = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    e = new THREE.Euler(),
    s = new THREE.Vector3(),
    v = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    const a = r() * Math.PI * 2,
      d = Math.sqrt(r()) * CRATER.r * 0.7;
    const x = CRATER.x + Math.cos(a) * d,
      z = CRATER.z + Math.sin(a) * d;
    if (Math.hypot(x - CRATER.x, z - CRATER.z) < 5.5) continue;
    const size = 0.25 + r() ** 2 * 1.1;
    e.set(r(), r() * 6, r());
    q.setFromEuler(e);
    s.set(size, size * 0.6, size);
    v.set(x, terrainHeight(x, z, planet) + size * 0.1, z);
    m.compose(v, q, s);
    inst.setMatrixAt(i, m);
  }
  inst.castShadow = true;
  group.add(inst);
  const n = 260,
    pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2,
      d = Math.sqrt(r()) * CRATER.r * 0.8;
    const x = CRATER.x + Math.cos(a) * d,
      z = CRATER.z + Math.sin(a) * d;
    pos.set([x, terrainHeight(x, z, planet) + 0.12, z], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const glints = new THREE.Points(g, new THREE.PointsMaterial({ color: "#e6f8ff", size: 0.28, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  group.add(glints);
  group.userData.glints = glints;
  return group;
}

/** Tyre tracks the rover leaves behind: a ring buffer of quads laid on the ground. */
export function trackSystem(planet: Planet, max = 2400) {
  const pos = new Float32Array(max * 4 * 3),
    alpha = new Float32Array(max * 4);
  const index = new Uint32Array(max * 6);
  for (let q = 0; q < max; q++) index.set([q * 4, q * 4 + 1, q * 4 + 2, q * 4 + 2, q * 4 + 1, q * 4 + 3], q * 6);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("alpha", new THREE.BufferAttribute(alpha, 1));
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  // Tracks darken whatever light falls on the ground (multiply), so they read by day and by night.
  const mat = new THREE.ShaderMaterial({
    uniforms: { shade: { value: new THREE.Color(PALETTE[planet].track) } },
    vertexShader: "attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: "uniform vec3 shade; varying float vA; void main(){ gl_FragColor = vec4(mix(vec3(1.0), shade * 1.6, vA), 1.0); }",
    transparent: true,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.DstColorFactor,
    blendDst: THREE.ZeroFactor,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  let next = 0;
  const last: (THREE.Vector3 | null)[] = [null, null];
  return {
    mesh,
    /** Add a step for each wheel line at the rover's position. */
    add(x: number, z: number, heading: number) {
      const sides = [-1, 1];
      sides.forEach((side, k) => {
        const wx = x + Math.cos(heading) * side * 1.15,
          wz = z - Math.sin(heading) * side * 1.15;
        const p = new THREE.Vector3(wx, terrainHeight(wx, wz, planet) + 0.04, wz);
        const prev = last[k];
        last[k] = p;
        if (!prev || prev.distanceTo(p) > 12) return;
        const q = next++ % max;
        const w = 0.22,
          ox = Math.cos(heading) * w,
          oz = -Math.sin(heading) * w;
        pos.set([prev.x - ox, prev.y, prev.z - oz, prev.x + ox, prev.y, prev.z + oz, p.x - ox, p.y, p.z - oz, p.x + ox, p.y, p.z + oz], q * 12);
        alpha.set([0.55, 0.55, 0.55, 0.55], q * 4);
      });
      geo.attributes.position.needsUpdate = true;
      geo.attributes.alpha.needsUpdate = true;
    },
    reset() {
      last[0] = last[1] = null;
    },
  };
}
