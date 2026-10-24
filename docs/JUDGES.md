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
| **Trade-offs** | Every module card has a "catch"; every decision card has a cost on every option; sheltering pauses research and building. |
| Not oversimplified, not too complex | Real relationships and rounded real numbers, introduced one mission at a time, with CAPCOM explaining causes in plain language. |
| Experience success and failure | Missions can be lost (crew health, radiation limit, time). The debrief shows a chart of what happened and suggests what to try next. |

## A five-minute demo

Tip: in **Settings**, turn on **Unlock every mission** first. To see Mars right away, press **Go to Mars** on the title screen. **Skip tutorial** on the CAPCOM card ends the guided steps, and the ↺ button in the top bar restarts a mission from the start.

1. **Title → Start training.** Mission 1 begins with a briefing from CAPCOM. Keep "Guide me step by step" ticked.
2. **First Light tutorial (2 min).** Drag to look around, build a Solar Array (time speeds up to 4×), see the power arrow turn green, build an Oxygen Maker, open the **Power** panel and read the battery forecast. Build a Battery and start the clock. At night, show the battery draining and the solar arrays producing nothing.
3. **Debrief.** Stars, the power chart (filling by day, draining at night), "what you learned", a NASA fact with a link, and a quick quiz question.
4. **Mission map → Ice Hunters.** Open **Rover**, press Go on Shadow Crater. The crater floor is permanently dark: the rover drains faster. Collect ice, drive home, unload +45 L. Point out that the Oxygen Maker uses water: on the Moon, water is air.
5. **Solar Storm.** The heads-up card pauses the game when a flare is spotted, with CAPCOM's suggestions (drive home, build a shelter). When the storm hits, the screen tints purple and a Geiger counter clicks; take shelter and watch the dose readout.
6. **Red Planet.** The Power panel shows less than half the solar power of the Moon. Build MOXIE and a fission reactor and ride out the dust storm.

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
