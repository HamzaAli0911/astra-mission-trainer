import * as THREE from "three";
import type { Planet } from "../sim/types";
import { CRATER, FLAT, ROCKS, type Site, terrainHeight, WORLD } from "../sim/world";
import { canvasTexture, light } from "./kit";

const smooth = (a: number, b: number, v: number) => {
  const x = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return x * x * (3 - 2 * x);
};
function hash(x: number, y: number) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function noise(x: number, y: number) {
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
const fbm = (x: number, y: number) =>
  noise(x, y) * 0.5 + noise(x * 2.1, y * 2.1) * 0.27 + noise(x * 4.3, y * 4.3) * 0.15 + noise(x * 8.7, y * 8.7) * 0.08;

export const PALETTE = {
  moon: { ground: "#a3a4a8", dark: "#4d5058", light: "#c9c9cb", crater: "#2c3140", rock: "#7e8088" },
  mars: { ground: "#b9714a", dark: "#6e3a26", light: "#d39a6c", crater: "#5a3a34", rock: "#8a5039" },
};

function regolith(planet: Planet) {
  const t = canvasTexture(512, 512, (c) => {
    const img = c.createImageData(512, 512);
    for (let y = 0; y < 512; y++)
      for (let x = 0; x < 512; x++) {
        const n = fbm(x / 22, y / 22),
          grain = hash(x, y);
        const v = 175 + (n - 0.5) * 60 + (grain - 0.5) * 26;
        const i = (y * 512 + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
    c.putImageData(img, 0, 0);
    // Small craters.
    for (let i = 0; i < 90; i++) {
      const x = hash(i, 3) * 512,
        y = hash(i, 7) * 512,
        r = 3 + hash(i, 11) ** 3 * 26;
      const g = c.createRadialGradient(x - r * 0.15, y - r * 0.15, r * 0.1, x, y, r);
      g.addColorStop(0, "rgba(80,80,80,0.32)");
      g.addColorStop(0.75, "rgba(110,110,110,0.18)");
      g.addColorStop(0.9, "rgba(255,255,255,0.28)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      c.fillStyle = g;
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.fill();
    }
  }, false);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(26, 26);
  t.colorSpace = THREE.NoColorSpace;
  void planet;
  return t;
}

export function buildTerrain(planet: Planet) {
  const size = (WORLD + 60) * 2,
    seg = 220;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const P = PALETTE[planet];
  const base = new THREE.Color(P.ground),
    dark = new THREE.Color(P.dark),
    bright = new THREE.Color(P.light),
    crater = new THREE.Color(P.crater),
    c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i),
      z = pos.getZ(i);
    pos.setY(i, terrainHeight(x, z, planet));
    const n = fbm(x * 0.045 + 10, z * 0.045 - 4);
    c.copy(base).lerp(n > 0.5 ? bright : dark, Math.abs(n - 0.5) * (planet === "mars" ? 1.1 : 0.9));
    const r = Math.hypot(x, z);
    c.lerp(bright, (1 - smooth(FLAT - 6, FLAT + 2, r)) * 0.28);
    const k = Math.hypot(x - CRATER.x, z - CRATER.z) / CRATER.r;
    if (k < 1.05) c.lerp(crater, (1 - smooth(0.55, 1.05, k)) * 0.85);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const tex = regolith(planet);
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    map: tex,
    roughness: 1,
    metalness: 0,
    bumpMap: tex,
    bumpScale: 0.6,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = "terrain";
  return mesh;
}

export function buildRocks(planet: Planet) {
  const geo = new THREE.DodecahedronGeometry(1, 1);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      y = p.getY(i),
      z = p.getZ(i);
    const n = 0.82 + hash(Math.round(x * 10), Math.round(z * 10 + y * 7)) * 0.32;
    p.setXYZ(i, x * n, y * n * 0.72, z * n);
  }
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: PALETTE[planet].rock, roughness: 0.95, flatShading: true });
  const mesh = new THREE.InstancedMesh(geo, mat, ROCKS.length);
  const m = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    e = new THREE.Euler(),
    s = new THREE.Vector3(),
    v = new THREE.Vector3();
  const color = new THREE.Color();
  ROCKS.forEach((r, i) => {
    e.set(hash(i, 1) * 0.5, hash(i, 2) * Math.PI * 2, hash(i, 3) * 0.4);
    q.setFromEuler(e);
    s.set(r.r * (0.9 + hash(i, 4) * 0.4), r.r * (0.7 + hash(i, 5) * 0.5), r.r * (0.9 + hash(i, 6) * 0.3));
    v.set(r.x, terrainHeight(r.x, r.z, planet) + r.r * 0.2, r.z);
    m.compose(v, q, s);
    mesh.setMatrixAt(i, m);
    color.set(PALETTE[planet].rock).multiplyScalar(0.8 + hash(i, 8) * 0.4);
    mesh.setColorAt(i, color);
  });
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function starField() {
  const n = 2600;
  const pos = new Float32Array(n * 3),
    col = new Float32Array(n * 3);
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const u = hash(i, 1) * 2 - 1,
      a = hash(i, 2) * Math.PI * 2,
      r = Math.sqrt(1 - u * u);
    pos.set([Math.cos(a) * r * 900, Math.abs(u) * 900 - 60, Math.sin(a) * r * 900], i * 3);
    c.setHSL(0.58 + (hash(i, 3) - 0.5) * 0.15, 0.4, 0.65 + hash(i, 4) * 0.35);
    col.set([c.r, c.g, c.b], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false, fog: false });
  return new THREE.Points(geo, mat);
}

function earthTexture() {
  return canvasTexture(512, 256, (c) => {
    c.fillStyle = "#1f5aa8";
    c.fillRect(0, 0, 512, 256);
    for (let i = 0; i < 46; i++) {
      const x = hash(i, 9) * 512,
        y = 40 + hash(i, 10) * 176;
      c.fillStyle = i % 3 ? "#3f8a4f" : "#b59a62";
      c.beginPath();
      c.ellipse(x, y, 14 + hash(i, 11) * 34, 8 + hash(i, 12) * 22, hash(i, 13) * 3, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = "rgba(255,255,255,0.75)";
    for (let i = 0; i < 70; i++) {
      c.beginPath();
      c.ellipse(hash(i, 21) * 512, hash(i, 22) * 256, 10 + hash(i, 23) * 40, 3 + hash(i, 24) * 6, 0.2, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = "#f4f8ff";
    c.fillRect(0, 0, 512, 18);
    c.fillRect(0, 240, 512, 16);
  });
}

function glowSprite(color: string, size: number) {
  const tex = canvasTexture(128, 128, (c) => {
    const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, color);
    g.addColorStop(0.18, color);
    g.addColorStop(0.4, "rgba(255,240,200,0.25)");
    g.addColorStop(1, "rgba(255,240,200,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, 128, 128);
  });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
  s.scale.set(size, size, 1);
  return s;
}

/** Sky: stars, the Sun, Earth over the lunar horizon, and the Martian sky colour. */
export function buildSky(planet: Planet) {
  const group = new THREE.Group();
  const stars = starField();
  group.add(stars);
  const sun = glowSprite("#fff6e0", planet === "mars" ? 60 : 90);
  group.add(sun);
  let earth: THREE.Mesh | null = null;
  if (planet === "moon") {
    earth = new THREE.Mesh(new THREE.SphereGeometry(16, 32, 20), new THREE.MeshStandardMaterial({ map: earthTexture(), emissive: "#1d3d72", emissiveIntensity: 0.35, roughness: 0.8, fog: false }));
    earth.position.set(-160, 70, -620);
    group.add(earth);
    const halo = glowSprite("rgba(120,170,255,0.55)", 70);
    halo.position.copy(earth.position);
    group.add(halo);
  }
  return { group, stars, sun, earth };
}

/** Floating marker for a site: ground ring, light beam and an icon. */
export function buildSiteMarker(s: Site, planet: Planet) {
  const color = s.kind === "ice" ? "#7fdcff" : s.kind === "regolith" ? "#ffb26b" : "#7ef0c8";
  const g = new THREE.Group();
  const y = terrainHeight(s.x, s.z, planet);
  g.position.set(s.x, y, s.z);
  const ringMat = light(color, 1.6);
  ringMat.transparent = true;
  ringMat.opacity = 0.75;
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.3, 2.75, 48), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.12;
  g.add(ring);
  const beamTex = canvasTexture(4, 128, (c) => {
    const gr = c.createLinearGradient(0, 0, 0, 128);
    gr.addColorStop(0, "rgba(255,255,255,0)");
    gr.addColorStop(1, "rgba(255,255,255,0.7)");
    c.fillStyle = gr;
    c.fillRect(0, 0, 4, 128);
  });
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.45, 0.45, 18, 16, 1, true),
    new THREE.MeshBasicMaterial({ color, map: beamTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }),
  );
  beam.position.y = 9;
  g.add(beam);
  g.userData.siteId = s.id;
  ring.userData.siteId = s.id;
  beam.userData.siteId = s.id;
  return { group: g, ring, beam, ringMat, color };
}

/** Sparkles of ice on the dark crater floor. */
export function iceSparkles(planet: Planet) {
  const n = 220;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = hash(i, 31) * Math.PI * 2,
      r = Math.sqrt(hash(i, 32)) * CRATER.r * 0.78;
    const x = CRATER.x + Math.cos(a) * r,
      z = CRATER.z + Math.sin(a) * r;
    pos.set([x, terrainHeight(x, z, planet) + 0.08, z], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  return new THREE.Points(geo, new THREE.PointsMaterial({ color: "#c8f1ff", size: 0.32, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }));
}

/** A small pool of dust particles kicked up by the rover, plus storm dust. */
export function dustSystem(color: string, count = 160) {
  const pos = new Float32Array(count * 3),
    vel = new Float32Array(count * 3),
    life = new Float32Array(count);
  const alpha = new Float32Array(count);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("alpha", new THREE.BufferAttribute(alpha, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(color) }, size: { value: 1.2 } },
    vertexShader:
      "attribute float alpha; varying float vA; uniform float size; void main(){ vA = alpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = min(size * 260.0 / -mv.z, 18.0); gl_Position = projectionMatrix * mv; }",
    fragmentShader:
      "uniform vec3 color; varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; gl_FragColor = vec4(color, vA * (1.0 - d * 2.0)); }",
    transparent: true,
    depthWrite: false,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  let next = 0;
  return {
    points,
    emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, spread = 1) {
      const i = next++ % count;
      pos.set([x, y, z], i * 3);
      vel.set([vx + (Math.random() - 0.5) * spread, vy + Math.random() * spread * 0.6, vz + (Math.random() - 0.5) * spread], i * 3);
      life[i] = 1;
    },
    update(dt: number, gravity: number) {
      for (let i = 0; i < count; i++) {
        if (life[i] <= 0) {
          alpha[i] = 0;
          continue;
        }
        life[i] -= dt * 0.9;
        vel[i * 3 + 1] -= gravity * dt;
        pos[i * 3] += vel[i * 3] * dt;
        pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
        pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        alpha[i] = Math.max(0, life[i]) * 0.55;
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.alpha.needsUpdate = true;
    },
  };
}

/** Fast streaks across the sky during a radiation storm. */
export function stormStreaks() {
  const n = 70;
  const pos = new Float32Array(n * 6);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.LineBasicMaterial({ color: "#e08bff", transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const lines = new THREE.LineSegments(geo, mat);
  lines.frustumCulled = false;
  const seeds = Array.from({ length: n }, (_, i) => ({ a: hash(i, 41) * Math.PI * 2, r: 10 + hash(i, 42) * 70, h: hash(i, 43), s: 0.6 + hash(i, 44) }));
  return {
    lines,
    mat,
    update(time: number, cx: number, cz: number, strength: number) {
      mat.opacity = strength * 0.75;
      if (strength <= 0) return;
      seeds.forEach((p, i) => {
        const phase = (time * p.s * 0.8 + p.h) % 1;
        const x = cx + Math.cos(p.a) * p.r,
          z = cz + Math.sin(p.a) * p.r;
        const y = 60 - phase * 70;
        pos.set([x + 3, y + 6, z - 2, x, y, z], i * 6);
      });
      geo.attributes.position.needsUpdate = true;
    },
  };
}
