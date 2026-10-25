# The Mars home: design notes

The habitat at the centre of the outpost is a two-storey inflatable home you can walk through in first
person, and leave through the airlock to walk outside in a suit. One floor plan, in `src/sim/home.ts`,
drives the 3D model inside and out, the walking collision, the tests and the floor-plan image
(`window.__qc.plan()` with `?debug`), so they cannot drift apart. It works on the Moon too (same home,
lunar gravity and sky).

## References

We studied real places where astronauts and analog crews live, and copied none of them:

- **NASA's Mars Dune Alpha** (CHAPEA, Johnson Space Center, Houston): a 3D-printed one-year home with
  private crew quarters, a galley, a medical station, a gym and a vertical farm. It showed how much
  privacy and exercise space a long mission needs.
- **HI-SEAS** (Hawaii): a two-level dome; the loft-over-common-room arrangement and how a round plan
  divides into rooms.
- **The Mars Desert Research Station** (Utah): a two-storey cylinder with crew rooms upstairs and
  workspaces, the airlock and suit-up area downstairs.
- **The International Space Station**: what the life-support racks look like (oxygen generation, CO2
  removal, water recovery, which now recycles about 98% of the water), crew quarters and the galley.
- **NASA's TransHab**: the inflatable, multi-floor shell on a rigid core.

## Size and shape

| | |
|---|---|
| Shell | about 10.4 m across (radius 5.2 m), near-vertical quilted wall to about 5.9 m, dome to 7.9 m, cupola on top |
| Footprint with the regolith shield | radius 5.8 m (`HABITAT_RADIUS`) |
| Decks | ground floor at 0.5 m, upper floor at 3.35 m |
| Clear height | 2.6 m on both floors |
| Plan | a central core (radius 1.9 m), a ring hall about 1 m wide around it (to 2.95 m), rooms between the hall and the padded wall (2.95 to 4.95 m) |
| Floor area | about 77 m² per floor, about 154 m² in all |
| Doors | 0.9 m wide and 2.05 m tall; they slide apart when you come within 1.25 m |

## Rooms

Bearings are compass degrees (0 north, 90 east, 180 south, where the airlock faces the rover dock).
Areas are between the hall wall and the padded wall.

**Ground floor**

| Room | Where | Area | What's in it |
|---|---|---|---|
| Suit room (dust lock) | 165–205°, closed | 5.5 m² | The airlock's inner hatch; two suit racks with four suits; a bench. Its door keeps Martian dust (with its toxic perchlorates) out of the living space |
| Galley and wardroom | 205–290°, open | 11.7 m² | Table for four, a counter with an oven, a rehydration station and a small sink, a fridge, a food store whose shelves fill and empty with the real food stock; two windows |
| Hygiene | 290–330°, closed | 5.5 m² | Toilet, sink with a mirror, a water-saving shower; not next to the food prep |
| Life support | 330–30°, closed | 8.3 m² | Oxygen plant, CO2 scrubber, water recovery and the water tanks, with status strips, tank gauges and a live screen; the noisiest machines, behind a closed door |
| Lab and workshop | 30–62°, open | 4.4 m² | Bench with a glovebox, microscope and stool, a parts printer; one window |
| Medical bay | 62–95°, open | 4.6 m² | Exam couch, medical cabinet, ultrasound screen; a small window |
| Stairs | 95–165° | | A straight flight along a chord of the ring |
| Storm shelter | the core | 7.1 m² inside | Walls of water tanks 0.4 m thick all round; four seats; a dosimeter screen; the door faces the galley side of the hall and opens by itself when a storm is warned |

**Upper floor**

| Room | Where | Area | What's in it |
|---|---|---|---|
| Four crew quarters | 205–385°, closed | 6.2 m² each | Bunk, desk with a reading light, locker and a window each, behind a door: the privacy long-mission crews ask for most |
| Exercise | 25–95°, open | 9.7 m² | Treadmill with a harness, cycle, resistance frame; two windows |
| Landing and stairwell | 95–165° | | Rails round the stairwell |
| Garden | 165–205°, open | 5.5 m² | Growing racks of lettuce and dwarf tomatoes under LED bars (the food wall); how full they are follows the greenhouse |
| Command and comms | the core | 9.6 m² | Three desks with the live outpost summary, power and comms, and the signal delay to Earth; the ladder up to the cupola |

## Decisions and why

- **The stair is a straight flight along a chord of the ring.** A spiral stair needs a room of its own,
  and a ladder would not let you walk between floors. A straight flight 0.9 m wide, with 15 risers of
  0.19 m and treads of 0.28 m, fits between the hall and the padded wall in one sector without cutting a
  room in half. You walk onto it at its foot by the medical bay, and step off it upstairs by the garden.
- **The storm shelter is in the core** with water walls all round, because mass between you and space is
  what stops radiation, and the middle of the home has the most of it.
- **Command moved into the core upstairs** (the brief suggested it face a window) so every crew member's
  room and the exercise area could have a window; the cupola above the command room gives the view.
- **A garden instead of a stowage room** above the suit room: a vertical farm is the thing Mars Dune Alpha
  and the ISS both found people value most, and it makes the food stock visible.
- **No wall between the medical bay and the stairs, or along the upstairs landing,** so the foot and the
  head of the flight have room to walk onto (found by the walking tests).
- **The walker is 0.6 m across** (shoulders and elbows), so a 0.9 m doorway is comfortable and a 1 m hall
  lets two people pass.

## How furniture is placed

Every piece of furniture is a box in the plan (`BLOCKS`: room, bearing, distance from the centre, width,
depth, height, and which way its front faces). Three helpers place them the way a designer would:
`atWall` puts a piece against the padded wall, `byPartition` against the wall between two rooms (facing
into the room), and `beside` next to another piece (a chair tucked under the table, a stool under the lab
bench). The same boxes are the walking collision and the 3D model's footprint, and the tests check that:

- every piece sits inside its room and inside the padded wall, clear of every doorway;
- no two pieces overlap (a separating-axis test), except a chair tucked under its own table;
- from the airlock you can reach every room on foot, with room to move in each (a flood fill on a 5 cm
  grid with the walker's 0.6 m body; no pocket of floor larger than 0.6 m² is cut off);
- you can walk from the airlock up the stair to the upper floor and back, and right up to the hatch;
- every window is in a room on its own floor, never on the stairs;
- in the 3D model, there is a wall wherever the walker bumps into one, nothing solid where you can walk,
  every doorway is tall and wide enough, and the foot and head of the stair are open.

## Walking

- **Move** with W A S D or the arrow keys (Shift to walk faster), **look** with the mouse (click the view
  to capture it, Esc to let go), or drag if the browser won't capture the mouse. On a phone or tablet: a
  stick on the left, drag on the right to look, and a Use button.
- Walking pace is 1.4 m/s (2.2 m/s faster), easing in and out. The eye is 1.65 m above the floor.
- Steps are longer and slower in low gravity: about 1.2 m on Mars and 1.85 m on the Moon (step length
  grows with the square root of 1/g), so the head bob and footsteps slow down. Footsteps sound different
  on the deck, on the stair and, outside, on regolith (on the Moon, only through your own suit).
- **E** (or Use) works whatever you're looking at: inspect a machine, suit up, cycle the airlock, take
  shelter. **Overview** goes back to the outpost; **Take a tour** guides you round six stops.
- *Settings → Walking*: field of view, look speed, invert look, and head bob (off with *Reduce motion*).

## Lighting

- Each room has its own ceiling lamps. The lamps are analytic lights in one shared shader: each pixel
  finds its room and floor from the plan, so light never leaks through a wall or a floor. Lamps within
  2.5 m add highlights; farther ones add only diffuse light (a cheaper approximation).
- Sunlight comes in through the windows, with shadows from the sun's shadow map.
- Corners, the joins between floor and wall and the space under furniture darken with ambient occlusion
  computed from the plan in the shader (the walls and boxes are known exactly), instead of a baked
  ray-traced lightmap.
- The light follows the mission (`interiorState` in `src/sim/interior.ts`): cool in the morning, neutral
  by day, warm in the evening and dim at night with path lights along the floor. A low battery dims the
  home to amber; when the power can't keep up, it goes to emergency red with only the essential screens
  on and the fans slowed.

## A home that lives with the mission

Everything the inside shows comes from the game state, through the pure function `interiorState(g)`:

| In the mission | In the home |
|---|---|
| Battery below 20% | Lights dim to amber, a chime |
| Power short at night | Emergency red, essential screens only, fans slow, path lights on |
| Less than a day of oxygen | An alarm chime and OXYGEN LOW signs |
| Water or food low | WATER RATIONING and FOOD LOW signs; the food shelves and tank gauges show the real stock |
| A damaged oxygen plant or recycler | Its status strip on the life-support rack turns red (amber for low oxygen; the CO2 scrubber goes amber on backup power) |
| Solar storm warned | A klaxon, red beacons turning over the shelter door and in command, the shelter door opens; quiet once the crew is inside |
| Dust storm (Mars) | Less sunlight through the windows (the storm dims the Sun outside) |
| A working, lit greenhouse | The garden racks fill with lettuce and tomatoes |
| Clock | Morning, day, evening and night light; the crew's routine |

**Inspect points** (E): 14 things show live numbers from the mission and one sourced fact from the
science library: oxygen supply, CO2 scrubber, water recovery, water tanks, power console, food store,
food wall, medical bay, storm shelter dosimeter, comms console, suit rack, parts printer, cupola ladder,
treadmill.

**The crew** (Maya, Alex, Sam and Noor) keep a daily routine (`crewSpots`): meals together at 7, 12 and
19 h; work at their stations (command, life support, garden, lab); two hours of exercise each in the
afternoon, two at a time; desks in the evening; bunks from 22 h. They shelter in the core in a storm,
and aren't home while out in the rover or on foot outside. They stand, sit, ride the cycle and sleep;
they don't walk between places (they appear at the next spot). You can pass through them.

## Walking outside (EVA)

- Suit up at the suit rack in the suit room, then use the airlock: an 8-second cycle (pumping down,
  then opening the outer hatch; you can skip it) puts you on the entry deck outside.
- One crew member walks outside: Alex (`WALKER`), whose suit (labelled A. RIVERA) leaves its rack. While outside, Alex
  takes the full outdoor radiation dose (no walls), and the suit has 8 training hours of air; the suit
  display warns with an hour left, and CAPCOM brings Alex in when it runs out. You can't go out while the
  crew is sheltering, and taking shelter brings Alex in.
- On foot you follow the ground, slide round modules, the airlock tunnel, the lander, the rover and
  boulders (`walkOutside` in `src/sim/outside.ts`), can't climb slopes steeper than 25°, and stay on the
  map. You can repair a damaged module and clean dusty solar panels by walking up to them and pressing E,
  at the same cost as from the HUD.
- The suit display shows suit time and battery, the dose rate and Alex's total dose, and a compass. On the Moon there's no outdoor
  sound (no air to carry it): you hear only your breathing and the suit's fans; on Mars, the wind too.

## Performance

Measured on the development Mac (Apple Silicon) in the production build at 1280 × 720, the same session
as the build before the walkable home. GPU frame time, median:

| Graphics | View | Before | Now |
|---|---|---|---|
| High | overview | 9.7 ms | 9.6 ms |
| High | habitat close-up | 8.5 ms | 9.7 ms (camera further back for the bigger home) |
| High | inside, galley | | 10.9 ms (556 draw calls with the depth pre-pass) |
| High | inside, landing | | 11.3 ms (668 draw calls) |
| Ultra | overview | 39.2 ms | 39.7 ms |
| Ultra | habitat close-up | 37.2 ms | 38.0 ms |
| Ultra | inside, galley | | 31.0 ms |
| Ultra | inside, landing | | 32.7 ms |

- The inside is built in slices after the outpost appears, then its shaders compile in the background:
  no task during start-up blocks the page for 50 ms or more (it was 669 ms before the build was split).
  "Preparing the home…" shows if you press Walk before it's ready.
- Inside, a depth pre-pass draws every surface's depth first so each pixel is shaded once; ambient
  occlusion (GTAO) is turned off indoors on Ultra, where the plan's own occlusion does the job (GTAO cost
  about 13 ms there).
- Entering or leaving the walk costs a frame or two (5–40 ms more than a normal frame).
- Walking in and out four times leaves no textures or shader programs behind (geometries 326 → 327).
- The walkable home and EVA added about 40 KB (gzip) to the download.

## Deviations from the brief

- **Ambient occlusion is analytic, not baked by ray-casting**: the plan knows every wall and box, so the
  shader computes the darkening directly, with no lightmap textures to download.
- **GTAO is off indoors on Ultra** (see Performance).
- **Command is in the core**, not by a window (see Decisions).
- **Alex walks outside, not the commander** (the brief said crew[0]): Maya, the commander, rides in the
  rover, so the engineer walks; you can then be outside on foot while the rover is out.
- **The airlock is a sequence, not a room you walk through**: it plays its cycle, then puts you outside.
- **The crew don't walk between rooms**, and you can pass through them.

## Changes to the outpost around it

- `HABITAT_RADIUS` grew from 3.4 m to 5.8 m.
- The pad rings moved out from 8.5, 15 and 21.5 m to 10.5, 17 and 22.5 m. Pad ids, kinds and bearings
  are unchanged, so missions still refer to the same pads.
- The rover dock moved south from z = 12 to z = 14 m.
- The ground is now level out past the outer ring (it used to slope up to 0.32 m under the outer pads).
- Tests check that pads clear the home and each other, sit on level ground and clear the dock, and the
  existing rover tests check that every site can still be reached.
