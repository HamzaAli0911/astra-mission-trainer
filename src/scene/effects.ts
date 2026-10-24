import * as THREE from "three";
import type { Planet } from "../sim/types";
import { type Site, terrainHeight } from "../sim/world";
import { canvasTexture, finalize, light, metal, paint, rng } from "./kit";

export const SITE_COLOR = { ice: "#7fdcff", regolith: "#ffb26b", science: "#7ef0c8" } as const;

let dashTexture: THREE.Texture | null = null;
function dashes() {
  if (dashTexture) return dashTexture;
  dashTexture = canvasTexture(512, 32, (c) => {
    c.clearRect(0, 0, 512, 32);
    c.fillStyle = "#fff";
    for (let i = 0; i < 24; i++) c.fillRect(i * (512 / 24), 0, 512 / 24 - 7, 32);
  });
  dashTexture.wrapS = THREE.RepeatWrapping;
  dashTexture.userData.shared = true;
  return dashTexture;
}
let glowTexture: THREE.Texture | null = null;
export function softGlow() {
  if (glowTexture) return glowTexture;
  glowTexture = canvasTexture(128, 128, (c) => {
    const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.25, "rgba(255,255,255,0.45)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, 128, 128);
  });
  glowTexture.userData.shared = true;
  return glowTexture;
}
let beamTexture: THREE.Texture | null = null;
function beamFade() {
  if (beamTexture) return beamTexture;
  beamTexture = canvasTexture(4, 256, (c) => {
    const g = c.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(0.7, "rgba(255,255,255,0.35)");
    g.addColorStop(1, "rgba(255,255,255,0.9)");
    c.fillStyle = g;
    c.fillRect(0, 0, 4, 256);
  });
  beamTexture.userData.shared = true;
  return beamTexture;
}

export interface SiteMarker {
  group: THREE.Group;
  ring: THREE.Mesh;
  ringMat: THREE.MeshBasicMaterial;
  beam: THREE.Mesh;
  beamMat: THREE.MeshBasicMaterial;
  pool: THREE.MeshBasicMaterial;
  lamp: THREE.MeshStandardMaterial;
  color: string;
}

/** A survey beacon for a site: a little tripod with a blinking lamp, a dashed ground ring and a tall light beam. */
export function buildSiteMarker(s: Site, planet: Planet): SiteMarker {
  const color = SITE_COLOR[s.kind];
  const g = new THREE.Group();
  g.position.set(s.x, terrainHeight(s.x, s.z, planet), s.z);
  const ringMat = new THREE.MeshBasicMaterial({ color, map: dashes(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  ringMat.color.multiplyScalar(2.2);
  const ringGeo = new THREE.RingGeometry(3.1, 3.45, 96, 1);
  // Lay the dash texture around the ring.
  const uv = ringGeo.attributes.uv,
    p = ringGeo.attributes.position;
  for (let i = 0; i < uv.count; i++) {
    const a = Math.atan2(p.getY(i), p.getX(i));
    uv.setXY(i, a / (Math.PI * 2) + 0.5, Math.hypot(p.getX(i), p.getY(i)) > 3.2 ? 1 : 0);
  }
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.25;
  g.add(ring);
  const pool = new THREE.MeshBasicMaterial({ color, map: softGlow(), transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending });
  const disc = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), pool);
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.2;
  g.add(disc);
  const beamMat = new THREE.MeshBasicMaterial({ color, map: beamFade(), transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.6, 34, 20, 1, true), beamMat);
  beam.position.y = 17;
  g.add(beam);
  // The survey tripod stands on the far side of the ring, out of the rover's way.
  const tripod = new THREE.Group();
  const out = Math.hypot(s.x, s.z) || 1;
  const tx = (s.x / out) * 3.9,
    tz = (s.z / out) * 3.9;
  tripod.position.set(tx, terrainHeight(s.x + tx, s.z + tz, planet) - g.position.y, tz);
  g.add(tripod);
  const leg = metal("#b8c0cc", 0.4);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 1.9, 6), leg);
    l.position.set(Math.cos(a) * 0.38, 0.9, Math.sin(a) * 0.38);
    l.rotation.set(-Math.sin(a) * 0.36, 0, Math.cos(a) * 0.36);
    l.castShadow = true;
    tripod.add(l);
  }
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.3, 0.42), paint("#e9eef6", 0.5));
  head.position.y = 1.85;
  head.castShadow = true;
  tripod.add(head);
  const lamp = light(color, 4);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8), lamp);
  bulb.position.y = 2.1;
  tripod.add(bulb);
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.06, 0.44), lamp);
  band.position.y = 1.78;
  tripod.add(band);
  finalize(tripod);
  g.userData.siteId = s.id;
  return { group: g, ring, ringMat, beam, beamMat, pool, lamp, color };
}

/** Soft dust particles kicked up by wheels, storms and construction. */
export function dustSystem(color: string, count = 420) {
  const pos = new Float32Array(count * 3),
    vel = new Float32Array(count * 3),
    life = new Float32Array(count),
    speed = new Float32Array(count),
    alpha = new Float32Array(count),
    size = new Float32Array(count);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("alpha", new THREE.BufferAttribute(alpha, 1));
  geo.setAttribute("size", new THREE.BufferAttribute(size, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(color) }, scale: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute float alpha; attribute float size; varying float vA; uniform float scale;
      void main() {
        vA = alpha;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = min(size * scale * 300.0 / -mv.z, 90.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 color; varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        if (d > 1.0) discard;
        gl_FragColor = vec4(color, vA * (1.0 - d) * (1.0 - d));
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  let next = 0;
  return {
    points,
    mat,
    emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, spread = 1, grow = 1, fade = 0.9) {
      const i = next++ % count;
      pos.set([x, y, z], i * 3);
      vel.set([vx + (Math.random() - 0.5) * spread, vy + Math.random() * spread * 0.6, vz + (Math.random() - 0.5) * spread], i * 3);
      life[i] = 1;
      speed[i] = fade;
      size[i] = (0.6 + Math.random() * 0.8) * grow;
    },
    update(dt: number, gravity: number) {
      for (let i = 0; i < count; i++) {
        if (life[i] <= 0) {
          alpha[i] = 0;
          continue;
        }
        life[i] -= dt * speed[i];
        vel[i * 3 + 1] -= gravity * dt;
        const drag = Math.max(0, 1 - dt * 0.6);
        vel[i * 3] *= drag;
        vel[i * 3 + 2] *= drag;
        pos[i * 3] += vel[i * 3] * dt;
        pos[i * 3 + 1] = Math.max(pos[i * 3 + 1] + vel[i * 3 + 1] * dt, -50);
        pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        size[i] += dt * 0.9;
        alpha[i] = Math.max(0, life[i]) * 0.5;
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.alpha.needsUpdate = true;
      geo.attributes.size.needsUpdate = true;
    },
  };
}

/** Bright sparks: welding on a construction site, debris from a meteor strike. */
export function sparkSystem(count = 300) {
  const pos = new Float32Array(count * 3),
    vel = new Float32Array(count * 3),
    life = new Float32Array(count),
    alpha = new Float32Array(count);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("alpha", new THREE.BufferAttribute(alpha, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { scale: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute float alpha; varying float vA; uniform float scale;
      void main() {
        vA = alpha;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = min(scale * 26.0 / -mv.z + 1.0, 8.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        gl_FragColor = vec4(vec3(4.0, 2.4, 0.9) * vA, vA * (1.0 - d));
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  let next = 0;
  return {
    points,
    mat,
    emit(x: number, y: number, z: number, n = 6, power = 3) {
      for (let k = 0; k < n; k++) {
        const i = next++ % count;
        pos.set([x, y, z], i * 3);
        const a = Math.random() * Math.PI * 2,
          s = power * (0.3 + Math.random());
        vel.set([Math.cos(a) * s, power * (0.4 + Math.random()), Math.sin(a) * s], i * 3);
        life[i] = 0.5 + Math.random() * 0.6;
      }
    },
    update(dt: number, gravity: number) {
      for (let i = 0; i < count; i++) {
        if (life[i] <= 0) {
          alpha[i] = 0;
          continue;
        }
        life[i] -= dt;
        vel[i * 3 + 1] -= gravity * dt;
        pos[i * 3] += vel[i * 3] * dt;
        pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
        pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        alpha[i] = Math.min(1, life[i] * 2);
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.alpha.needsUpdate = true;
    },
  };
}

/** A meteor streaking in and the flash when it hits. */
export function impactSystem() {
  const group = new THREE.Group();
  const flashMat = new THREE.SpriteMaterial({ map: softGlow(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
  flashMat.color.setRGB(6, 4.5, 3);
  const flash = new THREE.Sprite(flashMat);
  group.add(flash);
  const glow = new THREE.PointLight("#ffb46b", 0, 40, 1.6);
  group.add(glow);
  const trailMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 4, 3), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, map: beamFade() });
  const trail = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.25, 1, 8, 1, true), trailMat);
  group.add(trail);
  let t = -1;
  const from = new THREE.Vector3(),
    to = new THREE.Vector3(),
    up = new THREE.Vector3(0, 1, 0);
  return {
    group,
    hit(x: number, y: number, z: number) {
      to.set(x, y, z);
      from.set(x + 60, y + 90, z - 40);
      t = 0;
    },
    /** Returns true at the moment of impact. */
    update(dt: number) {
      if (t < 0) return false;
      const was = t;
      t += dt;
      const fall = 0.45;
      if (t < fall) {
        const k = t / fall;
        const head = from.clone().lerp(to, k);
        const tail = from.clone().lerp(to, Math.max(0, k - 0.35));
        trail.position.copy(head).add(tail).multiplyScalar(0.5);
        trail.scale.set(1, head.distanceTo(tail), 1);
        trail.quaternion.setFromUnitVectors(up, head.clone().sub(tail).normalize());
        trailMat.opacity = 0.9;
        flashMat.opacity = 0;
        return false;
      }
      trailMat.opacity = 0;
      const k = (t - fall) / 1.2;
      flash.position.copy(to).setY(to.y + 1.5);
      flash.scale.setScalar(4 + k * 18);
      flashMat.opacity = Math.max(0, 1 - k);
      glow.position.copy(flash.position);
      glow.intensity = Math.max(0, 1 - k) * 900;
      if (k >= 1) t = -1;
      return was < fall && t >= fall;
    },
  };
}

/** Bright streaks of particles raining down during a radiation storm (a picture of the invisible danger). */
export function stormStreaks() {
  const n = 140;
  const pos = new Float32Array(n * 6),
    col = new Float32Array(n * 6);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  for (let i = 0; i < n; i++) col.set([0.6, 0.25, 1, 2.4, 1.2, 3], i * 6);
  const mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const lines = new THREE.LineSegments(geo, mat);
  lines.frustumCulled = false;
  const r = rng(41);
  const seeds = Array.from({ length: n }, () => ({ a: r() * Math.PI * 2, r: 6 + r() * 110, h: r(), s: 0.5 + r() * 0.9 }));
  return {
    lines,
    mat,
    update(time: number, cx: number, cz: number, strength: number) {
      mat.opacity = strength;
      lines.visible = strength > 0.01;
      if (!lines.visible) return;
      seeds.forEach((p, i) => {
        const phase = (time * p.s * 0.7 + p.h) % 1;
        const x = cx + Math.cos(p.a) * p.r,
          z = cz + Math.sin(p.a) * p.r;
        const y = 90 - phase * 100;
        pos.set([x + 4, y + 10, z - 3, x, y, z], i * 6);
      });
      geo.attributes.position.needsUpdate = true;
    },
  };
}
