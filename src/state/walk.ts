import { create } from "zustand";
import { SPAWN, type Where } from "../sim/home";
import { useGame, type Speed } from "./game";
import { useUI, type View } from "./ui";

/** What steers the walker: written by the keyboard, mouse and touch handlers, read by the 3D view each frame. */
export const walkInput = {
  /** Movement keys held, by physical key code. */
  keys: new Set<string>(),
  /** The on-screen stick: x to the right, y forward, each −1 to 1. */
  stick: { x: 0, y: 0 },
  /** Look movement since the last frame, in screen pixels; `touch` when it came from a finger. */
  look: { x: 0, y: 0, touch: false },
  /** Walk faster (Shift). */
  fast: false,
  /** Interact was asked for since the last frame (E, a click with the mouse captured, or the button). */
  use: false,
};
export function clearWalkInput() {
  walkInput.keys.clear();
  walkInput.stick.x = walkInput.stick.y = 0;
  walkInput.look.x = walkInput.look.y = 0;
  walkInput.fast = walkInput.use = false;
}

/** When the mouse was last let go (Esc frees it first; that same press shouldn't also open the menu). */
export const lockState = { freedAt: -1e9 };

/** The walker: habitat-local metres, facing a compass bearing in radians (0 north, clockwise), looking up by `pitch`. */
export const walker = { x: SPAWN.x, z: SPAWN.z, where: SPAWN.where as Where, yaw: SPAWN.yaw, pitch: -0.04, vx: 0, vz: 0, stride: 0, outside: false };
export function respawn() {
  Object.assign(walker, { x: SPAWN.x, z: SPAWN.z, where: SPAWN.where, yaw: SPAWN.yaw, pitch: -0.04, vx: 0, vz: 0, stride: 0, outside: false });
  clearWalkInput();
}

export interface WalkStore {
  /** The room you are in, for the HUD. */
  room: string;
  /** What interacting would do right now ("Open the hatch"), or null. */
  prompt: string | null;
  /** The mouse is captured for looking. */
  locked: boolean;
  /** The inspect card open now (an id from sim/inspect), or null. */
  card: string | null;
  /** The airlock cycling (out to the surface, or back in), and when it started (seconds). */
  airlock: { dir: "out" | "in"; t0: number } | null;
  /** The home tour's step (0–5), or null. */
  tour: number | null;
  /** The inside has been built (it's put together in the background once the mission is on screen). */
  ready: boolean;
  /** The view and sim speed to go back to when you stop walking. */
  back: { view: Exclude<View, "walk">; speed: Speed } | null;
  set: (p: Partial<Pick<WalkStore, "room" | "prompt" | "locked" | "card" | "airlock" | "tour" | "ready">>) => void;
}
export const useWalk = create<WalkStore>((set) => ({
  room: "",
  prompt: null,
  locked: false,
  card: null,
  airlock: null,
  tour: null,
  ready: false,
  back: null,
  set: (p) => set(p),
}));

/** Why you can't step inside right now, or null if you can. */
export function cantWalk() {
  const ui = useUI.getState(),
    g = useGame.getState();
  if (ui.screen !== "game" || ui.briefing || ui.debrief) return "Start the mission first.";
  if (g.game.status !== "playing") return "The mission is over.";
  return null;
}

/** Step inside the home (first person, just inside the airlock), or say why not. */
export function enterWalk() {
  const why = cantWalk();
  if (why) {
    useGame.getState().toast(why, "warn");
    return false;
  }
  useUI.getState().setView("walk");
  return true;
}

/** Stop walking: back to the view you came from. */
export function leaveWalk() {
  if (useUI.getState().view !== "walk") return;
  useUI.getState().setView(useWalk.getState().back?.view ?? "orbit");
}

// Every way into or out of the walk (the view buttons, V, "Go inside", camera shortcuts, a new mission) passes here.
// Going in: start at the airlock, and run time at 1× (set directly: setSpeed() would also resume a paused mission).
// Coming out: the speed you had comes back, unless you changed it while walking.
useUI.subscribe((s, prev) => {
  if (s.view === prev.view) return;
  if (s.view === "walk") {
    if (cantWalk()) {
      useUI.getState().setView(prev.view === "walk" ? "orbit" : prev.view);
      return;
    }
    const speed = useGame.getState().speed;
    useWalk.setState({ back: { view: prev.view === "walk" ? "orbit" : prev.view, speed }, prompt: null, card: null });
    respawn();
    if (speed !== 1) useGame.setState({ speed: 1 });
  } else if (prev.view === "walk") {
    const back = useWalk.getState().back;
    if (back && useGame.getState().speed === 1) useGame.setState({ speed: back.speed });
    useWalk.setState({ back: null, prompt: null, locked: false, card: null, airlock: null, tour: null });
    // Stepping out of walk mode mid-walk outside brings Alex back in.
    if (useGame.getState().game.eva) useGame.getState().act({ type: "eva", on: false });
    clearWalkInput();
  }
});
