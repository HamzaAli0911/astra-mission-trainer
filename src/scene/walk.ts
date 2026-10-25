import * as THREE from "three";
import { blockAxes, BLOCKS, floorY, HOME, PACE, polar, roomAt, stepLength, stride, type Level } from "../sim/home";
import { OUTER_HATCH, SUIT, walkOutside } from "../sim/outside";
import { REPAIR_COST, spec } from "../sim/modules";
import { modulePos } from "../sim/rover";
import { FOOTPRINT, terrainHeight } from "../sim/world";
import { isBuilt } from "../sim/core";
import { INSPECTS } from "../sim/inspect";
import type { InteriorState } from "../sim/interior";
import { useGame } from "../state/game";
import { PLANETS } from "../sim/planets";
import type { Planet } from "../sim/types";
import { airlockSound, chime, doorSound, footstep, klaxon } from "../lib/sound";
import { useUI } from "../state/ui";
import { lockState, useWalk, walker, walkInput } from "../state/walk";
import type { Interior } from "./interior";

/** Doors slide open when you come this close (metres), and close again behind you. */
const DOOR_REACH = 1.25;
/** Seconds for a door to slide fully open or shut. */
const DOOR_TIME = 0.55;
/** How far you can reach to use something, and how far off straight ahead it may be (radians). */
const REACH = 1.5,
  AIM = 0.6;

/** Seconds the airlock takes to cycle (it can be skipped). */
export const AIRLOCK_SECONDS = 8;
/** Things you can use with E (or a click, or the Use button) while walking; level -1 is outside. */
interface Usable {
  level: Level | -1;
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
  let state: InteriorState | null = null;
  const act = (a: Parameters<ReturnType<typeof useGame.getState>["act"]>[0]) => useGame.getState().act(a);
  const suited = () => !!useGame.getState().game.eva;
  // Alex's suit hangs on the rack by the stair: you suit up standing at its front.
  const rack = BLOCKS.find((k) => k.id === "suit-rack-e")!;
  const ax = blockAxes(rack);
  const suitSpot = { level: 0 as Level, x: ax.c.x + ax.t.x * (rack.w / 2 + 0.05), z: ax.c.z + ax.t.z * (rack.w / 2 + 0.05) };
  const hatchSpot = { level: 0 as Level, ...polar(180, HOME.lining - 0.2) };
  const startAirlock = (dir: "out" | "in") => {
    useWalk.getState().set({ airlock: { dir, t0: performance.now() / 1000 }, card: null });
    airlockSound(dir === "out");
  };
  const usables: Usable[] = [
    // The walk outside: suit up at the rack, then cycle the airlock at the inner hatch.
    { ...suitSpot, label: "", use: () => (suited() ? act({ type: "eva", on: false }) : act({ type: "eva", on: true })) },
    { ...hatchSpot, label: "", use: () => (suited() ? startAirlock("out") : useGame.getState().toast("Suit up first: Alex's suit is on the rack by the stair.", "info")) },
    // Equipment you can look at closely: live readings and a fact.
    ...INSPECTS.map((p) => ({ level: p.level, x: p.x, z: p.z, label: `Look at the ${p.title.toLowerCase()}`, use: () => useWalk.getState().set({ card: useWalk.getState().card === p.id ? null : p.id }) })),
  ];
  // The storm drill: inside the shelter, the same shelter action as the HUD's (same rules, same costs).
  const shelterSpot = { level: 0 as Level, ...polar(70, 0.4) };
  const shelterUse = (): Usable | null => {
    const g = useGame.getState().game;
    const storm = state && state.storm !== "none";
    if (!storm && !g.sheltering) return null;
    return {
      ...shelterSpot,
      label: g.sheltering ? "Leave the shelter (whole crew)" : "Take shelter now (whole crew)",
      use: () => useGame.getState().act({ type: "shelter", on: !g.sheltering }),
    };
  };
  let alarmAt = -1e9,
    lastAlarm: string | null = null;
  /** Outside: the outer hatch, broken modules to repair, dusty panels to brush. */
  const outsideUses = (): Usable[] => {
    const g = useGame.getState().game;
    const out: Usable[] = [{ level: -1, x: OUTER_HATCH.x, z: OUTER_HATCH.z - 0.9, label: "Cycle the airlock and go inside", use: () => startAirlock("in") }];
    for (const m of g.modules) {
      if (m.type === "habitat" || !isBuilt(m)) continue;
      const p = modulePos(m);
      const name = spec(m.type, g.planet).name;
      // Reach it from anywhere round its edge: the point on its footprint nearest to you.
      const d = Math.hypot(walker.x - p.x, walker.z - p.z) || 1;
      const edge = { x: p.x + ((walker.x - p.x) / d) * FOOTPRINT[m.type], z: p.z + ((walker.z - p.z) / d) * FOOTPRINT[m.type] };
      if (m.health < 100 && m.repair === 0) out.push({ level: -1, ...edge, label: `Repair the ${name} (${REPAIR_COST} materials)`, use: () => act({ type: "repair", id: m.id }) });
      else if (m.type === "solar" && g.planet === "mars" && g.dust > 0.05) out.push({ level: -1, ...edge, label: "Brush the dust off the panels", use: () => act({ type: "clean" }) });
    }
    return out;
  };
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
    update(dt: number, walking: boolean, blocked: boolean, st: InteriorState | null = null) {
      state = st;
      if (active && !walking && locked()) document.exitPointerLock();
      active = walking;
      // A menu or card on top: let go of the mouse, and stand still.
      if (walking && blocked && locked()) document.exitPointerLock();
      // The airlock cycling: stand still, then come out on the other side.
      const lock = useWalk.getState().airlock;
      if (lock && walking) {
        const t = performance.now() / 1000 - lock.t0;
        if (t >= AIRLOCK_SECONDS || walkInput.use) {
          walkInput.use = false;
          useWalk.getState().set({ airlock: null });
          if (lock.dir === "out") Object.assign(walker, { outside: true, x: OUTER_HATCH.x, z: OUTER_HATCH.z, yaw: OUTER_HATCH.yaw, pitch: -0.08, where: 0 });
          else {
            const p = polar(180, HOME.lining - 0.55);
            Object.assign(walker, { outside: false, x: p.x, z: p.z, yaw: 0, pitch: -0.04, where: 0 });
            act({ type: "eva", on: false });
          }
        }
      }
      // If the mission brings Alex in (suit time up, everyone sheltering), they're back inside.
      if (walker.outside && !suited()) {
        const p = polar(180, HOME.lining - 0.55);
        Object.assign(walker, { outside: false, x: p.x, z: p.z, yaw: 0, where: 0 });
      }
      if (interior.living.mySuit) interior.living.mySuit.visible = !suited();
      if (walking && !blocked && !useWalk.getState().airlock) {
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
        const before = walker.stride;
        let speed: number;
        if (walker.outside) {
          // In a suit: slower, and on the Moon a springy lope.
          const pace = (walkInput.fast ? 1.9 : 1.25) * (planet === "moon" ? 0.85 : 1);
          const len = Math.min(1, Math.hypot(wish.x, wish.z));
          const ease = 1 - Math.exp(-dt * 5);
          const tx = len ? (wish.x / Math.hypot(wish.x, wish.z)) * pace * len : 0,
            tz = len ? (wish.z / Math.hypot(wish.x, wish.z)) * pace * len : 0;
          const vx = walker.vx + (tx - walker.vx) * ease,
            vz = walker.vz + (tz - walker.vz) * ease;
          const g = useGame.getState().game;
          const p = walkOutside(walker, vx * dt, vz * dt, g.modules, planet, g.rover);
          speed = Math.hypot(p.x - walker.x, p.z - walker.z) / Math.max(dt, 1e-6);
          Object.assign(walker, { x: p.x, z: p.z, vx: dt ? (p.x - walker.x) / dt : 0, vz: dt ? (p.z - walker.z) / dt : 0, stride: walker.stride + (speed * dt) / (step * 1.15) });
        } else {
          const next = stride(walker, wish, walkInput.fast ? PACE.fast : PACE.walk, dt, isOpen);
          speed = Math.hypot(next.vx, next.vz);
          Object.assign(walker, { x: next.x, z: next.z, where: next.where, vx: next.vx, vz: next.vz, stride: walker.stride + (speed * dt) / step });
        }
        if (Math.floor(walker.stride) !== Math.floor(before) && speed > 0.4) footstep(Math.min(1, 0.55 + gravity / 9.81) * (walker.outside ? 0.6 : 1));
      } else {
        walker.vx = walker.vz = 0;
      }
      walkInput.look.x = walkInput.look.y = 0;

      // Doors slide open as you come near (the airlock's hatch stays shut until walks outside arrive).
      const level = walker.outside ? -1 : walker.where === "stair" ? null : walker.where;
      for (const d of interior.doors) {
        // (The shelter's hatch stands open while a storm is coming or on.)
        const near = (walking && d.id !== "airlock" && level === d.level && Math.hypot(walker.x - d.x, walker.z - d.z) < DOOR_REACH) || (d.id === "shelter" && !!st?.shelterOpen);
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
      // Alarms you hear inside: the storm klaxon every few seconds, a chime when the battery or oxygen runs low.
      const alarm = st?.alarm ?? null;
      const now = performance.now() / 1000;
      const heard = `${alarm}|${!!st?.batteryLow}`;
      if (alarm === "storm") {
        if (now - alarmAt > 2.6) {
          alarmAt = now;
          klaxon();
        }
      } else if (heard !== lastAlarm && (alarm || st?.batteryLow)) chime(alarm === "o2");
      lastAlarm = heard;
      // Walk away from an open card and it closes.
      const card = useWalk.getState().card;
      if (card) {
        const p = INSPECTS.find((x) => x.id === card);
        if (!p || p.level !== level || Math.hypot(p.x - walker.x, p.z - walker.z) > 2.2) useWalk.getState().set({ card: null });
      }
      const here = walker.outside ? (planet === "mars" ? "Outside · Mars" : "Outside · the Moon") : walker.where === "stair" ? "Stairs" : roomAt(walker.x, walker.z, walker.where).name;
      let best: Usable | null = null,
        bestScore = Infinity;
      // The suit-up and hatch prompts say what they'd do right now.
      usables[0].label = suited() ? "Take the suit off" : "Suit up to go outside (Alex's suit)";
      usables[1].label = suited() ? "Cycle the airlock and go outside" : "Airlock: suit up first";
      const shelter = shelterUse();
      const list = walker.outside ? outsideUses() : shelter ? [shelter, ...usables] : usables;
      for (const u of list) {
        if (u.level !== level) continue;
        const dx = u.x - walker.x,
          dz = u.z - walker.z;
        const d = Math.hypot(dx, dz);
        const off = Math.abs(Math.atan2(Math.sin(Math.atan2(dx, -dz) - walker.yaw), Math.cos(Math.atan2(dx, -dz) - walker.yaw)));
        // Outside, things are bigger and further: a longer reach.
        if (d < (walker.outside ? 2.2 : REACH) && off < (walker.outside ? 0.8 : AIM) && d + off < bestScore) {
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
      if (walkInput.use && !useWalk.getState().airlock) {
        walkInput.use = false;
        best?.use();
      }
    },
    /** Where the walker's eyes are, in the world (the habitat's origin given), with a gentle bob as you walk. */
    eye(origin: THREE.Vector3, pos: THREE.Vector3, quat: THREE.Quaternion, reduced: boolean) {
      const s = useUI.getState().settings;
      const pace = Math.min(1, Math.hypot(walker.vx, walker.vz) / PACE.walk);
      // One rise and fall per step; low gravity makes for a longer, floatier stride (a real lope outside on the Moon).
      const bob = s.bob && !reduced ? Math.abs(Math.sin(walker.stride * Math.PI)) * 0.018 * Math.sqrt(9.81 / gravity) * pace * (walker.outside ? 1.6 : 1) : 0;
      if (walker.outside) pos.set(walker.x, terrainHeight(walker.x, walker.z, planet) + SUIT.eye + bob, walker.z);
      else pos.set(origin.x + walker.x, origin.y + floorY(walker) + HOME.eye - 0.012 + bob, origin.z + walker.z);
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
