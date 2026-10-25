import { create } from "zustand";
import { act as applyAction, createState, step, updateDock } from "../sim/engine";
import { SIM_STEP } from "../sim/core";
import { mission } from "../sim/missions";
import { starsFor } from "../sim/goals";
import {
  approachPoint,
  drive,
  followRoute,
  planRoute,
  SCOUT_ROVER,
  STOP,
  type Block,
  type DriveInput,
  type Point,
} from "../sim/rover";
import type { Action, FeedItem, FeedKind, GameState } from "../sim/types";
import { DOCK, SCOUT_HOME, site } from "../sim/world";
import { play } from "../lib/sound";
import { speak } from "../lib/speech";
import { useUI } from "./ui";

/** Real seconds per training hour at 1×. A training day lasts about a minute and a half. */
export const HOUR_SECONDS = 3.5;
export const SPEEDS = [1, 2, 4] as const;
export type Speed = (typeof SPEEDS)[number];

export type PauseReason =
  | "briefing"
  | "manual"
  | "menu"
  | "alert"
  | "choice"
  | "hidden"
  | "ended";

export interface Toast {
  id: number;
  kind: FeedKind;
  text: string;
}
export interface Capcom {
  id: number;
  text: string;
}

export interface GameStore {
  game: GameState;
  speed: Speed;
  paused: boolean;
  reason: PauseReason | null;
  /** Autopilot waypoints and where they lead ("dock", a site id, or "point"). */
  route: Point[];
  target: string | null;
  /** Which rover you drive and send (the Rover panel, the keys, the follow camera): the crew's or the science rover. */
  vehicle: Vehicle;
  /** The science rover's own autopilot ("home", a site id, or "point"). */
  scoutRoute: Point[];
  scoutTarget: string | null;
  /** On-screen drive pad. */
  pad: DriveInput;
  /** True while the player is steering by hand (time runs at 1× then). */
  manual: boolean;
  /** Leftover training time below one simulation step. */
  acc: number;
  /** The tutorial holds the clock still. */
  held: boolean;
  seen: number;
  alert: FeedItem | null;
  toasts: Toast[];
  capcom: Capcom[];
  start: (id: string, seed?: number) => void;
  /** Continue a saved mission, paused. */
  load: (game: GameState, route: Point[], target: string | null, speed: Speed) => void;
  restart: () => void;
  act: (a: Action) => boolean;
  frame: (dt: number, keys: DriveInput) => void;
  setSpeed: (n: Speed) => void;
  pause: (reason: PauseReason) => void;
  resume: () => void;
  togglePause: () => void;
  hold: (held: boolean) => void;
  /** Send a rover (the selected one unless named) to a site, or home ("dock" or "home"). */
  sendRover: (target: string, which?: Vehicle) => boolean;
  driveTo: (p: Point, which?: Vehicle) => boolean;
  stopRover: (which?: Vehicle) => void;
  setVehicle: (v: Vehicle) => void;
  setPad: (key: keyof DriveInput, on: boolean) => void;
  dismissAlert: () => void;
  toast: (text: string, kind?: FeedKind) => void;
  dropToast: (id: number) => void;
  say: (text: string) => void;
  nextCapcom: () => void;
}

export type Vehicle = "rover" | "scout";
let toastId = 0;
const anyInput = (i: DriveInput) => i.forward || i.back || i.left || i.right;

export const useGame = create<GameStore>((set, get) => {
  /** Turn new feed lines into toasts, CAPCOM messages and (for dangers) a pausing alert. */
  const digest = (g: GameState) => {
    const fresh = g.feed.filter((f) => f.id > get().seen);
    if (!fresh.length) return;
    const toasts = [...get().toasts],
      capcom = [...get().capcom];
    let alert = get().alert;
    for (const f of fresh) {
      if (f.kind === "capcom") {
        capcom.push({ id: f.id, text: f.text });
        speak(f.text);
        play("capcom");
      } else if ((f.kind === "danger" || f.kind === "alert") && !alert && g.status === "playing") {
        alert = f;
        play(f.kind === "danger" ? "danger" : "warn");
      } else {
        toasts.push({ id: ++toastId, kind: f.kind, text: f.text });
        play(f.kind === "good" ? (f.text.includes("online") ? "online" : "good") : f.kind === "warn" || f.kind === "alert" ? "warn" : f.kind === "danger" ? "danger" : "click");
      }
    }
    set({ seen: fresh[fresh.length - 1].id, toasts: toasts.slice(-4), capcom: capcom.slice(-4) });
    if (alert && alert !== get().alert)
      set({ alert, paused: true, reason: "alert", pad: { ...STOP } });
  };

  /** Called whenever the mission might have ended. */
  const checkEnd = (g: GameState) => {
    if (g.status === "playing") return;
    if (get().reason === "ended") return;
    set({ paused: true, reason: "ended", route: [], target: null, alert: null, pad: { ...STOP } });
    const stars = starsFor(g, mission(g.missionId));
    if (g.status === "won") useUI.getState().record(g.missionId, stars);
    play(g.status === "won" ? "win" : "lose");
    window.setTimeout(() => {
      if (useGame.getState().game === g || useGame.getState().reason === "ended")
        useUI.setState({ debrief: true, panel: null, placing: null });
    }, 1400);
  };

  const initial = createState("first-light");
  return {
    game: initial,
    speed: 1,
    paused: true,
    reason: "briefing",
    route: [],
    target: null,
    vehicle: "rover",
    scoutRoute: [],
    scoutTarget: null,
    pad: { ...STOP },
    manual: false,
    acc: 0,
    held: false,
    seen: 0,
    alert: null,
    toasts: [],
    capcom: [],

    start: (id, seed) => {
      const game = createState(id, seed ?? (Date.now() % 100000) + 1);
      set({
        game,
        speed: 1,
        paused: true,
        reason: "briefing",
        route: [],
        target: null,
        vehicle: "rover",
        scoutRoute: [],
        scoutTarget: null,
        pad: { ...STOP },
        manual: false,
        acc: 0,
        held: false,
        seen: game.feed[game.feed.length - 1]?.id ?? 0,
        alert: null,
        toasts: [],
        capcom: [],
      });
    },
    load: (game, route, target, speed) =>
      set({
        game,
        speed,
        paused: true,
        reason: "manual",
        route,
        target,
        vehicle: "rover",
        scoutRoute: [],
        scoutTarget: null,
        pad: { ...STOP },
        manual: false,
        acc: 0,
        held: false,
        seen: game.feed[game.feed.length - 1]?.id ?? 0,
        alert: null,
        toasts: [],
        capcom: [],
      }),
    restart: () => get().start(get().game.missionId, get().game.seed),

    act: (a) => {
      const r = applyAction(get().game, a);
      if (!r.ok) {
        if (r.message) get().toast(r.message, "warn");
        play("warn");
        return false;
      }
      set({ game: r.state });
      if (a.type === "choose" && !r.state.choice && get().reason === "choice") get().resume();
      digest(r.state);
      checkEnd(r.state);
      return true;
    },

    frame: (dt, keys) => {
      const st = get();
      if (st.paused || st.held || st.game.status !== "playing") return;
      if (st.game.choice) {
        set({ paused: true, reason: "choice" });
        play("open");
        return;
      }
      const input: DriveInput = {
        forward: keys.forward || st.pad.forward,
        back: keys.back || st.pad.back,
        left: keys.left || st.pad.left,
        right: keys.right || st.pad.right,
      };
      const manual = anyInput(input);
      const speed = manual ? 1 : st.speed;
      const hours = (Math.min(0.25, Math.max(0, dt)) * speed) / HOUR_SECONDS;
      if (hours <= 0) return;
      const g = structuredClone(st.game);
      let route = st.route,
        target = st.target,
        scoutRoute = st.scoutRoute,
        scoutTarget = st.scoutTarget;
      // The keys drive the rover you picked; the other carries on with its autopilot. Neither drives through the other.
      const steering: Vehicle = st.vehicle === "scout" && g.scout ? "scout" : "rover";
      const roverBlock: Block = g.scout ? { x: g.scout.x, z: g.scout.z, r: SCOUT_ROVER.gap } : null;
      if (g.rover.task) {
        if (manual && steering === "rover" && !st.manual) get().toast("Wait! The crew is outside collecting.", "warn");
      } else if (manual && steering === "rover") {
        route = [];
        target = null;
        g.rover = drive(g.rover, input, hours, g.modules, g.planet, roverBlock);
      } else if (route.length) {
        const out = followRoute(g.rover, route, hours, g.modules, g.planet, roverBlock);
        g.rover = out.rover;
        route = out.route;
        if (!route.length) {
          const goal = target && target !== "dock" && target !== "point" ? site(target) : null;
          if (goal && Math.hypot(goal.x - g.rover.x, goal.z - g.rover.z) > 5)
            get().toast("Autopilot stopped: something is in the way. Steer around it.", "warn");
          target = null;
        }
      } else if (g.rover.speed !== 0) g.rover = drive(g.rover, STOP, hours, g.modules, g.planet, roverBlock);
      if (g.scout) {
        const block: Block = { x: g.rover.x, z: g.rover.z, r: SCOUT_ROVER.gap };
        if (g.scout.task) {
          if (manual && steering === "scout" && !st.manual) get().toast("Wait! The science rover is studying the rocks.", "warn");
        } else if (manual && steering === "scout") {
          scoutRoute = [];
          scoutTarget = null;
          g.scout = drive(g.scout, input, hours, g.modules, g.planet, block);
        } else if (scoutRoute.length) {
          const out = followRoute(g.scout, scoutRoute, hours, g.modules, g.planet, block);
          g.scout = out.rover;
          scoutRoute = out.route;
          if (!scoutRoute.length) {
            const goal = scoutTarget && scoutTarget !== "home" && scoutTarget !== "point" ? site(scoutTarget) : null;
            if (goal && Math.hypot(goal.x - g.scout.x, goal.z - g.scout.z) > 5)
              get().toast("The science rover's autopilot stopped: something is in the way.", "warn");
            scoutTarget = null;
          }
        } else if (g.scout.speed !== 0) g.scout = drive(g.scout, STOP, hours, g.modules, g.planet, block);
      }
      const wasDocked = g.rover.docked;
      updateDock(g);
      if (g.rover.docked && !wasDocked) play("rover");
      let acc = st.acc + hours;
      while (acc >= SIM_STEP - 1e-9 && g.status === "playing" && !g.choice) {
        step(g, SIM_STEP);
        acc -= SIM_STEP;
      }
      set({ game: g, route, target, scoutRoute, scoutTarget, acc, manual });
      digest(g);
      checkEnd(g);
      if (g.choice && !get().paused) {
        set({ paused: true, reason: "choice", pad: { ...STOP } });
        play("open");
      }
    },

    setSpeed: (speed) => {
      set({ speed });
      if (get().paused && (get().reason === "manual" || get().reason === "briefing") && get().game.status === "playing" && !useUI.getState().briefing)
        get().resume();
    },
    pause: (reason) => {
      if (get().game.status !== "playing" && reason !== "ended") return;
      set({ paused: true, reason, pad: { ...STOP } });
    },
    resume: () => {
      const g = get().game;
      if (g.status !== "playing") return;
      if (g.choice) {
        set({ paused: true, reason: "choice" });
        return;
      }
      set({ paused: false, reason: null, alert: null });
    },
    togglePause: () => {
      if (get().paused) {
        if (get().reason === "ended") return;
        get().resume();
      } else get().pause("manual");
    },
    hold: (held) => set({ held }),

    sendRover: (to, which = get().vehicle) => {
      const g = get().game;
      if (g.status !== "playing") return false;
      if (which === "scout" && g.scout) {
        const sc = g.scout;
        if (sc.task) {
          get().toast("Wait for the science rover to finish studying.", "warn");
          return false;
        }
        const block: Block = { x: g.rover.x, z: g.rover.z, r: SCOUT_ROVER.gap };
        const where = to === "home" || to === "dock" ? null : site(to);
        if (to !== "home" && to !== "dock" && !where) return false;
        const goal = where ? (approachPoint(sc, where, g.modules, 2.2, block) ?? approachPoint(sc, where, g.modules, 0, block)) : { x: SCOUT_HOME.x, z: SCOUT_HOME.z };
        const route = goal ? planRoute(sc, goal, g.modules, block) : [];
        if (!route.length) {
          get().toast("The science rover can't find a way there.", "warn");
          return false;
        }
        set({ scoutRoute: route, scoutTarget: where ? to : "home" });
        play("rover");
        return true;
      }
      if (g.rover.task) {
        get().toast("Wait for the crew to finish collecting.", "warn");
        return false;
      }
      const r = g.rover;
      const block: Block = g.scout ? { x: g.scout.x, z: g.scout.z, r: SCOUT_ROVER.gap } : null;
      let goal: Point | null;
      if (to === "dock" || to === "home") goal = { ...DOCK };
      else {
        const where = site(to);
        if (!where) return false;
        // Park beside the marker, not on top of it.
        goal = approachPoint(r, where, g.modules, 2.2, block) ?? approachPoint(r, where, g.modules, 0, block);
      }
      const route = goal ? planRoute(r, goal, g.modules, block) : [];
      if (!route.length) {
        get().toast("The rover can't find a way there.", "warn");
        return false;
      }
      set({ route, target: to === "home" ? "dock" : to });
      play("rover");
      return true;
    },
    driveTo: (p, which = get().vehicle) => {
      const g = get().game;
      if (which === "scout" && g.scout) {
        if (g.status !== "playing" || g.scout.task) return false;
        const block: Block = { x: g.rover.x, z: g.rover.z, r: SCOUT_ROVER.gap };
        const goal = approachPoint(g.scout, p, g.modules, 0, block);
        const route = goal ? planRoute(g.scout, goal, g.modules, block) : [];
        if (!route.length) {
          get().toast("The science rover can't drive there.", "warn");
          return false;
        }
        set({ scoutRoute: route, scoutTarget: "point" });
        play("rover");
        return true;
      }
      if (g.status !== "playing" || g.rover.task) return false;
      const block: Block = g.scout ? { x: g.scout.x, z: g.scout.z, r: SCOUT_ROVER.gap } : null;
      const goal = approachPoint(g.rover, p, g.modules, 0, block);
      const route = goal ? planRoute(g.rover, goal, g.modules, block) : [];
      if (!route.length) {
        get().toast("The rover can't drive there.", "warn");
        return false;
      }
      set({ route, target: "point" });
      play("rover");
      return true;
    },
    stopRover: (which = get().vehicle) => (which === "scout" ? set({ scoutRoute: [], scoutTarget: null }) : set({ route: [], target: null })),
    // (During a tutorial, which teaches the crew rover, the science rover can't be picked.)
    setVehicle: (vehicle) =>
      set({ vehicle: vehicle === "scout" && (!get().game.scout || useUI.getState().tutorial !== null) ? "rover" : vehicle, pad: { ...STOP } }),
    setPad: (key, on) => set({ pad: { ...get().pad, [key]: on } }),

    dismissAlert: () => {
      set({ alert: null });
      if (get().reason === "alert") get().resume();
    },
    toast: (text, kind = "info") => {
      const toasts = [...get().toasts.filter((t) => t.text !== text), { id: ++toastId, kind, text }];
      set({ toasts: toasts.slice(-4) });
    },
    dropToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
    say: (text) => {
      set({ capcom: [...get().capcom, { id: ++toastId, text }].slice(-4) });
      speak(text);
    },
    nextCapcom: () => set({ capcom: get().capcom.slice(1) }),
  };
});
