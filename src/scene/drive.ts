import * as THREE from "three";
import type { Bumps } from "./terrain";

/**
 * Wheels on rough ground: where each wheel's centre has to be to sit on the ground and any rock under its tread,
 * a sprung wheel that follows that height (it can't pass through a rock, and it eases back down off one), and a
 * rubber tyre that flattens and bulges where it presses on the ground. Used by both rovers.
 */

/**
 * Height of a wheel's centre resting at (x, z), heading (fx, fz): on the bare ground, and on any rock under its
 * tread (rocks just ahead of and behind the axle count too, so the wheel starts to climb before it's on top).
 */
export function seat(ground: (x: number, z: number) => number, bumps: Bumps | null, x: number, z: number, fx: number, fz: number, radius: number) {
  const bare = ground(x, z) + radius;
  let on = bare;
  if (bumps)
    for (const u of [-0.8, -0.5, -0.25, 0, 0.25, 0.5, 0.8]) {
      const top = bumps.top(x + fx * u * radius, z + fz * u * radius);
      if (top > -Infinity) on = Math.max(on, top + radius * Math.sqrt(1 - u * u));
    }
  return { on, bare };
}

/** One wheel's vertical motion: a stiff spring toward its seat, and the tyre's give. */
export class Wheel {
  y = Number.NaN;
  v = 0;
  /** How far the tyre is squashed (metres). */
  squash = 0;
  constructor(
    /** Static squash under the rover's weight. */
    readonly sag: number,
    /** The most the tyre can give before the rim would touch. */
    readonly give: number,
  ) {}
  /**
   * Move toward `seat` (where the unsquashed wheel would rest) over dt seconds; returns the centre's height. On a
   * small rock the tyre wraps round some of it, so the wheel rises less than the rock is tall.
   */
  update(seat: { on: number; bare: number }, dt: number) {
    const target = seat.on - this.sag - Math.min(this.give - this.sag - 0.01, (seat.on - seat.bare) * 0.45);
    if (!Number.isFinite(this.y) || dt <= 0 || dt > 0.5) {
      this.y = target;
      this.v = 0;
    } else {
      // Critically damped: quick but without bouncing about.
      const w = 38;
      for (let t = dt, h = Math.min(dt, 1 / 120); t > 1e-6; t -= h, h = Math.min(t, 1 / 120)) {
        this.v += (w * w * (target - this.y) - 2 * w * this.v) * h;
        this.y += this.v * h;
      }
    }
    // A wheel can't sink into a rock further than its tyre gives: hitting one shoves it up.
    const floor = seat.on - this.give;
    if (this.y < floor) {
      this.y = floor;
      this.v = Math.max(this.v, 0);
    }
    this.squash = THREE.MathUtils.clamp(seat.on - this.y, 0, this.give);
    return this.y;
  }
}

/**
 * Give each wheel its own copy of the tyre material that squashes the tread flat where it meets the ground and
 * bulges the sidewalls (one shader program for all of them). The wheel's axle runs along its local x.
 */
export function squashableTyres(wheels: THREE.Object3D[], tyre: THREE.Material, radius: number) {
  return wheels.map((w) => {
    const uniforms = { uDown: { value: new THREE.Vector3(0, -1, 0) }, uFlat: { value: radius }, uBulge: { value: 0.55 } };
    const mat = (tyre as THREE.MeshStandardMaterial).clone();
    const base = tyre.onBeforeCompile;
    const key = tyre.customProgramCacheKey.bind(tyre);
    mat.onBeforeCompile = (shader, renderer) => {
      base.call(tyre, shader, renderer);
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nuniform vec3 uDown;\nuniform float uFlat;\nuniform float uBulge;")
        .replace(
          "#include <begin_vertex>",
          /* glsl */ `#include <begin_vertex>
          {
            // Tread below the contact plane is pushed back onto it; the rubber it displaces bulges out sideways.
            float over = dot(transformed, uDown) - uFlat;
            if (over > 0.0) {
              transformed -= uDown * over;
              transformed.x += sign(transformed.x) * over * uBulge;
            }
          }`,
        );
    };
    mat.customProgramCacheKey = () => key() + "|tyre";
    w.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.material === tyre) m.material = mat;
    });
    return uniforms;
  });
}

const inv = new THREE.Matrix4();
/** Point a tyre's squash at the ground under it: `squash` metres flatter than its `radius`. */
export function pressTyre(u: ReturnType<typeof squashableTyres>[number], wheel: THREE.Object3D, radius: number, squash: number) {
  inv.copy(wheel.matrixWorld).invert();
  u.uDown.value.set(0, -1, 0).transformDirection(inv);
  u.uFlat.value = radius - squash;
}
