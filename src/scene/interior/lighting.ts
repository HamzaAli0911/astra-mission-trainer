import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { hallWalls, HOME, partitions, polar, ROOMS, type Level } from "../../sim/home";
import { addDetail, type Detail } from "../surface";

/**
 * Light inside the home. Adding real lights to the scene would recompile every shader in it (a freeze when
 * you step inside), so the home's own materials light themselves: each fragment works out which room it is in
 * from the floor plan and takes light only from that room's ceiling lamps (and the hall's, in open rooms), so
 * light never leaks through a wall. Corners darken where walls meet floors and ceilings (worked out from the
 * plan, not ray-traced). Outdoors, only the Sun reaches in, through the windows, with real shadows; the sky's
 * fill and the other outdoor lights stop at the shell.
 */

/** Lighting zones: 0 the downstairs hall, 1 the upstairs hall, then each room of the plan in order. */
export const zoneOf = (room: string, level: Level) => (room === "hall" ? level : 2 + ROOMS.findIndex((m) => m.id === room));
const ZONES = 2 + ROOMS.length;
const zoneLevel = (z: number) => (z < 2 ? z : ROOMS[z - 2].level);
const zoneOpen = (z: number) => z < 2 || !ROOMS[z - 2].closed;

/** A ceiling lamp: habitat-local position, the zone it lights, its brightness. */
export interface Lamp {
  x: number;
  y: number;
  z: number;
  zone: number;
  power: number;
  /** Room lamps are square panels; the hall has strips along the ring. */
  strip?: boolean;
}
const lamp = (room: string, level: Level, bearing: number, r: number, power = 1, y: number = HOME.ceiling[level] - 0.03): Lamp => ({ ...polar(bearing, r), y, zone: zoneOf(room, level), power });
export const LAMPS: Lamp[] = [
  ...([0, 1] as const).flatMap((level) => [22.5, 67.5, 112.5, 157.5, 202.5, 247.5, 292.5, 337.5].map((b) => ({ ...lamp("hall", level, b, 2.42, 0.5), strip: true }))),
  lamp("suit", 0, 185, 3.95),
  lamp("galley", 0, 226, 3.95),
  lamp("galley", 0, 266, 3.95),
  lamp("hygiene", 0, 310, 3.95, 0.9),
  lamp("eclss", 0, 345, 3.9, 0.85),
  lamp("eclss", 0, 15, 3.9, 0.85),
  lamp("lab", 0, 46, 3.95, 1.1),
  lamp("medical", 0, 78, 3.95, 1.1),
  // A wall light by the foot of the flight; the landing's lamp over the stairwell lights the top.
  lamp("stairs", 0, 108, 4.6, 0.7, 2.45),
  lamp("shelter", 0, 70, 0.75, 0.75),
  lamp("shelter", 0, 250, 0.75, 0.75),
  lamp("landing", 1, 130, 3.8, 0.9),
  lamp("garden", 1, 185, 3.9, 0.8),
  ...(["q1", "q2", "q3", "q4"] as const).map((id) => {
    const m = ROOMS.find((x) => x.id === id)!;
    return lamp(id, 1, (m.from + m.to) / 2, 3.9, 0.85);
  }),
  lamp("exercise", 1, 45, 3.9),
  lamp("exercise", 1, 80, 3.9),
  lamp("command", 1, 90, 0.95, 0.8),
  lamp("command", 1, 270, 0.95, 0.8),
];

/** Shared by every material inside the home: change a value once and all of them follow. */
export const insideLight = {
  /** The habitat's origin in the world. */
  uHome: { value: new THREE.Vector3() },
  uLamp: { value: LAMPS.map((l) => new THREE.Vector4(l.x, l.y, l.z, l.power)) },
  uLampZone: { value: LAMPS.map((l) => l.zone) },
  /** The lamps' colour times brightness (warmer and dimmer at night, off in a blackout). */
  uLampColor: { value: new THREE.Color(1, 0.96, 0.9).multiplyScalar(5) },
  /** Light bouncing round a lit room, as a share of the lamps. */
  uFill: { value: 0.025 },
  /** How much of the outdoor sky's fill reaches in (only through the windows, so very little). */
  uSky: { value: 0.1 },
  /** Sunlight through the windows (shadowed by the shell, so it only lands where a window lets it). */
  uSun: { value: 1 },
  /** Reflections and soft ambient light come from the room itself, so they take the lamps' colour and level. */
  uEnvTint: { value: new THREE.Color(1, 0.96, 0.9) },
};

const f = (n: number) => n.toFixed(4);
const SPLIT = (HOME.ceiling[0] + HOME.floor[1]) / 2;
/** GLSL for the floor plan: which zone a point is in, and how much the nearby walls, floor and ceiling shade it. */
function planGlsl() {
  const arcs = (level: Level) =>
    ROOMS.filter((m) => !m.core && m.level === level)
      .map((m) => `if (homeIn(b, ${f(m.from)}, ${f(m.to - m.from)})) return ${zoneOf(m.id, level)};`)
      .join("\n      ");
  const core = (level: Level) => zoneOf(ROOMS.find((m) => m.core && m.level === level)!.id, level);
  // Every wall face near a point shades it, unless the point is on that face (facing the same way).
  const walls = (level: Level) => {
    const out: string[] = [];
    for (const e of partitions(level)) {
      const n = polar(e, 1);
      // Signed distance across the partition (clockwise tangent), and how far out along it the point is.
      out.push(`{ vec2 t = vec2(${f(-n.z)}, ${f(n.x)}); float along = dot(p.xz, vec2(${f(n.x)}, ${f(n.z)}));
        if (along > ${f(HOME.hall - 0.1)}) ao *= homeOcclude(abs(dot(p.xz, t)) - ${f(HOME.wall / 2)}, dot(nrm.xz, t)); }`);
    }
    for (const m of hallWalls(level))
      out.push(`if (homeIn(b, ${f(m.from)}, ${f(m.to - m.from)})) ao *= homeOcclude(abs(r - ${f(HOME.hall)}) - ${f(HOME.wall / 2)}, nr);`);
    return out.join("\n      ");
  };
  const inner = [HOME.shelter, HOME.command];
  return /* glsl */ `
  const int HOME_ZONE_LEVEL[${ZONES}] = int[${ZONES}](${Array.from({ length: ZONES }, (_, z) => zoneLevel(z)).join(", ")});
  const bool HOME_ZONE_OPEN[${ZONES}] = bool[${ZONES}](${Array.from({ length: ZONES }, (_, z) => zoneOpen(z)).join(", ")});
  bool homeIn(float b, float from, float span) { return mod(b - from + 720.0, 360.0) <= span; }
  int homeZone(vec3 p) {
    float r = length(p.xz);
    bool up = p.y > ${f(SPLIT)};
    if (r < ${f(HOME.core)}) return up ? ${core(1)} : ${core(0)};
    if (r < ${f(HOME.hall)}) return up ? 1 : 0;
    float b = mod(degrees(atan(p.x, -p.z)) + 360.0, 360.0);
    if (up) {
      ${arcs(1)}
      return 1;
    }
    ${arcs(0)}
    return 0;
  }
  // A surface d metres from a wall face, turned 'facing' towards that face's direction (1: parallel to it).
  float homeOcclude(float d, float facing) {
    return 1.0 - 0.42 * (1.0 - smoothstep(0.0, 0.55, max(d, 0.0))) * (1.0 - abs(facing));
  }
  float homeAO(vec3 p, vec3 nrm) {
    bool up = p.y > ${f(SPLIT)};
    float r = length(p.xz);
    float b = mod(degrees(atan(p.x, -p.z)) + 360.0, 360.0);
    vec2 radial = r > 0.001 ? p.xz / r : vec2(0.0);
    float nr = dot(nrm.xz, radial);
    float ao = homeOcclude(p.y - (up ? ${f(HOME.floor[1])} : ${f(HOME.floor[0])}), nrm.y);
    ao *= homeOcclude((up ? ${f(HOME.ceiling[1])} : ${f(HOME.ceiling[0])}) - p.y, nrm.y);
    if (r > ${f(HOME.hall)}) ao *= homeOcclude(${f(HOME.lining)} - r, nr);
    else if (r > ${f(HOME.core)}) ao *= homeOcclude(r - ${f(HOME.core)}, nr);
    else ao *= homeOcclude((up ? ${f(inner[1])} : ${f(inner[0])}) - r, nr);
    if (up) {
      ${walls(1)}
    } else {
      ${walls(0)}
    }
    return ao;
  }`;
}

const FRAG_PARS = /* glsl */ `
uniform vec4 uLamp[${LAMPS.length}];
uniform float uLampZone[${LAMPS.length}];
uniform vec3 uLampColor;
uniform float uFill;
uniform float uSky;
uniform float uSun;
uniform vec3 uEnvTint;
varying vec3 vHomePos;
${planGlsl()}
`;
// Runs where the scene's lights are added up: keep the shadowed Sun, drop other outdoor lights, add the lamps.
const LAMPS_GLSL = /* glsl */ `
float homeAo = 1.0;
#if defined( RE_Direct )
{
  vec3 wN = normalize( transpose( mat3( viewMatrix ) ) * geometryNormal );
  // Step off the surface a little, so a wall's face counts as part of the room it faces.
  int zone = homeZone( vHomePos + wN * 0.06 );
  homeAo = homeAO( vHomePos, wN );
  bool open = HOME_ZONE_OPEN[ zone ];
  int level = HOME_ZONE_LEVEL[ zone ];
  for ( int i = 0; i < ${LAMPS.length}; i ++ ) {
    int lz = int( uLampZone[ i ] );
    bool lit = lz == zone || ( zone < 2 && lz != zone && HOME_ZONE_OPEN[ lz ] && HOME_ZONE_LEVEL[ lz ] == zone ) || ( lz < 2 && open && lz == level );
    if ( !lit ) continue;
    vec3 toLamp = uLamp[ i ].xyz - vHomePos;
    float d2 = dot( toLamp, toLamp );
    vec3 L = toLamp * inversesqrt( d2 );
    // Panels shine downwards; the light falls off with distance and fades out across a big room.
    float k = uLamp[ i ].w * pow( saturate( L.y ), 0.65 ) / ( d2 + 0.35 ) * ( 1.0 - smoothstep( 16.0, 40.0, d2 ) );
    directLight.color = uLampColor * k * mix( 1.0, homeAo, 0.55 );
    directLight.direction = normalize( ( viewMatrix * vec4( L, 0.0 ) ).xyz );
    directLight.visible = true;
    RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
  }
}
#endif
`;

function patchLights(chunk: string) {
  return (
    chunk
      // Outdoor point and spot lights (the rover's headlights) never reach inside.
      .replace("getPointLightInfo( pointLight, geometryPosition, directLight );", "getPointLightInfo( pointLight, geometryPosition, directLight ); directLight.color = vec3( 0.0 );")
      .replace("getSpotLightInfo( spotLight, geometryPosition, directLight );", "getSpotLightInfo( spotLight, geometryPosition, directLight ); directLight.color = vec3( 0.0 );")
      // Of the directional lights, only a shadowed one (the Sun) gets in, and only where the shell lets it.
      .replace(
        "getDirectionalLightInfo( directionalLight, directLight );",
        `getDirectionalLightInfo( directionalLight, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS )
		directLight.color *= uSun;
		#else
		directLight.color = vec3( 0.0 );
		#endif`,
      )
      .replace("#if defined( RE_IndirectDiffuse )", LAMPS_GLSL + "\n#if defined( RE_IndirectDiffuse )")
      .replace("irradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal );", "irradiance += uSky * getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal );")
      .replace(
        "#if defined( RE_IndirectSpecular )",
        `#if defined( RE_IndirectDiffuse )
  irradiance += uLampColor * uFill;
#endif
#if defined( RE_IndirectSpecular )`,
      )
  );
}

const VERT_PARS = /* glsl */ `
uniform vec3 uHome;
varying vec3 vHomePos;
`;
const VERT = /* glsl */ `
#include <project_vertex>
#ifdef USE_INSTANCING
  vHomePos = ( modelMatrix * instanceMatrix * vec4( transformed, 1.0 ) ).xyz - uHome;
#else
  vHomePos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz - uHome;
#endif
`;

/**
 * Surface patterns drawn from the floor plan instead of textures: the padded wall's quilted panels and stitched
 * seams, the floor's plates, the ceiling's tiles.
 */
export type Pattern = "pad" | "floor" | "ceiling";
const PATTERN = /* glsl */ `
#if defined( HOME_PAD ) || defined( HOME_FLOOR ) || defined( HOME_CEILING )
{
  float lvlY = vHomePos.y > ${f(SPLIT)} ? ${f(HOME.floor[1])} : ${f(HOME.floor[0])};
  float hy = vHomePos.y - lvlY;
  #ifdef HOME_PAD
    // Fifty panels round the wall, in rows; seams sunk between them, a stitch line beside each seam.
    float a = fract( ( atan( vHomePos.x, -vHomePos.z ) / 6.2831853 + 1.0 ) * 50.0 );
    float du = min( a, 1.0 - a ) * 0.622;
    float rows[4] = float[4]( 0.14, 0.92, 1.78, 2.6 );
    float dv = 9.0, below = 0.0, above = 2.6;
    for ( int i = 0; i < 4; i ++ ) { dv = min( dv, abs( hy - rows[i] ) ); if ( rows[i] <= hy ) below = rows[i]; if ( rows[i] > hy && above == 2.6 ) above = rows[i]; }
    float d = min( du, dv );
    float seam = 1.0 - smoothstep( 0.003, 0.011, d );
    float stitch = ( 1.0 - smoothstep( 0.0015, 0.004, abs( d - 0.03 ) ) ) * step( 0.5, fract( ( du < dv ? hy : a * 0.622 ) * 40.0 ) );
    diffuseColor.rgb *= 1.0 - 0.38 * seam - 0.12 * stitch;
    // The kick strip along the floor is a darker, harder-wearing fabric.
    diffuseColor.rgb *= hy < 0.14 ? 0.62 : 1.0;
    homePillow = sin( 3.14159 * clamp( a, 0.0, 1.0 ) ) * sin( 3.14159 * clamp( ( hy - below ) / max( 0.05, above - below ), 0.0, 1.0 ) );
  #endif
  #ifdef HOME_FLOOR
    // Square floor plates 0.6 m across, with fine joints and a fastener at each corner.
    vec2 g = vHomePos.xz / 0.6;
    vec2 e = abs( fract( g ) - 0.5 );
    float j = 1.0 - smoothstep( 0.49, 0.495, max( e.x, e.y ) );
    float joint = 1.0 - j;
    vec2 c = ( 0.5 - e ) * 0.6;
    float bolt = 1.0 - smoothstep( 0.006, 0.01, length( c - 0.035 ) );
    diffuseColor.rgb *= 1.0 - 0.45 * joint - 0.25 * bolt;
  #endif
  #ifdef HOME_CEILING
    vec2 g = vHomePos.xz / 0.6;
    vec2 e = abs( fract( g ) - 0.5 );
    float joint = smoothstep( 0.488, 0.494, max( e.x, e.y ) );
    diffuseColor.rgb *= 1.0 - 0.3 * joint;
  #endif
}
#endif
`;

/** Make a material light itself the way the inside of the home is lit (see above), maybe with a surface pattern. */
export function inside<T extends THREE.MeshStandardMaterial>(mat: T, pattern?: Pattern): T {
  const before = mat.onBeforeCompile.bind(mat);
  const key = mat.customProgramCacheKey.bind(mat);
  mat.onBeforeCompile = (shader, renderer) => {
    before(shader, renderer);
    Object.assign(shader.uniforms, insideLight);
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\n" + VERT_PARS).replace("#include <project_vertex>", VERT);
    if (pattern) shader.fragmentShader = `#define HOME_${pattern.toUpperCase()}\n` + shader.fragmentShader;
    if (mat.userData.detail) shader.fragmentShader = "#define DETAIL_PERTURB\n" + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\n" + FRAG_PARS + "\nfloat homePillow = 0.0;")
      .replace("#include <color_fragment>", "#include <color_fragment>\n" + PATTERN)
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
        #if defined( HOME_PAD ) && defined( DETAIL_PERTURB )
          normal = detailPerturb( -vViewPosition, normal, vec2( dFdx( homePillow ), dFdy( homePillow ) ) * 0.035, faceDirection );
        #endif`,
      )
      .replace("#include <lights_fragment_begin>", patchLights(THREE.ShaderChunk.lights_fragment_begin))
      .replace(
        "#include <lights_fragment_maps>",
        `#include <lights_fragment_maps>
        #if defined( RE_IndirectDiffuse )
          iblIrradiance *= uEnvTint;
        #endif
        #if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )
          radiance *= uEnvTint;
        #endif`,
      )
      .replace(
        "#include <aomap_fragment>",
        `#include <aomap_fragment>
        reflectedLight.indirectDiffuse *= homeAo;
        reflectedLight.indirectSpecular *= mix( 1.0, homeAo, 0.6 );`,
      );
  };
  mat.customProgramCacheKey = () => `astra-inside${pattern ?? ""}|` + key();
  mat.envMapIntensity = 0.12;
  return mat;
}

/* ---------- Materials for the inside ---------- */

/** Surface detail seen from a step away, not across a crater: fine and quiet (no scratches catching the light). */
const FINE = {
  panel: { mix: [0, 0, 1, 0], scale: 1.4, bump: 0.02, rough: 0.12, grime: 0.05 },
  pad: { mix: [1, 0, 0.12, 0], scale: 2.6, bump: 0.1, rough: 0.1, grime: 0.05 },
  metal: { mix: [0, 1, 0.1, 0], scale: 3, bump: 0.05, rough: 0.4, grime: 0.06 },
  rubber: { mix: [0, 0, 1, 0.15], scale: 5, bump: 0.12, rough: 0.12, grime: 0.1 },
} satisfies Record<string, Detail>;

const cache = new Map<string, THREE.Material>();
function made<T extends THREE.Material>(key: string, make: () => T): T {
  let m = cache.get(key) as T | undefined;
  if (!m) {
    m = make();
    m.userData.shared = true;
    cache.set(key, m);
  }
  return m;
}
/**
 * Every material is also filed under its finish (what it's made of, how rough, its pattern), without its colour:
 * when the inside is merged, parts of the same finish become one mesh, their colours carried per vertex.
 */
const std = (key: string, params: THREE.MeshStandardMaterialParameters, detail?: Detail, pattern?: Pattern) =>
  made(key + (pattern ?? ""), () => {
    const m = new THREE.MeshStandardMaterial(params);
    const out = inside(detail ? addDetail(m, detail) : m, pattern);
    const { color: _, ...rest } = params;
    out.userData.finish = JSON.stringify([rest, detail ?? null, pattern ?? null]);
    return out;
  });
const finishes = new Map<string, THREE.MeshStandardMaterial>();
/** The one material for a finish, coloured per vertex. */
export function finishMaterial(finish: string) {
  let m = finishes.get(finish);
  if (!m) {
    const [rest, detail, pattern] = JSON.parse(finish) as [THREE.MeshStandardMaterialParameters, Detail | null, Pattern | null];
    const base = new THREE.MeshStandardMaterial({ ...rest, color: "#ffffff", vertexColors: true });
    m = inside(detail ? addDetail(base, detail) : base, pattern ?? undefined);
    m.userData.shared = true;
    finishes.set(finish, m);
  }
  return m;
}
/** Painted panels and furniture. */
export const ipaint = (color: string, rough = 0.6, metalness = 0.05, pattern?: Pattern) => std(`ip:${color}:${rough}:${metalness}`, { color, roughness: rough, metalness }, FINE.panel, pattern);
/** Padded fabric: the wall lining, cushions, bags. Never shiny. */
export const ifabric = (color: string, rough = 0.92, pattern?: Pattern) => std(`if:${color}:${rough}`, { color, roughness: rough, metalness: 0 }, FINE.pad, pattern);
/** Brushed metal: rails, frames, fittings. */
export const imetal = (color = "#9aa3b4", rough = 0.38) => std(`im:${color}:${rough}`, { color, roughness: rough, metalness: 0.75 }, FINE.metal);
/** Satin plastic: screens' bezels, handles, trim. */
export const iplastic = (color: string, rough = 0.45) => std(`ipl:${color}:${rough}`, { color, roughness: rough, metalness: 0 });
/** Rubber floors, seals and grips. */
export const irubber = (color = "#2a2e36", pattern?: Pattern) => std(`ir:${color}`, { color, roughness: 0.9, metalness: 0 }, FINE.rubber, pattern);

/** The lit face of a lamp, owned by one model so it can dim with the power. */
export function lampFace() {
  return new THREE.MeshStandardMaterial({ color: "#fff6e8", emissive: "#fff3e0", emissiveIntensity: 2.2, roughness: 0.4, toneMapped: false });
}

/** A soft studio-like reflection for shiny things inside (the outdoor sky would look wrong in a room). */
export function insideEnvironment(renderer: THREE.WebGLRenderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const rt = pmrem.fromScene(room, 0.04);
  room.dispose();
  pmrem.dispose();
  return rt;
}
