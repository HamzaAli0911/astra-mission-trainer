import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { Planet } from "../sim/types";
import { rng } from "./kit";
import { NOISE_GLSL } from "./sky";

/**
 * The planet's surface is painted once on the GPU into two maps (colour and
 * surface normals), so craters stay crisp without slowing the title screen.
 */
const BAKE = /* glsl */ `
  uniform sampler2D craters;
  uniform float count;
  uniform float mars;
  uniform float mode; // 0 colour, 1 normal
  varying vec2 vUv;
  ${NOISE_GLSL}
  const float PI = 3.14159265;
  vec3 dirOf(vec2 uv) {
    float phi = uv.x * 2.0 * PI, th = (1.0 - uv.y) * PI;
    return vec3(-cos(phi) * sin(th), cos(th), sin(phi) * sin(th));
  }
  float plains(vec3 p) { return smoothstep(0.5, 0.58, noise3(p * 1.6 + vec3(3.0, 0.0, -2.0)) * 0.7 + noise3(p * 4.0 - 1.0) * 0.3); }
  float heightAt(vec3 p, out float halo) {
    float h = fbm3(p * 3.0) * 0.06 + fbm3(p * 14.0) * 0.012 - plains(p) * 0.03;
    halo = 0.0;
    for (int i = 0; i < 256; i++) {
      if (float(i) >= count) break;
      vec4 c = texture2D(craters, vec2((float(i) + 0.5) / count, 0.5));
      float r = abs(c.w);
      float cd = dot(p, c.xyz);
      if (cd < cos(min(PI, r * (c.w < 0.0 ? 4.0 : 2.0)))) continue;
      float d = acos(clamp(cd, -1.0, 1.0)) / r;
      if (d < 1.0) h += (-(1.0 - d * d) + pow(d, 10.0) * 0.35) * r * 0.45;
      else h += exp(-pow((d - 1.0) / 0.25, 2.0)) * r * 0.18;
      if (c.w < 0.0) halo += exp(-max(0.0, d - 1.0) * 1.3) * (0.55 + 0.45 * noise3(p * 90.0));
    }
    return h;
  }
  void main() {
    vec3 p = dirOf(vUv);
    if (mode < 0.5) {
      float halo;
      heightAt(p, halo);
      float f = fbm3(p * 4.0), g = fbm3(p * 22.0);
      vec3 col;
      if (mars < 0.5) {
        col = mix(vec3(0.4, 0.395, 0.38), vec3(0.075, 0.075, 0.085), plains(p));
        col *= 0.8 + (f - 0.5) * 0.5 + (g - 0.5) * 0.25;
        col = mix(col, vec3(0.75, 0.75, 0.74), clamp(halo, 0.0, 0.8));
      } else {
        col = mix(vec3(0.6, 0.26, 0.12), vec3(0.24, 0.11, 0.07), smoothstep(0.42, 0.62, fbm3(p * 2.2 + 7.0)));
        col *= 0.82 + (f - 0.5) * 0.6 + (g - 0.5) * 0.2;
        // A great canyon and the polar ice caps.
        float canyon = exp(-pow((p.y - 0.12 + sin(atan(p.z, p.x) * 3.0) * 0.03) / 0.02, 2.0)) * smoothstep(0.2, 0.6, -p.x) * smoothstep(-0.2, 0.3, p.z);
        col *= 1.0 - canyon * 0.55;
        float cap = smoothstep(0.9, 0.93, abs(p.y) + (noise3(p * 9.0) - 0.5) * 0.06);
        col = mix(col, vec3(0.92, 0.9, 0.88), cap);
      }
      gl_FragColor = vec4(col, 1.0);
    } else {
      // Slopes from neighbouring heights, as a tangent-space normal map.
      float du = 1.0 / 2048.0, dv = 1.0 / 1024.0, tmp;
      float th = (1.0 - vUv.y) * PI;
      float hx = heightAt(dirOf(vUv + vec2(du, 0.0)), tmp) - heightAt(dirOf(vUv - vec2(du, 0.0)), tmp);
      float hy = heightAt(dirOf(vUv + vec2(0.0, dv)), tmp) - heightAt(dirOf(vUv - vec2(0.0, dv)), tmp);
      float ax = 2.0 * du * 2.0 * PI * max(0.05, sin(th)), ay = 2.0 * dv * PI;
      vec3 n = normalize(vec3(-hx / ax, -hy / ay, 1.0));
      gl_FragColor = vec4(n * 0.5 + 0.5, 1.0);
    }
  }`;

function bake(renderer: THREE.WebGLRenderer, planet: Planet) {
  const r = rng(planet === "mars" ? 31 : 13);
  const count = planet === "mars" ? 90 : 220;
  const data = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const u = r() * 2 - 1,
      a = r() * Math.PI * 2,
      s = Math.sqrt(1 - u * u);
    const rad = 0.01 + r() ** 5 * 0.17;
    const young = planet === "moon" && rad > 0.025 && r() < 0.18;
    data.set([Math.cos(a) * s, u, Math.sin(a) * s, young ? -rad : rad], i * 4);
  }
  const list = new THREE.DataTexture(data, count, 1, THREE.RGBAFormat, THREE.FloatType);
  list.needsUpdate = true;
  const mat = new THREE.ShaderMaterial({
    uniforms: { craters: { value: list }, count: { value: count }, mars: { value: planet === "mars" ? 1 : 0 }, mode: { value: 0 } },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
    fragmentShader: BAKE,
    depthTest: false,
  });
  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
  const cam = new THREE.Camera();
  const target = (type: THREE.TextureDataType) => {
    const t = new THREE.WebGLRenderTarget(2048, 1024, { type, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, depthBuffer: false });
    t.texture.anisotropy = 8;
    t.texture.wrapS = THREE.RepeatWrapping;
    return t;
  };
  const color = target(THREE.HalfFloatType),
    normal = target(THREE.UnsignedByteType);
  const was = renderer.getRenderTarget();
  for (const [rt, mode] of [
    [color, 0],
    [normal, 1],
  ] as const) {
    mat.uniforms.mode.value = mode;
    renderer.setRenderTarget(rt);
    renderer.render(scene, cam);
  }
  renderer.setRenderTarget(was);
  mat.dispose();
  list.dispose();
  return { color, normal };
}

/** A slowly turning planet for the title screen, lit hard from one side like a real photo. */
export function Globe({ planet = "moon", reduceMotion = false }: { planet?: Planet; reduceMotion?: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      return;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    camera.position.set(0, 0, 12);
    const sun = new THREE.DirectionalLight("#fff4e6", 3.4);
    sun.position.set(-6, 2.2, 3.2);
    scene.add(sun, new THREE.AmbientLight("#3a4a7a", 0.1));
    const maps = bake(renderer, planet);
    const globe = new THREE.Mesh(
      new THREE.SphereGeometry(3.2, 128, 96),
      new THREE.MeshStandardMaterial({ map: maps.color.texture, normalMap: maps.normal.texture, normalScale: new THREE.Vector2(1, 1), roughness: 1, metalness: 0 }),
    );
    // Start with a dark lunar "sea" in sunlight.
    globe.rotation.set(0, 4.8, 0.25);
    scene.add(globe);
    // A rim of light: Mars's thin dusty air, or a soft glow on the Moon's limb.
    const rim = new THREE.Mesh(
      new THREE.SphereGeometry(3.2 * (planet === "mars" ? 1.035 : 1.012), 96, 64),
      new THREE.ShaderMaterial({
        uniforms: { color: { value: new THREE.Color(planet === "mars" ? "#ff9a6a" : "#9fb8ff") }, power: { value: planet === "mars" ? 0.55 : 0.16 }, sun: { value: sun.position.clone().normalize() } },
        vertexShader: "varying vec3 vN; varying vec3 vW; void main(){ vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }",
        fragmentShader:
          "uniform vec3 color; uniform float power; uniform vec3 sun; varying vec3 vN; varying vec3 vW; void main(){ vec3 v = normalize(cameraPosition - vW); float f = pow(1.0 - abs(dot(normalize(vN), v)), 3.0); float lit = smoothstep(-0.35, 0.5, dot(normalize(vN), sun)); gl_FragColor = vec4(color * f * power * lit * 2.0, 1.0); }",
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.BackSide,
      }),
    );
    scene.add(rim);
    const resize = new ResizeObserver(() => {
      renderer.setSize(el.clientWidth, el.clientHeight, false);
      camera.aspect = el.clientWidth / Math.max(1, el.clientHeight);
      camera.updateProjectionMatrix();
    });
    resize.observe(el);
    const reduced = reduceMotion || matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (!reduced) globe.rotation.y += 0.0012;
      renderer.render(scene, camera);
    };
    loop();
    return () => {
      cancelAnimationFrame(raf);
      resize.disconnect();
      globe.geometry.dispose();
      (globe.material as THREE.Material).dispose();
      rim.geometry.dispose();
      (rim.material as THREE.Material).dispose();
      maps.color.dispose();
      maps.normal.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [planet, reduceMotion]);
  return <div ref={host} className="globe" aria-hidden="true" />;
}
