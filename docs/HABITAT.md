# The Mars home: design notes

The habitat at the centre of the outpost is a two-storey inflatable home you can walk through in first
person. One floor plan, in `src/sim/home.ts`, drives the 3D model inside and out, the walking collision,
the tests and the floor-plan image (`window.__qc.plan()` with `?debug`), so they cannot drift apart.

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
| Plan | a central core (radius 1.9 m), a ring hall 1.3 m wide around it, rooms between the hall and the padded wall (radius 3.2 to 4.95 m) |
| Floor area | about 77 m² per floor, about 154 m² in all |

## Rooms

Bearings are compass degrees (0 north, 90 east, 180 south, where the airlock faces the rover dock).

**Ground floor**

| Room | Where | Area | Notes |
|---|---|---|---|
| Suit room (dust lock) | 165–205°, closed | 5.0 m² | The airlock's inner hatch is here; four suits on racks; a sliding door keeps Martian dust (with its toxic perchlorates) out of the living space |
| Galley and wardroom | 205–290°, open | 10.6 m² | Table for four, food prep, food storage whose fill shows the real food stock; two windows |
| Hygiene | 290–330°, closed | 5.0 m² | Toilet, sink and a water-saving shower behind a door; not next to the food prep |
| Life support | 330–30°, closed | 7.5 m² | Oxygen supply, CO2 scrubber, water recovery, water tanks; the north side, away from the crew quarters above it is the noisiest equipment, vented outside |
| Lab and workshop | 30–62°, open | 4.0 m² | Glovebox, microscope, sample freezer, tool wall, 3D printer; one window |
| Medical bay | 62–95°, open | 4.1 m² | Exam couch, medical cabinet, ultrasound; a small window |
| Stairs | 95–165° | | A straight flight along a chord of the ring |
| Storm shelter | the core | 7.1 m² inside | Walls of water tanks 0.4 m thick all round; seats for four; a dosimeter; the door faces the hall |

**Upper floor**

| Room | Where | Area | Notes |
|---|---|---|---|
| Four crew quarters | 205–385°, closed | 5.6 m² each | Bunk, desk, reading light, personal things, a window each; on the quiet side, above the galley and hygiene rather than the life-support machines |
| Exercise | 25–95°, open | 8.7 m² | Treadmill with harness, cycle, resistance frame (low gravity still weakens bone and muscle); two windows |
| Landing and stairwell | 95–165° | | Rails round the stairwell |
| Stowage | 165–205°, open | 5.0 m² | Cargo bags, above the suit room |
| Command and comms | the core | 9.6 m² | Screens with the live outpost summary and the signal delay to Earth; the ladder up to the cupola |
| Food wall | round the core, in the hall | | Vertical growing racks under lights |

## Decisions and why

- **The stair is a straight flight along a chord of the ring.** A spiral stair needs a room of its own,
  and a ladder would not let you walk between floors. A straight flight 0.9 m wide, with 15 risers of
  0.19 m and treads of 0.28 m, fits between the hall and the padded wall in one sector without cutting a
  room in half. You walk onto it at its foot by the medical bay, and step off it upstairs by the stowage.
- **The storm shelter is in the core** with water walls all round, because mass between you and space is
  what stops radiation, and the middle of the home has the most of it.
- **Command moved into the core upstairs** (the brief suggested it face a window) so every crew member's
  room and the exercise area could have a window; the cupola above the command room gives the view.
- **No wall between the medical bay and the stairs, or along the upstairs landing,** so the foot and the
  head of the flight have room to walk onto (found by the walking tests).
- **The walker's body is 0.5 m across** (shoulders), so a 0.9 m doorway is comfortable.

## Changes to the outpost around it

- `HABITAT_RADIUS` grew from 3.4 m to 5.8 m.
- The pad rings moved out from 8.5, 15 and 21.5 m to 10.5, 17 and 22.5 m. Pad ids, kinds and bearings
  are unchanged, so missions still refer to the same pads.
- The rover dock moved south from z = 12 to z = 14 m.
- The ground is now level out past the outer ring (it used to slope up to 0.32 m under the outer pads).
- Tests check that pads clear the home and each other, sit on level ground and clear the dock, and the
  existing rover tests check that every site can still be reached.
