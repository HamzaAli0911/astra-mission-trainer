import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { ExternalLink, GraduationCap, Info, Settings as SettingsIcon, BookOpen, RotateCcw } from "lucide-react";
import { CAMPAIGN } from "../sim/missions";
import { DOSE_LIMIT } from "../sim/core";
import { useUI, type Settings } from "../state/ui";
import { useGame } from "../state/game";
import { play } from "../lib/sound";
import { speak } from "../lib/speech";
import { Kbd, Modal } from "./common";
import { IconCapcom, Logo, RESOURCE_ICON, IconDose } from "./icons";
import { LeaveConfirm, PauseMenu } from "./overlays";

export function Modals() {
  const modal = useUI((s) => s.modal);
  const close = () => {
    const ui = useUI.getState();
    // Sub-dialogs opened from the pause menu go back to it.
    if (ui.screen === "game" && modal !== "pause" && useGame.getState().reason === "menu") ui.setModal("pause");
    else ui.setModal(null);
  };
  switch (modal) {
    case "pause":
      return <PauseMenu onClose={() => useUI.getState().setModal(null)} />;
    case "restart":
    case "mars":
      return <LeaveConfirm kind={modal} />;
    case "settings":
      return <SettingsDialog close={close} />;
    case "guide":
      return <Guide close={close} />;
    case "library":
      return <Library close={close} />;
    case "teachers":
      return <Teachers close={close} />;
    case "credits":
      return <Credits close={close} />;
    default:
      return null;
  }
}

function Toggle({ label, text, on, set }: { label: string; text: string; on: boolean; set: (v: boolean) => void }) {
  return (
    <div className="setting">
      <div>
        <b>{label}</b>
        <small>{text}</small>
      </div>
      <button
        className={`switch ${on ? "on" : ""}`}
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={() => {
          set(!on);
          play("toggle");
        }}
      >
        <i />
      </button>
    </div>
  );
}

function SettingsDialog({ close }: { close: () => void }) {
  const s = useUI((x) => x.settings);
  const set = useUI.getState().setSetting;
  const [confirm, setConfirm] = useState(false);
  return (
    <Modal title="Settings" onClose={close} icon={<SettingsIcon size={20} />}>
      <Toggle label="Sound effects" text="Beeps, alarms and the Geiger counter in storms." on={s.sound} set={(v) => set("sound", v)} />
      <Toggle
        label="Read CAPCOM aloud"
        text="Your browser reads messages and tips out loud."
        on={s.voice}
        set={(v) => {
          set("voice", v);
          if (v) speak("Voice on. This is Jo, your CAPCOM.", true);
        }}
      />
      <Toggle label="Larger text" text="Makes all writing bigger." on={s.bigText} set={(v) => set("bigText", v)} />
      <Toggle label="Reduce motion" text="Fewer animations and camera moves." on={s.motion} set={(v) => set("motion", v)} />
      <div className="setting">
        <div>
          <b>On-screen drive pad</b>
          <small>Arrow buttons for driving the rover. Auto shows them on touch screens.</small>
        </div>
        <span className="segmented">
          {(["auto", "on", "off"] as Settings["pad"][]).map((v) => (
            <button key={v} className={s.pad === v ? "on" : ""} aria-pressed={s.pad === v} onClick={() => set("pad", v)}>
              {v[0].toUpperCase() + v.slice(1)}
            </button>
          ))}
        </span>
      </div>
      <div className="setting">
        <div>
          <b>Graphics</b>
          <small>Ultra adds ambient occlusion, sharper shadows and the finest detail (needs a strong graphics card). High adds glow and soft shadows. Low runs faster on older computers.</small>
        </div>
        <span className="segmented">
          {(["auto", "low", "high", "ultra"] as Settings["graphics"][]).map((v) => (
            <button key={v} className={s.graphics === v ? "on" : ""} aria-pressed={s.graphics === v} onClick={() => set("graphics", v)}>
              {v[0].toUpperCase() + v.slice(1)}
            </button>
          ))}
        </span>
      </div>
      <Toggle label="Show the map" text="A small map of the area in the corner. Click it to look somewhere or send the rover to a site." on={s.minimap} set={(v) => set("minimap", v)} />
      <Toggle label="Unlock every mission" text="For teachers and judges: open any mission without playing the ones before it." on={s.unlockAll} set={(v) => set("unlockAll", v)} />
      <div className="setting">
        <div>
          <b>Reset progress</b>
          <small>Clears your stars. Settings stay as they are.</small>
        </div>
        {confirm ? (
          <span className="confirm">
            <button
              className="btn danger small"
              onClick={() => {
                useUI.getState().resetProgress();
                setConfirm(false);
                play("off");
              }}
            >
              Reset
            </button>
            <button className="btn ghost small" onClick={() => setConfirm(false)}>
              Keep
            </button>
          </span>
        ) : (
          <button className="btn ghost small" onClick={() => setConfirm(true)}>
            <RotateCcw size={15} /> Reset
          </button>
        )}
      </div>
    </Modal>
  );
}

function Guide({ close }: { close: () => void }) {
  return (
    <Modal title="How to play" onClose={close} wide icon={<Info size={20} />}>
      <div className="guide">
        <section>
          <h3>Your job</h3>
          <p>
            You are the commander of a small outpost. Four astronauts depend on you. Each mission has a few <b>goals</b> (top left). Reach them all and keep the crew safe until time runs out to earn up to three stars.
          </p>
          <h3>The four lifelines</h3>
          <ul className="lifelines">
            <li>
              {RESOURCE_ICON.power({ size: 20 })}
              <span>
                <b>Power</b> runs every machine. Solar arrays only work in sunlight, so store energy in batteries for the night.
              </span>
            </li>
            <li>
              {RESOURCE_ICON.o2({ size: 20 })}
              <span>
                <b>Oxygen</b>: the crew breathes 3.4 kg a day. An Oxygen Maker makes it from water (Moon) or from the air (Mars).
              </span>
            </li>
            <li>
              {RESOURCE_ICON.water({ size: 20 })}
              <span>
                <b>Water</b>: find ice with the rover and recycle what the crew uses.
              </span>
            </li>
            <li>
              {RESOURCE_ICON.food({ size: 20 })}
              <span>
                <b>Food</b>: greenhouses grow meals, but grow lights need power, even at night.
              </span>
            </li>
            <li>
              <IconDose size={20} />
              <span>
                <b>Radiation</b>: during solar storms, get everyone into a shelter. The limit is {DOSE_LIMIT} mSv.
              </span>
            </li>
          </ul>
          <p className="hint">
            Under each supply you'll see how long it lasts, for example <b>▼ 2.1 days</b>. Arrows up mean you make more than you use.
          </p>
        </section>
        <section>
          <h3>Controls</h3>
          <table className="keys">
            <tbody>
              <tr>
                <td>Look around</td>
                <td>Drag · scroll or pinch to zoom · right-drag to slide</td>
              </tr>
              <tr>
                <td>Build · Power · Rover · Shelter</td>
                <td>
                  <Kbd>B</Kbd> <Kbd>P</Kbd> <Kbd>R</Kbd> <Kbd>H</Kbd>
                </td>
              </tr>
              <tr>
                <td>Drive the rover</td>
                <td>
                  <Kbd>W</Kbd>
                  <Kbd>A</Kbd>
                  <Kbd>S</Kbd>
                  <Kbd>D</Kbd> or arrows · or pick a site and press Go
                </td>
              </tr>
              <tr>
                <td>Pause · speed</td>
                <td>
                  <Kbd>Space</Kbd> · <Kbd>1</Kbd> <Kbd>2</Kbd> <Kbd>3</Kbd>
                </td>
              </tr>
              <tr>
                <td>Camera on base · on rover</td>
                <td>
                  <Kbd>C</Kbd> · <Kbd>F</Kbd>
                </td>
              </tr>
              <tr>
                <td>Close · menu</td>
                <td>
                  <Kbd>Esc</Kbd>
                </td>
              </tr>
            </tbody>
          </table>
          <h3>Tips from CAPCOM</h3>
          <ul className="tips-list">
            {[
              <>
                Stuck? Press <b>Hint</b>. Jo always has a suggestion and a button that helps.
              </>,
              <>Time stops for emergencies and decisions, so you always have time to think.</>,
              <>Open the Power panel before sunset and check that the battery will last the night.</>,
              <>Every machine has a catch. Read it before you build!</>,
              <>A day lasts about a minute and a half at 1×. Use 2× and 4× when things are calm.</>,
            ].map((tip, i) => (
              <li key={i}>
                <IconCapcom size={18} />
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </Modal>
  );
}

export const LIBRARY = [
  {
    topic: "Life support",
    title: "Water becomes air",
    text: "Electricity can split water (H₂O) into hydrogen and oxygen. The International Space Station makes breathing oxygen this way, so water and air are linked.",
    source: "NASA · Life support (ECLSS)",
    url: "https://www.nasa.gov/reference/environmental-control-and-life-support-systems-eclss/",
  },
  {
    topic: "Life support",
    title: "Recycling almost every drop",
    text: "In 2023 the ISS reached about 98% water recovery: sweat, breath moisture and urine are cleaned into drinking water.",
    source: "NASA · Water recovery milestone",
    url: "https://www.nasa.gov/missions/station/iss-research/nasa-achieves-water-recovery-milestone-on-international-space-station/",
  },
  {
    topic: "The Moon",
    title: "Ice in eternal shadow",
    text: "Some craters near the Moon's poles never see sunlight and stay colder than −200 °C. In 2009 NASA's LCROSS impact found water in one of them.",
    source: "NASA Science · LCROSS",
    url: "https://science.nasa.gov/mission/lcross/",
  },
  {
    topic: "The Moon",
    title: "Long days, long nights",
    text: "A full day–night cycle on the Moon takes about 29.5 Earth days. Without air to hold heat, the surface swings from scorching to far below freezing.",
    source: "NASA Science · Moon facts",
    url: "https://science.nasa.gov/moon/facts/",
  },
  {
    topic: "The Moon",
    title: "Why the south pole?",
    text: "Artemis plans to land near the lunar south pole: high ridges get long stretches of sunlight for power, and the dark craters nearby hold ice.",
    source: "NASA · Artemis III",
    url: "https://www.nasa.gov/missions/artemis/artemis-iii/",
  },
  {
    topic: "Radiation",
    title: "No air, no shield",
    text: "Earth's atmosphere and magnetic field block most space radiation. China's Chang'e-4 lander measured about 1.4 mSv a day on the Moon's surface, more than twice the dose on the ISS.",
    source: "NASA · Space radiation",
    url: "https://www.nasa.gov/hrp/radiation/",
  },
  {
    topic: "Radiation",
    title: "Building a storm shelter",
    text: "If a solar storm hits during an Artemis flight, the crew builds a shelter inside Orion from bags of food, water and supplies. Dense stuff makes a good shield.",
    source: "NASA · Orion radiation protection",
    url: "https://www.nasa.gov/missions/artemis/orion/scientists-and-engineers-evaluate-orion-radiation-protection-plan/",
  },
  {
    topic: "Food",
    title: "Gardens in space",
    text: "The Veggie garden on the ISS has grown lettuce, cabbage and zinnias under LED lights. Plants also make a little oxygen.",
    source: "NASA Science · Veggie",
    url: "https://science.nasa.gov/mission/veggie/",
  },
  {
    topic: "Mars",
    title: "Weaker sunlight, dusty panels",
    text: "Mars is about 1.5 times farther from the Sun than Earth, so sunlight there is roughly 43% as strong. NASA's InSight lander shut down in 2022 when dust covered its solar panels.",
    source: "NASA Science · InSight",
    url: "https://science.nasa.gov/mission/insight/",
  },
  {
    topic: "Mars",
    title: "Making oxygen from Mars air",
    text: "MOXIE, on the Perseverance rover, split carbon dioxide from the Martian air and made 122 grams of oxygen between 2021 and 2023.",
    source: "NASA · MOXIE",
    url: "https://www.nasa.gov/solar-system/nasas-oxygen-generating-experiment-moxie-completes-mars-mission/",
  },
  {
    topic: "Power",
    title: "Nuclear power for the night",
    text: "NASA's Fission Surface Power project is designing a small reactor (around 40 kW) that could run for ten years without sunlight.",
    source: "NASA · Fission Surface Power",
    url: "https://www.nasa.gov/centers-and-facilities/glenn/nasas-fission-surface-power-project-energizes-lunar-exploration/",
  },
];

function Library({ close }: { close: () => void }) {
  return (
    <Modal title="Science library" onClose={close} wide icon={<BookOpen size={20} />}>
      <p className="muted">The real science behind every mission. Links open NASA pages in a new tab.</p>
      <div className="library">
        {LIBRARY.map((c) => (
          <article key={c.title}>
            <span className="eyebrow">{c.topic}</span>
            <h3>{c.title}</h3>
            <p>{c.text}</p>
            <a href={c.url} target="_blank" rel="noreferrer">
              {c.source} <ExternalLink size={13} />
            </a>
          </article>
        ))}
        <article className="model-note">
          <span className="eyebrow">How the trainer simplifies</span>
          <h3>A model you can learn from</h3>
          <p>
            Crew needs (0.84 kg of oxygen, about 3 L of water and 3 meals per person per day) and radiation levels are based on real figures. Days are sped up to about a minute and a half, distances are shrunk, and machine outputs are rounded so cause and effect are easy to see. Don't plan a real mission with these numbers!
          </p>
        </article>
      </div>
    </Modal>
  );
}

const STANDARDS = [
  ["MS-ETS1-1", "Define the criteria and constraints of a design problem (goals, materials, power)."],
  ["MS-ETS1-2", "Evaluate competing design solutions (solar or nuclear, shelter or shielding)."],
  ["MS-ETS1-3", "Analyze test data to improve a design (the debrief charts, retries for stars)."],
  ["HS-ETS1-3", "Evaluate a solution based on prioritized criteria and trade-offs (safety vs. productivity)."],
  ["MS-ESS1-3", "Compare properties of solar system bodies (sunlight, day length and environment on the Moon and Mars)."],
  ["MS-LS1-6", "Photosynthesis and the cycling of matter (the greenhouse turns light, water and CO₂ into food and oxygen)."],
];
const QUESTIONS: Record<string, string> = {
  "first-light": "Why does a solar-powered outpost need batteries? What would change during a two-week lunar night?",
  "ice-hunters": "Why does making oxygen use up water? How does recycling change how much ice the crew needs?",
  "green-thumb": "What did you give up when the grow lights stayed on High at night? What else could you have done?",
  "solar-storm": "Shelter or shielding: which did you choose and why? What did sheltering cost the outpost?",
  "red-planet": "Why do solar arrays struggle on Mars? Why might NASA want nuclear power there?",
  "mars-colony": "What does 'self-sufficient' mean? Which system was hardest to balance, and why?",
};

function Teachers({ close }: { close: () => void }) {
  return (
    <Modal title="For teachers" onClose={close} wide icon={<GraduationCap size={20} />}>
      <div className="teachers">
        <p>
          <b>ASTRA</b> is a free browser game for ages 9–14 (and curious grown-ups). Each mission takes about 10–20 minutes and builds one engineering trade-off at a time: power and storage, water and oxygen, food and energy, radiation shielding, and the different conditions on Mars. No login, no downloads, works on tablets.
        </p>
        <h3>Missions and learning goals</h3>
        <table className="mission-table">
          <thead>
            <tr>
              <th>Mission</th>
              <th>Learning goal</th>
              <th>Discussion question</th>
            </tr>
          </thead>
          <tbody>
            {CAMPAIGN.map((m) => (
              <tr key={m.id}>
                <td>
                  <b>
                    {m.number}. {m.title}
                  </b>
                  <small>{m.planet === "moon" ? "Moon" : "Mars"} · ~{m.minutes} min</small>
                </td>
                <td>{m.objective}</td>
                <td>{QUESTIONS[m.id]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <h3>Standards connections (NGSS)</h3>
        <ul className="standards">
          {STANDARDS.map(([code, text]) => (
            <li key={code}>
              <b>{code}</b> {text}
            </li>
          ))}
        </ul>
        <h3>Classroom tips</h3>
        <ul>
          <li>Play in pairs: one student is commander, the other is CAPCOM who reads the Power panel aloud. Swap each mission.</li>
          <li>Pause at sunset and ask the class to predict: will the battery last the night? Then press play and check.</li>
          <li>Use the debrief chart: find the moment a resource started falling and explain why.</li>
          <li>Turn on "Read CAPCOM aloud" in Settings for younger readers, and "Unlock every mission" to jump to a topic.</li>
        </ul>
      </div>
    </Modal>
  );
}

function Credits({ close }: { close: () => void }) {
  return (
    <Modal title="About ASTRA" onClose={close} icon={<Logo size={22} />}>
      <div className="about">
        <p>
          <b>ASTRA: Junior Astronaut Mission Trainer</b> was made for the NASA Space Apps Challenge 2026 challenge "Build a Junior Astronaut Mission Trainer". It is an independent educational project and is not a NASA product or endorsed by NASA.
        </p>
        <p>All 3D models, terrain, icons and sounds are original and generated in code. No NASA logos or images are used.</p>
        <p>Built with React, TypeScript, Three.js, Zustand, Vite, Lucide icons and the Lexend typeface (designed to make reading easier).</p>
        <button className="btn secondary" onClick={() => useUI.getState().setModal("library")}>
          <BookOpen size={17} /> Science sources
        </button>
      </div>
    </Modal>
  );
}

export function useSettingsClasses() {
  return useUI(useShallow((s) => ({ big: s.settings.bigText, motion: s.settings.motion })));
}
