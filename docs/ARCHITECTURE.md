# Architecture

A static React + TypeScript + Three.js app built with Vite. No backend; progress and settings are saved in `localStorage`.

## Layers

```
sim (pure)  →  state (Zustand)  →  scene (Three.js) + ui (React)
```

- **`src/sim`** is plain TypeScript with no React, DOM, `Date` or `Math.random`. Same inputs, same outputs.
  - `core.ts`: `flows(state, dt)` computes every power and resource flow for the next step. Power goes to the most important systems first when there is not enough (habitat, oxygen, shelter, recycler, greenhouse, drill, lab, rover charger). The engine applies it; the HUD, forecasts and advisor read it, so the numbers on screen are the numbers in the simulation.
  - `engine.ts`: `createState(missionId, seed)`, `step(state, dt)` (mutating, used in fixed 0.05 h steps), `advance` (pure wrapper), and `act(state, action)` for player decisions with friendly refusal messages. Random events for the final mission and free play come from a seeded generator and are spaced out.
  - `missions.ts`: all campaign content as data: start state, available modules, hazards, script, goals, star rules, briefing, debrief, fact and quiz.
  - `goals.ts`, `advisor.ts`, `rover.ts`, `world.ts`, `cards.ts`, `modules.ts`, `planets.ts`.
- **`src/state`**
  - `game.ts`: the frame loop. Each animation frame converts real time to training time (3.5 s per hour at 1×, forced to 1× while steering by hand), moves the rover, then advances the simulation in fixed steps. New feed lines become toasts, CAPCOM messages or pausing alerts.
  - `ui.ts`: screens, panels, selection, camera commands, settings and progress (persisted).
  - `tutorial.ts`: tutorial steps as data. Each step holds or releases the clock, sets the speed, and finishes on a predicate over the game and UI state.
- **`src/scene`**: all art is procedural (no model or texture files).
  - `World.tsx` builds the scene once per mission and updates it from the store inside its own animation loop (it never re-renders React). Modules are reconciled by id. It renders through an HDR `EffectComposer` (multisampled half-float target, bloom, ACES tone mapping) with three quality levels; on *Auto* it steps down (resolution, then bloom, then shadows) if frames are slow. The shadow camera follows the view and grows as you zoom out.
  - `terrain.ts`: the ground mesh (heights from `sim/world.ts`, so the rover drives on what you see), coloured by slope, craters, rays and dunes; a tiling detail colour and normal map blended at two scales so it never looks repeated; distant hills; instanced boulders and pebbles; ice in the crater; tyre tracks (a ring buffer of quads drawn with multiply blending).
  - `sky.ts`: a shader sky dome (Milky Way on the Moon; Martian day, dusk halo, night and dust), a star field, the Sun, Earth, Phobos and Deimos, and a small environment map for reflections.
  - `models.ts` and `kit.ts`: modules, rover, astronauts, lander, pads and dock built from primitives. `kit.finalize()` merges each model's static parts into one mesh per material, so a detailed module costs a handful of draw calls; moving parts are marked with `keep()`.
  - `effects.ts`: site beacons, dust, sparks, meteor strikes and storm streaks.
  - `Globe.tsx`: the title-screen planet. Its colour and normal maps are painted once on the GPU (craters, maria, ice caps), so it stays sharp without slowing the page.
  - `anchors.ts` publishes screen positions of world objects so HTML labels and the tutorial spotlight can follow them, plus where the camera is looking (for the map) and a hook to move it.
- **`src/ui`**: HUD, panels, overlays, the tutorial coach, screens, dialogs and the minimap (a shaded relief drawn once per planet, with live markers on top). Components subscribe to narrow, rounded slices of the store.

## Tests

`npm test` runs Vitest over `src/sim`:

- `engine.test.ts`: power, day/night, priorities, life support chemistry, radiation and shielding, actions and refusals, cards, goals, random events, determinism.
- `missions.test.ts`: data integrity and a scripted player that wins every mission, plus failing strategies that lose.
- `rover.test.ts`: driving, collisions, battery drain, autopilot routes to every site.
- `advisor.test.ts`: forecasts and advice.
