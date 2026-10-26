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

- **World:** features beyond the campus scale by S = 1.45 (sites, craters, mesa, dunes, rocks); `WORLD` 150 to 270
  (a 540 m square). Rover speed x1.25 and drain / 1.45 keep trip battery the same and trip time about +16%.
- **Campus:** data-driven (`src/sim/base.ts`): rectangular buildings in world metres (origin at the old home's
  centre, x east, z south, y up), rooms, doors (portals), corridors, floors and stairs, stage gating, module
  bindings, collision segments, nav graph. The v6 round home stays as **Hab-1** (crew residence, building B).
- **Layout:** the pad field and Hab-1 stay in the middle (pads unchanged except the ice pad and the far reactor
  pad, which move outward). A pressurised corridor loop runs round the pad field at about 36 m; buildings hang off
  it. Hab-1's airlock tunnel becomes a pressurised link (T0) south to the loop. EVA moves to the EVA complex (H),
  which has a yard door (into the pad field) and a surface door (out to the world). The dock moves into the rover
  garage (I, unpressurised hangar). The reactor pad moves to a remote compound.
- **Floors:** campus floors at y = 0.5 (Hab-1's ground floor level), so the link needs no ramp.
- **Staging:** stage 0 (missions 1-2), 1 (missions 3-4), 2 (Mars missions and free play). Unbuilt buildings show
  as foundations or scaffolding with locked doors.
- **Bindings:** campus buildings are support infrastructure; ones bound to modules (life support, greenhouse,
  power, shelter) show those modules' real state. The storm shelter (Hab-1 core and K) is usable only when a
  Shelter module is built.
- **Lighting:** a campus version of the interior shader with a room-id map texture (no leaks through walls),
  analytic lamps limited to the active sector, distance-to-wall AO.
- **Saves:** version 2; version 1 saves migrate (rovers return to the garage, routes cleared).

## 3. Phases and status

- [x] A. First-person fixes: horizontal FOV setting (85 deg default, 70-100; vertical worked out per aspect, capped at
  95 deg on tall screens), pitch +-83 deg, E needs a clear line of sight (`home.ts:lineClear`; comms console moved
  to the reachable desk), re-entry checkpoint per mission run, blur listener cleanup, long-frame and line-of-sight
  tests (123 tests).
- [ ] C. World scale, campus data, collision (walker and rovers), garage dock, EVA complex, terrain plateau, tests.
- [ ] B. Benchmark slice: Hab-1 link, south concourse, EVA complex, command HQ at final quality.
- [ ] D. Remaining buildings and corridors.
- [ ] E. Interactions tied to the sim (12+), crew walking, tour and wayfinding, sound.
- [ ] F. Performance, QA screenshots, docs, report.
