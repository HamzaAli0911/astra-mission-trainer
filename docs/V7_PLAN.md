# ASTRA v7: audit, plan and status

Working document for the v7 overhaul (brief: `~/Downloads/ASTRA_v7_MEGA_OVERHAUL_PROMPT.md`). It records what the
v6 code does today, the decisions taken, and what is done. The final report is written from it.

## 1. Audit of v6 (code-grounded)

**Works well (keep):**
- Pure, deterministic sim (`src/sim`) with one source of truth for flows (`core.ts:flows`); 120 tests.
- Walking collision: a 0.3 m circle against wall/furniture segments, moved in 8 cm substeps, so it cannot tunnel
  at large `dt` (`home.ts:walk`, `resolve`). Doors are segments that stop blocking once open (> 0.8).
- One floor plan drives model, collision and tests for the round home (`home.ts`: `HOME`, `ROOMS`, `BLOCKS`, ...).
- Interior shader with per-room analytic lamps and plan-derived AO: no light leaks (`interior/lighting.ts`).
- Walk input decoupled from sim speed; pointer lock with drag fallback; touch stick; Esc frees the mouse first.

**Restrictive (proven in code):**
- The world is 300 m square (`world.ts: WORLD = 150`), flat only within 27 m (`FLAT`), with build pads in rings
  out to 22.5 m and sites 87 to 175 m out. A 140 to 180 m campus cannot fit without moving sites.
- The walker only knows one round building: `Where = Level | "stair"`, walls from `home.ts:walls(level)`.
- Outside collision uses circles only (`outside.ts`, `rover.ts:canOccupy`): fine for round modules, wrong for
  rectangular buildings and doorways.
- Interaction is distance plus angle (`walk.ts: REACH 1.5, AIM 0.6`) with no occlusion: it can reach through a
  wall.
- The v6 home's core storm shelter exists whether or not a Shelter module is built (a free second shelter).
- The rover dock sits in the open south of the home (`DOCK = (0, 14)`); no garage.
- Saves are version 1 with positions in the v6 map; changing the map needs a migration.

**Visual hypotheses to confirm with screenshots:**
- FOV setting is vertical (70 deg), about 102 deg horizontal at 16:9: wide, slightly fish-eyed.
- The base reads as one pod and scattered machines from eye level outdoors.

## 2. Decisions

- **World:** `WORLD` 150 to 270 (a 540 m square). The campus sits south of Hab-1, so the sites were placed afresh
  round the rover garage's door rather than scaled: every trip is about 1.25 times its v6 length, and the rover is
  1.25 times faster with drain per metre divided by 1.25, so trip time and battery stay close to v6 (measured: Moon ice
  round trip 44% battery and 5.7 h, was about 40% and 5.3 h). Landforms move with their sites (the ice crater, the
  Martian mesa and dunes, the lunar skylight pit). Craters (70) and rocks (1100) are regenerated around the campus.
- **Campus:** data-driven (`src/sim/base.ts`): rectangular buildings in world metres (origin at Hab-1's centre, x east,
  z south, y up), rooms (cells), openings (portals: doors, archways, airlock doors, the garage's vehicle door), floors
  and the HQ stair, stage gating, module bindings, outdoor solids, porches. The v6 round home stays as **Hab-1**
  (building B). One edge list per room (`cellEdges`) drives both the walls you bump into and the 3D walls.
- **Layout:** Hab-1 and its pad field stay in the middle. A pressurised link runs south from Hab-1's old airlock to the
  command HQ (A, 28 x 22 m, double-height hall and mezzanine). Two spines run west and east from the HQ; the west wing
  has life support (C), the clinic (F), the storm shelter (K), the greenhouse (E) and logistics (J); the east wing the
  yard lock, the science lab (D), the rover garage (I, an unpressurised hangar with both rovers' bays), the EVA
  complex (H: suit room, dust lock, airlock) and engineering (G). The power compound (L) is outdoors to the north-east,
  the reactor compound far to the east. 31 campus rooms plus Hab-1's 17.
- **Floors:** campus floors at y = 0.5 (Hab-1's ground floor level), so the link needs no ramp; the HQ mezzanine is
  floor 2 at 4.8 m, reached by an open stair in the hall.
- **Airlocks:** a pure, tested state machine (`src/sim/airlock.ts`): the inner door opens only at full pressure, the
  outer only at vacuum, never both, never while cycling. You suit up at a rack beside the airlock (EVA complex or yard
  lock), pump down from the chamber's panel, walk out through the open door onto a porch (the walk switches to outside
  there), and come back the same way. Hab-1's suit room keeps the spare suits.
- **Staging:** stage 0 (missions 1-2), 1 (missions 3-4), 2 (Mars missions and free play). Unbuilt buildings show
  as foundations with scaffolding; their doors stay locked.
- **Bindings:** campus buildings are support infrastructure; ones bound to modules (life support, greenhouse,
  power, shelter, lab) are to show those modules' real state (phase E).
- **Lighting:** every campus vertex carries its room's index (a vertex attribute), so each surface adds up only its own
  room's ceiling lamps and darkens towards its own walls; lamps and room boxes live in one float texture. No light
  leaks through walls; no per-pixel lookup.
- **Saves:** version 2; version 1 saves migrate (both rovers back in their garage bays, the crew rover docked with its
  load, drives dropped).

## 3. Phases and status

- [x] A. First-person fixes: horizontal FOV setting (85 deg default, 70-100; vertical worked out per aspect, capped at
  95 deg on tall screens), pitch +-83 deg, E needs a clear line of sight (`home.ts:lineClear`; comms console moved
  to the reachable desk), re-entry checkpoint per mission run, blur listener cleanup, long-frame and line-of-sight
  tests (123 tests).
- [x] C. World and campus foundations: 540 m world with sites re-placed round the garage (trips measured), graded
  plateau, campus data and wall generation, walker collision over the whole campus (wall grid), HQ stair and
  mezzanine, rover and suited-walker collision against buildings (rectangles, doorway notches, porches), garage
  bays, interlocked airlocks with walk-through outer doors, minimap campus, save v2 migration, proxy 3D campus with
  per-room lighting. Tests: 142 (campus plan, routes, stairs, airlock interlock, outdoor collision, migration).
- [x] B. Benchmark slice (link, HQ, EVA complex, spines): furniture as data and collision (`FURNITURE`), built with
  the home's kit and re-lit for the campus (`campus/bake.ts`, merged by finish and material); windows cut through
  walls inside and out with reveals, frames and glass (`CAMPUS_WINDOWS`), sunlight only through a room's own windows
  (exact ray test in the shader, so no leaks at thin corners); regolith berms (also outdoor collision), airlock
  porches, the HQ's dish, mast and air handlers, wall ribs and cornices, window glow panes; live screens from the
  mission (16 m display wall, 14 consoles, situation table, briefing, comms, lobby map, suit check, airlock gauge);
  airlock beacon and door lights from the real interlock state; Alex's suit leaves its rack during an EVA; the
  commander works at the flight director's desk (shown only there); sector culling indoors (your building and its
  doorway neighbours). Phase F to-dos found here: one texture per console's screens (44 screens = 44 draws), terrain
  in chunks (the 600-segment mesh is drawn whole), measured comparison against v6.
- [ ] D. Remaining buildings and corridors.
- [ ] E. Interactions tied to the sim (12+), crew walking, tour and wayfinding, sound.
- [ ] F. Performance, QA screenshots, docs, report.
