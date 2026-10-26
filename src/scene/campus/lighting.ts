import * as THREE from "three";
import { CELLS, FLOOR, MEZZANINE, type Cell } from "../../sim/base";
import { FINE } from "../interior/lighting";
import { addDetail, type Detail } from "../surface";

/**
 * Light inside the campus, the way Hab-1 is lit (see interior/lighting.ts) but for a plan of rectangular rooms:
 * every vertex of the campus carries the index of the room (cell) it belongs to, so a fragment adds up only its own
 * room's ceiling lamps (no light through a wall, however thin) and darkens towards its own room's walls, floor and
 * ceiling. The Sun only reaches in where shadows let it; the other outdoor lights stop at the shell. The lamps and
 * the rooms' boxes live in one small float texture, so the shader's size doesn't grow with the campus.
 */

export const CELL_INDEX = new Map(CELLS.map((c, i) => [c.id, i]));
/** The floor and ceiling heights a room is lit between. */
export const cellFloor = (c: Cell) => (c.kind === "hangar" ? 0.02 : c.level === 2 ? MEZZANINE : FLOOR);
export const cellCeiling = (c: Cell) => cellFloor(c) + c.height;

export interface CampusLamp {
  x: number;
  y: number;
  z: number;
  cell: number;
  power: number;
}
/** Ceiling lamps in a grid over each room (strips down the middle of corridors; high bays in the hall and the garage). */
export const CAMPUS_LAMPS: CampusLamp[] = (() => {
  const out: CampusLamp[] = [];
  CELLS.forEach((c, i) => {
    const r = c.rect,
      w = r.x1 - r.x0,
      d = r.z1 - r.z0;
    const y = cellCeiling(c) - 0.04;
    // Brighter lamps the higher they hang, so the floor gets about the same light.
    const power = Math.max(1, (c.height / 2.7) ** 2) * (c.kind === "corridor" ? 0.7 : 1);
    const spacing = c.kind === "corridor" ? 3.2 : c.kind === "hall" || c.kind === "hangar" ? 5.5 : 3.4;
    const nx = Math.max(1, Math.round(w / spacing)),
      nz = Math.max(1, Math.round(d / spacing));
    // Corridors: one row down the middle.
    const rows = c.kind === "corridor" ? (w > d ? [1, nz] : [nx, 1]) : [nx, nz];
    for (let a = 0; a < rows[0]; a++)
      for (let b = 0; b < rows[1]; b++) out.push({ x: r.x0 + (w * (a + 0.5)) / rows[0], y, z: r.z0 + (d * (b + 0.5)) / rows[1], cell: i, power });
    // Under the HQ mezzanine, the hall has a row of lower lamps of its own.
    if (c.id === "hq-hall") for (let a = 0; a < 6; a++) out.push({ x: r.x0 + (w * (a + 0.5)) / 6, y: MEZZANINE - 0.36, z: 53.4, cell: i, power: 1.1 });
  });
  return out.sort((a, b) => a.cell - b.cell);
})();

/** Shared by every campus material: change a value once and all of them follow. */
export const campusLight = {
  uCampusData: { value: null as THREE.DataTexture | null },
  uCampusLampColor: { value: new THREE.Color(1, 0.97, 0.92).multiplyScalar(5) },
  uCampusFill: { value: 0.03 },
  uCampusSky: { value: 0.08 },
  uCampusSun: { value: 1 },
  uCampusEnvTint: { value: new THREE.Color(1, 0.97, 0.92) },
};

/** The lamps (row 0), the rooms' boxes (row 1) and their heights and lamps (row 2), as one float texture. */
export function campusData() {
  if (campusLight.uCampusData.value) return campusLight.uCampusData.value;
  const width = Math.max(CAMPUS_LAMPS.length, CELLS.length);
  const data = new Float32Array(width * 3 * 4);
  CAMPUS_LAMPS.forEach((l, i) => data.set([l.x, l.y, l.z, l.power], i * 4));
  CELLS.forEach((c, i) => {
    const lamps = CAMPUS_LAMPS.map((l, k) => [l, k] as const).filter(([l]) => l.cell === i);
    data.set([c.rect.x0, c.rect.z0, c.rect.x1, c.rect.z1], (width + i) * 4);
    data.set([cellFloor(c), cellCeiling(c), lamps.length ? lamps[0][1] : 0, lamps.length], (width * 2 + i) * 4);
  });
  const t = new THREE.DataTexture(data, width, 3, THREE.RGBAFormat, THREE.FloatType);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  t.userData.shared = true;
  campusLight.uCampusData.value = t;
  return t;
}

const VERT_PARS = /* glsl */ `
attribute float cell;
flat varying int vCell;
varying vec3 vCampusPos;
varying vec3 vCampusN;
`;
const VERT = /* glsl */ `
#include <project_vertex>
vCell = int( cell + 0.5 );
#ifdef USE_INSTANCING
  vCampusPos = ( modelMatrix * instanceMatrix * vec4( transformed, 1.0 ) ).xyz;
  vCampusN = normalize( mat3( modelMatrix ) * mat3( instanceMatrix ) * objectNormal );
#else
  vCampusPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
  vCampusN = normalize( mat3( modelMatrix ) * objectNormal );
#endif
`;
const FRAG_PARS = /* glsl */ `
uniform highp sampler2D uCampusData;
uniform vec3 uCampusLampColor;
uniform float uCampusFill;
uniform float uCampusSky;
uniform float uCampusSun;
uniform vec3 uCampusEnvTint;
flat varying int vCell;
varying vec3 vCampusPos;
varying vec3 vCampusN;
vec4 campusRect() { return texelFetch( uCampusData, ivec2( vCell, 1 ), 0 ); }
vec4 campusInfo() { return texelFetch( uCampusData, ivec2( vCell, 2 ), 0 ); }
// A surface d metres from a wall face, turned 'facing' towards that face's direction (1: parallel to it).
float campusOcclude( float d, float facing ) {
  return 1.0 - 0.42 * ( 1.0 - smoothstep( 0.0, 0.55, max( d, 0.0 ) ) ) * ( 1.0 - abs( facing ) );
}
float campusAO( vec3 p, vec3 n ) {
  vec4 r = campusRect(), info = campusInfo();
  float ao = campusOcclude( p.x - r.x, n.x ) * campusOcclude( r.z - p.x, n.x ) * campusOcclude( p.z - r.y, n.z ) * campusOcclude( r.w - p.z, n.z );
  return ao * campusOcclude( p.y - info.x, n.y ) * campusOcclude( info.y - p.y, n.y );
}
`;
// Runs where the scene's lights are added up: keep the shadowed Sun, drop other outdoor lights, add the room's lamps.
const LAMPS_GLSL = /* glsl */ `
float campusAo = 1.0;
#if defined( RE_Direct )
{
  campusAo = campusAO( vCampusPos, normalize( vCampusN ) );
  vec4 info = campusInfo();
  int from = int( info.z ), count = int( info.w );
  for ( int i = from; i < from + count; i ++ ) {
    vec4 lamp = texelFetch( uCampusData, ivec2( i, 0 ), 0 );
    vec3 toLamp = lamp.xyz - vCampusPos;
    float d2 = dot( toLamp, toLamp );
    if ( d2 > 90.0 || toLamp.y <= 0.0 ) continue;
    vec3 L = toLamp * inversesqrt( d2 );
    float k = lamp.w * pow( saturate( L.y ), 0.65 ) / ( d2 + 0.35 ) * ( 1.0 - smoothstep( 30.0, 90.0, d2 ) );
    directLight.color = uCampusLampColor * k * mix( 1.0, campusAo, 0.55 );
    directLight.direction = normalize( ( viewMatrix * vec4( L, 0.0 ) ).xyz );
    directLight.visible = true;
    if ( d2 < 9.0 ) RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
    else reflectedLight.directDiffuse += saturate( dot( geometryNormal, directLight.direction ) ) * directLight.color * BRDF_Lambert( material.diffuseColor );
  }
}
#endif
`;

function patchLights(chunk: string) {
  return chunk
    .replace("getPointLightInfo( pointLight, geometryPosition, directLight );", "getPointLightInfo( pointLight, geometryPosition, directLight ); directLight.color = vec3( 0.0 );")
    .replace("getSpotLightInfo( spotLight, geometryPosition, directLight );", "getSpotLightInfo( spotLight, geometryPosition, directLight ); directLight.color = vec3( 0.0 );")
    .replace(
      "getDirectionalLightInfo( directionalLight, directLight );",
      `getDirectionalLightInfo( directionalLight, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS )
		directLight.color *= uCampusSun;
		#else
		directLight.color = vec3( 0.0 );
		#endif`,
    )
    .replace("#if defined( RE_IndirectDiffuse )", LAMPS_GLSL + "\n#if defined( RE_IndirectDiffuse )")
    .replace("irradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal );", "irradiance += uCampusSky * getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal );")
    .replace(
      "#if defined( RE_IndirectSpecular )",
      `#if defined( RE_IndirectDiffuse )
  irradiance += uCampusLampColor * uCampusFill;
#endif
#if defined( RE_IndirectSpecular )`,
    );
}

/**
 * Surface patterns from the plan instead of textures: floor plates, ceiling tiles, wall panels (vertical joints, a
 * rail at hand height, a darker kick plate), and the corridors' ribbed liner.
 */
export type CampusPattern = "floor" | "ceiling" | "wall" | "liner";
const PATTERN = /* glsl */ `
#if defined( CAMPUS_FLOOR ) || defined( CAMPUS_CEILING ) || defined( CAMPUS_WALL ) || defined( CAMPUS_LINER )
{
  vec3 p = vCampusPos;
  vec3 n = normalize( vCampusN );
  float hy = p.y - campusInfo().x;
  #ifdef CAMPUS_FLOOR
    // Plates 1.2 by 0.6 m, laid in a running bond, with fine joints and a fastener at each corner.
    vec2 g = p.xz / vec2( 1.2, 0.6 );
    g.x += step( 0.5, fract( g.y * 0.5 ) ) * 0.5;
    vec2 e = abs( fract( g ) - 0.5 );
    float joint = 1.0 - ( 1.0 - smoothstep( 0.493, 0.497, e.x ) ) * ( 1.0 - smoothstep( 0.488, 0.494, e.y ) );
    vec2 c = ( 0.5 - e ) * vec2( 1.2, 0.6 );
    float bolt = 1.0 - smoothstep( 0.006, 0.01, length( c - 0.04 ) );
    diffuseColor.rgb *= 1.0 - 0.4 * joint - 0.22 * bolt;
  #endif
  #ifdef CAMPUS_CEILING
    vec2 g = p.xz / 0.6;
    vec2 e = abs( fract( g ) - 0.5 );
    diffuseColor.rgb *= 1.0 - 0.28 * smoothstep( 0.486, 0.493, max( e.x, e.y ) );
  #endif
  #if defined( CAMPUS_WALL ) || defined( CAMPUS_LINER )
    float along = abs( n.x ) > 0.5 ? p.z : p.x;
    #ifdef CAMPUS_WALL
      // Panels 1.2 m wide; a rail at 0.95 m; the kick plate below 0.14 m.
      float a = fract( along / 1.2 );
      float joint = 1.0 - smoothstep( 0.004, 0.009, min( a, 1.0 - a ) * 1.2 );
      float rail = 1.0 - smoothstep( 0.02, 0.026, abs( hy - 0.95 ) );
      diffuseColor.rgb *= ( 1.0 - 0.35 * joint ) * ( 1.0 - 0.18 * rail ) * ( hy < 0.14 ? 0.55 : 1.0 );
    #else
      // Ribs every 0.6 m round the corridor's liner, and a darker band at floor level.
      float a = fract( along / 0.6 );
      float rib = smoothstep( 0.0, 0.06, min( a, 1.0 - a ) );
      diffuseColor.rgb *= ( 0.82 + 0.18 * rib ) * ( hy < 0.14 ? 0.6 : 1.0 );
    #endif
  #endif
}
#endif
`;

/** Make a material light itself the way the inside of the campus is lit (see above), maybe with a surface pattern. */
export function campusInside<T extends THREE.MeshStandardMaterial>(mat: T, pattern?: CampusPattern): T {
  const before = mat.onBeforeCompile.bind(mat);
  const key = mat.customProgramCacheKey.bind(mat);
  campusData();
  mat.onBeforeCompile = (shader, renderer) => {
    before(shader, renderer);
    Object.assign(shader.uniforms, campusLight);
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\n" + VERT_PARS).replace("#include <project_vertex>", VERT);
    if (pattern) shader.fragmentShader = `#define CAMPUS_${pattern.toUpperCase()}\n` + shader.fragmentShader;
    if (mat.userData.detail) shader.fragmentShader = "#define DETAIL_PERTURB\n#define DETAIL_NO_GRIME\n#define DETAIL_ONE_PLANE\n" + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\n" + FRAG_PARS)
      .replace("#include <color_fragment>", "#include <color_fragment>\n" + PATTERN)
      .replace("#include <lights_fragment_begin>", patchLights(THREE.ShaderChunk.lights_fragment_begin))
      .replace(
        "#include <lights_fragment_maps>",
        `#include <lights_fragment_maps>
        #if defined( RE_IndirectDiffuse )
          iblIrradiance *= uCampusEnvTint;
        #endif
        #if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )
          radiance *= uCampusEnvTint;
        #endif`,
      )
      .replace(
        "#include <aomap_fragment>",
        `#include <aomap_fragment>
        reflectedLight.indirectDiffuse *= campusAo;
        reflectedLight.indirectSpecular *= mix( 1.0, campusAo, 0.6 );`,
      );
  };
  mat.customProgramCacheKey = () => `astra-campus${pattern ?? ""}|` + key();
  mat.envMapIntensity = 0.12;
  return mat;
}

/* ---------- Materials ---------- */

const cache = new Map<string, THREE.MeshStandardMaterial>();
/** One material per finish (what it's made of, how rough, its pattern), coloured per vertex. */
function finish(key: string, params: THREE.MeshStandardMaterialParameters, detail?: Detail, pattern?: CampusPattern) {
  const k = key + (pattern ?? "");
  let m = cache.get(k);
  if (!m) {
    const base = new THREE.MeshStandardMaterial({ ...params, color: "#ffffff", vertexColors: true });
    m = campusInside(detail ? addDetail(base, detail) : base, pattern);
    m.userData.shared = true;
    cache.set(k, m);
  }
  return m;
}
/** The finishes of the campus inside: painted panels, metal, satin plastic, rubber, and soft fabric. */
export const FINISH = {
  paint: (pattern?: CampusPattern, rough = 0.62) => finish(`paint:${rough}`, { roughness: rough, metalness: 0.05 }, FINE.panel, pattern),
  metal: (rough = 0.38) => finish(`metal:${rough}`, { roughness: rough, metalness: 0.75 }, FINE.metal),
  plastic: (rough = 0.45) => finish(`plastic:${rough}`, { roughness: rough, metalness: 0 }),
  rubber: (pattern?: CampusPattern) => finish("rubber", { roughness: 0.9, metalness: 0 }, FINE.rubber, pattern),
  fabric: () => finish("fabric", { roughness: 0.92, metalness: 0 }, FINE.pad),
};
export type Finish = keyof typeof FINISH;
