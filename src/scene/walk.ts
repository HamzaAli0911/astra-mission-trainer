import * as THREE from "three";
import { floorY, HOME, PACE, polar, roomAt, stepLength, stride, type Level } from "../sim/home";
import { PLANETS } from "../sim/planets";
import type { Planet } from "../sim/types";
import { doorSound, footstep } from "../lib/sound";
import { useUI } from "../state/ui";
import { leaveWalk, lockState, useWalk, walker, walkInput } from "../state/walk";
import type { Interior } from "./interior";

/** Doors slide open when you come this close (metres), and close again behind you. */
const DOOR_REACH = 1.25;
/** Seconds for a door to slide fully open or shut. */
const DOOR_TIME = 0.55;
/** How far you can reach to use something, and how far off straight ahead it may be (radians). */
const REACH = 1.5,
  AIM = 0.6;

/** Things you can use with E (or a click, or the Use button) while walking. */
interface Usable {
  level: Level;
  x: number;
  z: number;
  label: string;
  use: () => void;
}

/**
 * Walking inside the home in first person: look with the mouse (captured with the Pointer Lock API, or by
 * dragging if the browser won't), move with the keys or the touch stick, and doors slide open as you come near.
 * Movement is in real seconds, whatever the mission's speed.
 */
export function walkController(canvas: HTMLCanvasElement, planet: Planet, interior: Interior) {
  const gravity = PLANETS[planet].gravity;
  const step = stepLength(gravity);
  const open = new Map<string, number>();
  const isOpen = (id: string) => (open.get(id) ?? 0) > 0.8;
  const usables: Usable[] = [
    // Until walks outside arrive, the airlock takes you back out to look over the outpost.
    { level: 0, ...polar(180, HOME.lining - 0.2), label: "Leave by the airlock", use: () => leaveWalk() },
  ];
  let active = false,
    drag: { x: number; y: number } | null = null;

  const locked = () => document.pointerLockElement === canvas;
  const onDown = (e: PointerEvent) => {
    if (!active || e.button > 0) return;
    if (e.pointerType === "mouse") {
      // With the mouse captured a click uses what you're looking at; otherwise it captures the mouse.
      if (locked()) {
        walkInput.use = true;
        return;
      }
      try {
        const p = canvas.requestPointerLock() as unknown as Promise<void> | undefined;
        p?.catch?.(() => undefined);
      } catch {
        /* no pointer lock here: dragging still looks around */
      }
    }
    drag = { x: e.clientX, y: e.clientY };
  };
  const onMove = (e: PointerEvent) => {
    if (!active) return;
    if (locked()) {
      walkInput.look.x += e.movementX;
      walkInput.look.y += e.movementY;
      walkInput.look.touch = false;
    } else if (drag && e.buttons) {
      walkInput.look.x += e.clientX - drag.x;
      walkInput.look.y += e.clientY - drag.y;
      walkInput.look.touch = e.pointerType !== "mouse";
      drag = { x: e.clientX, y: e.clientY };
    }
  };
  const onUp = () => (drag = null);
  const onLock = () => {
    if (!locked()) lockState.freedAt = performance.now();
    useWalk.getState().set({ locked: locked() });
  };
  canvas.addEventListener("pointerdown", onDown);
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  document.addEventListener("pointerlockchange", onLock);

  const euler = new THREE.Euler(0, 0, 0, "YXZ");
  let room = "",
    prompt: string | null = null;

  return {
    get active() {
      return active;
    },
    /** One frame: move the walker (while walking), slide the doors, and work out what you could use. */
    update(dt: number, walking: boolean, blocked: boolean) {
      if (active && !walking && locked()) document.exitPointerLock();
      active = walking;
      // A menu or card on top: let go of the mouse, and stand still.
      if (walking && blocked && locked()) document.exitPointerLock();
      if (walking && !blocked) {
        const s = useUI.getState().settings;
        const k = (walkInput.look.touch ? 0.0045 : 0.0022) * s.look;
        walker.yaw += walkInput.look.x * k;
        walker.pitch = THREE.MathUtils.clamp(walker.pitch - walkInput.look.y * k * (s.invert ? -1 : 1), -1.3, 1.3);
        let ahead = walkInput.stick.y,
          side = walkInput.stick.x,
          turn = 0;
        for (const code of walkInput.keys) {
          if (code === "KeyW" || code === "ArrowUp") ahead += 1;
          else if (code === "KeyS" || code === "ArrowDown") ahead -= 1;
          else if (code === "KeyD") side += 1;
          else if (code === "KeyA") side -= 1;
          // Arrow keys turn, so you can get about with the keyboard alone.
          else if (code === "ArrowRight") turn += 1;
          else if (code === "ArrowLeft") turn -= 1;
        }
        walker.yaw += turn * dt * 1.9;
        const fx = Math.sin(walker.yaw),
          fz = -Math.cos(walker.yaw);
        const wish = { x: fx * ahead - fz * side, z: fz * ahead + fx * side };
        const next = stride(walker, wish, walkInput.fast ? PACE.fast : PACE.walk, dt, isOpen);
        const before = walker.stride;
        const speed = Math.hypot(next.vx, next.vz);
        Object.assign(walker, { x: next.x, z: next.z, where: next.where, vx: next.vx, vz: next.vz, stride: walker.stride + (speed * dt) / step });
        if (Math.floor(walker.stride) !== Math.floor(before) && speed > 0.4) footstep(Math.min(1, 0.55 + gravity / 9.81));
      } else {
        walker.vx = walker.vz = 0;
      }
      walkInput.look.x = walkInput.look.y = 0;

      // Doors slide open as you come near (the airlock's hatch stays shut until walks outside arrive).
      const level = walker.where === "stair" ? null : walker.where;
      for (const d of interior.doors) {
        const near = walking && d.id !== "airlock" && level === d.level && Math.hypot(walker.x - d.x, walker.z - d.z) < DOOR_REACH;
        const was = open.get(d.id) ?? 0;
        const now = THREE.MathUtils.clamp(was + (near ? dt : -dt) / DOOR_TIME, 0, 1);
        if (now !== was) {
          if ((was === 0 && near) || (was === 1 && !near)) doorSound(near);
          open.set(d.id, now);
          // Ease in and out: doors start and stop gently.
          d.set(now * now * (3 - 2 * now));
        }
      }

      // What room you're in, and what you could use.
      if (!walking) return;
      const here = walker.where === "stair" ? "Stairs" : roomAt(walker.x, walker.z, walker.where).name;
      let best: Usable | null = null,
        bestScore = Infinity;
      for (const u of usables) {
        if (u.level !== level) continue;
        const dx = u.x - walker.x,
          dz = u.z - walker.z;
        const d = Math.hypot(dx, dz);
        const off = Math.abs(Math.atan2(Math.sin(Math.atan2(dx, -dz) - walker.yaw), Math.cos(Math.atan2(dx, -dz) - walker.yaw)));
        if (d < REACH && off < AIM && d + off < bestScore) {
          best = u;
          bestScore = d + off;
        }
      }
      const label = best?.label ?? null;
      if (here !== room || label !== prompt) {
        room = here;
        prompt = label;
        useWalk.getState().set({ room: here, prompt: label });
      }
      if (walkInput.use) {
        walkInput.use = false;
        best?.use();
      }
    },
    /** Where the walker's eyes are, in the world (the habitat's origin given), with a gentle bob as you walk. */
    eye(origin: THREE.Vector3, pos: THREE.Vector3, quat: THREE.Quaternion, reduced: boolean) {
      const s = useUI.getState().settings;
      const pace = Math.min(1, Math.hypot(walker.vx, walker.vz) / PACE.walk);
      // One rise and fall per step; low gravity makes for a longer, floatier stride.
      const bob = s.bob && !reduced ? Math.abs(Math.sin(walker.stride * Math.PI)) * 0.018 * Math.sqrt(9.81 / gravity) * pace : 0;
      pos.set(origin.x + walker.x, origin.y + floorY(walker) + HOME.eye - 0.012 + bob, origin.z + walker.z);
      euler.set(walker.pitch, -walker.yaw, 0, "YXZ");
      quat.setFromEuler(euler);
    },
    dispose() {
      if (locked()) document.exitPointerLock();
      canvas.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointerlockchange", onLock);
    },
  };
}
export type WalkController = ReturnType<typeof walkController>;
