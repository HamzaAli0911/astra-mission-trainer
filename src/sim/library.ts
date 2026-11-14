/** The science library: the real science behind the game, each fact with its source (shown in the Library and on inspect cards inside the home). */
export interface Fact {
  topic: string;
  title: string;
  text: string;
  source: string;
  url: string;
}
export const LIBRARY: Fact[] = [
  {
    topic: "Life support",
    title: "Water becomes air",
    text: "Electricity can split water (H₂O) into hydrogen and oxygen. The International Space Station makes breathing oxygen this way, so water and air are linked.",
    source: "NASA · Life support (ECLSS)",
    url: "https://www.nasa.gov/reference/environmental-control-and-life-support-systems-eclss/",
  },
  {
    topic: "Life support",
    title: "Recycling almost every drop",
    text: "In 2023 the ISS reached about 98% water recovery: sweat, breath moisture and urine are cleaned into drinking water.",
    source: "NASA · Water recovery milestone",
    url: "https://www.nasa.gov/missions/station/iss-research/nasa-achieves-water-recovery-milestone-on-international-space-station/",
  },
  {
    topic: "The Moon",
    title: "Ice in eternal shadow",
    text: "Some craters near the Moon's poles never see sunlight and stay colder than −200 °C. In 2009 NASA's LCROSS impact found water in one of them.",
    source: "NASA Science · LCROSS",
    url: "https://science.nasa.gov/mission/lcross/",
  },
  {
    topic: "The Moon",
    title: "Long days, long nights",
    text: "A full day–night cycle on the Moon takes about 29.5 Earth days. Without air to hold heat, the surface swings from scorching to far below freezing.",
    source: "NASA Science · Moon facts",
    url: "https://science.nasa.gov/moon/facts/",
  },
  {
    topic: "The Moon",
    title: "Why the south pole?",
    text: "Artemis plans to land near the lunar south pole: high ridges get long stretches of sunlight for power, and the dark craters nearby hold ice.",
    source: "NASA · Artemis III",
    url: "https://www.nasa.gov/missions/artemis/artemis-iii/",
  },
  {
    topic: "Radiation",
    title: "No air, no shield",
    text: "Earth's atmosphere and magnetic field block most space radiation. China's Chang'e-4 lander measured about 1.4 mSv a day on the Moon's surface, more than twice the dose on the ISS.",
    source: "NASA · Space radiation",
    url: "https://www.nasa.gov/hrp/radiation/",
  },
  {
    topic: "Radiation",
    title: "Building a storm shelter",
    text: "If a solar storm hits during an Artemis flight, the crew builds a shelter inside Orion from bags of food, water and supplies. Dense stuff makes a good shield.",
    source: "NASA · Orion radiation protection",
    url: "https://www.nasa.gov/missions/artemis/orion/scientists-and-engineers-evaluate-orion-radiation-protection-plan/",
  },
  {
    topic: "Food",
    title: "Gardens in space",
    text: "The Veggie garden on the ISS has grown lettuce, cabbage and zinnias under LED lights. Plants also make a little oxygen.",
    source: "NASA Science · Veggie",
    url: "https://science.nasa.gov/mission/veggie/",
  },
  {
    topic: "Mars",
    title: "Weaker sunlight, dusty panels",
    text: "Mars is about 1.5 times farther from the Sun than Earth, so sunlight there is roughly 43% as strong. NASA's InSight lander shut down in 2022 when dust covered its solar panels.",
    source: "NASA Science · InSight",
    url: "https://science.nasa.gov/mission/insight/",
  },
  {
    topic: "Mars",
    title: "Making oxygen from Mars air",
    text: "MOXIE, on the Perseverance rover, split carbon dioxide from the Martian air and made 122 grams of oxygen between 2021 and 2023.",
    source: "NASA · MOXIE",
    url: "https://www.nasa.gov/solar-system/nasas-oxygen-generating-experiment-moxie-completes-mars-mission/",
  },
  {
    topic: "Power",
    title: "Nuclear power for the night",
    text: "NASA's Fission Surface Power project is designing a small reactor (around 40 kW) that could run for ten years without sunlight.",
    source: "NASA · Fission Surface Power",
    url: "https://www.nasa.gov/centers-and-facilities/glenn/nasas-fission-surface-power-project-energizes-lunar-exploration/",
  },
  {
    topic: "Life support",
    title: "Scrubbing the air",
    text: "Every breath out adds carbon dioxide. On the ISS, beds of zeolite take turns soaking it up and then releasing it to space, so the air never builds up to a dangerous level.",
    source: "NASA · Life support (ECLSS)",
    url: "https://www.nasa.gov/reference/environmental-control-and-life-support-systems-eclss/",
  },
  {
    topic: "Mars",
    title: "A conversation with a long pause",
    text: "Radio signals take between 3 and 22 minutes to cross between Earth and Mars, depending on where the planets are. A Mars crew can't wait for Mission Control in an emergency.",
    source: "NASA Science · Talking to Perseverance",
    url: "https://science.nasa.gov/blog/speaking-percys-language-how-to-talk-so-perseverance-will-listen/",
  },
  {
    topic: "Mars",
    title: "Toxic dust",
    text: "Martian soil is rich in perchlorates, salts that are corrosive and can be toxic to people. Crews will need to keep the fine dust off their suits and out of the air they breathe.",
    source: "NASA JPL · Perseverance and astronaut safety",
    url: "https://www.jpl.nasa.gov/news/how-nasas-perseverance-is-helping-prepare-astronauts-for-mars/",
  },
  {
    topic: "Engineering",
    title: "Printing spare parts in space",
    text: "In November 2014 a 3D printer on the ISS made the first object ever printed in space. Printing parts on demand means carrying fewer spares from Earth.",
    source: "NASA · First 3D print in space",
    url: "https://www.nasa.gov/missions/station/open-for-business-3-d-printer-creates-first-object-in-space-on-international-space-station/",
  },
  {
    topic: "Health",
    title: "Two hours of exercise a day",
    text: "Without Earth's gravity, bones can lose about 1% of their density a month. ISS crews exercise about two hours a day on a treadmill, a cycle and a resistance machine.",
    source: "NASA · Counteracting bone and muscle loss",
    url: "https://www.nasa.gov/missions/station/iss-research/counteracting-bone-and-muscle-loss-in-microgravity/",
  },
  // From the resources NASA Space Apps gave the challenge: RadLab, DONKI, OSDR, Mars Trek and the Canadian Space Agency.
  {
    topic: "Radiation",
    title: "The storms of May 2024",
    text: "In May 2024, NASA's CRaTER instrument orbiting the Moon measured the radiation dose rate rise more than 500 times during a run of solar storms. Curiosity measured a smaller jump on Mars a week later, and the Space Station, inside Earth's magnetic field, hardly noticed.",
    source: "NASA OSDR · RadLab radiation database",
    url: "https://visualization.osdr.nasa.gov/radlab/gui/",
  },
  {
    topic: "Radiation",
    title: "Every storm on record",
    text: "NASA's DONKI database logs every solar flare, coronal mass ejection and particle storm, so forecasters can warn astronauts. Each solar storm in this game is modelled on one of its real events.",
    source: "NASA CCMC · DONKI",
    url: "https://ccmc.gsfc.nasa.gov/tools/DONKI/",
  },
  {
    topic: "Food",
    title: "Lettuce from the Space Station",
    text: "Lettuce grown in the Veggie garden on the Space Station in 2014 was flown back to Earth and tested for nutrients and microbes. Leafy greens grown like this have been safe for astronauts to eat.",
    source: "NASA OSDR · OSD-268 (VEG-01B)",
    url: "https://osdr.nasa.gov/bio/repo/data/studies/OSD-268",
  },
  {
    topic: "Health",
    title: "Mice in orbit lose muscle and bone",
    text: "Mice that spent 33 days on the Space Station in 2019–20 lost a lot of muscle and bone. Astronauts exercise every day to fight the same loss.",
    source: "NASA OSDR · OSD-342",
    url: "https://osdr.nasa.gov/bio/repo/data/studies/OSD-342",
  },
  {
    topic: "Food",
    title: "Food for the Moon and the North",
    text: "The Canadian Space Agency and NASA ran the Deep Space Food Challenge. The winning system could grow over 700 kg of fresh food a year, for astronauts and for remote places on Earth like Canada's North.",
    source: "Canadian Space Agency · Deep Space Food Challenge",
    url: "https://www.asc-csa.gc.ca/eng/sciences/food-production/deep-space-food-challenge.asp",
  },
  {
    topic: "Mars",
    title: "A real place for a Mars base",
    text: "Deuteronilus Mensae, a region of flat-topped mesas, was proposed as a landing zone for the first humans on Mars at a NASA workshop in 2015. Radar on the Mars Reconnaissance Orbiter found ice buried under its rocky slopes.",
    source: "Brown University · Deuteronilus Mensae proposal",
    url: "https://archive2.news.brown.edu/2007-2015/articles/2015/10/mars.html",
  },
];

/** A fact by its title. */
export const fact = (title: string) => LIBRARY.find((f) => f.title === title)!;
