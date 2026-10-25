# Science notes and simplifications

ASTRA keeps the **relationships** real and the **numbers** close to real where players see them, and simplifies the rest so cause and effect fit into a few minutes of play.

## Numbers based on real figures

| Quantity | In ASTRA | Basis |
|---|---|---|
| Oxygen per person | 0.84 kg/day | NASA life-support planning figure |
| Water per person | about 3 L/day (drinking and food) | NASA planning range |
| Food | 3 meals/person/day | |
| Water → oxygen | electrolysis on the Moon uses about 1.1 kg of water per kg of oxygen | Chemistry: H₂O → H₂ + ½O₂ (0.89 kg O₂ per kg water) |
| Water recycling | 85% of crew water recovered | ISS reached about 98% in 2023 ([NASA](https://www.nasa.gov/missions/station/iss-research/nasa-achieves-water-recovery-milestone-on-international-space-station/)) |
| Sunlight on Mars | 43% of the Moon's | Mars orbits about 1.52 AU from the Sun (1/1.52² ≈ 0.43) |
| Lunar surface radiation | 0.055 mSv/h (≈1.3 mSv/day) | Chang'e-4 LND measured ≈1.37 mSv/day (Zhang et al., *Science Advances*, 2020) |
| Mars surface radiation | 0.03 mSv/h (≈0.7 mSv/day) | Curiosity RAD measured ≈0.67 mSv/day (Hassler et al., *Science*, 2014) |
| Shelter / shielding | shelter blocks 90%, regolith-covered habitat 75%, habitat 40%, rover 20% | Illustrative values; dense material (water, regolith, supplies) is what real shelters use ([NASA Orion plan](https://www.nasa.gov/missions/artemis/orion/scientists-and-engineers-evaluate-orion-radiation-protection-plan/)) |
| MOXIE | Mars oxygen from CO₂ needs no water but more power | MOXIE made 122 g of O₂ on Mars, 2021–2023 ([NASA](https://www.nasa.gov/solar-system/nasas-oxygen-generating-experiment-moxie-completes-mars-mission/)) |
| Fission power | 10 kW, day and night | NASA Fission Surface Power targets about 40 kW ([NASA](https://www.nasa.gov/centers-and-facilities/glenn/nasas-fission-surface-power-project-energizes-lunar-exploration/)) |
| Ice in dark craters | Shadow Crater holds ice; the rover drains faster there | LCROSS found water at Cabeus crater in 2009 ([NASA](https://science.nasa.gov/mission/lcross/)) |
| Gravity | Mars 3.71 m/s² (38% of Earth's), Moon 1.62 m/s² (17%) | NASA planetary fact sheets ([NASA](https://nssdc.gsfc.nasa.gov/planetary/factsheet/)) |
| Walking in low gravity | steps of about 1.2 m on Mars and 1.85 m on the Moon, slower and bouncier | Step length scales with √(1/g) in our model (0.75 m on Earth); Apollo crews loped and hopped on the Moon |
| Signal delay to Earth | Mars 3 to 22 minutes each way; Moon about 1.3 s | Light travel time; the Perseverance team plans around it ([NASA](https://science.nasa.gov/blog/speaking-percys-language-how-to-talk-so-perseverance-will-listen/)) |
| CO₂ breathed out | about 1 kg per person per day, removed by a scrubber | NASA life-support planning figure; the ISS scrubbers ([NASA](https://www.nasa.gov/reference/environmental-control-and-life-support-systems-eclss/)) |
| Exercise | two hours a day per crew member, on a treadmill and a cycle | ISS crews exercise about two hours a day to slow bone and muscle loss ([NASA](https://www.nasa.gov/missions/station/iss-research/counteracting-bone-and-muscle-loss-in-microgravity/)) |
| Walking outside (EVA) | full outdoor radiation dose (no walls); 8 hours of suit time | Spacewalks usually last five to eight hours ([NASA](https://www.nasa.gov/learning-resources/for-kids-and-students/what-is-a-spacewalk-grades-5-8/)) |
| Martian dust | a sealed suit room keeps dust out of the living space | Mars dust contains toxic perchlorates ([NASA JPL](https://www.jpl.nasa.gov/news/how-nasas-perseverance-is-helping-prepare-astronauts-for-mars/)) |
| Storm shelter in the core | water walls 0.4 m thick round the middle of the home | Mass between you and space blocks radiation; water is one of the best shields ([NASA Orion plan](https://www.nasa.gov/missions/artemis/orion/scientists-and-engineers-evaluate-orion-radiation-protection-plan/)) |
| Parts printer | spares printed in the lab | The ISS printed its first part in 2014 ([NASA](https://www.nasa.gov/missions/station/open-for-business-3-d-printer-creates-first-object-in-space-on-international-space-station/)) |
| Science rover power | a nuclear generator (RTG): works day and night, never needs charging | Curiosity and Perseverance run on an MMRTG, which turns the heat of decaying plutonium-238 into about 110 W ([NASA fact sheet](https://www.nasa.gov/wp-content/uploads/2015/04/mmrtg.pdf)) |
| Rocker-bogie suspension | six wheels stay on the ground over rocks; the body tilts only a little | The design used on every NASA Mars rover; Curiosity's wheels are 50 cm across and each has its own motor ([NASA JPL](https://www.jpl.nasa.gov/images/pia13236-new-wheels/), [Perseverance's wheels](https://mars.nasa.gov/mars2020/spacecraft/rover/wheels/)) |
| Rovers on rocks | wheels climb rocks up to about 0.4 m; bigger boulders block the way | A rocker-bogie can roll over obstacles about as tall as its wheels' diameter ([NASA](https://mars.nasa.gov/mars2020/spacecraft/rover/wheels/)) |

## Deliberate simplifications

- **Time is compressed.** One training day is 24 hours and plays in about a minute and a half at 1×. A real lunar day–night cycle lasts about 29.5 Earth days; a Mars sol lasts 24 h 39 min.
- **The map is shrunk.** Sites are 80–180 m from the outpost instead of kilometres.
- **Equipment outputs are rounded** (a 6 kW solar array, a 120 kWh battery bank, a greenhouse growing up to 8.6 meals a day) so that a handful of modules can support four people.
- **Generous stores.** The habitat holds up to 90 kg of oxygen (over three weeks for four people) and its own 60 kWh battery, so a mistake gives you time to react rather than ending the mission at once. Random events (storms, meteor showers, decision cards) in Mars Colony and Free Play come at least 16 training hours apart.
- **Radiation limit.** The trainer uses a 50 mSv limit per mission so storms matter within a short game. Real NASA limits are set over a whole career (about 600 mSv).
- **Health.** Crew health falls with missing oxygen (fast), water, food or heat; radiation is tracked as dose, not health.
- **The home.** The CO₂ scrubber and its screen are shown, but CO₂ levels aren't simulated (the scrubber goes on backup when power is short). The crew keep a routine (meals, work, exercise, sleep) but don't walk between rooms.
- **The science rover is fast.** Real Mars rovers creep along at a few centimetres a second; this one drives at more than half the crew rover's speed so a trip fits into a game. It studies each science site once, for 2 training hours, and radios home 8 science points (a crew sample brought back to the dock gives 15).
- **Tyres.** The crew rover's tyres are rubber and flatten a few centimetres where they press on the ground or a rock; real lunar and Martian wheels are usually metal mesh or aluminium, which flex much less.
- **Walking outside.** Only one crew member, Alex, goes out on foot, and the airlock plays an 8-second cycle instead of a real one (which takes much longer). Suit time counts training hours, so a walk outside uses up suit time quickly.
- **Nothing you can't see is drawn.** Radiation and CO₂ are invisible: storms show only through alarms, beacons, the dosimeter and the screen edge, never a glow. On the Moon there is no outdoor sound, only your breathing and the suit's fans.
- **Not modelled:** CO₂ levels, air pressure and leaks (except as an event card), thermal design, plant growth cycles, crew psychology.

The in-game **Science library** shows these facts with links; the debrief of every mission ends with one real-science fact and its source.
