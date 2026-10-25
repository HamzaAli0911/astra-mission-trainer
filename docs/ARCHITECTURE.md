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
  - `home.ts`: the walkable home's floor plan (rooms, doors, windows, the stair, every piece of furniture as a box) and walking on it: `walls()`, `walk()` (collision, sliding, the stair) and `stride()` (pace, easing, step length from gravity). The 3D model, the collision and the tests all read this one plan. See [HABITAT.md](HABITAT.md).
  - `interior.ts`: `interiorState(g)`, what the inside shows for a game state (lights, alarms, faults, stores, plants, storms), and `crewSpots(g)`, the crew's daily routine.
  - `inspect.ts`: the 14 things you can look at closely inside, each with live rows from the game state and a fact from `library.ts` (the science library, shared with the in-game library).
  - `outside.ts`: walking outside in a suit: ground following, collision with buildings, the lander, the rover and boulders, a 25° slope limit, the map edge.
  - EVA rules live in the engine: the `"eva"` action, the walker's place `"eva"` (full outdoor dose), the suit timer and its warnings.
  - The science rover (`GameState.scout`) is a second `Rover`, with its own top speed and RTG power (no drain); `rover.ts` drives and routes both, each treating the other as an obstacle (`Block`). The engine's `"study"` action and step handle its studies; the store (`state/game.ts`) keeps which rover you drive (`vehicle`) and an autopilot route for each.
- **`src/state`**
  - `game.ts`: the frame loop. Each animation frame converts real time to training time (3.5 s per hour at 1×, forced to 1× while steering by hand), moves the rover, then advances the simulation in fixed steps. New feed lines become toasts, CAPCOM messages or pausing alerts.
  - `ui.ts`: screens, panels, selection, camera commands, settings and progress (persisted).
  - `save.ts`: autosave of the mission in progress (every 5 s and when the tab is hidden or closed), cleared when the mission ends; the title screen offers to resume it.
  - `tutorial.ts`: tutorial steps as data. Each step holds or releases the clock, sets the speed, and finishes on a predicate over the game and UI state.
  - `walk.ts`: the walk view's state (room, prompt, inspect card, airlock, tour, whether the inside is ready), the walker's position, and entering and leaving the walk (time runs at 1×; the view and speed you had come back).
- **`src/scene`**: all art is procedural (no model or texture files).
  - `bake.ts`, `bake.worker.ts`, `prebake.ts`: the slow, pure work for each planet (ground and hill meshes, the ground's detail textures, Earth's surface, the minimap relief) runs in a web worker as soon as the title screen loads, and is kept for the session. Without worker support it runs on the main thread instead.
  - `World.tsx` builds the scene once per mission and updates it from the store inside its own animation loop (it never re-renders React). Modules are reconciled by id. It builds in short slices with pauses between them, behind a "Landing…" screen, then compiles shaders (`compileAsync`) and draws three warm-up frames (no shadows or glow, then shadows, then glow) so no single step blocks the page for long. It renders through an HDR `EffectComposer` (multisampled half-float target, restrained bloom, ACES tone mapping, then a per-planet colour grade from `grade.ts`) with four quality levels and a pixel budget (High: at most 1.5× resolution and about 3.2 million pixels; Ultra: at most 2× and about 4.2 million, plus GTAO ambient occlusion computed at half resolution, SMAA, 4096² shadows, a finer ground mesh and more pebbles). On *Auto* it steps down (resolution, then bloom, then shadows) if frames are slow; *Ultra* never steps down. The shadow camera is snapped to whole shadow-map texels so shadows don't shimmer as the view moves. Each rover wheel is lifted or dropped to meet the ground under it. The shadow camera follows the view and grows as you zoom out. The camera rig has three views (orbit, chase, cockpit) and glides between them; the chase camera keeps the angle you drag it to, relative to the rover's heading, and lifts over buildings.
  - Robustness: if the browser takes the WebGL context away (a GPU reset, laptop sleep), `World` shows "Restarting the 3D view…" and rebuilds the scene when the context comes back. Shaders are compiled for the composer's off-screen buffer (not the screen), so the first real frame never recompiles them.
  - `interior/`: the inside of the home, built from the plan in slices after the outpost appears, then compiled in the background. `structure.ts` (lining, floors, partitions, doors, stair, lamps), `furniture.ts` and `dressing.ts` (every room's equipment, signs, screens, plants), `crew.ts` (the crew in four poses), `parts.ts` (shared parts and one label atlas), `mesher.ts`, and `lighting.ts`: one shader patch for every surface inside, with per-room analytic lamps (no light leaks through walls or floors), the sun's shadow through the windows, ambient occlusion computed from the plan, and the day, dim and emergency tints. Static parts are merged by finish with per-vertex colours; food and plants are instanced; a depth pre-pass shades each pixel once. `index.ts` applies `interiorState` every frame (only what changed) and redraws the screens a few times a second.
  - `walk.ts`: the first-person controller: pointer lock (with a drag fallback), keys and touch, doors that slide open, inspect points and actions (suit up, airlock, shelter; outside, repair and clean), the airlock cycle, footsteps and alarms, the eye position with head bob.
  - `drive.ts`: wheels on rough ground: `seat()` (where a wheel's centre sits on the ground and on any rock under its tread, from the rock tops `terrain.ts` records as it places them), a sprung `Wheel`, and tyres that flatten and bulge where they meet the ground (a vertex-shader patch, one material per wheel sharing one program). The crew rover's body rides on its six sprung wheels; the science rover's on its rocker-bogie.
  - `models/scout.ts`: the science rover (rocker-bogie suspension with a differential bar, steering corner wheels, a mast camera that pans and tilts, a five-tool arm, an RTG), with `poseScout()` (rocker-bogie kinematics from the six wheel heights, tested as `solveSide`) and `poseArm()`.
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
- **`src/ui`**: `walk.tsx` is the walk view's HUD (room name, prompts, inspect cards, the tour, the suit display and compass, the airlock gauge, touch controls). HUD, panels, overlays, the tutorial coach, screens, dialogs and the minimap (a shaded relief drawn once per planet, with live markers on top). Components subscribe to narrow, rounded slices of the store.

## Tests

`npm test` runs Vitest over `src/sim`, `src/state` and the interior builder:

- `engine.test.ts`: power, day/night, priorities, life support chemistry, radiation and shielding, actions and refusals, cards, goals, random events, determinism.
- `missions.test.ts`: data integrity and a scripted player that wins every mission, plus failing strategies that lose.
- `rover.test.ts`: driving, collisions, battery drain, autopilot routes to every site.
- `advisor.test.ts`: forecasts and advice.
- `home.test.ts`: the floor plan: every room reachable with the walker's body, doors, the stair, furniture inside its room and clear of walls and of each other, pace and step length, pads around the bigger home.
- `interior.test.ts`, `inspect.test.ts`: what the inside shows for each mission state, the crew's routine, live inspect numbers.
- `eva.test.ts`, `outside.test.ts`: EVA dose, suit time, repairs on foot at the HUD's cost, refusals; walking outside.
- `src/state/walk.test.ts`: entering and leaving the walk.
- `scout.test.ts`: the science rover: where it parks, its speed and power, not driving through the crew rover, studying sites (once each, through storms, refusals), old saves without it.
- `src/scene/interior/interior.test.ts`: the 3D inside against the plan: a wall wherever you bump into one, nothing solid where you can walk, doors big enough, the draw-call budget.

## Quality control

`?debug` also loads `src/dev/qc.ts` as `window.__qc`: review captures from fixed cameras (outdoors, inside every room, every mission state), GPU timings per view and tier, start-up long tasks, an overlap scan of the HUD at any window size, a leak check (walking in and out), the floor-plan image and an automated walk through every room. `tools/qc/shotserver.py` saves what it posts; `tools/qc/compare.py` makes before/after sheets.
