import { useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  CircleAlert,
  Gauge,
  Hammer,
  Info,
  Lightbulb,
  Menu,
  Moon,
  Orbit,
  Pause,
  Play,
  Radio,
  RotateCcw,
  SkipForward,
  Sun,
  TriangleAlert,
  Video,
  Volume2,
  VolumeX,
  Wrench,
  X,
  Zap,
  ZapOff,
} from "lucide-react";
import { activeHazard, capacity, DOSE_LIMIT, flows, isBuilt } from "../sim/core";
import { advise, type Fix } from "../sim/advisor";
import { goalProgress } from "../sim/goals";
import { mission } from "../sim/missions";
import { MODULES, spec } from "../sim/modules";
import { clockOf, dayOf, hoursToSunChange, isDaytime, PLANETS } from "../sim/planets";
import { SITES } from "../sim/world";
import { useGame, SPEEDS } from "../state/game";
import { useUI, type View } from "../state/ui";
import { follow } from "../scene/anchors";
import { play } from "../lib/sound";
import { speak } from "../lib/speech";
import { duration } from "./common";
import { runFix } from "./fixes";
import { finish } from "./Coach";
import { IconCapcom, IconDose, IconIce, IconRock, IconRover, IconSample, IconShelter, MODULE_ICON, RESOURCE_ICON } from "./icons";

/* ---------- Top bar ---------- */

export function TopBar() {
  const { id, held } = useGame(useShallow((s) => ({ id: s.game.missionId, held: s.held })));
  const m = mission(id);
  return (
    <header className="topbar">
      <div className="tb-left">
        <button className="icon-btn ghost" aria-label="Pause menu" title="Menu (Esc)" onClick={() => openPause()}>
          <Menu size={22} />
        </button>
        <div className="mission-chip">
          <span className={`planet-dot ${m.planet}`} aria-hidden="true" />
          <span>
            <small>{m.number ? `Mission ${m.number}` : "Free play"}</small>
            <b>{m.title}</b>
          </span>
        </div>
      </div>
      <ResourceBar />
      <div className="tb-right">
        <Clock />
        <SpeedControls held={held} />
      </div>
    </header>
  );
}

/** Ask before leaving the mission in progress (to restart it, or to go to Mars): the game is paused while the question is open. */
function ask(kind: "restart" | "mars") {
  const st = useGame.getState();
  if (st.game.status === "playing" && !st.paused) st.pause("menu");
  useUI.getState().setModal(kind);
  play("open");
}

/** Labelled shortcuts above the goals: restart, skip the tutorial (while it runs) and go to Mars (from the Moon). */
export function QuickActions() {
  const planet = useGame((s) => s.game.planet);
  const tutorial = useUI((s) => s.tutorial !== null);
  return (
    <div className="quick-actions" role="group" aria-label="Mission shortcuts">
      <button className="btn secondary tiny" onClick={() => ask("restart")} title="Start this mission again from the beginning">
        <RotateCcw size={14} /> Restart<span className="qa-long"> mission</span>
      </button>
      {tutorial && (
        <button
          className="btn secondary tiny"
          onClick={() => {
            play("click");
            finish();
          }}
          title="End the tutorial and play on your own"
        >
          <SkipForward size={14} /> Skip tutorial
        </button>
      )}
      {planet === "moon" && (
        <button className="btn secondary tiny" onClick={() => ask("mars")} title="Leave this mission and start the first Mars mission">
          <span className="planet-dot mars" aria-hidden="true" /> Go to Mars
        </button>
      )}
    </div>
  );
}

export function openPause() {
  const st = useGame.getState();
  if (st.game.status === "playing" && !st.paused) st.pause("menu");
  useUI.getState().setModal("pause");
  play("open");
}

const UNIT = { o2: "kg", water: "L", food: "meals" } as const;

function ResourceBar() {
  const r = useGame(
    useShallow((s) => {
      const g = s.game,
        f = flows(g),
        cap = capacity(g);
      const rate = (made: number, used: number) => Math.round((made - used) * 24 * 10) / 10;
      return {
        power: Math.round(g.res.power),
        powerCap: cap.power,
        net: Math.round((f.gen - f.used) * 10) / 10,
        short: f.short.power,
        o2: Math.round(g.res.o2 * 10) / 10,
        water: Math.round(g.res.water),
        food: Math.round(g.res.food),
        o2Rate: rate(f.o2.made, f.o2.used),
        waterRate: rate(f.water.made, f.water.used),
        foodRate: rate(f.food.made, f.food.used),
        o2Use: Math.round(f.o2.used * 240) / 10,
        waterUse: Math.round(f.water.used * 240) / 10,
        foodUse: Math.round(f.food.used * 240) / 10,
        dose: Math.round(Math.max(...g.crew.map((c) => c.dose)) * 10) / 10,
        materials: Math.floor(g.res.materials),
        science: Math.floor(g.res.science),
      };
    }),
  );
  const open = () => {
    useUI.getState().select(null);
    useUI.getState().openPanel("power");
    play("open");
  };
  const life = (key: "o2" | "water" | "food", label: string, value: number, perDay: number, usePerDay: number) => {
    const Icon = RESOURCE_ICON[key];
    const left = perDay < -0.05 ? (value / -perDay) * 24 : Infinity;
    const low = left < 24 || value <= 0.01;
    return (
      <button
        className={`res ${key} ${low ? "low" : ""}`}
        data-res={key}
        onClick={open}
        title={`${label}: ${value} ${UNIT[key]}. The crew uses ${usePerDay.toFixed(1)} ${UNIT[key]} a day. ${perDay >= 0 ? "Production keeps up." : `It runs out in about ${duration(left)}.`}`}
      >
        <Icon size={20} />
        <span className="res-text">
          <b>
            {value}
            <small>{UNIT[key]}</small>
          </b>
          <em className={perDay > 0.05 ? "up" : perDay < -0.05 ? "down" : ""}>
            {perDay > 0.05 ? (
              <>
                <ArrowUp size={11} /> rising
              </>
            ) : perDay < -0.05 ? (
              <>
                <ArrowDown size={11} /> {duration(left)}
              </>
            ) : (
              "steady"
            )}
          </em>
        </span>
      </button>
    );
  };
  const PowerIcon = r.short ? ZapOff : Zap;
  return (
    <div className="resource-bar" role="group" aria-label="Outpost supplies">
      <button
        className={`res power ${r.short || r.power < 3 ? "low" : ""}`}
        data-res="power"
        onClick={open}
        title={`Stored power: ${r.power} of ${r.powerCap} kWh. ${r.net >= 0 ? `Charging at ${r.net} kW.` : `Draining at ${-r.net} kW.`}`}
      >
        <PowerIcon size={20} />
        <span className="res-text">
          <b>
            {r.power}
            <small>/{r.powerCap} kWh</small>
          </b>
          <em className={r.net > 0.05 ? "up" : r.net < -0.05 ? "down" : ""}>
            {r.net > 0.05 ? <ArrowUp size={11} /> : r.net < -0.05 ? <ArrowDown size={11} /> : null}
            {r.net > 0 ? "+" : ""}
            {r.net} kW
          </em>
        </span>
        <span className="res-fill" style={{ width: `${Math.min(100, (r.power / r.powerCap) * 100)}%` }} />
      </button>
      {life("o2", "Oxygen", r.o2, r.o2Rate, r.o2Use)}
      {life("water", "Water", r.water, r.waterRate, r.waterUse)}
      {life("food", "Food", r.food, r.foodRate, r.foodUse)}
      <button
        className={`res dose ${r.dose >= DOSE_LIMIT * 0.7 ? "low" : ""}`}
        data-res="dose"
        onClick={() => {
          useUI.getState().select(null);
          useUI.getState().openPanel("crew");
        }}
        title={`Highest crew radiation dose: ${r.dose} mSv. The training limit is ${DOSE_LIMIT} mSv.`}
      >
        <IconDose size={20} />
        <span className="res-text">
          <b>
            {r.dose}
            <small>/{DOSE_LIMIT} mSv</small>
          </b>
          <em>radiation</em>
        </span>
        <span className="res-fill" style={{ width: `${Math.min(100, (r.dose / DOSE_LIMIT) * 100)}%` }} />
      </button>
      <div className="res-stock">
        <span title="Materials for building. The rover brings more from the regolith field." data-res="materials">
          {RESOURCE_ICON.materials({ size: 17 })}
          <b>{r.materials}</b>
        </span>
        <span title="Science points" data-res="science">
          {RESOURCE_ICON.science({ size: 17 })}
          <b>{r.science}</b>
        </span>
      </div>
    </div>
  );
}

function Clock() {
  const c = useGame(
    useShallow((s) => {
      const g = s.game;
      const warned = g.hazards.find((h) => h.phase === "warned");
      const active = g.hazards.find((h) => h.phase === "active");
      return {
        planet: g.planet,
        day: dayOf(g.t),
        time: clockOf(g.t).slice(0, 4) + "0",
        daytime: isDaytime(g.planet, g.t),
        change: Math.ceil(hoursToSunChange(g.planet, g.t)),
        warnedKind: warned?.kind ?? null,
        warnedIn: warned ? Math.max(0, Math.ceil(warned.startAt - g.t)) : 0,
        activeKind: active?.kind ?? null,
        activeLeft: active ? Math.max(0, Math.ceil(active.endAt - g.t)) : 0,
      };
    }),
  );
  const P = PLANETS[c.planet];
  return (
    <div
      className="clock"
      data-tut="clock"
      aria-live="off"
      title={
        c.planet === "moon"
          ? "Training time: one day here is 24 hours. A real lunar day–night cycle lasts about 29.5 Earth days."
          : "Training time: one sol here is 24 hours. A real Mars sol lasts 24 h 39 min."
      }
    >
      <span className={`sun-icon ${c.daytime ? "day" : "night"}`}>{c.daytime ? <Sun size={20} /> : <Moon size={19} />}</span>
      <span className="clock-text">
        <b>
          {P.dayWord} {c.day} · {c.time}
        </b>
        <small>
          {c.daytime ? "Sunset" : "Sunrise"} in {c.change} h
        </small>
      </span>
      {c.activeKind ? (
        <span className={`hazard-chip ${c.activeKind}`}>{c.activeKind === "storm" ? "Radiation storm" : "Dust storm"} · {c.activeLeft} h</span>
      ) : c.warnedKind ? (
        <span className={`hazard-chip warn ${c.warnedKind}`}>{c.warnedKind === "storm" ? "Storm" : "Dust"} in {c.warnedIn} h</span>
      ) : null}
    </div>
  );
}

function SpeedControls({ held }: { held: boolean }) {
  const { paused, speed, reason, status, manual } = useGame(useShallow((s) => ({ paused: s.paused, speed: s.speed, reason: s.reason, status: s.game.status, manual: s.manual })));
  const running = !paused && !held && status === "playing";
  return (
    <div className="speed" role="group" aria-label="Time controls" data-tut="speed">
      <button
        className={`speed-btn play ${running ? "" : "is-paused"}`}
        aria-label={running ? "Pause" : "Play"}
        title="Pause / play (Space)"
        disabled={status !== "playing" || held}
        onClick={() => {
          useGame.getState().togglePause();
          play("click");
        }}
      >
        {running ? <Pause size={18} /> : <Play size={18} />}
      </button>
      {SPEEDS.map((n, i) => (
        <button
          key={n}
          className={`speed-btn ${speed === n ? "on" : ""}`}
          aria-pressed={speed === n}
          title={`${n}× speed (${i + 1})`}
          disabled={status !== "playing" || held}
          onClick={() => {
            useGame.getState().setSpeed(n);
            play("click");
          }}
        >
          {n}×
        </button>
      ))}
      {held ? (
        <span className="speed-note">Training pause</span>
      ) : paused && reason === "manual" ? (
        <span className="speed-note">Paused</span>
      ) : manual && speed > 1 && !paused ? (
        <span className="speed-note">1× while you drive</span>
      ) : null}
    </div>
  );
}

/* ---------- Goals ---------- */

export function Goals() {
  const g = useGame((s) => s.game);
  const m = mission(g.missionId);
  const [open, setOpen] = useState(() => typeof matchMedia === "undefined" || matchMedia("(min-width: 641px)").matches);
  const rows = m.goals.map((goal) => ({ goal, p: goalProgress(g, goal, m) }));
  const done = rows.filter((r) => r.p.done).length;
  return (
    <section className={`goals card ${open ? "" : "closed"}`} aria-label="Mission goals">
      <button className="goals-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span>Goals</span>
        <b>
          {done}/{rows.length}
        </b>
        {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>
      {open && (
        <ul>
          {rows.map(({ goal, p }) => (
            <li key={goal.id} className={p.done ? "done" : ""}>
              {p.done ? <CheckCircle2 size={20} className="tick" /> : <Circle size={20} className="tick" />}
              <span className="goal-text">
                {goal.text}
                {!p.done && (
                  <span className="goal-progress">
                    <i style={{ width: `${p.fraction * 100}%` }} />
                  </span>
                )}
              </span>
              <small>{p.label}</small>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ---------- Crew ---------- */

const CREW_COLORS = ["#ff8a3d", "#5ee0ff", "#63d471", "#c48bff"];
export function Crew() {
  const crew = useGame(
    useShallow((s) => s.game.crew.map((c) => `${c.id}|${Math.round(c.health)}|${Math.round(c.dose * 10) / 10}|${c.place}`)),
  );
  const [open, setOpen] = useState(false);
  const list = crew.map((x) => {
    const [id, health, dose, place] = x.split("|");
    return { id, health: +health, dose: +dose, place };
  });
  const full = useGame.getState().game.crew;
  return (
    <section className={`crew card ${open ? "open" : ""}`} aria-label="Crew">
      <button className="crew-head" onClick={() => setOpen(!open)} aria-expanded={open} title="Crew health and radiation">
        {list.map((c, i) => (
          <span key={c.id} className={`avatar ${c.health < 50 ? "hurt" : ""}`} style={{ "--c": CREW_COLORS[i], "--h": `${c.health * 3.6}deg` } as React.CSSProperties}>
            <span className="face">{full[i].name.split(" ").map((w) => w[0]).join("")}</span>
            {c.health < 50 && (
              <span className="hurt-mark" aria-label={`${full[i].name} is unwell`}>
                !
              </span>
            )}
            <span className={`where ${c.place}`} aria-hidden="true">
              {c.place === "rover" ? <IconRover size={11} /> : c.place === "shelter" ? <IconShelter size={11} /> : null}
            </span>
          </span>
        ))}
      </button>
      {open && (
        <ul className="crew-list">
          {list.map((c, i) => (
            <li key={c.id}>
              <b>{full[i].name}</b>
              <small>
                {full[i].role} · {c.place === "rover" ? "in the rover" : c.place === "shelter" ? "in the shelter" : "in the habitat"}
              </small>
              <span className="crew-bars">
                <span title={`Health ${c.health}%`}>
                  <i className="hp" style={{ width: `${c.health}%` }} />
                </span>
                <span title={`Radiation ${c.dose} of ${DOSE_LIMIT} mSv`}>
                  <i className="rad" style={{ width: `${Math.min(100, (c.dose / DOSE_LIMIT) * 100)}%` }} />
                </span>
              </span>
              <small className="crew-nums">
                {c.health}% health · {c.dose} mSv
              </small>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ---------- Dock (main actions) ---------- */

export function Dock() {
  const d = useGame(
    useShallow((s) => {
      const g = s.game,
        f = flows(g);
      const shelter = g.modules.some((m) => m.type === "shelter" && isBuilt(m));
      return {
        short: f.short.power,
        roverOut: !g.rover.docked,
        task: !!g.rover.task,
        battery: Math.round(g.rover.battery),
        sheltering: g.sheltering,
        shelter,
        storm: !!activeHazard(g, "storm"),
        hasShelterBuild: mission(g.missionId).build.includes("shelter"),
      };
    }),
  );
  const panel = useUI((s) => s.panel);
  const toggle = (p: "build" | "power" | "rover") => {
    const ui = useUI.getState();
    ui.select(null);
    ui.togglePanel(p);
    play(ui.panel === p ? "close" : "open");
  };
  return (
    <nav className="dock" aria-label="Actions">
      <button className={`dock-btn ${panel === "build" ? "on" : ""}`} data-dock="build" onClick={() => toggle("build")} aria-pressed={panel === "build"}>
        <Hammer size={24} />
        <span>Build</span>
        <kbd className="kbd">B</kbd>
      </button>
      <button className={`dock-btn ${panel === "power" ? "on" : ""}`} data-dock="power" onClick={() => toggle("power")} aria-pressed={panel === "power"}>
        <Zap size={24} />
        <span>Power</span>
        <kbd className="kbd">P</kbd>
        {d.short && <i className="badge danger" aria-label="Power problem" />}
      </button>
      <button className={`dock-btn ${panel === "rover" ? "on" : ""}`} data-dock="rover" onClick={() => toggle("rover")} aria-pressed={panel === "rover"}>
        <IconRover size={26} />
        <span>Rover</span>
        <kbd className="kbd">R</kbd>
        {d.roverOut && <i className="badge info">{d.task ? "…" : `${d.battery}%`}</i>}
      </button>
      {(d.hasShelterBuild || d.shelter) && (
        <button
          className={`dock-btn shelter ${d.sheltering ? "on" : ""} ${d.storm && !d.sheltering ? "urgent" : ""}`}
          data-dock="shelter"
          aria-pressed={d.sheltering}
          title={d.shelter ? (d.sheltering ? "Send the crew back to work" : "Move the crew into the Storm Shelter") : "Build a Storm Shelter first"}
          onClick={() => {
            if (!d.shelter) {
              useGame.getState().toast("Build a Storm Shelter first. Find it in the Build menu.", "warn");
              useUI.getState().openPanel("build");
              return;
            }
            useGame.getState().act({ type: "shelter", on: !d.sheltering });
            play(d.sheltering ? "off" : "toggle");
          }}
        >
          <IconShelter size={24} />
          <span>{d.sheltering ? "Sheltering" : "Shelter"}</span>
          <kbd className="kbd">H</kbd>
        </button>
      )}
      <HintButton />
    </nav>
  );
}

function HintButton() {
  return (
    <button
      className="dock-btn hint"
      title="Ask CAPCOM for a hint"
      onClick={() => {
        play("capcom");
        // During the tutorial, the hint is the current step: read it again.
        const coach = document.querySelector(".coach p")?.textContent;
        if (useUI.getState().tutorial !== null && coach) return speak(coach, true);
        const g = useGame.getState().game;
        const a = advise(g)[0];
        if (a) pushHint(a.text, a.fix, true);
        else useGame.getState().say(nextGoalHint());
      }}
    >
      <Lightbulb size={22} />
      <span>Hint</span>
    </button>
  );
}

function nextGoalHint() {
  const g = useGame.getState().game;
  const m = mission(g.missionId);
  const goal = m.goals.find((x) => !goalProgress(g, x, m).done);
  if (!goal) return "Everything looks good, Commander. Keep the crew safe until the end of the mission.";
  if (goal.kind === "survive") return `All set! Now ${goal.text.toLowerCase()}. Speed up time with the buttons at the top right.`;
  return `Everything is stable. Your next goal: ${goal.text}.`;
}

/* ---------- CAPCOM ---------- */

type Message = { id: number; text: string; fix?: Fix };
let hints: Message[] = [];
const hintListeners = new Set<() => void>();
let hintId = 1e6;
export function pushHint(text: string, fix?: Fix, force = false) {
  if (!force && hints.some((h) => h.text === text)) return;
  hints = [...hints.filter((h) => h.text !== text), { id: ++hintId, text, fix }].slice(-3);
  speak(text);
  hintListeners.forEach((f) => f());
}

/** Watches the advisor and lets CAPCOM speak up once per problem. */
export function useAdvisorHints() {
  const seen = useRef(new Set<string>());
  const shownAt = useRef(new Map<string, number>());
  useEffect(() => {
    const iv = window.setInterval(() => {
      const st = useGame.getState();
      if (st.paused || st.held || st.game.status !== "playing" || useUI.getState().tutorial !== null) return;
      const list = advise(st.game);
      const active = new Set(list.map((a) => a.id));
      for (const id of [...seen.current]) if (!active.has(id)) seen.current.delete(id);
      // Speak up once per problem, and not again for a while even if it flickers.
      const now = performance.now();
      const next = list.find((a) => a.level !== "tip" && !seen.current.has(a.id) && now - (shownAt.current.get(a.id) ?? -1e9) > 45000);
      if (next && !st.alert) {
        seen.current.add(next.id);
        shownAt.current.set(next.id, now);
        pushHint(next.text, next.fix);
        play("capcom");
      }
    }, 1500);
    return () => window.clearInterval(iv);
  }, []);
}

export function Capcom() {
  const queue = useGame((s) => s.capcom);
  const tutorial = useUI((s) => s.tutorial);
  const run = useGame((s) => `${s.game.missionId}:${s.game.seed}`);
  const [, bump] = useState(0);
  useEffect(() => {
    // A new mission starts with a quiet radio.
    hints = [];
    bump((n) => n + 1);
  }, [run]);
  useEffect(() => {
    const f = () => bump((n) => n + 1);
    hintListeners.add(f);
    return () => {
      hintListeners.delete(f);
    };
  }, []);
  const msg: Message | undefined = queue[0] ?? hints[0];
  useEffect(() => {
    if (!msg) return;
    const t = window.setTimeout(() => dismiss(msg), Math.max(9000, msg.text.length * 85));
    return () => window.clearTimeout(t);
  }, [msg]);
  if (!msg || tutorial !== null) return null;
  function dismiss(m: Message) {
    if (useGame.getState().capcom[0]?.id === m.id) useGame.getState().nextCapcom();
    else {
      hints = hints.filter((h) => h.id !== m.id);
      hintListeners.forEach((f) => f());
    }
  }
  return (
    <aside className="capcom" role="status" aria-live="polite" key={msg.id}>
      <span className="capcom-avatar" aria-hidden="true">
        <IconCapcom size={24} />
      </span>
      <div className="capcom-body">
        <header>
          <b>Jo</b> <small>CAPCOM · Mission Control</small>
          <button className="icon-btn tiny" aria-label="Read aloud" title="Read aloud" onClick={() => speak(msg.text, true)}>
            <Volume2 size={15} />
          </button>
        </header>
        <p>{msg.text}</p>
        <div className="capcom-actions">
          {msg.fix && (
            <button
              className="btn primary small"
              onClick={() => {
                runFix(msg.fix!);
                dismiss(msg);
              }}
            >
              {msg.fix.label} <ArrowRight size={15} />
            </button>
          )}
          <button className="btn ghost small" onClick={() => dismiss(msg)}>
            OK
          </button>
        </div>
      </div>
    </aside>
  );
}

/* ---------- Toasts ---------- */

export function Toasts() {
  const toasts = useGame((s) => s.toasts);
  const timers = useRef(new Map<number, number>());
  useEffect(() => {
    for (const t of toasts)
      if (!timers.current.has(t.id))
        timers.current.set(
          t.id,
          window.setTimeout(() => {
            useGame.getState().dropToast(t.id);
            timers.current.delete(t.id);
          }, t.kind === "danger" ? 9000 : t.kind === "warn" ? 6500 : 4500),
        );
  }, [toasts]);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);
  if (!toasts.length) return null;
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          {t.kind === "good" ? <CheckCircle2 size={18} /> : t.kind === "warn" ? <TriangleAlert size={18} /> : t.kind === "danger" ? <CircleAlert size={18} /> : <Info size={18} />}
          <span>{t.text}</span>
          <button className="icon-btn tiny" aria-label="Dismiss" onClick={() => useGame.getState().dropToast(t.id)}>
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

/* ---------- Labels that float over the 3D world ---------- */

export function WorldLabels() {
  const view = useGame(
    useShallow((s) => {
      const g = s.game;
      return {
        planet: g.planet,
        done: SITES.filter((x) => x.kind === "science" && (g.stats.sites.includes(x.id) || g.rover.cargo.samples.includes(x.id))).map((x) => x.id).join(","),
        modules: g.modules
          .filter((m) => m.type !== "habitat")
          .map((m) => {
            const built = isBuilt(m);
            const left = Math.max(0, Math.ceil(MODULES[m.type].time - m.built));
            const state = !built ? `build:${left}` : m.health < 50 ? (m.repair > 0 ? "repairing" : "damaged") : !m.on ? "off" : "";
            return `${m.id}:${m.type}:${state}`;
          })
          .join("|"),
        task: g.rover.task ? Math.round((1 - g.rover.task.left) * 100) : -1,
        battery: Math.round(g.rover.battery),
        docked: g.rover.docked,
        cargo: g.rover.cargo.water ? "ice" : g.rover.cargo.materials ? "rock" : g.rover.cargo.samples.length ? "sample" : "",
      };
    }),
  );
  const unpowered = useGame(
    useShallow((s) => {
      const f = flows(s.game);
      return s.game.modules.filter((m) => isBuilt(m) && m.on && m.health >= 50 && (f.ratio[m.id] ?? 1) < 0.5).map((m) => m.id);
    }),
  );
  const target = useGame((s) => s.target);
  const ui = useUI(useShallow((s) => ({ panel: s.panel, selected: s.selected })));
  const done = view.done.split(",");
  return (
    <div className="world-labels" aria-hidden="false">
      {SITES.map((s) => {
        const isDone = done.includes(s.id);
        const hot = (ui.selected?.kind === "site" && ui.selected.id === s.id) || target === s.id;
        const Icon = s.kind === "ice" ? IconIce : s.kind === "regolith" ? IconRock : IconSample;
        return (
          <button
            key={s.id}
            ref={(el) => follow(`site:${s.id}`, el)}
            className={`site-label ${s.kind} ${isDone ? "done" : ""} ${hot ? "hot" : ""}`}
            onClick={() => {
              useUI.getState().select({ kind: "site", id: s.id });
              useUI.getState().openPanel("rover");
              play("open");
            }}
            title={`${s.name[view.planet]}: send the rover`}
          >
            <Icon size={15} />
            <span>{s.name[view.planet]}</span>
            {isDone && <CheckCircle2 size={14} />}
          </button>
        );
      })}
      {view.modules
        .split("|")
        .filter(Boolean)
        .map((x) => {
          const [id, type, state] = x.split(":");
          const n = +id;
          const off = !state && unpowered.includes(n);
          if (!state && !off) return null;
          return (
            <button
              key={id}
              ref={(el) => follow(`module:${id}`, el)}
              className={`module-badge ${state.split(":")[0] || "nopower"}`}
              onClick={() => useUI.getState().select({ kind: "module", id: n })}
              title={spec(type as never, view.planet).name}
            >
              {state.startsWith("build") ? (
                <>
                  <Hammer size={13} /> {x.split(":")[3]} h
                </>
              ) : state === "damaged" ? (
                <>
                  <Wrench size={13} /> Fix me
                </>
              ) : state === "repairing" ? (
                <>
                  <Wrench size={13} /> Repairing
                </>
              ) : state === "off" ? (
                <>Off</>
              ) : (
                <>
                  <ZapOff size={13} /> No power
                </>
              )}
            </button>
          );
        })}
      <div ref={(el) => follow("rover", el)} className={`rover-tag ${view.docked ? "docked" : ""} ${view.battery < 25 ? "low" : ""}`}>
        {view.task >= 0 ? (
          <span className="task-ring" style={{ "--p": `${view.task * 3.6}deg` } as React.CSSProperties}>
            <Radio size={12} />
          </span>
        ) : null}
        <span>{view.battery}%</span>
        {view.cargo && <span className={`cargo ${view.cargo}`}>{view.cargo === "ice" ? <IconIce size={12} /> : view.cargo === "rock" ? <IconRock size={12} /> : <IconSample size={12} />}</span>}
      </div>
    </div>
  );
}

/* ---------- Storm atmosphere ---------- */

export function Atmosphere() {
  const fx = useGame(
    useShallow((s) => ({
      storm: !!activeHazard(s.game, "storm"),
      dust: !!activeHazard(s.game, "dust"),
      safe: s.game.sheltering && s.game.rover.docked,
    })),
  );
  return (
    <>
      <div className={`fx-storm ${fx.storm ? "on" : ""} ${fx.safe ? "safe" : ""}`} aria-hidden="true" />
      <div className={`fx-dust ${fx.dust ? "on" : ""}`} aria-hidden="true" />
    </>
  );
}

/* ---------- On-screen drive pad (touch) ---------- */

export function DrivePad() {
  const setting = useUI((s) => s.settings.pad);
  const show = useGame((s) => !s.game.rover.docked || useUI.getState().panel === "rover");
  const panel = useUI((s) => s.panel);
  const touch = useMemo(() => typeof matchMedia !== "undefined" && matchMedia("(hover: none) and (pointer: coarse)").matches, []);
  if (setting === "off" || (setting === "auto" && !touch)) return null;
  if (!show && panel !== "rover") return null;
  const pad = (key: "forward" | "back" | "left" | "right", icon: React.ReactNode, label: string) => (
    <button
      className="pad-btn"
      aria-label={label}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        useGame.getState().setPad(key, true);
      }}
      onPointerUp={() => useGame.getState().setPad(key, false)}
      onPointerCancel={() => useGame.getState().setPad(key, false)}
      onLostPointerCapture={() => useGame.getState().setPad(key, false)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {icon}
    </button>
  );
  return (
    <div className="drive-pad" role="group" aria-label="Drive the rover">
      <span />
      {pad("forward", <ArrowUp size={24} />, "Forward")}
      <span />
      {pad("left", <ArrowLeft size={24} />, "Turn left")}
      {pad("back", <ArrowDown size={24} />, "Reverse")}
      {pad("right", <ArrowRight size={24} />, "Turn right")}
    </div>
  );
}

export function SoundToggle() {
  const on = useUI((s) => s.settings.sound);
  return (
    <button className="icon-btn ghost" aria-label={on ? "Mute sounds" : "Turn sounds on"} title={on ? "Mute" : "Sound on"} onClick={() => useUI.getState().setSetting("sound", !on)}>
      {on ? <Volume2 size={20} /> : <VolumeX size={20} />}
    </button>
  );
}

export function moduleIconFor(type: keyof typeof MODULE_ICON, size = 22) {
  const I = MODULE_ICON[type];
  return <I size={size} />;
}

const VIEWS: { id: View; label: string; title: string; icon: React.ReactNode }[] = [
  { id: "orbit", label: "Overview", title: "Look over the whole outpost", icon: <Orbit size={20} /> },
  { id: "chase", label: "Follow", title: "Ride behind the rover. Drag to look from any side.", icon: <Video size={20} /> },
  { id: "cockpit", label: "Cockpit", title: "Sit in the driver's seat. Drag to look around.", icon: <Gauge size={20} /> },
];
/** Next camera view, for the V key. */
export function nextView(v: View): View {
  return VIEWS[(VIEWS.findIndex((x) => x.id === v) + 1) % VIEWS.length].id;
}

/** Switch between the overview, the follow camera and the driver's seat. */
export function ViewSwitcher() {
  const view = useUI((s) => s.view);
  return (
    <div className="view-switch" role="group" aria-label="Camera view" data-tut="views">
      <span className="view-label">
        View <kbd className="kbd">V</kbd>
      </span>
      {VIEWS.map((v) => (
        <button
          key={v.id}
          className={view === v.id ? "on" : ""}
          aria-pressed={view === v.id}
          title={v.title}
          onClick={() => {
            useUI.getState().setView(v.id);
            play("toggle");
          }}
        >
          {v.icon}
          <span>{v.label}</span>
        </button>
      ))}
    </div>
  );
}
