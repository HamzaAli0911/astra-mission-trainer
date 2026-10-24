import { useEffect } from "react";
import { useShallow } from "zustand/react/shallow";
import { Play } from "lucide-react";
import { STOP, type DriveInput } from "../sim/rover";
import { useGame } from "../state/game";
import { useUI } from "../state/ui";
import { World } from "../scene/World";
import { play } from "../lib/sound";
import { hush } from "../lib/speech";
import { Atmosphere, Capcom, Crew, Dock, DrivePad, Goals, openPause, Toasts, TopBar, useAdvisorHints, WorldLabels } from "./hud";
import { Drawer, usePadGuard } from "./panels";
import { AlertCard, Briefing, ChoiceCard, Debrief } from "./overlays";
import { Coach } from "./Coach";
import { MissionMap, Title } from "./screens";
import { Modals } from "./modals";
import { Minimap } from "./Minimap";

/** Keys held for driving, by physical key code. */
const held = new Set<string>();
const DRIVE: Record<string, keyof DriveInput> = {
  KeyW: "forward",
  ArrowUp: "forward",
  KeyS: "back",
  ArrowDown: "back",
  KeyA: "left",
  ArrowLeft: "left",
  KeyD: "right",
  ArrowRight: "right",
};
function keys(): DriveInput {
  const k = { ...STOP };
  for (const code of held) k[DRIVE[code]] = true;
  return k;
}
const typing = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) && !(t instanceof HTMLInputElement && t.type === "checkbox"));

export default function App() {
  const { screen, big, motion } = useUI(useShallow((s) => ({ screen: s.screen, big: s.settings.bigText, motion: s.settings.motion })));

  useEffect(() => {
    document.documentElement.classList.toggle("big-text", big);
    document.documentElement.classList.toggle("reduce-motion", motion);
  }, [big, motion]);

  // One loop drives the simulation and the rover while a mission is on screen.
  useEffect(() => {
    if (screen !== "game") return;
    let raf = 0,
      last = performance.now();
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.25, Math.max(0, (t - last) / 1000));
      last = t;
      useGame.getState().frame(dt, keys());
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [screen]);

  // A hidden tab pauses the mission.
  useEffect(() => {
    const vis = () => {
      held.clear();
      const st = useGame.getState();
      if (document.hidden && useUI.getState().screen === "game" && !st.paused && st.game.status === "playing") st.pause("hidden");
      if (document.hidden) hush();
    };
    document.addEventListener("visibilitychange", vis);
    window.addEventListener("blur", () => held.clear());
    return () => document.removeEventListener("visibilitychange", vis);
  }, []);

  // Keyboard shortcuts. Text fields keep their keys; buttons keep Space and Enter.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return;
      const ui = useUI.getState(),
        st = useGame.getState();
      if (ui.screen !== "game") return;
      if (ui.modal || ui.briefing || ui.debrief || st.alert || st.game.choice) return;
      if (DRIVE[e.code]) {
        if (e.code.startsWith("Arrow")) e.preventDefault();
        held.add(e.code);
        if (st.paused && st.reason === "manual") st.resume();
        return;
      }
      if (e.repeat) return;
      const onButton = e.target instanceof HTMLButtonElement;
      const panel = (p: "build" | "power" | "rover") => {
        ui.select(null);
        ui.togglePanel(p);
        play(useUI.getState().panel ? "open" : "close");
      };
      switch (e.code) {
        case "Space":
          if (onButton) return;
          e.preventDefault();
          if (!st.held) st.togglePause();
          break;
        case "Digit1":
        case "Digit2":
        case "Digit3":
          if (!st.held) st.setSpeed(([1, 2, 4] as const)[Number(e.code.slice(-1)) - 1]);
          break;
        case "KeyB":
          panel("build");
          break;
        case "KeyP":
          panel("power");
          break;
        case "KeyR":
          panel("rover");
          break;
        case "KeyH": {
          const shelter = st.game.modules.some((m) => m.type === "shelter" && m.built >= 3);
          if (shelter) st.act({ type: "shelter", on: !st.game.sheltering });
          else st.toast("Build a Storm Shelter first.", "warn");
          break;
        }
        case "KeyC":
          ui.cam("base");
          break;
        case "KeyF":
          ui.cam("rover");
          break;
        case "Escape":
          if (ui.placing) ui.place(null);
          else if (ui.selected) ui.select(null);
          else if (ui.panel) ui.openPanel(null);
          else openPause();
          break;
      }
    };
    const up = (e: KeyboardEvent) => held.delete(e.code);
    // After a mouse click, give focus back to the game so Space still pauses (keyboard users keep their focus).
    const pointerUp = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const active = document.activeElement;
      if (active instanceof HTMLButtonElement && !active.closest('[role="dialog"], [role="alertdialog"], .coach')) setTimeout(() => active.blur(), 0);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("pointerup", pointerUp);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("pointerup", pointerUp);
    };
  }, []);

  return (
    <div className="app">
      {screen === "title" && <Title />}
      {screen === "map" && <MissionMap />}
      {screen === "game" && <Game />}
      <Modals />
    </div>
  );
}

function Game() {
  useAdvisorHints();
  usePadGuard();
  const { planet, reason } = useGame(useShallow((s) => ({ planet: s.game.planet, reason: s.reason })));
  const panel = useUI((s) => s.panel);
  const selected = useUI((s) => s.selected?.kind === "module");
  return (
    <div className={`game ${planet} ${panel || selected ? "drawer-open" : ""}`}>
      <World />
      <Atmosphere />
      <WorldLabels />
      <TopBar />
      <div className="hud-left">
        <Goals />
      </div>
      <div className="hud-right">
        <Crew />
        <Minimap />
      </div>
      <Toasts />
      <Capcom />
      <Dock />
      <DrivePad />
      <Drawer />
      {reason === "hidden" && (
        <div className="paused-chip">
          <span>Paused while you were away</span>
          <button className="btn primary small" onClick={() => useGame.getState().resume()}>
            <Play size={15} /> Resume
          </button>
        </div>
      )}
      <Coach />
      <Briefing />
      <AlertCard />
      <ChoiceCard />
      <Debrief />
    </div>
  );
}
