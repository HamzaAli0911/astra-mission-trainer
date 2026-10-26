import { MISSIONS } from "../sim/missions";
import type { GameState } from "../sim/types";
import type { Point } from "../sim/rover";
import { DOCK, SCOUT_HOME } from "../sim/world";
import { useGame, type Speed } from "./game";
import { useUI } from "./ui";

/**
 * Autosave: the mission in progress is written to localStorage every few
 * seconds and when the tab is hidden or closed, so a refresh or a closed
 * laptop doesn't throw away a long mission. Finishing a mission clears it.
 */
const KEY = "astra-trainer-save-v1";

export interface SavedMission {
  /** 1: the first outpost's map; 2: the colony campus's (sites, dock and far pads moved). */
  v: 1 | 2;
  at: number;
  game: GameState;
  route: Point[];
  target: string | null;
  speed: Speed;
  tutorial: number | null;
}

/**
 * Bring a save from an older version up to date. Version 1 saves come from the smaller map before the campus was
 * built: positions there mean nothing now, so both rovers go back to their bays in the garage (the crew rover docks,
 * keeping its charge and any load it was carrying, which it unloads there), and any planned drive is dropped. Modules
 * stay on their pads (a pad keeps its number when it moves).
 */
export function migrate(save: SavedMission): SavedMission {
  if (save.v === 2) return save;
  const g = save.game;
  g.rover = { ...g.rover, x: DOCK.x, z: DOCK.z, heading: Math.PI, speed: 0, docked: true, task: null };
  if (g.scout) g.scout = { ...g.scout, x: SCOUT_HOME.x, z: SCOUT_HOME.z, heading: SCOUT_HOME.heading, speed: 0, task: null };
  return { ...save, v: 2, game: g, route: [], target: null };
}

export function readSave(): SavedMission | null {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as SavedMission | null;
    if (!raw || (raw.v !== 1 && raw.v !== 2) || !raw.game || raw.game.status !== "playing") return null;
    if (!MISSIONS.some((m) => m.id === raw.game.missionId)) return null;
    return migrate(raw);
  } catch {
    return null;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* storage is optional */
  }
}

export function saveNow() {
  const st = useGame.getState(),
    ui = useUI.getState();
  if (ui.screen !== "game" || ui.briefing || st.game.status !== "playing") return;
  const save: SavedMission = { v: 2, at: Date.now(), game: st.game, route: st.route, target: st.target, speed: st.speed, tutorial: ui.tutorial };
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    /* storage full or blocked: carry on without saving */
  }
}

/** Pick up a saved mission where it was left, paused. */
export function resumeSave(save: SavedMission) {
  // A walk outside doesn't survive a reload: the walker is back inside (saves from before walks outside have none).
  if (save.game.eva) {
    save.game.eva = null;
    for (const c of save.game.crew) if (c.place === "eva") c.place = "habitat";
  }
  useGame.getState().load(save.game, save.route, save.target, save.speed);
  useUI.setState({
    screen: "game",
    briefing: false,
    debrief: false,
    modal: null,
    panel: null,
    selected: null,
    placing: null,
    tutorial: save.tutorial,
    focus: save.game.missionId,
    view: "orbit",
  });
  useUI.getState().cam("reset");
  useGame.getState().toast("Mission resumed. Press play when you're ready.", "info");
}

/** Keep saving while the app runs. */
export function startAutosave() {
  window.setInterval(saveNow, 5000);
  document.addEventListener("visibilitychange", () => document.hidden && saveNow());
  window.addEventListener("pagehide", saveNow);
  // A mission that ends (won or lost) has nothing left to resume.
  useGame.subscribe((s, prev) => {
    if (s.game.status !== "playing" && prev.game.status === "playing") clearSave();
  });
}
