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
  - `save.ts`: autosave of the mission in progress (every 5 s and when the tab is hidden or closed), cleared when the mission ends; the title screen offers to resume it.
  - `tutorial.ts`: tutorial steps as data. Each step holds or releases the clock, sets the speed, and finishes on a predicate over the game and UI state.
- **`src/scene`**: all art is procedural (no model or texture files).
  - `bake.ts`, `bake.worker.ts`, `prebake.ts`: the slow, pure work for each planet (ground and hill meshes, the ground's detail textures, Earth's surface, the minimap relief) runs in a web worker as soon as the title screen loads, and is kept for the session. Without worker support it runs on the main thread instead.
  - `World.tsx` builds the scene once per mission and updates it from the store inside its own animation loop (it never re-renders React). Modules are reconciled by id. It builds in short slices with pauses between them, behind a "Landing…" screen, then compiles shaders (`compileAsync`) and draws three warm-up frames (no shadows or glow, then shadows, then glow) so no single step blocks the page for long. It renders through an HDR `EffectComposer` (multisampled half-float target, restrained bloom, ACES tone mapping, then a per-planet colour grade from `grade.ts`) with four quality levels and a pixel budget (High: at most 1.5× resolution and about 3.2 million pixels; Ultra: at most 2× and about 4.2 million, plus GTAO ambient occlusion computed at half resolution, SMAA, 4096² shadows, a finer ground mesh and more pebbles). On *Auto* it steps down (resolution, then bloom, then shadows) if frames are slow; *Ultra* never steps down. The shadow camera is snapped to whole shadow-map texels so shadows don't shimmer as the view moves. Each rover wheel is lifted or dropped to meet the ground under it. The shadow camera follows the view and grows as you zoom out. The camera rig has three views (orbit, chase, cockpit) and glides between them; the chase camera keeps the angle you drag it to, relative to the rover's heading, and lifts over buildings.
  - Robustness: if the browser takes the WebGL context away (a GPU reset, laptop sleep), `World` shows "Restarting the 3D view…" and rebuilds the scene when the context comes back. Shaders are compiled for the composer's off-screen buffer (not the screen), so the first real frame never recompiles them.
  - `cockpit.ts`: the rover's interior (shown only in the driver's view) and its three dashboard screens, drawn on canvases a few times a second.
  - `terrain.ts`: the ground mesh (heights from `sim/world.ts`, so the rover drives on what you see), coloured by slope, craters, rays and dunes, with triplanar rock relief on slopes and, on Mars, mesa strata and dune ripples in the shader; a tiling detail colour and normal map blended at two scales so it never looks repeated; distant hills; instanced boulders (noise-displaced, with fracture faces and flat bases, part-buried, dusty on top) and pebbles in two sizes; frost-coated rocks in the dark crater; tyre tracks with a chevron tread (a ring buffer of quads drawn with multiply blending).
  - `sky.ts`: a shader sky dome (Milky Way on the Moon; Martian day, dusk halo, night and dust), a star field, the Sun, Earth, Phobos and Deimos, and a small environment map for reflections.
  - `surface.ts`: the shared micro-detail used by most materials: one 512² texture (weave, brushed streaks, grain with scratches, foil crinkle) applied triplanar in object space through `onBeforeCompile`, which varies roughness, adds grime and bump relief (the weave fades before it can alias), and can coat upward faces with dust or frost. All detailed materials share one shader program.
  - `kit.ts`: physically based material presets (paint, brushed metal, fabric, rubber, foil, regolith, clear and tinted glass), primitives and parts (bevelled panels, framed windows, pipes, bolt rings, grilles, struts, contact shadows), and `finalize()`, which merges each model's static parts into one mesh per material so a detailed module costs a handful of draw calls; moving parts are marked with `keep()`.
  - `models.ts` dispatches to `models/`: `habitat.ts` (with the instanced sandbag shield revealed course by course), `power.ts` (solar, battery, reactor), `life.ts` (oxygen, recycler, greenhouse with leaf geometry), `works.ts` (ice drill, storm shelter, lab), `rover.ts` (a lofted cabin with glass patches laid on it), `crew.ts` (jointed astronauts and their Moon/Mars gaits), `site.ts` (lander, pads, dock, survey flag, scaffold) and `common.ts` (shared parts: status lamps, skids, cabinets, solar cells, labels, sandbags).
  - `grade.ts`: the final colour grade (contrast, lift and gain, saturation, vignette) per planet.
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
