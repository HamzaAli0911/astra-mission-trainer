import * as THREE from "three";
import type { Planet } from "../sim/types";
import { CRATER, FLAT, noise, ROCKS, terrainHeight, WORLD } from "../sim/world";
import { DETAIL_SIZE, HORIZON, PALETTE, type Baked, type MeshArrays } from "./bake";
import { addDetail, DETAIL, detailTexture } from "./surface";
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
  // Blend the detail at two scales so its tiling doesn't show; add large-scale variation, rocky
  // texture where slopes are steep (crater walls), and wind ripples on the Martian dunes.
  const mars = baked.planet === "mars";
  mat.onBeforeCompile = (shader) => {
    const second = "vec2(0.17, 0.53)";
    shader.uniforms.microMap = { value: detailTexture() };
    shader.uniforms.rockTint = { value: new THREE.Color(mars ? "#a88270" : "#c3c3c8") };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vTPos;\nvarying vec3 vTNrm;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvTPos = position;\nvTNrm = objectNormal;");
    shader.fragmentShader = (mars ? "#define MARS\n" : "") + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        /* glsl */ `#include <common>
        uniform sampler2D microMap;
        uniform vec3 rockTint;
        varying vec3 vTPos;
        varying vec3 vTNrm;
        vec3 terrainPerturb(vec3 surfPos, vec3 surfNorm, vec2 dHdxy, float faceDir) {
          vec3 sx = dFdx(surfPos), sy = dFdy(surfPos);
          vec3 r1 = cross(sy, surfNorm), r2 = cross(surfNorm, sx);
          float det = dot(sx, r1) * faceDir;
          return normalize(abs(det) * surfNorm - sign(det) * (dHdxy.x * r1 + dHdxy.y * r2));
        }`,
      )
      .replace(
        "#include <map_fragment>",
        /* glsl */ `diffuseColor *= mix(texture2D(map, vMapUv), texture2D(map, vMapUv * 0.31 + ${second}), 0.5);
        // Large soft patches of lighter and darker ground, tens of metres across.
        float macro = texture2D(map, vTPos.xz * 0.0045 + vec2(0.31, 0.77)).r * 0.6 + texture2D(map, vTPos.xz * 0.0013).r * 0.4;
        diffuseColor.rgb *= 1.0 + (macro - 0.8) * 1.1;
        // Steep slopes show bare rock rather than loose regolith.
        vec3 tn = normalize(vTNrm);
        float rocky = smoothstep(0.12, 0.42, 1.0 - tn.y);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * rockTint, rocky * 0.75);
        #ifdef MARS
          float mesaBands = smoothstep(46.0, 24.0, length((vTPos.xz - vec2(-30.0, -132.0)) * vec2(0.8, 1.0))) * rocky;
          float bandPhase = vTPos.y * 3.2 + sin(vTPos.x * 0.07) * 0.8;
          vec3 bandCol = mix(vec3(0.78, 0.55, 0.4), vec3(1.12, 0.92, 0.74), smoothstep(0.3, 0.7, fract(bandPhase * 0.5)));
          diffuseColor.rgb *= mix(vec3(1.0), bandCol, mesaBands * 0.8);
        #endif`,
      )
      .replace(
        "#include <normal_fragment_maps>",
        THREE.ShaderChunk.normal_fragment_maps
          .split("texture2D( normalMap, vNormalMapUv )")
          .join(`mix(texture2D( normalMap, vNormalMapUv ), texture2D( normalMap, vNormalMapUv * 0.31 + ${second} ), 0.5)`) +
          /* glsl */ `
        {
          // Rock relief on steep ground (triplanar, so walls don't look stretched).
          vec3 w = pow(abs(tn), vec3(4.0)); w /= (w.x + w.y + w.z);
          vec4 rk = texture2D(microMap, vTPos.zy * 0.35) * w.x + texture2D(microMap, vTPos.xz * 0.35) * w.y + texture2D(microMap, vTPos.xy * 0.35) * w.z;
          float fade = 1.0 - smoothstep(15.0, 90.0, length(vViewPosition));
          float h = (rk.a * 0.6 + rk.b * 0.4) * rocky * 0.06 * fade;
          #ifdef MARS
            // The mesa's flanks: sedimentary layers as alternating bands and small ledges.
            float mesa = smoothstep(46.0, 24.0, length((vTPos.xz - vec2(-30.0, -132.0)) * vec2(0.8, 1.0))) * rocky;
            float layerPhase = vTPos.y * 3.2 + sin(vTPos.x * 0.07) * 0.8;
            h += smoothstep(0.35, 0.65, fract(layerPhase)) * 0.05 * mesa * fade;
            float dune = smoothstep(72.0, 28.0, length(vTPos.xz - vec2(40.0, 112.0)));
            float ph = dot(vTPos.xz, vec2(0.93, 0.37)) * 10.5 + sin(dot(vTPos.xz, vec2(-0.37, 0.93)) * 0.8) * 2.0;
            h += (sin(ph) * 0.5 + 0.5) * (sin(ph) * 0.5 + 0.5) * 0.012 * dune * (1.0 - smoothstep(10.0, 60.0, length(vViewPosition)));
          #endif
          normal = terrainPerturb(-vViewPosition, normal, vec2(dFdx(h), dFdy(h)), faceDirection);
        }`,
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

/**
 * A rock: a lumpy, noise-displaced ball with a few fracture faces cut flat and a
 * flat base, so it can sit part-buried in the ground. Vertex colours darken the
 * hollows.
 */
function rockGeometry(seed: number, detail: number, squash: number, cuts = 4) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.attributes.position;
  const r = rng(seed);
  const bumps = Array.from({ length: 6 }, () => new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize());
  const planes = Array.from({ length: cuts }, () => ({ n: new THREE.Vector3(r() - 0.5, r() * 0.8, r() - 0.5).normalize(), d: 0.62 + r() * 0.28 }));
  const v = new THREE.Vector3();
  const shade = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    v.set(p.getX(i), p.getY(i), p.getZ(i));
    let k = 0.86;
    for (const b of bumps) k += Math.max(0, v.dot(b)) ** 3 * 0.24;
    const n = noise(v.x * 2.6 + seed, v.z * 2.6 + v.y * 1.9);
    const fine = noise(v.x * 8 - seed, v.y * 8 + v.z * 5) - 0.5;
    k += (n - 0.5) * 0.28 + fine * 0.08 + (noise(v.y * 17 + seed, v.x * 17 - v.z * 9) - 0.5) * 0.025;
    v.multiplyScalar(k);
    // Fracture faces: anything beyond a cutting plane is pushed back onto it.
    let cut = 0;
    for (const pl of planes) {
      const over = v.dot(pl.n) - pl.d;
      if (over > 0) {
        v.addScaledVector(pl.n, -over * 0.92);
        cut = 1;
      }
    }
    // A flat-ish base to sink into the regolith.
    if (v.y < -0.42) v.y = -0.42 + (v.y + 0.42) * 0.15;
    p.setXYZ(i, v.x, v.y * squash, v.z);
    // Hollows are darker; fresh fracture faces a little lighter.
    const c = THREE.MathUtils.clamp(0.6 + (k - 0.86) * 1.5 + (n - 0.5) * 0.3 + fine * 0.2 + cut * 0.06, 0.38, 1.12);
    shade.set([c, c, c], i * 3);
  }
  g.setAttribute("color", new THREE.BufferAttribute(shade, 3));
  g.computeVertexNormals();
  return g;
}

/** Rock material: fine rock relief from the shared micro-detail, darker hollows, and dust (or frost) on top. */
function rockMaterial(coat: { color: string; amount: number }) {
  return addDetail(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.94, metalness: 0 }), { ...DETAIL.rock, coat });
}

/** Boulders (several shapes, instanced, part-buried and dusty) and thousands of scattered pebbles. */
export function buildRocks(baked: Baked, pebbles = true, fine = false) {
  const planet = baked.planet;
  const group = new THREE.Group();
  const dust = { color: planet === "moon" ? "#9c9da1" : "#b77551", amount: planet === "moon" ? 0.45 : 0.7 };
  const mat = rockMaterial(dust);
  // Small rocks share two simpler shapes; boulders get detailed ones.
  const hi = fine ? 4 : 3;
  const shapes = [rockGeometry(3, 2, 0.75, 3), rockGeometry(8, 2, 0.6, 4), rockGeometry(15, hi, 0.85, 5), rockGeometry(27, hi, 0.7, 4), rockGeometry(41, hi, 0.95, 6), rockGeometry(52, hi, 0.62, 5)];
  const m = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    e = new THREE.Euler(),
    s = new THREE.Vector3(),
    v = new THREE.Vector3(),
    color = new THREE.Color();
  const r = rng(77);
  const base = new THREE.Color(PALETTE[planet].rock);
  shapes.forEach((shape, k) => {
    const list = ROCKS.filter((rock, i) => (rock.r > 1.3 ? 2 + (i % 4) : i % 2) === k);
    if (!list.length) return;
    const inst = new THREE.InstancedMesh(shape, mat, list.length);
    list.forEach((rock, i) => {
      e.set(r() * 0.5, r() * Math.PI * 2, r() * 0.4);
      q.setFromEuler(e);
      s.set(rock.r * (0.9 + r() * 0.45), rock.r * (0.7 + r() * 0.5), rock.r * (0.9 + r() * 0.35));
      // Sunk into the ground by about a third of their height, as real boulders are.
      v.set(rock.x, terrainHeight(rock.x, rock.z, planet) - s.y * (0.12 + r() * 0.18), rock.z);
      m.compose(v, q, s);
      inst.setMatrixAt(i, m);
      color.copy(base).multiplyScalar(1.05 + r() * 0.4);
      inst.setColorAt(i, color);
    });
    inst.castShadow = inst.receiveShadow = true;
    group.add(inst);
  });
  if (pebbles) {
    // Two sizes: small pebbles are simple (20 triangles), larger ones get more shape and cast shadows on Ultra.
    const count = fine ? 7000 : 3600;
    const small = new THREE.InstancedMesh(rockGeometry(66, 0, 0.65, 2), mat, count),
      large = new THREE.InstancedMesh(rockGeometry(71, 1, 0.7, 3), mat, Math.ceil(count * 0.45));
    let ns = 0,
      nl = 0;
    for (let i = 0; i < count * 3 && ns + nl < count; i++) {
      const x = (r() * 2 - 1) * (WORLD + 40),
        z = (r() * 2 - 1) * (WORLD + 40);
      const d = Math.hypot(x, z);
      if (d < 9 || (d < FLAT && r() < 0.75)) continue;
      const size = 0.05 + r() ** 3 * 0.32;
      e.set(r() * 0.6, r() * 6, r() * 0.6);
      q.setFromEuler(e);
      s.set(size, size * (0.5 + r() * 0.4), size * (0.8 + r() * 0.4));
      v.set(x, terrainHeight(x, z, planet) - size * 0.08, z);
      m.compose(v, q, s);
      color.copy(base).multiplyScalar(0.85 + r() * 0.6);
      const big = size > 0.15 && nl < large.instanceMatrix.count;
      const into = big ? large : small;
      const n = big ? nl++ : ns++;
      into.setMatrixAt(n, m);
      into.setColorAt(n, color);
    }
    small.count = ns;
    large.count = nl;
    small.castShadow = false;
    large.castShadow = fine;
    small.receiveShadow = large.receiveShadow = true;
    group.add(small, large);
  }
  return group;
}

/**
 * Ice in the dark crater. Lunar ice is mixed into the regolith, not lying in
 * crystals: frost-dusted rocks, the frost patches baked into the ground colour,
 * and the occasional glint where a headlight catches it.
 */
export function buildIce(planet: Planet) {
  const group = new THREE.Group();
  const r = rng(5);
  // A thin rime, not snow: lunar ice is a few percent of the soil, so frost only pales the tops of rocks.
  const frost = rockMaterial({ color: planet === "moon" ? "#aab6c2" : "#d6d3cf", amount: 0.5 });
  const count = 70;
  const inst = new THREE.InstancedMesh(rockGeometry(21, 2, 0.7, 4), frost, count);
  const m = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    e = new THREE.Euler(),
    s = new THREE.Vector3(),
    v = new THREE.Vector3(),
    color = new THREE.Color(PALETTE[planet].rock);
  let n = 0;
  for (let i = 0; i < count * 2 && n < count; i++) {
    const a = r() * Math.PI * 2,
      d = Math.sqrt(r()) * CRATER.r * 0.72;
    const x = CRATER.x + Math.cos(a) * d,
      z = CRATER.z + Math.sin(a) * d;
    if (Math.hypot(x - CRATER.x, z - CRATER.z) < 6) continue;
    const size = 0.2 + r() ** 2.5 * 1.3;
    e.set(r() * 0.4, r() * 6, r() * 0.4);
    q.setFromEuler(e);
    s.set(size, size * (0.5 + r() * 0.4), size);
    v.set(x, terrainHeight(x, z, planet) - size * 0.15, z);
    m.compose(v, q, s);
    inst.setMatrixAt(n, m);
    inst.setColorAt(n++, color);
  }
  inst.count = n;
  inst.castShadow = inst.receiveShadow = true;
  group.add(inst);
  const g2 = 140,
    pos = new Float32Array(g2 * 3);
  for (let i = 0; i < g2; i++) {
    const a = r() * Math.PI * 2,
      d = Math.sqrt(r()) * CRATER.r * 0.75;
    const x = CRATER.x + Math.cos(a) * d,
      z = CRATER.z + Math.sin(a) * d;
    pos.set([x, terrainHeight(x, z, planet) + 0.06, z], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const glints = new THREE.Points(g, new THREE.PointsMaterial({ color: "#eaf8ff", size: 0.12, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  group.add(glints);
  group.userData.glints = glints;
  return group;
}

/** Tyre tracks the rover leaves behind: a ring buffer of quads laid on the ground. */
export function trackSystem(planet: Planet, max = 2400) {
  const pos = new Float32Array(max * 4 * 3),
    alpha = new Float32Array(max * 4),
    tread = new Float32Array(max * 4 * 2);
  const index = new Uint32Array(max * 6);
  for (let q = 0; q < max; q++) index.set([q * 4, q * 4 + 1, q * 4 + 2, q * 4 + 2, q * 4 + 1, q * 4 + 3], q * 6);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("alpha", new THREE.BufferAttribute(alpha, 1));
  geo.setAttribute("tread", new THREE.BufferAttribute(tread, 2));
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  // Tracks darken whatever light falls on the ground (multiply), so they read by day and by night.
  const mat = new THREE.ShaderMaterial({
    uniforms: { shade: { value: new THREE.Color(PALETTE[planet].track) } },
    vertexShader:
      "attribute float alpha; attribute vec2 tread; varying float vA; varying vec2 vT; void main(){ vA = alpha; vT = tread; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    // A chevron tread pattern pressed into a darker, compacted band with soft edges.
    fragmentShader: /* glsl */ `
      uniform vec3 shade; varying float vA; varying vec2 vT;
      void main() {
        float across = abs(vT.x - 0.5) * 2.0;
        float chevron = step(0.5, fract(vT.y * 4.0 + across * 0.6));
        float edge = 1.0 - smoothstep(0.7, 1.0, across);
        float a = vA * edge * (0.65 + 0.35 * chevron);
        gl_FragColor = vec4(mix(vec3(1.0), shade * 1.6, a), 1.0);
      }`,
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
  const along = [0, 0];
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
        const a0 = along[k],
          a1 = (along[k] += prev.distanceTo(p));
        tread.set([0, a0, 1, a0, 0, a1, 1, a1], q * 8);
        const w = 0.22,
          ox = Math.cos(heading) * w,
          oz = -Math.sin(heading) * w;
        pos.set([prev.x - ox, prev.y, prev.z - oz, prev.x + ox, prev.y, prev.z + oz, p.x - ox, p.y, p.z - oz, p.x + ox, p.y, p.z + oz], q * 12);
        alpha.set([0.55, 0.55, 0.55, 0.55], q * 4);
      });
      geo.attributes.position.needsUpdate = true;
      geo.attributes.alpha.needsUpdate = true;
      geo.attributes.tread.needsUpdate = true;
    },
    reset() {
      last[0] = last[1] = null;
    },
  };
}
