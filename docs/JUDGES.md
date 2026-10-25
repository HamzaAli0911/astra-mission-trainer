# ASTRA for judges

## The challenge, and our answer

> "Design and build an interactive game or app that lets students run a lunar or Martian outpost, balancing competing demands like life support, radiation shielding, power, and food production, so they experience firsthand the decisions that determine whether a mission fails or succeeds."

| The brief asks for | ASTRA |
|---|---|
| Students **run** an outpost | You build, switch, drive and decide in a live 3D outpost, from four crew on the Moon to a colony on Mars. |
| Lunar **or** Martian | Both: four Moon missions, then Mars with weaker sunlight, CO₂-based oxygen and dust storms. |
| Life support | Oxygen from water (Moon) or from CO₂ (Mars), water recycling, ice mining, crew needs of 0.84 kg O₂ / 3 L water / 3 meals per person per day. |
| Radiation shielding | Solar storms with warnings; shelter vs. regolith shielding vs. doing nothing; per-crew dose in millisieverts with a limit. |
| Power | Day/night solar, batteries, a forecast of when the battery runs out, priorities when power is short, fission on Mars. |
| Food production | Greenhouses whose grow lights compete with life support for stored power at night. |
| **Trade-offs** | Every module card has a "catch"; decision cards arrive mid-mission in every mission, each option has a cost, and some come back later (a failed battery needs repairing before night); sheltering pauses research and building. |
| Not oversimplified, not too complex | Real relationships and rounded real numbers, introduced one mission at a time, with CAPCOM explaining causes in plain language. |
| Experience success and failure | Missions can be lost (crew health, radiation limit, time). The debrief shows a chart of what happened and suggests what to try next. |

## A five-minute demo

Tip: in **Settings**, turn on **Unlock every mission** first. **Go to Mars**, **Skip tutorial** and **Restart mission** are on the title screen; Go to Mars and Skip tutorial are also on each mission's briefing, and all three sit above the goals during a mission.

1. **Title → Start training.** Mission 1 begins with a briefing from CAPCOM. Keep "Guide me step by step" ticked.
2. **First Light tutorial (2 min).** Drag to look around, build a Solar Array (time speeds up to 4×), see the power arrow turn green, build an Oxygen Maker, open the **Power** panel and read the battery forecast. Build a Battery and start the clock. At night, show the battery draining and the solar arrays producing nothing.
3. **Debrief.** Stars, the power chart (filling by day, draining at night), "what you learned", a NASA fact with a link, and a quick quiz question.
4. **Mission map → Ice Hunters.** Open **Rover**, press Go on Shadow Crater. The crater floor is permanently dark: the rover drains faster. Collect ice, drive home, unload +45 L. Point out that the Oxygen Maker uses water: on the Moon, water is air.
5. **Solar Storm.** The heads-up card pauses the game when a flare is spotted, with CAPCOM's suggestions (drive home, build a shelter). When the storm hits, the screen tints purple and a Geiger counter clicks; take shelter and watch the dose readout.
6. **Red Planet.** The Power panel shows less than half the solar power of the Moon. Build MOXIE and a fission reactor and ride out the dust storm.

## A 60-second "step inside" demo

The outpost's habitat is a two-storey home you can walk through, and every machine in it shows the mission's real numbers ([HABITAT.md](HABITAT.md)).

1. **Title → Go to Mars → Start mission.** (5 s)
2. **Walk** (view buttons, bottom right; or **Go inside** on the habitat's card). You stand in the suit room, by the airlock. Click the view to look around (Esc lets go of the mouse), walk with W A S D. On a tablet: the stick on the left, drag on the right. (5 s)
3. **Where the air comes from (15 s).** Through the suit room's door, follow the hall round the core to the life-support room on the far (north) side. Look at the oxygen rack and press **E**: the card shows oxygen stored, made and used today, from the simulation, and a sourced fact (MOXIE). The water recovery rack next to it shows the recycler.
4. **Food (10 s).** Back round to the galley: the food store's shelves hold the real food stock. **E** shows meals left and how long they will last.
5. **Upstairs (15 s).** The stair is by the medical bay. At the top: the garden's food wall, then the command room in the core, where the power console shows the battery and what is made and used, and the comms console the 3 to 22 minute signal delay to Earth.
6. **The storm shelter (10 s).** Down again: the door in the core by the galley opens into the shelter, walled with water tanks, with a live dosimeter.

**Take a tour** (in the bar at the top) guides a student round six stops: oxygen, water, the food wall, power, the storm shelter and the cupola. The home also changes with the mission: dim lights and path lights at night, amber when the battery is low, emergency red in a power cut, a klaxon, a red beacon and an open shelter in a solar storm, empty shelves when food runs low, an orange haze on the windows in a dust storm.

**Walking outside (30 s more).** Suit up at the suit rack (**E**), cycle the airlock (or Skip) and step out. The suit display counts suit time and radiation dose (on foot you get the full outdoor dose). Suit time runs with the mission clock, so press Space to pause it while you look round: you can still walk. Walk up to a damaged module or dusty panels and press **E** to repair or clean them (same cost as the HUD), then come back through the outer hatch. On the Moon you hear only your breathing and the suit's fans.

## What makes it work in a classroom

- **Focused:** 10–20 minute missions, each built around one idea.
- **Learning by doing:** tutorial steps finish when the player does the thing, not when they click Next.
- **Feedback before failure:** every supply shows how long it will last; CAPCOM warns early; emergencies pause time.
- **Reflection:** debrief charts, "what you learned", a NASA source, one quiz question per mission.
- **Teachers:** a built-in teacher page with learning goals, NGSS links and discussion questions; "unlock all" for jumping to a topic.
- **Access:** runs in any modern browser, on Chromebooks and tablets, offline once loaded, no accounts, read-aloud option.

## Technical quality

- Pure, deterministic simulation (`src/sim`) separated from rendering, covered by unit tests, including scripted wins and losses for every mission.
- Single source of truth for resource flows (`core.ts: flows`), used by the engine, the HUD, the forecast and the advisor.
- Procedural 3D (no downloaded assets), adaptive quality on slow machines, responsive layout from phones to desktops.
- One floor plan (`src/sim/home.ts`) drives the walkable home's 3D model, its collision and its tests, so what you see is where you can walk; the inside reads the mission through one pure function (`interiorState`), tested for every situation.
