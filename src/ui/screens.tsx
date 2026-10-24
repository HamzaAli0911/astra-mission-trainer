import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Clock,
  GraduationCap,
  Info,
  Lock,
  Play,
  Rocket,
  Settings,
  Shuffle,
  Star,
} from "lucide-react";
import { CAMPAIGN, mission, MISSIONS, type Mission } from "../sim/missions";
import { unlocked, useUI } from "../state/ui";
import { readSave, resumeSave } from "../state/save";
import { clockOf, dayOf } from "../sim/planets";
import { Globe } from "../scene/Globe";
import { play } from "../lib/sound";
import { Stars } from "./common";
import { IconDose, IconGreenhouse, IconOxygen, IconReactor, IconSolar, IconWater, Logo } from "./icons";
import { launch } from "./overlays";
import { SoundToggle } from "./hud";

/* ---------- Title ---------- */

export function Title() {
  const { progress, motion } = useUI(useShallow((s) => ({ progress: s.progress, motion: s.settings.motion })));
  const earned = Object.values(progress.stars).reduce((a, b) => a + b, 0);
  const next = CAMPAIGN.find((m) => !progress.stars[m.id]) ?? CAMPAIGN[CAMPAIGN.length - 1];
  const started = earned > 0;
  const [save] = useState(readSave);
  return (
    <main className="title-screen">
      <div className="starfield" aria-hidden="true" />
      <Globe planet="moon" reduceMotion={motion} />
      <header className="title-top">
        <span className="brand">
          <Logo size={40} />
          <span>
            ASTRA <small>Junior Astronaut Mission Trainer</small>
          </span>
        </span>
        <div className="title-top-actions">
          <SoundToggle />
          <button className="icon-btn ghost" aria-label="Settings" onClick={() => useUI.getState().setModal("settings")}>
            <Settings size={20} />
          </button>
        </div>
      </header>
      <section className="title-hero">
        <span className="eyebrow">Cadet training · Moon and Mars</span>
        <h1>
          Keep your crew alive <em>on another world.</em>
        </h1>
        <p className="lede">
          Run an outpost on the Moon, then Mars. Balance power, air, water, food and radiation shielding, and learn the choices that make a mission succeed or fail.
        </p>
        <div className="title-actions">
          {save && (
            <button
              className="btn primary big resume"
              autoFocus
              onClick={() => {
                play("open");
                resumeSave(save);
              }}
            >
              <Play size={20} />
              <span>
                Resume {mission(save.game.missionId).title}
                <small>
                  {save.game.planet === "mars" ? "Sol" : "Day"} {dayOf(save.game.t)} · {clockOf(save.game.t)}
                </small>
              </span>
            </button>
          )}
          {!save && (
            <button
              className="btn primary big"
              autoFocus
              onClick={() => {
                play("open");
                if (!started) launch(CAMPAIGN[0].id);
                else useUI.setState({ screen: "map", focus: next.id });
              }}
            >
              {started ? "Continue training" : "Start training"} <ArrowRight size={20} />
            </button>
          )}
          <button
            className="btn secondary big"
            onClick={() => {
              play("open");
              useUI.setState({ screen: "map" });
            }}
          >
            <Rocket size={19} /> Missions
          </button>
        </div>
        {started && (
          <p className="title-progress">
            <Star size={16} className="on" /> {earned} of {CAMPAIGN.length * 3} stars earned
          </p>
        )}
        <ul className="pillars" aria-label="What you will learn">
          <li>
            <IconSolar size={20} /> Power
          </li>
          <li>
            <IconOxygen size={20} /> Life support
          </li>
          <li>
            <IconGreenhouse size={20} /> Food
          </li>
          <li>
            <IconDose size={20} /> Radiation
          </li>
        </ul>
      </section>
      <footer className="title-foot">
        <button className="link" onClick={() => useUI.getState().setModal("guide")}>
          <Info size={16} /> How to play
        </button>
        <button className="link" onClick={() => useUI.getState().setModal("library")}>
          <BookOpen size={16} /> Science library
        </button>
        <button className="link" onClick={() => useUI.getState().setModal("teachers")}>
          <GraduationCap size={16} /> For teachers
        </button>
        <button className="link" onClick={() => useUI.getState().setModal("credits")}>
          About
        </button>
        <span className="foot-note">NASA Space Apps Challenge 2026 · An independent project, not endorsed by NASA</span>
      </footer>
    </main>
  );
}

/* ---------- Mission map ---------- */

const TOPIC_ICON: Record<string, (p: { size?: number }) => React.ReactElement> = {
  "first-light": IconSolar,
  "ice-hunters": IconWater,
  "green-thumb": IconGreenhouse,
  "solar-storm": IconDose,
  "red-planet": IconReactor,
  "mars-colony": IconOxygen,
};

export function MissionMap() {
  const { progress, focus, settings } = useUI(useShallow((s) => ({ progress: s.progress, focus: s.focus, settings: s.settings })));
  const selected = mission(focus);
  const moon = CAMPAIGN.filter((m) => m.planet === "moon"),
    mars = CAMPAIGN.filter((m) => m.planet === "mars");
  const free = MISSIONS.filter((m) => m.number === 0);
  const earned = Object.values(progress.stars).reduce((a, b) => a + b, 0);
  const node = (m: Mission) => {
    const open = unlocked(m.id, { progress, settings });
    const stars = progress.stars[m.id] ?? 0;
    const Icon = TOPIC_ICON[m.id] ?? Shuffle;
    return (
      <li key={m.id} className={`node ${m.id === focus ? "on" : ""} ${open ? "" : "locked"} ${stars ? "done" : ""}`}>
        <button
          onClick={() => {
            useUI.getState().setFocus(m.id);
            play("click");
          }}
          aria-pressed={m.id === focus}
          aria-label={`${m.number ? `Mission ${m.number}: ` : ""}${m.title}${open ? "" : " (locked)"}${stars ? `, ${stars} stars` : ""}`}
        >
          <span className="node-disc">{open ? <Icon size={26} /> : <Lock size={22} />}</span>
          <span className="node-label">
            {m.number > 0 && <small>{m.number}</small>}
            {m.title}
          </span>
          <Stars n={stars} size={13} label={false} />
        </button>
      </li>
    );
  };
  return (
    <main className="map-screen">
      <div className="starfield" aria-hidden="true" />
      <header className="map-top">
        <button className="btn ghost" onClick={() => useUI.setState({ screen: "title" })}>
          <ArrowLeft size={18} /> Title
        </button>
        <h1>Training missions</h1>
        <span className="map-stars">
          <Star size={18} className="on" /> {earned}/{CAMPAIGN.length * 3}
        </span>
      </header>
      <div className="map-body">
        <div className="journey">
          <section className="world-zone moon">
            <span className="zone-planet" aria-hidden="true" />
            <h2>The Moon</h2>
            <p>3 days from Earth · south pole</p>
            <ol className="path">{moon.map(node)}</ol>
          </section>
          <div className="transfer" aria-hidden="true">
            <span>about 7 months</span>
          </div>
          <section className="world-zone mars">
            <span className="zone-planet" aria-hidden="true" />
            <h2>Mars</h2>
            <p>Thin air · dust storms · weak sunlight</p>
            <ol className="path">{mars.map(node)}</ol>
          </section>
          <section className="world-zone free">
            <h2>Free play</h2>
            <p>Random events every time</p>
            <ol className="path">{free.map(node)}</ol>
          </section>
        </div>
        <MissionDetails m={selected} />
      </div>
    </main>
  );
}

function MissionDetails({ m }: { m: Mission }) {
  const { progress, settings } = useUI(useShallow((s) => ({ progress: s.progress, settings: s.settings })));
  const open = unlocked(m.id, { progress, settings });
  const stars = progress.stars[m.id] ?? 0;
  const before = m.after ? mission(m.after) : null;
  return (
    <aside className={`mission-card ${m.planet}`} aria-label="Mission details">
      <span className="eyebrow">
        {m.number ? `Mission ${m.number}` : "Free play"} · {m.planet === "moon" ? "The Moon" : "Mars"}
      </span>
      <h2>{m.title}</h2>
      <p className="tagline">{m.tagline}</p>
      <h3>You'll learn</h3>
      <ul className="check-list">
        {m.learn.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
      <div className="meta">
        <span>
          <Clock size={15} /> about {m.minutes} min
        </span>
        <span>
          <Stars n={stars} size={15} />
        </span>
      </div>
      {open ? (
        <button className="btn primary big" onClick={() => launch(m.id)}>
          {stars ? "Play again" : "Launch"} <Play size={18} />
        </button>
      ) : (
        <p className="locked-note">
          <Lock size={16} /> Complete <b>{before?.title}</b> to unlock this mission.
        </p>
      )}
    </aside>
  );
}
