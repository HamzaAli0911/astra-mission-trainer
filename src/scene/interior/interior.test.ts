import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { DOORS, HOME, ROOMS, SPAWN, STAIR, stairLocal, stairPoint, walls, type Seg } from "../../sim/home";
import { buildInterior } from "./index";
import { DOOR_H, HATCH } from "./structure";

// What you see inside must be where you can walk: these tests ray-cast the 3D model against the floor plan.
const interior = buildInterior();
for (const d of interior.doors) d.set(1);
interior.group.updateMatrixWorld(true);
const ray = new THREE.Raycaster();
ray.layers.enableAll();
const hit = (x: number, y: number, z: number, dx: number, dz: number, far: number) => {
  ray.set(new THREE.Vector3(x, y, z), new THREE.Vector3(dx, 0, dz).normalize());
  ray.far = far;
  return ray.intersectObject(interior.group, true)[0]?.distance ?? Infinity;
};

describe("the inside of the home, against its floor plan", () => {
  it("builds every door in the plan, and few draw calls", () => {
    expect(interior.doors.map((d) => d.id).sort()).toEqual(DOORS.map((d) => d.id).sort());
    let meshes = 0;
    interior.group.traverse((o) => (meshes += (o as THREE.Mesh).isMesh ? 1 : 0));
    expect(meshes).toBeLessThan(120);
  });

  it("draws a wall wherever the walker bumps into one", () => {
    for (const level of [0, 1] as const) {
      for (const s of walls(level)) {
        // Doors open in this model; furniture is checked below.
        if (s.door || s.block) continue;
        const len = Math.hypot(s.bx - s.ax, s.bz - s.az);
        if (len < 0.05) continue;
        const mx = (s.ax + s.bx) / 2,
          mz = (s.az + s.bz) / 2;
        const nx = -(s.bz - s.az) / len,
          nz = (s.bx - s.ax) / len;
        // From 0.3 m off one side or the other, looking at it, there is a surface within a partition's half-width of
        // the line: at some height (furniture and windows hide it at some; the stair's side only rises to the treads).
        const seen = [0.4, 1.0, 1.6, 2.35].some((h) =>
          [1, -1].some((side) => {
            const d = hit(mx + nx * 0.3 * side, HOME.floor[level] + h, mz + nz * 0.3 * side, -nx * side, -nz * side, 0.6);
            return d > 0.3 - HOME.wall / 2 - 0.02 && d < 0.3 + 0.02;
          }),
        );
        expect(seen, `level ${level} wall at ${mx.toFixed(2)}, ${mz.toFixed(2)}`).toBe(true);
      }
    }
  });

  it("draws nothing where you can walk (no wall you'd pass through)", () => {
    for (const level of [0, 1] as const) {
      const y = HOME.floor[level] + 1.0;
      const segs = walls(level).filter((s: Seg) => !s.door || s.door === "airlock");
      for (let x = -HOME.lining; x <= HOME.lining; x += 0.3)
        for (let z = -HOME.lining; z <= HOME.lining; z += 0.3) {
          if (Math.hypot(x, z) > HOME.lining - HOME.body) continue;
          const { u, w } = stairLocal(x, z);
          if (Math.abs(u) <= STAIR.half + 0.3 && w >= STAIR.inner - 0.3 && w <= STAIR.outer + 0.3) continue;
          // Somewhere the walker can stand: clear of every wall and piece of furniture by the body's radius.
          const clear = segs.every((s) => distToSeg(x, z, s) >= HOME.body);
          if (!clear) continue;
          for (let k = 0; k < 8; k++) {
            const a = (k / 8) * Math.PI * 2;
            expect(hit(x, y, z, Math.cos(a), Math.sin(a), 0.15), `level ${level} at ${x.toFixed(2)}, ${z.toFixed(2)}`).toBe(Infinity);
          }
        }
    }
  });

  it("makes every doorway tall and wide enough for a crew member", () => {
    // A 1.75 m person with room over their head, and shoulders (the walker's body) with a hand's width either side.
    expect(DOOR_H).toBeGreaterThanOrEqual(1.75 + 0.25);
    expect(HATCH.h).toBeGreaterThanOrEqual(1.75 + 0.15);
    for (const d of DOORS) expect(d.width, d.id).toBeGreaterThanOrEqual(2 * HOME.body + 0.25);
  });

  it("leaves the doorways and the foot and head of the stair open", () => {
    for (const d of DOORS.filter((x) => x.id !== "airlock")) {
      const room = ROOMS.find((m) => m.id === d.id)!;
      const out = { x: Math.sin((d.bearing * Math.PI) / 180), z: -Math.cos((d.bearing * Math.PI) / 180) };
      // Through the middle of the doorway, at waist and head height, from the hall side to the room side.
      const r0 = room.core ? HOME.core + 0.4 : HOME.hall - 0.4,
        dir = room.core ? -1 : 1;
      for (const h of [1.0, 1.9])
        expect(hit(out.x * r0, HOME.floor[d.level] + h, out.z * r0, out.x * dir, out.z * dir, 0.8), `door ${d.id}`).toBe(Infinity);
    }
    const foot = stairPoint(-STAIR.half - 0.6, (STAIR.inner + STAIR.outer) / 2),
      up = stairPoint(1, 0);
    const along = { x: up.x - stairPoint(0, 0).x, z: up.z - stairPoint(0, 0).z };
    expect(hit(foot.x, HOME.floor[0] + 1.2, foot.z, along.x, along.z, 0.55)).toBe(Infinity);
    expect(hit(SPAWN.x, HOME.floor[0] + 1.6, SPAWN.z, 0, -1, 0.5)).toBe(Infinity);
  });
});

function distToSeg(x: number, z: number, s: Seg) {
  const vx = s.bx - s.ax,
    vz = s.bz - s.az;
  const t = Math.max(0, Math.min(1, ((x - s.ax) * vx + (z - s.az) * vz) / (vx * vx + vz * vz || 1e-9)));
  return Math.hypot(x - s.ax - vx * t, z - s.az - vz * t);
}
