import * as THREE from "three";
import type { Planet } from "../sim/types";
import { noise } from "../sim/world";
import type { Baked } from "./bake";
import { canvasTexture, rng } from "./kit";

export const SKY_RADIUS = 2600;

export const NOISE_GLSL = /* glsl */ `
float hash3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise3(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash3(i), hash3(i + vec3(1, 0, 0)), f.x), mix(hash3(i + vec3(0, 1, 0)), hash3(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hash3(i + vec3(0, 0, 1)), hash3(i + vec3(1, 0, 1)), f.x), mix(hash3(i + vec3(0, 1, 1)), hash3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float fbm3(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise3(p); p *= 2.03; a *= 0.5; } return s; }
`;

/** The sky dome: the Milky Way over the black lunar sky, or Mars's butterscotch day and blue sunset. */
function dome(planet: Planet) {
  const uniforms = {
    sunDir: { value: new THREE.Vector3(0, 1, 0) },
    day: { value: 1 },
    dust: { value: 0 },
    storm: { value: 0 },
    zenith: { value: new THREE.Color("#b88762") },
    horizon: { value: new THREE.Color("#e2b68c") },
    dusk: { value: new THREE.Color("#5f8dd0") },
    dustColor: { value: new THREE.Color("#8f5e40") },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    defines: { MARS: planet === "mars" ? 1 : 0 },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 sunDir, zenith, horizon, dusk, dustColor;
      uniform float day, dust, storm;
      varying vec3 vDir;
      ${NOISE_GLSL}
      void main() {
        vec3 d = normalize(vDir);
        float sd = max(dot(d, sunDir), 0.0);
        vec3 col;
      #if MARS == 0
        // The Milky Way: a tilted band of faint light broken by dark dust lanes.
        vec3 bn = normalize(vec3(0.42, 0.55, 0.72));
        float b = dot(d, bn);
        float band = exp(-b * b * 14.0);
        float clouds = fbm3(d * 5.0);
        float lanes = smoothstep(0.48, 0.72, fbm3(d * 10.0 + 3.0)) * exp(-b * b * 60.0);
        col = vec3(0.004, 0.005, 0.009);
        col += vec3(0.42, 0.48, 0.7) * band * (0.025 + clouds * 0.07) * (1.0 - lanes * 0.75);
        col += vec3(0.85, 0.72, 0.55) * pow(band, 5.0) * clouds * 0.06 * (1.0 - lanes);
        // No air to scatter sunlight: only a tight glare around the Sun.
        col += vec3(1.0, 0.94, 0.82) * (pow(sd, 1600.0) * 30.0 + pow(sd, 90.0) * 0.12 + pow(sd, 12.0) * 0.012);

      #else
        float h = max(d.y, 0.0);
        float up = smoothstep(-0.12, 0.18, sunDir.y);
        vec3 sky = mix(horizon, zenith, pow(h, 0.5));
        // Dust scatters blue light forward, so the Sun sits in a blue halo at sunset.
        float low = 1.0 - smoothstep(0.02, 0.5, sunDir.y);
        sky = mix(sky, dusk, pow(sd, 5.0) * (0.25 + low * 0.7));
        // A pale aureole around the Sun from dust scattering light forward, and a hazy, brighter horizon.
        sky += vec3(1.0, 0.92, 0.8) * pow(sd, 8.0) * 0.22 * up;
        sky *= 0.86 + 0.3 * pow(1.0 - h, 4.0);
        sky += vec3(1.0, 0.96, 0.9) * (pow(sd, 2400.0) * 20.0 + pow(sd, 60.0) * 0.25);
        // The horizon away from the Sun goes dim first.
        sky *= mix(1.0, 0.55 + 0.45 * sd, low * 0.6);
        vec3 night = vec3(0.006, 0.006, 0.014) + vec3(0.02, 0.012, 0.01) * (1.0 - h);
        col = mix(night, sky, up);
        col = mix(col, dustColor * (0.08 + 0.92 * up) * (0.9 + 0.2 * fbm3(d * 4.0)), dust);
      #endif
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(SKY_RADIUS, 64, 32), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return { mesh, uniforms };
}

/** Thousands of stars with real-looking colours and brightness. */
function stars(planet: Planet) {
  const n = 6000;
  const pos = new Float32Array(n * 3),
    col = new Float32Array(n * 3),
    size = new Float32Array(n);
  const r = rng(planet === "moon" ? 3 : 4);
  const c = new THREE.Color();
  const band = new THREE.Vector3(0.42, 0.55, 0.72).normalize();
  const v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    // More stars crowd into the Milky Way.
    for (let k = 0; k < 4; k++) {
      const u = r() * 2 - 1,
        a = r() * Math.PI * 2,
        s = Math.sqrt(1 - u * u);
      v.set(Math.cos(a) * s, u, Math.sin(a) * s);
      if (Math.abs(v.dot(band)) < 0.25 || r() < 0.45) break;
    }
    v.multiplyScalar(SKY_RADIUS * 0.94);
    pos.set([v.x, v.y, v.z], i * 3);
    const t = r();
    c.set(t < 0.12 ? "#9db8ff" : t < 0.3 ? "#cad7ff" : t < 0.75 ? "#ffffff" : t < 0.92 ? "#fff1d6" : "#ffcf9e");
    const bright = 0.25 + r() ** 6 * 2.4;
    col.set([c.r * bright, c.g * bright, c.b * bright], i * 3);
    size[i] = 1 + r() ** 8 * 2.6;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  geo.setAttribute("size", new THREE.BufferAttribute(size, 1));
  const uniforms = { fade: { value: 1 }, time: { value: 0 }, twinkle: { value: planet === "mars" ? 1 : 0 }, scale: { value: 1 } };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    fog: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute float size; attribute vec3 color;
      uniform float time, twinkle, scale;
      varying vec3 vColor;
      void main() {
        float tw = 1.0 - twinkle * 0.35 * (0.5 + 0.5 * sin(time * (2.0 + fract(position.x * 0.13) * 5.0) + position.z));
        vColor = color * tw;
        gl_PointSize = size * scale;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float fade;
      varying vec3 vColor;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = smoothstep(1.0, 0.0, d);
        gl_FragColor = vec4(vColor * a * a * fade, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return { points, uniforms };
}

function sunSprite(planet: Planet) {
  const tex = canvasTexture(256, 256, (c) => {
    const g = c.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.07, "rgba(255,255,255,1)");
    g.addColorStop(0.09, "rgba(255,240,215,0.55)");
    g.addColorStop(0.25, "rgba(255,225,180,0.12)");
    g.addColorStop(1, "rgba(255,220,170,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, 256, 256);
    // Faint diffraction spikes, like a camera sees them.
    c.globalCompositeOperation = "lighter";
    for (let i = 0; i < 4; i++) {
      c.save();
      c.translate(128, 128);
      c.rotate((i * Math.PI) / 4 + 0.2);
      const s = c.createLinearGradient(-128, 0, 128, 0);
      s.addColorStop(0, "rgba(255,240,220,0)");
      s.addColorStop(0.5, `rgba(255,240,220,${i % 2 ? 0.08 : 0.16})`);
      s.addColorStop(1, "rgba(255,240,220,0)");
      c.fillStyle = s;
      c.fillRect(-128, -1.5, 256, 3);
      c.restore();
    }
  });
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending });
  mat.color.setRGB(4, 3.8, 3.4);
  const s = new THREE.Sprite(mat);
  // No air on the Moon to spread the glare: a smaller, sharper Sun.
  const size = planet === "mars" ? 420 : 380;
  s.scale.set(size, size, 1);
  s.renderOrder = -8;
  return s;
}

/** Earth's surface, from the baked pixels. */
function earthTexture(pixels: Uint8ClampedArray) {
  const t = new THREE.DataTexture(new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength), 512, 256, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.flipY = true;
  t.needsUpdate = true;
  return t;
}

/** A body lit by the Sun, with an optional glowing atmosphere rim. */
function litBody(geo: THREE.BufferGeometry, map: THREE.Texture | null, color: string, rim: string | null) {
  const uniforms = {
    sunDir: { value: new THREE.Vector3(0, 1, 0) },
    map: { value: map },
    useMap: { value: map ? 1 : 0 },
    tint: { value: new THREE.Color(color) },
    rim: { value: new THREE.Color(rim ?? "#000000") },
    fade: { value: 1 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    fog: false,
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vV; varying vec2 vUv;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vN = normalize(mat3(modelMatrix) * normal);
        vV = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 sunDir, tint, rim; uniform sampler2D map; uniform float useMap, fade;
      varying vec3 vN; varying vec3 vV; varying vec2 vUv;
      void main() {
        vec3 n = normalize(vN);
        float l = dot(n, sunDir);
        vec3 base = useMap > 0.5 ? texture2D(map, vUv).rgb : tint;
        float lit = smoothstep(-0.08, 0.35, l);
        vec3 col = base * (0.012 + lit * 1.5);
        // Sunlight glinting off the oceans (blue, unclouded areas).
        float ocean = useMap > 0.5 ? smoothstep(0.05, 0.25, base.b - max(base.r, base.g)) : 0.0;
        col += vec3(1.0, 0.95, 0.85) * pow(max(dot(reflect(-sunDir, n), vV), 0.0), 60.0) * ocean * 0.8 * lit;
        float f = pow(1.0 - max(dot(n, vV), 0.0), 3.0);
        col += rim * f * smoothstep(-0.3, 0.4, l) * 1.6;
        gl_FragColor = vec4(col, fade);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  return { mesh: new THREE.Mesh(geo, mat), uniforms };
}

function lumpy(seed: number, squash: number) {
  const g = new THREE.IcosahedronGeometry(1, 4);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.set(p.getX(i), p.getY(i), p.getZ(i));
    const k = 0.85 + noise(v.x * 2 + seed, v.y * 2 + v.z) * 0.3 - Math.max(0, noise(v.x * 6 - seed, v.z * 6 + v.y * 3) - 0.6) * 0.4;
    p.setXYZ(i, v.x * k * squash, v.y * k, v.z * k);
  }
  g.computeVertexNormals();
  return g;
}

export interface Sky {
  group: THREE.Group;
  update(camera: THREE.PerspectiveCamera, sun: THREE.Vector3, opts: { day: number; dust: number; storm: number; time: number; pixelRatio: number }): void;
}

/** Everything beyond the horizon: sky, stars, the Sun, Earth over the Moon or Phobos and Deimos over Mars. */
export function buildSky(baked: Baked): Sky {
  const planet = baked.planet;
  const group = new THREE.Group();
  const sky = dome(planet);
  group.add(sky.mesh);
  const st = stars(planet);
  group.add(st.points);
  const sun = sunSprite(planet);
  group.add(sun);
  const bodies: { mesh: THREE.Mesh; uniforms: { sunDir: { value: THREE.Vector3 }; fade: { value: number } }; dir: THREE.Vector3; dist: number; drift: number }[] = [];
  if (planet === "moon") {
    // From the lunar south pole Earth hangs low over the horizon and never sets.
    const earth = litBody(new THREE.SphereGeometry(1, 48, 32), baked.earth ? earthTexture(baked.earth) : null, "#2a62b8", "#5aa0ff");
    // Close to Earth's real size in the lunar sky (about 2°), a little enlarged so it reads at game distances.
    earth.mesh.scale.setScalar(44);
    earth.mesh.rotation.set(0.4, 2.2, 0.1);
    bodies.push({ ...earth, dir: new THREE.Vector3(-0.42, 0.17, -0.9).normalize(), dist: SKY_RADIUS * 0.85, drift: 0.01 });
    group.add(earth.mesh);
  } else {
    const phobos = litBody(lumpy(3, 1.3), null, "#7d6f66", null);
    // Phobos looks about a third the size of our Moon from Mars; Deimos is little more than a bright star.
    phobos.mesh.scale.setScalar(9);
    bodies.push({ ...phobos, dir: new THREE.Vector3(0.6, 0.38, -0.7).normalize(), dist: SKY_RADIUS * 0.85, drift: 0.06 });
    const deimos = litBody(lumpy(9, 1.15), null, "#8a7d72", null);
    deimos.mesh.scale.setScalar(3);
    bodies.push({ ...deimos, dir: new THREE.Vector3(-0.5, 0.55, 0.66).normalize(), dist: SKY_RADIUS * 0.85, drift: 0.015 });
    group.add(phobos.mesh, deimos.mesh);
  }
  const up = new THREE.Vector3(0, 1, 0);
  const tmp = new THREE.Vector3();
  return {
    group,
    update(camera, dir, o) {
      group.position.copy(camera.position);
      sky.uniforms.sunDir.value.copy(dir);
      sky.uniforms.day.value = o.day;
      sky.uniforms.dust.value = o.dust;
      sky.uniforms.storm.value = o.storm;
      const night = planet === "moon" ? 1 : 1 - THREE.MathUtils.smoothstep(dir.y, -0.15, 0.15);
      // Stars fade in daylight (the bright ground swamps them), and fully on Mars where the sky glows.
      st.uniforms.fade.value = (planet === "moon" ? 0.4 + 0.6 * (1 - o.day) : night * 0.9) * (1 - o.dust * 0.95);
      st.uniforms.time.value = o.time;
      st.uniforms.scale.value = o.pixelRatio;
      sun.position.copy(dir).multiplyScalar(SKY_RADIUS * 0.9);
      sun.visible = dir.y > -0.08;
      sun.material.opacity = 1 - o.dust * 0.85;
      for (const b of bodies) {
        tmp.copy(b.dir).applyAxisAngle(up, o.time * b.drift * 0.02);
        b.mesh.position.copy(tmp).multiplyScalar(b.dist);
        b.uniforms.sunDir.value.copy(dir);
        b.uniforms.fade.value = planet === "moon" ? 1 : Math.max(0.15, night) * (1 - o.dust);
      }
    },
  };
}

/** A soft image of the sky and ground, so metal and glass have something to reflect. */
export function environmentMap(renderer: THREE.WebGLRenderer, planet: Planet) {
  const scene = new THREE.Scene();
  // What shiny things see: on the Moon a black sky over bright grey ground; on Mars a butterscotch sky over rusty ground.
  const top = planet === "moon" ? "#020306" : "#9a6c4c",
    mid = planet === "moon" ? "#2b2c31" : "#d9a77b",
    ground = planet === "moon" ? "#8d8e93" : "#94593b";
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {
      top: { value: new THREE.Color(top) },
      mid: { value: new THREE.Color(mid) },
      ground: { value: new THREE.Color(ground) },
      sun: { value: new THREE.Vector3(0.6, planet === "moon" ? 0.22 : 0.45, -0.75).normalize() },
    },
    vertexShader: "varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: /* glsl */ `
      uniform vec3 top, mid, ground, sun; varying vec3 vP;
      void main() {
        vec3 d = normalize(vP);
        vec3 c = d.y > 0.0 ? mix(mid, top, pow(d.y, 0.35)) : mix(mid, ground, pow(-d.y, 0.25));
        // The sunlit side of the ground is brighter than the side in shadow.
        float facing = dot(normalize(vec3(d.x, 0.0, d.z)), normalize(vec3(sun.x, 0.0, sun.z)));
        if (d.y < 0.0) c *= 0.75 + 0.45 * (facing * 0.5 + 0.5);
        c += vec3(1.0, 0.95, 0.85) * pow(max(dot(d, sun), 0.0), 220.0) * 30.0 + vec3(1.0, 0.92, 0.8) * pow(max(dot(d, sun), 0.0), 12.0) * 0.25;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 48, 24), mat));
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(scene, 0.02);
  pmrem.dispose();
  mat.dispose();
  return rt;
}
