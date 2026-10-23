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
  STOP,
  type DriveInput,
  type Point,
} from "../sim/rover";
import type { Action, FeedItem, FeedKind, GameState } from "../sim/types";
import { DOCK, site } from "../sim/world";
import { play } from "../lib/sound";
import { speak } from "../lib/speech";
import { useUI } from "./ui";

/** Real seconds per training hour at 1×. A training day lasts one minute. */
export const HOUR_SECONDS = 2.5;
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
  restart: () => void;
  act: (a: Action) => boolean;
  frame: (dt: number, keys: DriveInput) => void;
  setSpeed: (n: Speed) => void;
  pause: (reason: PauseReason) => void;
  resume: () => void;
  togglePause: () => void;
  hold: (held: boolean) => void;
  sendRover: (target: string) => boolean;
  driveTo: (p: Point) => boolean;
  stopRover: () => void;
  setPad: (key: keyof DriveInput, on: boolean) => void;
  dismissAlert: () => void;
  toast: (text: string, kind?: FeedKind) => void;
  dropToast: (id: number) => void;
  say: (text: string) => void;
  nextCapcom: () => void;
}

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
        target = st.target;
      if (g.rover.task) {
        if (manual && !st.manual) get().toast("Wait! The crew is outside collecting.", "warn");
      } else if (manual) {
        route = [];
        target = null;
        g.rover = drive(g.rover, input, hours, g.modules, g.planet);
      } else if (route.length) {
        const out = followRoute(g.rover, route, hours, g.modules, g.planet);
        g.rover = out.rover;
        route = out.route;
        if (!route.length) {
          const goal = target && target !== "dock" && target !== "point" ? site(target) : null;
          if (goal && Math.hypot(goal.x - g.rover.x, goal.z - g.rover.z) > 5)
            get().toast("Autopilot stopped: something is in the way. Steer around it.", "warn");
          target = null;
        }
      } else if (g.rover.speed !== 0) g.rover = drive(g.rover, STOP, hours, g.modules, g.planet);
      const wasDocked = g.rover.docked;
      updateDock(g);
      if (g.rover.docked && !wasDocked) play("rover");
      let acc = st.acc + hours;
      while (acc >= SIM_STEP - 1e-9 && g.status === "playing" && !g.choice) {
        step(g, SIM_STEP);
        acc -= SIM_STEP;
      }
      set({ game: g, route, target, acc, manual });
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

    sendRover: (to) => {
      const g = get().game;
      if (g.status !== "playing") return false;
      if (g.rover.task) {
        get().toast("Wait for the crew to finish collecting.", "warn");
        return false;
      }
      const r = g.rover;
      let goal: Point | null;
      if (to === "dock") goal = { ...DOCK };
      else {
        const where = site(to);
        if (!where) return false;
        // Park beside the marker, not on top of it.
        goal = approachPoint(r, where, g.modules, 2.2) ?? approachPoint(r, where, g.modules, 0);
      }
      const route = goal ? planRoute(r, goal, g.modules) : [];
      if (!route.length) {
        get().toast("The rover can't find a way there.", "warn");
        return false;
      }
      set({ route, target: to });
      play("rover");
      return true;
    },
    driveTo: (p) => {
      const g = get().game;
      if (g.status !== "playing" || g.rover.task) return false;
      const goal = approachPoint(g.rover, p, g.modules, 0);
      const route = goal ? planRoute(g.rover, goal, g.modules) : [];
      if (!route.length) {
        get().toast("The rover can't drive there.", "warn");
        return false;
      }
      set({ route, target: "point" });
      play("rover");
      return true;
    },
    stopRover: () => set({ route: [], target: null }),
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
