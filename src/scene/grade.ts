import * as THREE from "three";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import type { Planet } from "../sim/types";

/**
 * Colour grading, applied after tone mapping: a gentle contrast curve, a
 * per-planet tint (cool, neutral grey on the Moon; warm ochre on Mars), a
 * touch of saturation control and a soft vignette.
 */
const GRADES: Record<Planet, { lift: [number, number, number]; gain: [number, number, number]; saturation: number; contrast: number }> = {
  moon: { lift: [0.0, 0.004, 0.014], gain: [0.99, 1.0, 1.03], saturation: 0.9, contrast: 0.08 },
  mars: { lift: [0.012, 0.005, 0.0], gain: [1.03, 0.99, 0.94], saturation: 1.02, contrast: 0.07 },
};

export function gradePass(planet: Planet) {
  const g = GRADES[planet];
  return new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      lift: { value: new THREE.Vector3(...g.lift) },
      gain: { value: new THREE.Vector3(...g.gain) },
      saturation: { value: g.saturation },
      contrast: { value: g.contrast },
      vignette: { value: 0.4 },
    },
    vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse;
      uniform vec3 lift, gain;
      uniform float saturation, contrast, vignette;
      varying vec2 vUv;
      void main() {
        vec3 c = texture2D(tDiffuse, vUv).rgb;
        c = mix(c, c * c * (3.0 - 2.0 * c), contrast);
        c = c * gain + lift * (1.0 - c);
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        c = mix(vec3(l), c, saturation);
        vec2 d = vUv - 0.5;
        c *= 1.0 - dot(d, d) * vignette;
        gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
      }`,
  });
}
