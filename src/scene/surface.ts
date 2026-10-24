import * as THREE from "three";

/**
 * Fine surface detail for every model, without UV work: a small tileable
 * texture of micro-patterns is projected onto each surface from three sides
 * (triplanar mapping, in the model's own metres) and turned into tiny bumps
 * and roughness changes. One texture, one shader variant, shared by all.
 *
 * Channels: R woven fabric, G brushed metal, B fine grain and scratches,
 * A crinkled foil and hammered metal.
 */
const SIZE = 512;
let texture: THREE.DataTexture | null = null;

function hash(i: number) {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}
/** Periodic value noise on a SIZE × SIZE tile with `cells` cells across. */
function tileNoise(x: number, y: number, cells: number, seed: number) {
  const fx = (x / SIZE) * cells,
    fy = (y / SIZE) * cells;
  const ix = Math.floor(fx),
    iy = Math.floor(fy);
  const tx = fx - ix,
    ty = fy - iy;
  const u = tx * tx * (3 - 2 * tx),
    v = ty * ty * (3 - 2 * ty);
  const h = (a: number, b: number) => hash((((a % cells) + cells) % cells) * 131 + (((b % cells) + cells) % cells) * 977 + seed * 7919);
  const a = h(ix, iy),
    b = h(ix + 1, iy),
    c = h(ix, iy + 1),
    d = h(ix + 1, iy + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** The micro-detail texture (about 100 ms to make; done once, while the title screen is up). */
export function detailTexture() {
  if (texture) return texture;
  const data = new Uint8Array(SIZE * SIZE * 4);
  // Crinkle: distance to the nearest two of a few dozen scattered points (cells with creases).
  const pts: [number, number][] = [];
  for (let i = 0; i < 70; i++) pts.push([hash(i + 1) * SIZE, hash(i + 101) * SIZE]);
  // Scratches: a few long thin lines.
  const scratches = Array.from({ length: 26 }, (_, i) => ({
    x: hash(i + 300) * SIZE,
    y: hash(i + 400) * SIZE,
    a: hash(i + 500) * Math.PI,
    len: 30 + hash(i + 600) * 160,
  }));
  const scratch = new Float32Array(SIZE * SIZE);
  for (const s of scratches) {
    const dx = Math.cos(s.a),
      dy = Math.sin(s.a);
    for (let t = 0; t < s.len; t += 0.5) {
      const x = Math.round(s.x + dx * t),
        y = Math.round(s.y + dy * t);
      scratch[(((y % SIZE) + SIZE) % SIZE) * SIZE + (((x % SIZE) + SIZE) % SIZE)] = 1;
    }
  }
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      const i = (y * SIZE + x) * 4;
      // Woven fabric: threads 8 px apart, alternating over and under.
      const u = x / 8,
        v = y / 8;
      const fu = u - Math.floor(u),
        fv = v - Math.floor(v);
      const over = (Math.floor(u) + Math.floor(v)) % 2 === 0;
      const warp = Math.sin(Math.PI * fu),
        weft = Math.sin(Math.PI * fv);
      const weave = (over ? warp * 0.75 + weft * 0.2 : weft * 0.75 + warp * 0.2) + (tileNoise(x, y, 64, 1) - 0.5) * 0.15;
      // Brushed metal: fine streaks running along one direction.
      const brushed = 0.5 + (hash(y * 3.1 + Math.floor(x / 97) * 0.37) - 0.5) * 0.45 + (tileNoise(x, y * 16, 8, 2) - 0.5) * 0.35;
      // Grain: two octaves of fine noise, with scratches cut in.
      const grain = tileNoise(x, y, 128, 3) * 0.55 + tileNoise(x, y, 32, 4) * 0.45 - scratch[y * SIZE + x] * 0.35;
      // Crinkle: creases where two cells meet.
      let d1 = 1e9,
        d2 = 1e9;
      for (const [px, py] of pts) {
        let ddx = Math.abs(px - x),
          ddy = Math.abs(py - y);
        if (ddx > SIZE / 2) ddx = SIZE - ddx;
        if (ddy > SIZE / 2) ddy = SIZE - ddy;
        const d = ddx * ddx + ddy * ddy;
        if (d < d1) {
          d2 = d1;
          d1 = d;
        } else if (d < d2) d2 = d;
      }
      const crinkle = Math.min(1, (Math.sqrt(d2) - Math.sqrt(d1)) / 18) * 0.8 + tileNoise(x, y, 48, 5) * 0.2;
      data[i] = Math.max(0, Math.min(255, weave * 255));
      data[i + 1] = Math.max(0, Math.min(255, brushed * 255));
      data[i + 2] = Math.max(0, Math.min(255, grain * 255));
      data[i + 3] = Math.max(0, Math.min(255, crinkle * 255));
    }
  texture = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  texture.userData.shared = true;
  return texture;
}

export interface Detail {
  /** How much of each pattern (fabric, brushed, grain, crinkle) makes up the surface relief. */
  mix: [number, number, number, number];
  /** Pattern repeats per metre. */
  scale: number;
  /** Relief strength. */
  bump: number;
  /** How much the pattern varies the roughness. */
  rough: number;
  /** Large soft blotches of grime and wear (0 to 1). */
  grime: number;
  /** A coating that settles on upward-facing surfaces (dust on rocks, frost in the dark crater). */
  coat?: { color: string; amount: number };
}

export const DETAIL = {
  paint: { mix: [0, 0, 1, 0], scale: 2.2, bump: 0.1, rough: 0.3, grime: 0.28 },
  fabric: { mix: [1, 0, 0.2, 0], scale: 1.6, bump: 0.28, rough: 0.2, grime: 0.22 },
  metal: { mix: [0, 1, 0.25, 0], scale: 3, bump: 0.1, rough: 0.55, grime: 0.2 },
  foil: { mix: [0, 0, 0.1, 1], scale: 1.6, bump: 0.75, rough: 0.5, grime: 0.08 },
  rubber: { mix: [0, 0, 1, 0.2], scale: 6, bump: 0.25, rough: 0.15, grime: 0.15 },
  rock: { mix: [0, 0, 0.8, 0.6], scale: 1.2, bump: 1.2, rough: 0.2, grime: 0.5 },
  soil: { mix: [0.3, 0, 0.7, 0.3], scale: 2.5, bump: 0.7, rough: 0.15, grime: 0.4 },
} satisfies Record<string, Detail>;

const VERT_PARS = /* glsl */ `
varying vec3 vDetailPos;
varying vec3 vDetailNormal;
`;
const VERT = /* glsl */ `
#include <begin_vertex>
#ifdef USE_INSTANCING
  vDetailPos = (instanceMatrix * vec4(position, 1.0)).xyz;
  vDetailNormal = mat3(instanceMatrix) * objectNormal;
#else
  vDetailPos = position;
  vDetailNormal = objectNormal;
#endif
`;
const FRAG_PARS = /* glsl */ `
uniform sampler2D detailMap;
uniform vec4 detailMix;
uniform float detailScale;
uniform float detailBump;
uniform float detailRough;
uniform float detailGrime;
uniform vec3 coatColor;
uniform float coatAmount;
varying vec3 vDetailPos;
varying vec3 vDetailNormal;
vec4 detailTriplanar(vec3 p, vec3 n, float scale) {
  vec3 w = pow(abs(n), vec3(4.0));
  w /= max(w.x + w.y + w.z, 1e-4);
  return texture2D(detailMap, p.zy * scale) * w.x + texture2D(detailMap, p.xz * scale) * w.y + texture2D(detailMap, p.xy * scale) * w.z;
}
vec3 detailPerturb(vec3 surfPos, vec3 surfNorm, vec2 dHdxy, float faceDir) {
  vec3 sx = dFdx(surfPos), sy = dFdy(surfPos);
  vec3 r1 = cross(sy, surfNorm), r2 = cross(surfNorm, sx);
  float det = dot(sx, r1) * faceDir;
  vec3 grad = sign(det) * (dHdxy.x * r1 + dHdxy.y * r2);
  return normalize(abs(det) * surfNorm - grad);
}
`;

/**
 * Add triplanar micro-detail to a standard or physical material. All detailed
 * materials share one shader program; only their uniforms differ.
 */
export function addDetail<T extends THREE.MeshStandardMaterial>(mat: T, d: Detail): T {
  const map = detailTexture();
  const coat = d.coat ? new THREE.Color(d.coat.color) : null;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.coatColor = { value: coat ?? new THREE.Color() };
    shader.uniforms.coatAmount = { value: d.coat?.amount ?? 0 };
    shader.uniforms.detailMap = { value: map };
    shader.uniforms.detailMix = { value: new THREE.Vector4(...d.mix) };
    shader.uniforms.detailScale = { value: d.scale };
    shader.uniforms.detailBump = { value: d.bump };
    shader.uniforms.detailRough = { value: d.rough };
    shader.uniforms.detailGrime = { value: d.grime };
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\n" + VERT_PARS).replace("#include <begin_vertex>", VERT);
    shader.fragmentShader = (coat ? "#define DETAIL_COAT\n" : "") + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\n" + FRAG_PARS)
      .replace(
        "#include <color_fragment>",
        /* glsl */ `#include <color_fragment>
        vec3 dN = normalize(vDetailNormal);
        vec4 dtl = detailTriplanar(vDetailPos, dN, detailScale);
        float dtlGrime = detailTriplanar(vDetailPos, dN, detailScale * 0.07).b;
        float dtlFade = 1.0 - smoothstep(6.0, 40.0, length(vViewPosition));
        diffuseColor.rgb *= 1.0 - detailGrime * (dtlGrime - 0.45) * 0.55 - (dtl.b - 0.5) * 0.08;
        #ifdef DETAIL_COAT
          float coatMask = smoothstep(0.25, 0.75, dN.y + (dtl.b - 0.5) * 0.6 + (dtlGrime - 0.5) * 0.4) * coatAmount;
          diffuseColor.rgb = mix(diffuseColor.rgb, coatColor, coatMask);
        #endif`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        /* glsl */ `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor * (1.0 + (dot(dtl, detailMix) / max(dot(detailMix, vec4(1.0)), 0.001) - 0.5) * detailRough) + detailGrime * (dtlGrime - 0.45) * 0.25, 0.04, 1.0);`,
      )
      .replace(
        "#include <normal_fragment_maps>",
        /* glsl */ `#include <normal_fragment_maps>
        // The weave is periodic: once its threads come closer than a few pixels apart it would beat into moiré, so its relief fades out.
        float dtlThreadPx = 1.0 / (64.0 * detailScale * max(length(fwidth(vDetailPos)), 1e-6));
        float dtlWeave = smoothstep(2.0, 4.5, dtlThreadPx);
        float dtlH = dot(dtl, detailMix * vec4(dtlWeave, 1.0, 1.0, 1.0)) * detailBump * 0.02 * dtlFade;
        normal = detailPerturb(-vViewPosition, normal, vec2(dFdx(dtlH), dFdy(dtlH)), faceDirection);`,
      );
  };
  mat.customProgramCacheKey = () => (coat ? "astra-detail-coat" : "astra-detail");
  mat.userData.detail = d;
  return mat;
}
