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
  - `game.ts`: the frame loop. Each animation frame converts real time to training time (2.5 s per hour at 1×, forced to 1× while steering by hand), moves the rover, then advances the simulation in fixed steps. New feed lines become toasts, CAPCOM messages or pausing alerts.
  - `ui.ts`: screens, panels, selection, camera commands, settings and progress (persisted).
  - `tutorial.ts`: tutorial steps as data. Each step holds or releases the clock, sets the speed, and finishes on a predicate over the game and UI state.
- **`src/scene`**: `World.tsx` builds the scene once per mission and updates it from the store inside its own animation loop (it never re-renders React). Modules are reconciled by id. `anchors.ts` publishes screen positions of world objects so HTML labels and the tutorial spotlight can follow them.
- **`src/ui`**: HUD, panels, overlays, the tutorial coach, screens and dialogs. Components subscribe to narrow, rounded slices of the store.

## Tests

`npm test` runs Vitest over `src/sim`:

- `engine.test.ts`: power, day/night, priorities, life support chemistry, radiation and shielding, actions and refusals, cards, goals, random events, determinism.
- `missions.test.ts`: data integrity and a scripted player that wins every mission, plus failing strategies that lose.
- `rover.test.ts`: driving, collisions, battery drain, autopilot routes to every site.
- `advisor.test.ts`: forecasts and advice.

`src/sim/balance.test.ts` holds extra balance probes that print outcomes; run them with `PROBE=1 npm test`.
