import { useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  ArrowRight,
  BatteryCharging,
  Check,
  CornerDownLeft,
  Crosshair,
  DoorOpen,
  Hammer,
  House,
  MapPin,
  MousePointerClick,
  Navigation,
  Power,
  Recycle,
  Timer,
  Trash2,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import { capacity, demandOf, DOSE_LIMIT, flows, isBuilt, isWorking, shieldDone, solarFactor } from "../sim/core";
import { forecast } from "../sim/advisor";
import { freePad } from "../sim/engine";
import { mission } from "../sim/missions";
import { BUILD_ORDER, CREW_NEEDS, DAMAGED, MODULES, RATES, REPAIR_COST, SHIELD_COST, SHIELD_TIME, spec } from "../sim/modules";
import { clockOf, PLANETS } from "../sim/planets";
import { planRoute, approachPoint, tripCost, routeLength, SCOUT_ROVER } from "../sim/rover";
import type { GameState, Light, Module, ModuleType } from "../sim/types";
import { DOCK, HAUL, PADS, padFits, SCOUT_HOME, site as siteById, SITE_REACH, SITES, type Site } from "../sim/world";
import { useGame, type Vehicle } from "../state/game";
import { useUI, type Panel } from "../state/ui";
import { enterWalk } from "../state/walk";
import { play } from "../lib/sound";
import { duration } from "./common";
import { IconDose, IconIce, IconRock, IconRover, IconSample, IconScout, IconShelter, MODULE_ICON, RESOURCE_ICON } from "./icons";

/** The right-hand drawer (a bottom sheet on phones): one panel at a time. */
export function Drawer() {
  const { panel, selected } = useUI(useShallow((s) => ({ panel: s.panel, selected: s.selected })));
  const moduleId = selected?.kind === "module" ? selected.id : null;
  const exists = useGame((s) => (moduleId === null ? false : s.game.modules.some((m) => m.id === moduleId)));
  useEffect(() => {
    if (moduleId !== null && !exists) useUI.getState().select(null);
  }, [moduleId, exists]);
  if (moduleId !== null && exists) return <ModuleCard id={moduleId} />;
  if (!panel) return null;
  return (
    <aside className={`drawer panel-${panel}`} aria-label={TITLES[panel]}>
      <header className="drawer-head">
        <h2>{TITLES[panel]}</h2>
        <button
          className="icon-btn"
          aria-label="Close panel"
          onClick={() => {
            useUI.getState().openPanel(null);
            useUI.getState().place(null);
            play("close");
          }}
        >
          <X size={20} />
        </button>
      </header>
      <div className="drawer-body">
        {panel === "build" && <BuildPanel />}
        {panel === "power" && <PowerPanel />}
        {panel === "rover" && <RoverDrawer />}
        {panel === "crew" && <CrewPanel />}
      </div>
    </aside>
  );
}
const TITLES: Record<Panel, string> = {
  build: "Build",
  power: "Power & life support",
  rover: "Rover",
  crew: "Crew & radiation",
};

const kw = (n: number) => `${n % 1 ? n.toFixed(1) : n} kW`;
function powerText(t: ModuleType, planet: "moon" | "mars") {
  if (t === "solar") return { text: `+${(RATES.solarKw * PLANETS[planet].solar).toFixed(1)} kW in sun`, good: true };
  if (t === "reactor") return { text: `+${RATES.reactorKw} kW always`, good: true };
  if (t === "battery") return { text: `stores ${RATES.batteryKwh} kWh`, good: true };
  const use: Partial<Record<ModuleType, number>> = {
    oxygen: PLANETS[planet].oxygenPower,
    recycler: RATES.recyclerKw,
    greenhouse: RATES.greenhouseKw[2],
    icedrill: RATES.drillKw,
    lab: RATES.labKw,
    shelter: RATES.shelterKw,
  };
  const n = use[t];
  return n ? { text: `uses ${kw(n)}${t === "greenhouse" ? " (High)" : t === "shelter" ? " in use" : ""}`, good: false } : { text: "", good: false };
}

/* ---------- Build ---------- */

function BuildPanel() {
  const g = useGame((s) => s.game);
  const { selected, placing } = useUI(useShallow((s) => ({ selected: s.selected, placing: s.placing })));
  const m = mission(g.missionId);
  const pad = selected?.kind === "pad" ? PADS[selected.id] : null;
  const build = (t: ModuleType, choose = false) => {
    const ui = useUI.getState();
    if (choose) {
      ui.place(ui.placing === t ? null : t);
      ui.select(null);
      play("click");
      return;
    }
    const target = pad && padFits(t, pad.kind) ? pad.id : undefined;
    if (useGame.getState().act({ type: "build", module: t, pad: target })) {
      play("build");
      ui.select(null);
      ui.place(null);
    }
  };
  return (
    <div className="build-panel">
      <div className="panel-note">
        <span className="stock">
          {RESOURCE_ICON.materials({ size: 18 })} <b>{Math.floor(g.res.materials)}</b> materials
        </span>
        {pad ? (
          <span className="pad-chip">
            <MapPin size={14} /> Pad {pad.id + 1} selected
            <button className="icon-btn tiny" aria-label="Clear pad" onClick={() => useUI.getState().select(null)}>
              <X size={13} />
            </button>
          </span>
        ) : placing ? (
          <span className="pad-chip pick">
            <MousePointerClick size={14} /> Click a glowing pad
            <button className="icon-btn tiny" aria-label="Stop choosing" onClick={() => useUI.getState().place(null)}>
              <X size={13} />
            </button>
          </span>
        ) : (
          <small>Need more? The rover can haul materials from the {g.planet === "moon" ? "Boulder Field" : "Rock Garden"}.</small>
        )}
      </div>
      <div className="build-list">
        {BUILD_ORDER.filter((t) => m.build.includes(t)).map((t) => {
          const sp = spec(t, g.planet);
          const afford = g.res.materials >= sp.cost;
          const spot = pad && padFits(t, pad.kind) ? pad : freePad(g, t);
          const p = powerText(t, g.planet);
          const Icon = MODULE_ICON[t];
          const count = g.modules.filter((x) => x.type === t).length;
          const reason = !afford ? `Needs ${sp.cost - Math.floor(g.res.materials)} more materials` : !spot ? (t === "icedrill" ? "Ice pad in use" : t === "reactor" ? "Far pad in use" : "No free pads") : "";
          return (
            <article key={t} className={`build-card ${placing === t ? "picking" : ""}`} data-build={t} style={{ "--c": sp.color } as React.CSSProperties}>
              <span className="build-icon">
                <Icon size={26} />
                {count > 0 && <i className="count">{count}</i>}
              </span>
              <div className="build-info">
                <h3>{sp.name}</h3>
                <p>{sp.does}</p>
                <p className="catch">{sp.catch}</p>
                <div className="chips">
                  <span className={`chip cost ${afford ? "" : "short"}`}>
                    {RESOURCE_ICON.materials({ size: 14 })} {sp.cost}
                  </span>
                  {p.text && <span className={`chip ${p.good ? "good" : "use"}`}>{p.text}</span>}
                  <span className="chip">
                    <Timer size={13} /> {sp.time} h
                  </span>
                  {t === "icedrill" && <span className="chip">ice pad only</span>}
                  {t === "reactor" && <span className="chip">far pad only</span>}
                </div>
              </div>
              <div className="build-actions">
                <button className="btn primary small" disabled={!!reason} onClick={() => build(t)} title={reason || `Build on pad ${(spot?.id ?? 0) + 1}`}>
                  <Hammer size={15} /> Build
                </button>
                {!reason && !pad && (t === "icedrill" || t === "reactor" ? null : (
                  <button className="btn ghost tiny" onClick={() => build(t, true)} aria-pressed={placing === t}>
                    Pick a pad
                  </button>
                ))}
                {reason && <small className="why">{reason}</small>}
              </div>
            </article>
          );
        })}
        {m.shield && <ShieldCard g={g} />}
      </div>
    </div>
  );
}

function ShieldCard({ g }: { g: GameState }) {
  const done = shieldDone(g);
  const afford = g.res.materials >= SHIELD_COST;
  return (
    <article className="build-card" data-build="shield" style={{ "--c": "#c48bff" } as React.CSSProperties}>
      <span className="build-icon">
        <IconShelter size={26} />
      </span>
      <div className="build-info">
        <h3>Habitat Shielding</h3>
        <p>Piles regolith over the habitat. It then blocks 75% of radiation instead of 40%.</p>
        <p className="catch">No power needed, but it takes {SHIELD_TIME} hours of crew work.</p>
        <div className="chips">
          <span className={`chip cost ${afford ? "" : "short"}`}>
            {RESOURCE_ICON.materials({ size: 14 })} {SHIELD_COST}
          </span>
          <span className="chip">
            <Timer size={13} /> {SHIELD_TIME} h
          </span>
        </div>
      </div>
      <div className="build-actions">
        {done ? (
          <span className="done-tag">
            <Check size={15} /> Built
          </span>
        ) : g.shieldStarted ? (
          <span className="done-tag busy">{Math.round((g.shield / SHIELD_TIME) * 100)}%</span>
        ) : (
          <button className="btn primary small" disabled={!afford} onClick={() => useGame.getState().act({ type: "shield" }) && play("build")}>
            <Hammer size={15} /> Build
          </button>
        )}
      </div>
    </article>
  );
}

/* ---------- Power & life support ---------- */

function PowerPanel() {
  const g = useGame((s) => s.game);
  const [fc, setFc] = useState(() => forecast(g, 18));
  useEffect(() => {
    // The forecast looks 18 hours ahead; twice a second is plenty.
    const iv = window.setInterval(() => setFc(forecast(useGame.getState().game, 18)), 500);
    return () => window.clearInterval(iv);
  }, []);
  const f = flows(g);
  const cap = capacity(g);
  const net = f.gen - f.used;
  const max = Math.max(f.gen, f.demand, 1);
  const P = PLANETS[g.planet];
  const status = f.short.power
    ? { cls: "bad", text: "Not enough power! Some machines are shut down." }
    : fc.power !== null
      ? { cls: fc.power < 4 ? "bad" : "warn", text: `At this rate the battery runs out at ${clockOf(g.t + fc.power)}.` }
      : net >= 0
        ? { cls: "good", text: g.res.power >= cap.power - 0.5 ? "Battery full. Spare power is wasted." : "Making more than you use: the battery is charging." }
        : { cls: "good", text: "Using more than you make, but the battery lasts the next 18 hours." };
  const rows = g.modules.filter((m) => m.type !== "solar" && m.type !== "reactor" && m.type !== "battery");
  const gens = g.modules.filter((m) => m.type === "solar" || m.type === "reactor");
  const life = [
    { key: "o2" as const, label: "Oxygen", unit: "kg", flow: f.o2, stock: g.res.o2 },
    { key: "water" as const, label: "Water", unit: "L", flow: f.water, stock: g.res.water },
    { key: "food" as const, label: "Food", unit: "meals", flow: f.food, stock: g.res.food },
  ];
  return (
    <div className="power-panel">
      <section className="power-balance" aria-label="Power balance">
        <div className="balance-row">
          <span className="label">
            <Zap size={16} /> Making
          </span>
          <span className="bar">
            <i className="made" style={{ width: `${(f.gen / max) * 100}%` }} />
          </span>
          <b>{kw(Math.round(f.gen * 10) / 10)}</b>
        </div>
        <div className="balance-row">
          <span className="label">
            <Power size={16} /> Using
          </span>
          <span className="bar">
            <i className="used" style={{ width: `${(f.demand / max) * 100}%` }} />
          </span>
          <b>{kw(Math.round(f.demand * 10) / 10)}</b>
        </div>
        <div className="battery-row">
          <BatteryCharging size={18} />
          <span className="battery">
            <i style={{ width: `${(g.res.power / cap.power) * 100}%` }} />
            {fc.powerLow < g.res.power - 1 && <u style={{ left: `${(fc.powerLow / cap.power) * 100}%` }} title="Lowest level in the next 18 hours" />}
          </span>
          <b>
            {Math.round(g.res.power)}/{cap.power} kWh
          </b>
        </div>
        <p className={`verdict ${status.cls}`}>{status.text}</p>
      </section>

      <h3 className="section-title">Making power</h3>
      {gens.length === 0 && <p className="empty">No generators yet. Build a Solar Array{g.planet === "mars" ? " or a Fission Reactor" : ""}.</p>}
      {gens.map((m) => (
        <SystemRow key={m.id} m={m} g={g} ratio={1} />
      ))}

      <h3 className="section-title">Using power</h3>
      {rows.map((m) => (
        <SystemRow key={m.id} m={m} g={g} ratio={f.ratio[m.id] ?? 1} />
      ))}
      {g.rover.docked && f.roverKw > 0 && (
        <div className="system-row">
          <span className="sys-icon" style={{ color: "#ff8a3d" }}>
            <IconRover size={22} />
          </span>
          <span className="sys-text">
            <b>Rover charger</b>
            <small>Charging the rover: {Math.round(g.rover.battery)}%</small>
          </span>
          <span className="sys-kw">{kw(Math.round(f.roverKw * 10) / 10)}</span>
          <span className="sys-auto">auto</span>
        </div>
      )}

      <h3 className="section-title">Life support today</h3>
      <div className="life-table">
        {life.map((l) => {
          const Icon = RESOURCE_ICON[l.key];
          const madeDay = l.flow.made * 24,
            usedDay = l.flow.used * 24,
            netDay = madeDay - usedDay;
          return (
            <div key={l.key} className={`life-row ${l.key}`}>
              <Icon size={20} />
              <b>{l.label}</b>
              <span>
                made <strong>{madeDay.toFixed(1)}</strong>
              </span>
              <span>
                used <strong>{usedDay.toFixed(1)}</strong>
              </span>
              <span className={netDay >= -0.05 ? "good" : "bad"}>
                {netDay >= 0 ? "+" : ""}
                {netDay.toFixed(1)} {l.unit}/day
              </span>
            </div>
          );
        })}
        <p className="hint">
          Four crew need {(CREW_NEEDS.o2 * 96).toFixed(1)} kg of oxygen, {CREW_NEEDS.water * 96} L of water and {CREW_NEEDS.food * 96} meals every day.
          {P.oxygenWater > 0 ? " The Oxygen Maker also splits water to make air." : " On Mars, MOXIE makes oxygen from the air, not from water."}
        </p>
      </div>
    </div>
  );
}

function SystemRow({ m, g, ratio }: { m: Module; g: GameState; ratio: number }) {
  const sp = spec(m.type, g.planet);
  const Icon = MODULE_ICON[m.type];
  const built = isBuilt(m);
  const damaged = built && m.health < DAMAGED;
  const gen = m.type === "solar" || m.type === "reactor";
  const kwNow = !built || !isWorking(m) ? 0 : m.type === "solar" ? RATES.solarKw * solarFactor(g) : m.type === "reactor" ? RATES.reactorKw : demandOf(g, m) * ratio;
  const state = !built
    ? `Building… ${Math.max(1, Math.ceil(MODULES[m.type].time - m.built))} h left`
    : damaged
      ? m.repair > 0
        ? "Being repaired"
        : "Damaged: repair it"
      : !m.on
        ? "Switched off"
        : m.type === "solar" && kwNow < 0.05
          ? "No sunlight right now"
          : m.type === "shelter" && !g.sheltering
            ? "Ready. Uses power only while in use"
            : m.type === "lab" && g.sheltering
              ? "Paused while the crew shelters"
              : !gen && ratio < 0.5
                ? "Not enough power!"
                : produces(m, g);
  const starved = built && !damaged && m.on && !gen && ratio < 0.5 && demandOf(g, m) > 0;
  return (
    <div className={`system-row ${!built || damaged || !m.on || starved ? "dim" : ""} ${starved ? "starved" : ""}`}>
      <button className="sys-icon" style={{ color: sp.color }} onClick={() => useUI.getState().select({ kind: "module", id: m.id })} aria-label={`${sp.name} details`}>
        <Icon size={22} />
      </button>
      <span className="sys-text">
        <b>{sp.name}</b>
        <small>{state}</small>
      </span>
      <span className={`sys-kw ${gen ? "gen" : ""}`}>{built ? `${gen ? "+" : ""}${kw(Math.round(kwNow * 10) / 10)}` : ""}</span>
      {m.type === "greenhouse" ? (
        <LightSwitch m={m} />
      ) : m.type === "habitat" ? (
        <span className="sys-auto">always on</span>
      ) : (
        <button
          className={`switch ${m.on ? "on" : ""}`}
          role="switch"
          aria-checked={m.on}
          aria-label={`${sp.name} power`}
          onClick={() => {
            useGame.getState().act({ type: "toggle", id: m.id });
            play(m.on ? "off" : "toggle");
          }}
        >
          <i />
        </button>
      )}
    </div>
  );
}

function produces(m: Module, g: GameState) {
  const P = PLANETS[g.planet];
  switch (m.type) {
    case "habitat":
      return "Air, warmth and pressure for the crew";
    case "solar":
      return "Electricity while the Sun shines";
    case "reactor":
      return "Steady electricity, day and night";
    case "oxygen":
      return `+${(RATES.oxygenKgPerHour * 24).toFixed(1)} kg oxygen a day${P.oxygenWater ? `, uses ${(P.oxygenWater * 24).toFixed(1)} L water` : ""}`;
    case "recycler":
      return `Recovers ${Math.round(RATES.recyclerRecovery * 100)}% of used water`;
    case "greenhouse":
      return m.light ? `+${(RATES.greenhouseFood[m.light] * 24).toFixed(1)} meals a day` : "Lights off: plants not growing";
    case "icedrill":
      return `+${RATES.drillWater * 24} L water a day`;
    case "shelter":
      return "Crew protected from radiation";
    case "lab":
      return `+${RATES.labScience * 24} science a day`;
    default:
      return "";
  }
}

function LightSwitch({ m }: { m: Module }) {
  const levels: { v: Light; label: string }[] = [
    { v: 0, label: "Off" },
    { v: 1, label: "Low" },
    { v: 2, label: "High" },
  ];
  return (
    <span className="segmented" role="radiogroup" aria-label="Grow lights">
      {levels.map((l) => (
        <button
          key={l.v}
          role="radio"
          aria-checked={m.light === l.v}
          className={m.light === l.v ? "on" : ""}
          onClick={() => {
            useGame.getState().act({ type: "light", id: m.id, level: l.v });
            play("toggle");
          }}
        >
          {l.label}
        </button>
      ))}
    </span>
  );
}

/* ---------- Rover ---------- */

function siteInfo(s: Site, planet: "moon" | "mars") {
  if (s.kind === "ice") return { gives: `+${HAUL.ice.water} L water`, about: planet === "moon" ? "Always dark and very cold: the battery drains faster here." : "Ice hides under the dust here." };
  if (s.kind === "regolith") return { gives: `+${HAUL.regolith.materials} materials`, about: "Loose rock you can build with." };
  return { gives: `+${HAUL.science.science} science (once)`, about: s.fact[planet] };
}

/** The Rover drawer: pick which rover to drive and send (when the mission has the science rover too). */
function RoverDrawer() {
  // (Tutorials teach the crew rover: the science rover waits until they're done.)
  const tutorial = useUI((s) => s.tutorial !== null);
  const vehicle = useGame((s) => (tutorial ? "rover" : s.vehicle));
  const hasScout = useGame((s) => !!s.game.scout) && !tutorial;
  const pick = (v: Vehicle) => {
    if (v === vehicle) return;
    useGame.getState().setVehicle(v);
    // Show the one you picked.
    useUI.getState().cam("rover");
    play("toggle");
  };
  return (
    <>
      {hasScout && (
        <div className="vehicle-switch segmented" role="radiogroup" aria-label="Which rover">
          <button className={vehicle === "rover" ? "on" : ""} role="radio" aria-checked={vehicle === "rover"} onClick={() => pick("rover")}>
            <IconRover size={18} /> Crew rover
          </button>
          <button className={vehicle === "scout" ? "on" : ""} role="radio" aria-checked={vehicle === "scout"} onClick={() => pick("scout")} data-act="scout">
            <IconScout size={18} /> Science rover
          </button>
        </div>
      )}
      {vehicle === "scout" && hasScout ? <ScoutPanel /> : <RoverPanel />}
    </>
  );
}

/** The science rover: a robot on nuclear power that studies science sites and radios the data home. */
function ScoutPanel() {
  const g = useGame((s) => s.game);
  const { target, routeLen } = useGame(useShallow((s) => ({ target: s.scoutTarget, routeLen: s.scoutRoute.length })));
  const selected = useUI((s) => (s.selected?.kind === "site" ? s.selected.id : null));
  const sc = g.scout!;
  const near = SITES.find((w) => Math.hypot(sc.x - w.x, sc.z - w.z) <= SITE_REACH);
  const parked = Math.hypot(sc.x - SCOUT_HOME.x, sc.z - SCOUT_HOME.z) < 3;
  const studying = sc.task ? siteById(sc.task.site) : null;
  const status = studying
    ? `Studying ${studying.name[g.planet]}… ${Math.round((1 - sc.task!.left / SCOUT_ROVER.study) * 100)}%`
    : routeLen
      ? target === "home"
        ? "Driving back to its parking spot"
        : "Driving…"
      : parked
        ? "Parked by the dock"
        : near
          ? `At ${near.name[g.planet]}`
          : "Stopped outside";
  const science = SITES.filter((w) => w.kind === "science").sort(
    (a, b) => Number(b.id === selected) - Number(a.id === selected) || Math.hypot(sc.x - a.x, sc.z - a.z) - Math.hypot(sc.x - b.x, sc.z - b.z),
  );
  return (
    <div className="rover-panel scout-panel">
      <section className="rover-status">
        <span className="rover-art" aria-hidden="true">
          <IconScout size={34} />
        </span>
        <div>
          <b>{status}</b>
          <small>
            Nuclear power (an RTG): it never needs charging · {sc.studied.length} of {science.length} sites studied
          </small>
        </div>
      </section>
      <div className="rover-actions">
        {near && <StudyButton site={near} g={g} />}
        {!parked && (
          <button className="btn secondary" onClick={() => useGame.getState().sendRover("home", "scout") && play("rover")}>
            <House size={17} /> Park
          </button>
        )}
        {routeLen > 0 && (
          <button className="btn ghost" onClick={() => useGame.getState().stopRover("scout")}>
            Stop
          </button>
        )}
        <button className="btn ghost" onClick={() => useUI.getState().cam("rover")} title="Follow the science rover">
          <Crosshair size={16} /> Camera
        </button>
      </div>
      <h3 className="section-title">Science sites</h3>
      <div className="site-list">
        {science.map((w) => (
          <ScoutSiteCard key={w.id} s={w} g={g} selected={selected === w.id} active={target === w.id} />
        ))}
      </div>
      <p className="hint drive-hint">
        <Navigation size={14} /> A robot needs no air, food or shelter, so it can keep exploring through a solar storm. It is slower than the crew rover
        ({SCOUT_ROVER.top} instead of 36 m an hour) and has no cargo bay: it studies rocks where they lie and radios the results home. Drive it with{" "}
        <kbd className="kbd">W</kbd>
        <kbd className="kbd">A</kbd>
        <kbd className="kbd">S</kbd>
        <kbd className="kbd">D</kbd>; in the cockpit view you see through its mast camera.
      </p>
    </div>
  );
}

function StudyButton({ site, g }: { site: Site; g: GameState }) {
  const sc = g.scout!;
  if (sc.task) return <span className="collecting">Studying… {Math.round((1 - sc.task.left / SCOUT_ROVER.study) * 100)}%</span>;
  if (site.kind !== "science") return <span className="collecting done">No cargo bay: send the crew rover</span>;
  if (sc.studied.includes(site.id)) return <span className="collecting done">Studied</span>;
  return (
    <button className="btn primary" data-act="study" onClick={() => useGame.getState().act({ type: "study" }) && play("click")}>
      <IconSample size={17} /> Study here
    </button>
  );
}

function ScoutSiteCard({ s, g, selected, active }: { s: Site; g: GameState; selected: boolean; active: boolean }) {
  const sc = g.scout!;
  const done = sc.studied.includes(s.id);
  const dist = Math.hypot(sc.x - s.x, sc.z - s.z);
  const here = dist <= SITE_REACH;
  return (
    <article className={`site-card science ${selected ? "selected" : ""} ${active ? "active" : ""} ${done ? "done" : ""}`} data-site={s.id}>
      <span className="site-icon">
        <IconSample size={22} />
      </span>
      <div className="site-info">
        <h4>{s.name[g.planet]}</h4>
        <p className="gives">+{SCOUT_ROVER.science} science, radioed home</p>
        <p className="about">{s.fact[g.planet]}</p>
        <div className="chips">
          <span className="chip">{Math.round(dist)} m</span>
          <span className="chip">~{Math.max(1, Math.round((dist / SCOUT_ROVER.top) * 10) / 10)} h away</span>
        </div>
      </div>
      <div className="site-go">
        {done ? (
          <span className="done-tag">
            <Check size={15} /> Done
          </span>
        ) : here ? (
          <span className="done-tag busy">Here</span>
        ) : (
          <button
            className="btn primary small"
            onClick={() => {
              useGame.getState().sendRover(s.id, "scout");
              useUI.getState().select({ kind: "site", id: s.id });
            }}
          >
            Go
          </button>
        )}
      </div>
    </article>
  );
}

function RoverPanel() {
  const g = useGame((s) => s.game);
  const { target, routeLen } = useGame(useShallow((s) => ({ target: s.target, routeLen: s.route.length })));
  const selected = useUI((s) => (s.selected?.kind === "site" ? s.selected.id : null));
  const rv = g.rover;
  const cargo = rv.cargo.water ? `${rv.cargo.water} L of ice` : rv.cargo.materials ? `${rv.cargo.materials} materials` : "";
  const samples = rv.cargo.samples.length;
  const status = rv.task
    ? "Crew outside, collecting…"
    : rv.docked
      ? rv.battery < 99.5
        ? `Charging on the dock · full in ${duration(((100 - rv.battery) / RATES.roverChargePerHour))}`
        : "Parked on the dock, fully charged"
      : routeLen
        ? target === "dock"
          ? "Driving home"
          : "Driving…"
        : "Stopped outside";
  const near = SITES.find((s) => Math.hypot(rv.x - s.x, rv.z - s.z) <= SITE_REACH && !rv.docked);
  // Order: the selected site, then ice and regolith (the trips you repeat), then science sites by distance.
  const rank = (x: Site) => (x.id === selected ? 0 : x.kind === "ice" ? 1 : x.kind === "regolith" ? 2 : 3);
  const sites = [...SITES].sort((a, b) => rank(a) - rank(b) || Math.hypot(rv.x - a.x, rv.z - a.z) - Math.hypot(rv.x - b.x, rv.z - b.z));
  return (
    <div className="rover-panel">
      <section className="rover-status">
        <span className="rover-art" aria-hidden="true">
          <IconRover size={34} />
        </span>
        <div>
          <b>{status}</b>
          <span className={`battery small ${rv.battery < 25 ? "low" : ""}`} aria-label={`Rover battery ${Math.round(rv.battery)}%`}>
            <i style={{ width: `${rv.battery}%` }} />
          </span>
          <small>
            Battery {Math.round(rv.battery)}%{cargo || samples ? ` · carrying ${[cargo, samples ? `${samples} sample${samples > 1 ? "s" : ""}` : ""].filter(Boolean).join(" and ")}` : ""}
          </small>
        </div>
      </section>
      <div className="rover-actions">
        {near && (
          <CollectButton site={near} g={g} />
        )}
        {!rv.docked && (
          <button className="btn secondary" data-act="home" onClick={() => useGame.getState().sendRover("dock", "rover") && play("rover")}>
            <House size={17} /> Drive home
          </button>
        )}
        {routeLen > 0 && (
          <button className="btn ghost" onClick={() => useGame.getState().stopRover("rover")}>
            Stop
          </button>
        )}
        <button className="btn ghost" onClick={() => useUI.getState().cam(rv.docked ? "base" : "rover")} title="Point the camera at the rover">
          <Crosshair size={16} /> Camera
        </button>
      </div>
      <h3 className="section-title">Where to?</h3>
      <div className="site-list">
        {sites.map((s) => (
          <SiteCard key={s.id} s={s} g={g} selected={selected === s.id} active={target === s.id} />
        ))}
      </div>
      <p className="hint drive-hint">
        <Navigation size={14} /> Drive it yourself with <kbd className="kbd">W</kbd>
        <kbd className="kbd">A</kbd>
        <kbd className="kbd">S</kbd>
        <kbd className="kbd">D</kbd> or the arrow keys, or click the ground while this panel is open. Press <kbd className="kbd">V</kbd> to switch between the overview, follow and cockpit views.
      </p>
    </div>
  );
}

function CollectButton({ site, g }: { site: Site; g: GameState }) {
  const rv = g.rover;
  const sample = site.kind === "science" && (g.stats.sites.includes(site.id) || rv.cargo.samples.includes(site.id));
  const full = site.kind !== "science" && (rv.cargo.water > 0 || rv.cargo.materials > 0);
  if (rv.task) return <span className="collecting">Collecting at {site.name[g.planet]}… {Math.round((1 - rv.task.left) * 100)}%</span>;
  if (sample) return <span className="collecting done">Sample on board</span>;
  return (
    <button
      className="btn primary"
      data-act="collect"
      disabled={full}
      title={full ? "Unload the cargo at the dock first" : ""}
      onClick={() => useGame.getState().act({ type: "collect", site: site.id }) && play("click")}
    >
      {site.kind === "ice" ? <IconIce size={17} /> : site.kind === "regolith" ? <IconRock size={17} /> : <IconSample size={17} />} Collect here
    </button>
  );
}

function SiteCard({ s, g, selected, active }: { s: Site; g: GameState; selected: boolean; active: boolean }) {
  const rv = g.rover;
  const info = siteInfo(s, g.planet);
  const done = s.kind === "science" && (g.stats.sites.includes(s.id) || rv.cargo.samples.includes(s.id));
  const dist = Math.hypot(rv.x - s.x, rv.z - s.z);
  const [cost, setCost] = useState<{ there: number; back: number } | null>(null);
  useEffect(() => {
    // Battery estimate for there and back, planned off the main thread's hot path.
    const t = window.setTimeout(() => {
      const goal = approachPoint(rv, s, g.modules, 2.2);
      const route = goal ? planRoute(rv, goal, g.modules) : [];
      if (!route.length || !goal) return setCost(null);
      const back = planRoute(goal, DOCK, g.modules);
      setCost({ there: tripCost(rv, route, g.planet), back: back.length ? tripCost(goal, back, g.planet) : routeLength(goal, [DOCK]) * PLANETS[g.planet].roverDrain });
    }, 60);
    return () => window.clearTimeout(t);
  }, [Math.round(rv.x / 3), Math.round(rv.z / 3), g.modules.length]);
  const need = cost ? Math.ceil(cost.there + cost.back) : null;
  const risky = need !== null && need > rv.battery - 5;
  const here = dist <= SITE_REACH && !rv.docked;
  const Icon = s.kind === "ice" ? IconIce : s.kind === "regolith" ? IconRock : IconSample;
  return (
    <article className={`site-card ${s.kind} ${selected ? "selected" : ""} ${active ? "active" : ""} ${done ? "done" : ""}`} data-site={s.id}>
      <span className="site-icon">
        <Icon size={22} />
      </span>
      <div className="site-info">
        <h4>{s.name[g.planet]}</h4>
        <p className="gives">{info.gives}</p>
        <p className="about">{info.about}</p>
        <div className="chips">
          <span className="chip">{Math.round(dist)} m</span>
          {need !== null && !done && <span className={`chip ${risky ? "short" : ""}`}>~{need}% battery there and back</span>}
        </div>
      </div>
      <div className="site-go">
        {done ? (
          <span className="done-tag">
            <Check size={15} /> Done
          </span>
        ) : here ? (
          <span className="done-tag busy">Here</span>
        ) : (
          <button
            className={`btn ${risky ? "secondary" : "primary"} small`}
            onClick={() => {
              if (risky) useGame.getState().toast(`Careful: that trip needs about ${need}% battery and the rover has ${Math.round(rv.battery)}%.`, "warn");
              useGame.getState().sendRover(s.id, "rover");
              useUI.getState().select({ kind: "site", id: s.id });
            }}
          >
            {active ? "Going…" : "Go"} <ArrowRight size={15} />
          </button>
        )}
      </div>
    </article>
  );
}

/* ---------- Crew ---------- */

function CrewPanel() {
  const g = useGame((s) => s.game);
  const shelter = g.modules.some((m) => m.type === "shelter" && isBuilt(m) && m.health >= DAMAGED);
  const factor = shieldDone(g) ? 25 : 60;
  return (
    <div className="crew-panel">
      <p className="lead">
        The Moon and Mars have no thick air or magnetic field to block radiation from space. Every crew member collects a dose, measured in millisieverts (mSv). In this trainer the limit is <b>{DOSE_LIMIT} mSv</b>.
      </p>
      {g.crew.map((c) => (
        <div key={c.id} className="crew-row">
          <b>{c.name}</b>
          <small>
            {c.role} · {c.place === "rover" ? "in the rover" : c.place === "shelter" ? "in the shelter" : c.place === "eva" ? "outside on foot" : "in the habitat"}
          </small>
          <div className="crew-meter">
            <span>Health</span>
            <span className="bar">
              <i className="hp" style={{ width: `${c.health}%` }} />
            </span>
            <b>{Math.round(c.health)}%</b>
          </div>
          <div className="crew-meter">
            <span>Dose</span>
            <span className="bar">
              <i className="rad" style={{ width: `${Math.min(100, (c.dose / DOSE_LIMIT) * 100)}%` }} />
            </span>
            <b>{c.dose.toFixed(1)} mSv</b>
          </div>
        </div>
      ))}
      <h3 className="section-title">How much gets through?</h3>
      <ul className="shield-list">
        <li>
          <IconDose size={18} /> Outside or collecting: <b>100%</b>
        </li>
        <li>
          <IconRover size={18} /> Inside the rover: <b>80%</b>
        </li>
        <li>
          <House size={18} /> Inside the habitat: <b>{factor}%</b> {shieldDone(g) ? "(shielded)" : "(add regolith shielding for 25%)"}
        </li>
        <li>
          <IconShelter size={18} /> Inside the Storm Shelter: <b>10%</b> {shelter ? "" : "(not built yet)"}
        </li>
      </ul>
    </div>
  );
}

/* ---------- Module card ---------- */

function ModuleCard({ id }: { id: number }) {
  const g = useGame((s) => s.game);
  const m = g.modules.find((x) => x.id === id)!;
  const sp = spec(m.type, g.planet);
  const Icon = MODULE_ICON[m.type];
  const f = flows(g);
  const built = isBuilt(m);
  const damaged = built && m.health < DAMAGED;
  const [confirm, setConfirm] = useState(false);
  const close = () => {
    useUI.getState().select(null);
    play("close");
  };
  const ratio = f.ratio[m.id] ?? 1;
  return (
    <aside className="drawer module-card" aria-label={sp.name} style={{ "--c": sp.color } as React.CSSProperties}>
      <header className="drawer-head">
        <span className="build-icon">
          <Icon size={26} />
        </span>
        <h2>{sp.name}</h2>
        <button className="icon-btn" aria-label="Close" onClick={close}>
          <X size={20} />
        </button>
      </header>
      <div className="drawer-body">
        <p className={`status-line ${damaged || (!built ? false : ratio < 0.5 && m.on) ? "bad" : !m.on ? "off" : "good"}`}>
          {!built
            ? `Under construction: ready in ${Math.max(1, Math.ceil(MODULES[m.type].time - m.built))} h${g.sheltering ? " (paused while sheltering)" : ""}`
            : damaged
              ? m.repair > 0
                ? "Being repaired…"
                : "Damaged! It won't work until it's repaired."
              : !m.on
                ? "Switched off."
                : ratio < 0.5 && m.type !== "solar" && m.type !== "reactor"
                  ? "Not getting enough power."
                  : `Working. ${produces(m, g)}.`}
        </p>
        <p>{sp.does}</p>
        <p className="catch">{sp.catch}</p>
        <div className="real-fact">
          <b>Real world</b>
          <p>{MODULES[m.type].real}</p>
        </div>
        <div className="module-actions">
          {m.type === "habitat" && (
            <button
              className="btn primary"
              onClick={() => {
                if (!enterWalk()) return;
                useUI.getState().select(null);
                play("open");
              }}
            >
              <DoorOpen size={16} /> Go inside
            </button>
          )}
          {m.type === "greenhouse" && built && (
            <div className="light-row">
              <span>Grow lights</span>
              <LightSwitch m={m} />
            </div>
          )}
          {m.type !== "habitat" && built && (
            <button
              className={`btn ${m.on ? "secondary" : "primary"}`}
              onClick={() => {
                useGame.getState().act({ type: "toggle", id: m.id });
                play(m.on ? "off" : "toggle");
              }}
            >
              <Power size={16} /> {m.on ? "Switch off" : "Switch on"}
            </button>
          )}
          {built && m.health < 100 && (
            <button className="btn primary" disabled={m.repair > 0 || g.res.materials < REPAIR_COST} onClick={() => useGame.getState().act({ type: "repair", id: m.id }) && play("build")}>
              <Wrench size={16} /> Repair ({REPAIR_COST} materials)
            </button>
          )}
          {m.type === "habitat" && mission(g.missionId).shield && !g.shieldStarted && (
            <button className="btn secondary" disabled={g.res.materials < SHIELD_COST} onClick={() => useGame.getState().act({ type: "shield" }) && play("build")}>
              <IconShelter size={16} /> Add regolith shielding ({SHIELD_COST})
            </button>
          )}
          {m.type !== "habitat" &&
            (confirm ? (
              <div className="confirm">
                <span>{built ? `Recycle it for ${Math.floor(MODULES[m.type].cost / 2)} materials?` : `Cancel and get ${MODULES[m.type].cost} materials back?`}</span>
                <button
                  className="btn danger small"
                  onClick={() => {
                    useGame.getState().act({ type: built ? "recycle" : "cancel", id: m.id });
                    play("off");
                    close();
                  }}
                >
                  <Trash2 size={15} /> Yes
                </button>
                <button className="btn ghost small" onClick={() => setConfirm(false)}>
                  No
                </button>
              </div>
            ) : (
              <button className="btn ghost" onClick={() => setConfirm(true)}>
                {built ? <Recycle size={16} /> : <CornerDownLeft size={16} />} {built ? "Recycle" : "Cancel build"}
              </button>
            ))}
          <button className="btn ghost" onClick={() => useUI.getState().cam("focus")}>
            <Crosshair size={16} /> Show me
          </button>
        </div>
      </div>
    </aside>
  );
}

/** Keeps a selected pad meaningful: clear it when it's taken. */
export function usePadGuard() {
  const sel = useUI((s) => s.selected);
  const taken = useGame((s) => (sel?.kind === "pad" ? s.game.modules.some((m) => m.pad === sel.id) : false));
  useEffect(() => {
    if (taken) useUI.getState().select(null);
  }, [taken]);
}

