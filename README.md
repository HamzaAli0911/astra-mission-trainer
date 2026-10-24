# ASTRA · Junior Astronaut Mission Trainer

**Keep your crew alive on another world.**

**Play it in your browser: https://hamzaali0911.github.io/astra-mission-trainer/**

ASTRA is a free browser game for the NASA Space Apps Challenge 2026 challenge [Build a Junior Astronaut Mission Trainer](https://www.spaceappschallenge.org/2026/challenges/build-a-junior-astronaut-mission-trainer/). Players aged about 9–14 run an outpost on the Moon, then Mars, and balance the things that decide whether a mission succeeds or fails: **power, life support (air and water), food and radiation shielding**.

It is an independent educational project, not a NASA product, and is not endorsed by NASA.

## How it plays

A campaign of six training missions (about 10–20 minutes each). Each one teaches one trade-off by making you live with it, then debriefs you with a chart of what happened, the real science behind it and a quick check question.

| # | Mission | You learn |
|---|---------|-----------|
| 1 | **First Light** (Moon) | Solar power only works in daylight; batteries carry you through the night; electricity and water make oxygen. Fully guided tutorial. |
| 2 | **Ice Hunters** (Moon) | Making oxygen uses up water. Drive the rover into a crater that never sees the Sun to mine ice; recycle water. Guided rover tutorial. |
| 3 | **Green Thumb** (Moon) | Grow lights compete with life support for stored power at night. A cargo lander makes you choose one crate. |
| 4 | **Solar Storm** (Moon) | Two radiation storms. Bring the rover crew home, then choose a storm shelter, regolith shielding or both. |
| 5 | **Red Planet** (Mars) | 43% of the Moon's sunlight, oxygen made from CO₂ (like NASA's MOXIE) and a dust storm. Solar or nuclear? |
| 6 | **Mars Colony** (Mars) | Everything at once, with random events: make oxygen, water and food faster than the crew uses them. |

Plus **Free Play** on the Moon and Mars with random events.

The core loop:

- **Build** modules on pads around the habitat: solar arrays, batteries, an oxygen maker, a water recycler, greenhouses, an ice drill, a storm shelter, a lab and a fission reactor. Every card says what the module does and **its catch**.
- **Power** panel: what you make vs. what you use, a battery forecast ("at this rate the battery runs out at 03:40"), and a switch for every machine. Turning things off saves power, but they stop working.
- **Rover**: send it to sites (or drive with WASD/arrows or the on-screen pad) to bring back ice, regolith for building, and science samples. It drains its battery (faster in the cold, dark crater) and recharges on the dock from the outpost's power.
- **Shelter**: during solar storms, move the crew into the shelter. Research and building pause while they hide.
- **Decisions**: event cards where every option costs something (cargo lander, leaks, a sick crew member, meteor showers, dust devils).
- **CAPCOM** (Jo, at Mission Control) explains, warns before trouble and offers one button that helps. Messages can be read aloud.

Every supply shows how long it will last ("▼ 2.1 days"), so cause and effect is visible before it becomes an emergency. Time pauses for emergencies and decisions, so players always have time to think.

Missions **save themselves** every few seconds and when the tab is closed. After a refresh, the title screen offers **Resume** to carry on where you left off.

## What you see

Everything is drawn in real time in the browser, with no image or model files: every model, texture and sky is made by code.

- A **300 m × 300 m** area around the outpost on each world, ringed by distant hills: an icy crater that never sees the Sun, boulder fields, smaller craters, a lava-tube skylight (Moon), dunes and a layered mesa (Mars), and the lander that brought the crew.
- **Moon**: a black sky with the Milky Way, a low Sun that casts long shadows, Earth hanging over the horizon, no air (so no haze and no blowing dust), and a crater floor that never sees the Sun, with frost on its rocks. **Mars**: a butterscotch sky, blue sunsets, Phobos and Deimos at night, rippled dunes, a layered mesa and dust storms that dim the Sun. Solar storms don't tint the sky (radiation is invisible); the screen edge pulses instead.
- Detailed, physically shaded modules: an inflatable habitat (quilted shell, cupola, airlock with a pressure door, radiators, a dish) that gets buried under regolith sandbags as you build its shield; tall Sun-tracking solar masts on the Moon and dusty tilting tables on Mars; a battery bank with cooling fans; ice-water electrolysis on the Moon and a MOXIE-style CO₂ unit on Mars; a water recycler; a greenhouse with lettuce and staked tomato vines under LED bars; an ice drill with a turning auger; a sandbagged storm shelter; a lab with a dish and weather mast; and a fission reactor buried in a berm under its radiator cone (nothing nuclear glows). A six-wheeled pressurised rover with suspension that follows the ground, chevron tyres, suitports and an arm; jointed astronauts who lope on the Moon and walk on Mars; welding sparks while things are built; power cables that pulse in the direction energy flows.
- Three camera views. **Overview** looks over the outpost. **Follow** rides behind the rover and turns with it (drag to watch from any side). **Cockpit** puts you in the driver's seat, with live screens for speed, battery, a radar of nearby sites and your cargo. Leaving the dock switches to Follow by itself.
- A **map** in the corner shows the whole area. Click a site on it to plan a rover trip, or anywhere else to look there.
- **Settings → Graphics**: *Auto* adapts to the device (it lowers detail if the game runs slowly), *High* adds glow and soft shadows, *Ultra* adds ambient occlusion, sharper shadows, a finer ground mesh and more pebbles and never steps down on its own (for fast computers), *Low* is for older computers.

## Run it

Needs Node.js 20 or newer.

```bash
npm install
npm run dev        # http://127.0.0.1:5173
npm test           # simulation, mission, rover and advisor tests
npm run build      # type check + production build in dist/
npm run preview    # serve dist/ on http://127.0.0.1:5175
```

The built `dist/` folder is a static site: host it anywhere (GitHub Pages, Netlify, a school server). It needs no backend, account or network access; fonts are bundled. Opening `dist/index.html` straight from disk does not work (browsers block module scripts on `file://`), so serve it.

Add `?debug` to the URL to expose the game stores on `window.__astra` for automated testing.

## Controls

| Action | Mouse / touch | Keyboard |
|---|---|---|
| Look around | drag; scroll or pinch to zoom; right-drag to slide | |
| Build · Power · Rover · Shelter | dock buttons | B · P · R · H |
| Drive the rover | pick a site and press Go, click the ground, or the on-screen pad | W A S D / arrows |
| Pause · speed | top-right buttons | Space · 1 2 3 |
| Camera on base · rover | Camera button in the Rover panel | C · F |
| Look somewhere else · plan a trip | click the map (top right) | |
| Camera view: Overview · Follow · Cockpit | View buttons (bottom right); drag to look around | V |
| Restart the mission from the start | ↺ button next to the menu (asks first) | |
| End the tutorial | **Skip tutorial** on the CAPCOM card | |
| Close · menu | | Esc |

## For teachers and judges

- **Go to Mars** (title screen) starts the first Mars mission straight away; it is always unlocked.
- **Settings → Unlock every mission** opens the whole campaign immediately.
- **For teachers** (title screen) lists learning goals, NGSS connections and discussion questions for each mission.
- **Science library** links every fact to its NASA source.
- See [docs/JUDGES.md](docs/JUDGES.md) for a 5-minute demo and how ASTRA answers the challenge, and [docs/SCIENCE.md](docs/SCIENCE.md) for the numbers and what is simplified.

## Project layout

```
src/sim/      pure, deterministic simulation (no React, no DOM), with tests
  engine.ts     createState · step · act · random events
  core.ts       power allocation and resource flows (single source of truth)
  missions.ts   the campaign: goals, stars, hazards, scripts, debriefs, quizzes
  advisor.ts    plain-language advice and forecasts
  rover.ts      driving, collisions, A* autopilot
  world.ts      map: terrain, pads, sites, crater, rocks
src/state/    Zustand stores: game loop, UI, tutorial scripts
src/scene/    Three.js world: procedural models, terrain, sky, effects
src/ui/       HUD, panels, overlays, tutorial coach, screens, dialogs
docs/         judges' guide, science notes, architecture
```

## Accessibility

Lexend typeface (designed for reading ease), large hit targets, keyboard shortcuts, focus outlines, text plus icons (never colour alone), an optional read-aloud voice, larger text and reduced-motion settings, and a touch drive pad.

## License

Original code and procedurally generated assets: MIT (see [LICENSE](LICENSE)). Dependencies keep their own licenses (React, Three.js, Zustand, Lucide, Vite: MIT/ISC; Lexend: SIL OFL 1.1).
