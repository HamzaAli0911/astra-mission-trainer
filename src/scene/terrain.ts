import * as THREE from "three";
import type { Planet } from "../sim/types";
import { CRATER, FLAT, noise, ROCKS, terrainHeight, WORLD } from "../sim/world";
import { DETAIL_SIZE, HORIZON, PALETTE, type Baked, type MeshArrays } from "./bake";
import { rng } from "./kit";

export { PALETTE } from "./bake";

function dataTexture(pixels: Uint8ClampedArray, size: number, srgb: boolean) {
  const t = new THREE.DataTexture(new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength), size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.flipY = true;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

const details = new Map<Planet, { map: THREE.Texture; nmap: THREE.Texture }>();
/** The detail maps, made once per planet and shared by the ground and the rocks. */
function detailFor(baked: Baked) {
  let d = details.get(baked.planet);
  if (!d) {
    d = { map: dataTexture(baked.detail.color, DETAIL_SIZE, true), nmap: dataTexture(baked.detail.normal, DETAIL_SIZE, false) };
    d.map.userData.shared = d.nmap.userData.shared = true;
    details.set(baked.planet, d);
  }
  return d;
}

function geometryOf(m: MeshArrays) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(m.position, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(m.normal, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(m.color, 3));
  if (m.uv) geo.setAttribute("uv", new THREE.BufferAttribute(m.uv, 2));
  geo.setIndex(new THREE.BufferAttribute(m.index, 1));
  geo.computeBoundingSphere();
  return geo;
}

/** The playable ground, coloured by geology (its shape and colours come from the bake). */
export function buildTerrain(baked: Baked) {
  const geo = geometryOf(baked.terrain);
  const size = HORIZON * 2;
  const { map, nmap } = detailFor(baked);
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
export function buildHorizon(baked: Baked) {
  const far = new THREE.Color(baked.planet === "moon" ? "#8d8e93" : "#b0704c");
  // A touch of glow so slopes facing away from the Sun don't turn into a black wall.
  const mesh = new THREE.Mesh(
    geometryOf(baked.horizon),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, emissive: far, emissiveIntensity: baked.planet === "moon" ? 0.06 : 0.1 }),
  );
  mesh.receiveShadow = false;
  return mesh;
}

function rockGeometry(seed: number, detail: number, squash: number) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.attributes.position;
  const r = rng(seed);
  const bumps = Array.from({ length: 6 }, () => new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize());
  const v = new THREE.Vector3();
  const shade = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    v.set(p.getX(i), p.getY(i), p.getZ(i));
    let k = 0.85;
    for (const b of bumps) k += Math.max(0, v.dot(b)) ** 3 * 0.22;
    const n = noise(v.x * 3 + seed, v.z * 3 + v.y * 2);
    k += (n - 0.5) * 0.25 + (noise(v.x * 9 - seed, v.y * 9 + v.z * 5) - 0.5) * 0.06;
    v.multiplyScalar(k);
    p.setXYZ(i, v.x, v.y * squash, v.z);
    // Hollows are darker, bulges and the top catch more dust (lighter).
    const c = THREE.MathUtils.clamp(0.62 + (k - 0.85) * 1.4 + Math.max(0, v.y) * 0.18 + (n - 0.5) * 0.25, 0.45, 1.15);
    shade.set([c, c, c], i * 3);
  }
  g.setAttribute("color", new THREE.BufferAttribute(shade, 3));
  g.computeVertexNormals();
  return g;
}

/** Boulders (three shapes, instanced) and thousands of scattered pebbles. */
export function buildRocks(baked: Baked, pebbles = true) {
  const planet = baked.planet;
  const group = new THREE.Group();
  // Rocks reuse the ground's grit as a fine rough surface, at a smaller scale.
  const d = detailFor(baked);
  const grit = d.map.clone(),
    bumps = d.nmap.clone();
  for (const t of [grit, bumps]) {
    t.repeat.set(3, 3);
    t.needsUpdate = true;
  }
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: grit, normalMap: bumps, normalScale: new THREE.Vector2(1.4, 1.4), roughness: 0.93, flatShading: true });
  const plain = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.92, flatShading: true });
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
      color.copy(base).multiplyScalar(1.15 + r() * 0.45);
      inst.setColorAt(i, color);
    });
    inst.castShadow = inst.receiveShadow = true;
    group.add(inst);
  });
  if (pebbles) {
    const count = 3600;
    const pebble = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), plain, count);
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
