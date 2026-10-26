import * as THREE from "three";
import { AIRLOCKS, cellAt, cellById, doorLocked, doorSlab, LOCK_PANELS, portalById, porchY, stageOf, SUIT_RACKS, WALL, type Airlock, type Portal } from "../sim/base";
import { lockStatus, newLock, startCycle, stepLock, type Lock } from "../sim/airlock";
import { blockAxes, BLOCKS, floorY, HOME, lineClear, PACE, placeName, stepLength, stride, type Floor } from "../sim/home";
import { SUIT, walkOutside } from "../sim/outside";
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

/** Things you can use with E (or a click, or the Use button) while walking; level -1 is outside. */
interface Usable {
  level: Floor | -1;
  x: number;
  z: number;
  label: string;
  use: () => void;
  /** The furniture it sits on (its own edges don't hide it from you). */
  block?: string;
}

/**
 * Walking inside the home in first person: look with the mouse (captured with the Pointer Lock API, or by
 * dragging if the browser won't), move with the keys or the touch stick, and doors slide open as you come near.
 * Movement is in real seconds, whatever the mission's speed.
 */
/** A door in the 3D model that the walk slides open and shut. */
export interface DoorView {
  id: string;
  level: number;
  x: number;
  z: number;
  set: (open: number) => void;
}
/** How far out from an outer door's wall face a walker is (negative: inside the doorway). */
function outward(p: Portal, x: number, z: number) {
  const c = cellById(p.a === "outside" ? p.b : p.a)!;
  const r = c.rect;
  if (p.along === "x") return p.z > (r.z0 + r.z1) / 2 ? z - (r.z1 + WALL.outer) : r.z0 - WALL.outer - z;
  return p.x > (r.x0 + r.x1) / 2 ? x - (r.x1 + WALL.outer) : r.x0 - WALL.outer - x;
}
const across = (p: Portal, x: number, z: number) => Math.abs(p.along === "x" ? x - p.x : z - p.z);

export function walkController(
  canvas: HTMLCanvasElement,
  planet: Planet,
  home: () => Interior | null,
  /** The ground outside, rocks included (a suited walker steps up onto them). */
  ground: (x: number, z: number) => number = (x, z) => terrainHeight(x, z, planet),
  /** The campus's doors (its 3D model is built in the background). */
  campusDoors: () => DoorView[] = () => [],
) {
  // Outside, the feet follow the ground and climb onto rocks over a moment rather than in a jump.
  let feet = Number.NaN,
    feetAt = 0;
  const gravity = PLANETS[planet].gravity;
  const step = stepLength(gravity);
  const open = new Map<string, number>();
  // The airlocks: each one's chamber pressure and doors, run by sim/airlock (its doors never both open).
  const locks = new Map<string, Lock>(AIRLOCKS.map((a) => [a.id, newLock()]));
  const lockOf = new Map<string, { a: Airlock; door: "inner" | "outer" }>(AIRLOCKS.flatMap((a) => [[a.inner, { a, door: "inner" as const }] as const, [a.outer, { a, door: "outer" as const }] as const]));
  let hurry = false;
  const isOpen = (id: string) => {
    const l = lockOf.get(id);
    return l ? locks.get(l.a.id)![l.door] > 0.8 : (open.get(id) ?? 0) > 0.8;
  };
  /** Shut airlock doors, as solid slabs for a walker outside. */
  const shutOuter = () => AIRLOCKS.filter((a) => !isOpen(a.outer)).map((a) => doorSlab(portalById(a.outer)!));
  let state: InteriorState | null = null;
  const act = (a: Parameters<ReturnType<typeof useGame.getState>["act"]>[0]) => useGame.getState().act(a);
  const suited = () => !!useGame.getState().game.eva;
  const stage = () => stageOf(useGame.getState().game.missionId);
  const cycle = (a: Airlock, dir: "out" | "in") => {
    locks.set(a.id, startCycle(locks.get(a.id)!, dir));
    hurry = false;
    useWalk.getState().set({ card: null });
    airlockSound(dir === "out");
  };
  // Hab-1's suit room keeps the spare suits; Alex suits up by an airlock (the EVA complex's, or the yard lock's).
  const rack = BLOCKS.find((k) => k.id === "suit-rack-e")!;
  const ax = blockAxes(rack);
  const spareSuits = { level: 0 as Floor, x: ax.c.x + ax.t.x * (rack.w / 2 + 0.05), z: ax.c.z + ax.t.z * (rack.w / 2 + 0.05) };
  const usables: Usable[] = [
    { ...spareSuits, label: "Spare suits (Alex suits up in the EVA complex)", use: () => useGame.getState().toast("To go outside, suit up in the EVA complex: through the link to the HQ, then the east spine.", "info") },
    // Suit up (or out of the suit) at a rack beside an airlock.
    ...SUIT_RACKS.map((r) => ({ level: 0 as Floor, x: r.x, z: r.z, label: "", use: () => act({ type: "eva", on: !suited() }) })),
    // Each airlock's panel inside its chamber: pump down to go out, or fill with air to come in.
    ...LOCK_PANELS.map((p) => {
      const a = AIRLOCKS.find((x) => x.id === p.airlock)!;
      return {
        level: 0 as Floor,
        ...p.inside,
        label: "",
        use: () => {
          const l = locks.get(a.id)!;
          if (l.cycle !== "none") hurry = true;
          else if (l.pressure >= 1) {
            if (!suited()) useGame.getState().toast("Suit up first: the suits hang in the room behind you.", "warn");
            else cycle(a, "out");
          } else cycle(a, "in");
        },
      };
    }),
    // Equipment you can look at closely: live readings and a fact.
    ...INSPECTS.map((p) => ({ level: p.level, x: p.x, z: p.z, block: p.block, label: `Look at the ${p.title.toLowerCase()}`, use: () => useWalk.getState().set({ card: useWalk.getState().card === p.id ? null : p.id }) })),
  ];
  const rackUses = usables.slice(1, 1 + SUIT_RACKS.length),
    panelUses = usables.slice(1 + SUIT_RACKS.length, 1 + SUIT_RACKS.length + LOCK_PANELS.length);
  // The storm drill: inside the shelter, the same shelter action as the HUD's (same rules, same costs).
  const shelterSpot = { level: 0 as Floor, x: Math.sin((70 * Math.PI) / 180) * 0.4, z: -Math.cos((70 * Math.PI) / 180) * 0.4 };
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
  /** Outside: the airlocks' outer panels, broken modules to repair, dusty panels to brush. */
  const outsideUses = (): Usable[] => {
    const g = useGame.getState().game;
    const out: Usable[] = LOCK_PANELS.map((p) => {
      const a = AIRLOCKS.find((x) => x.id === p.airlock)!;
      const l = locks.get(a.id)!;
      return {
        level: -1 as const,
        ...p.outside,
        label: l.cycle !== "none" ? "Airlock cycling: hurry it along" : l.pressure > 0 ? `${a.name}: pump it down to open the outer door` : `${a.name}: the outer door opens as you come near`,
        use: () => (l.cycle !== "none" ? (hurry = true) : l.pressure > 0 ? cycle(a, "out") : undefined),
      };
    });
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
      // The airlocks: doors open for you only as the interlock allows; a cycle runs once both doors are shut.
      let cycling: { a: Airlock; l: Lock } | null = null;
      for (const a of AIRLOCKS) {
        const inner = portalById(a.inner)!,
          outer = portalById(a.outer)!;
        const before = locks.get(a.id)!;
        const inside = !walker.outside && walker.where === 0;
        const wantInner = walking && inside && Math.hypot(walker.x - inner.x, walker.z - inner.z) < DOOR_REACH + 0.15;
        const wantOuter = walking && suited() && Math.hypot(walker.x - outer.x, walker.z - outer.z) < (walker.outside ? 1.9 : DOOR_REACH + 0.15);
        const l = stepLock(before, dt, { inner: wantInner, outer: wantOuter }, hurry);
        locks.set(a.id, l);
        for (const [door, k, was] of [[a.inner, l.inner, before.inner], [a.outer, l.outer, before.outer]] as const) {
          if (k === was) continue;
          if ((was === 0 && k > 0) || (was === 1 && k < 1)) doorSound(k > was);
          for (const d of campusDoors()) if (d.id === door) d.set(k * k * (3 - 2 * k));
        }
        if (before.cycle !== "none" && l.cycle === "none") {
          hurry = false;
          chime(false);
          // Back in from the surface: the suit comes off and goes back on its rack.
          if (before.cycle === "in" && suited() && cellAt(walker.x, walker.z, 0)?.id === a.chamber) {
            act({ type: "eva", on: false });
            useGame.getState().toast("Back inside. Alex's suit goes back on its rack.", "good");
          }
        }
        const here = walker.outside ? Math.hypot(walker.x - outer.x, walker.z - outer.z) < 4 : cellAt(walker.x, walker.z, 0)?.id === a.chamber;
        if (l.cycle !== "none" && here) cycling = { a, l };
      }
      // The pressure gauge while you're in (or just outside) an airlock that's cycling.
      const shown = useWalk.getState().airlock;
      if (cycling) {
        const kpa = Math.round(cycling.l.pressure * 101);
        if (!shown || shown.id !== cycling.a.id || shown.kpa !== kpa || shown.dir !== cycling.l.cycle) useWalk.getState().set({ airlock: { id: cycling.a.id, dir: cycling.l.cycle as "out" | "in", kpa, status: lockStatus(cycling.l) } });
      } else if (shown) useWalk.getState().set({ airlock: null });
      // E (or Skip) while cycling hurries it along.
      if (cycling && walkInput.use) {
        walkInput.use = false;
        hurry = true;
      }
      // If the mission brings Alex in (suit time up, everyone sheltering), they're back inside, by the airlock.
      if (walker.outside && !suited()) {
        const a = AIRLOCKS.reduce((best, x) => (Math.hypot(walker.x - x.outside.x, walker.z - x.outside.z) < Math.hypot(walker.x - best.outside.x, walker.z - best.outside.z) ? x : best));
        const c = cellById(a.stage)!.rect;
        Object.assign(walker, { outside: false, x: (c.x0 + c.x1) / 2, z: (c.z0 + c.z1) / 2, where: 0 });
      }
      const interior = home();
      if (interior?.living.mySuit) interior.living.mySuit.visible = true;
      if (walking && !blocked) {
        const s = useUI.getState().settings;
        const k = (walkInput.look.touch ? 0.0045 : 0.0022) * s.look;
        walker.yaw += walkInput.look.x * k;
        // (Nearly straight down at your feet, or up at the ceiling; never over the top.)
        walker.pitch = THREE.MathUtils.clamp(walker.pitch - walkInput.look.y * k * (s.invert ? -1 : 1), -1.45, 1.45);
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
          const p = walkOutside(walker, vx * dt, vz * dt, g.modules, planet, g.rover, shutOuter());
          speed = Math.hypot(p.x - walker.x, p.z - walker.z) / Math.max(dt, 1e-6);
          Object.assign(walker, { x: p.x, z: p.z, vx: dt ? (p.x - walker.x) / dt : 0, vz: dt ? (p.z - walker.z) / dt : 0, stride: walker.stride + (speed * dt) / (step * 1.15) });
          // Into an open outer door: the walk carries on inside the chamber.
          for (const a of AIRLOCKS) {
            const door = portalById(a.outer)!;
            if (isOpen(a.outer) && across(door, walker.x, walker.z) < door.width / 2 && outward(door, walker.x, walker.z) < -0.05) Object.assign(walker, { outside: false, where: 0 });
          }
        } else {
          const next = stride(walker, wish, walkInput.fast ? PACE.fast : PACE.walk, dt, isOpen);
          speed = Math.hypot(next.vx, next.vz);
          Object.assign(walker, { x: next.x, z: next.z, where: next.where, vx: next.vx, vz: next.vz, stride: walker.stride + (speed * dt) / step });
          // Out through an open outer door, onto the porch: the walk carries on outside.
          for (const a of AIRLOCKS) {
            const door = portalById(a.outer)!;
            if (walker.where === 0 && isOpen(a.outer) && across(door, walker.x, walker.z) < door.width / 2 + 0.1 && outward(door, walker.x, walker.z) > 0.2) walker.outside = true;
          }
        }
        if (Math.floor(walker.stride) !== Math.floor(before) && speed > 0.4)
          // (Outside on the Moon, only through your own suit.)
          footstep(Math.min(1, 0.55 + gravity / 9.81) * (walker.outside && planet === "moon" ? 0.5 : 1), walker.outside ? "ground" : walker.where === "stair" ? "stair" : "floor");
      } else {
        walker.vx = walker.vz = 0;
      }
      walkInput.look.x = walkInput.look.y = 0;

      // Doors slide open as you come near (a door into a building the colony hasn't built yet stays locked).
      const level = walker.outside ? -1 : walker.where === "stair" || walker.where === "hq-stair" ? null : walker.where;
      const now0 = stage();
      for (const d of [...(interior?.doors ?? []), ...campusDoors()]) {
        if (lockOf.has(d.id)) continue;
        const portal = portalById(d.id);
        // (The garage's vehicle door opens for the rovers, not for walkers.)
        if (portal && (portal.kind === "vehicle" || doorLocked(portal, now0))) continue;
        // (The shelter's hatch stands open while a storm is coming or on.)
        const near = (walking && level === d.level && Math.hypot(walker.x - d.x, walker.z - d.z) < DOOR_REACH) || (d.id === "shelter" && !!st?.shelterOpen);
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
      const garage = walker.outside && cellAt(walker.x, walker.z, 0)?.id === "garage";
      const here = walker.outside ? (garage ? "Rover garage (unpressurised)" : planet === "mars" ? "Outside · Mars" : "Outside · the Moon") : placeName(walker.x, walker.z, walker.where);
      let best: Usable | null = null,
        bestScore = Infinity;
      // The suit racks' and airlock panels' prompts say what they'd do right now.
      for (const u of rackUses) u.label = suited() ? "Take the suit off" : "Suit up to go outside (Alex's suit)";
      panelUses.forEach((u, i) => {
        const l = locks.get(LOCK_PANELS[i].airlock)!;
        u.label = l.cycle !== "none" ? "Airlock cycling: hurry it along" : l.pressure >= 1 ? (suited() ? "Pump the airlock down and go outside" : "Airlock: suit up first") : "Fill the airlock with air and come in";
      });
      const shelter = shelterUse();
      const list = walker.outside ? outsideUses() : shelter ? [shelter, ...usables] : usables;
      for (const u of list) {
        if (u.level !== level) continue;
        const dx = u.x - walker.x,
          dz = u.z - walker.z;
        const d = Math.hypot(dx, dz);
        const off = Math.abs(Math.atan2(Math.sin(Math.atan2(dx, -dz) - walker.yaw), Math.cos(Math.atan2(dx, -dz) - walker.yaw)));
        // Outside, things are bigger and further: a longer reach. Inside, only what you can actually see: not
        // through a wall, a closed door or another cabinet.
        if (d < (walker.outside ? 2.2 : REACH) && off < (walker.outside ? 0.8 : AIM) && d + off < bestScore && (u.level === -1 || lineClear(u.level, walker, u, isOpen, u.block))) {
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
      // One rise and fall per step; low gravity makes for a longer, floatier stride (a real lope outside on the Moon).
      const bob = s.bob && !reduced ? Math.abs(Math.sin(walker.stride * Math.PI)) * 0.018 * Math.sqrt(9.81 / gravity) * pace * (walker.outside ? 1.6 : 1) : 0;
      if (walker.outside) {
        const now = performance.now() / 1000,
          to = Math.max(ground(walker.x, walker.z), porchY(walker.x, walker.z));
        feet = !Number.isFinite(feet) || now - feetAt > 0.5 ? to : feet + (to - feet) * Math.min(1, (now - feetAt) * 7);
        feetAt = now;
        pos.set(walker.x, feet + SUIT.eye + bob, walker.z);
      } else {
        feet = Number.NaN;
        pos.set(origin.x + walker.x, origin.y + floorY(walker) + HOME.eye - 0.012 + bob, origin.z + walker.z);
      }
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
