import type {
  HazardKind,
  Light,
  ModuleType,
  Planet,
  Resources,
  ScriptEntry,
} from "./types";

/** A mission goal. Goals stay complete once reached, except "survive", which completes at the end time. */
export type Goal = { id: string; text: string } & (
  | { kind: "build"; module: ModuleType; count: number }
  | { kind: "stock"; res: keyof Resources; atLeast: number }
  | { kind: "grow"; res: "food" | "water" | "o2"; atLeast: number }
  | { kind: "trips"; trip: "ice" | "regolith" | "science"; count: number }
  | { kind: "protect" }
  | { kind: "home" }
  | { kind: "clean" }
  | { kind: "balance" }
  | { kind: "survive" }
);

/** Extra-star rules, checked when the mission is won. */
export type StarRule = { text: string } & (
  | { kind: "noBrownout" }
  | { kind: "minHealth"; atLeast: number }
  | { kind: "maxDose"; below: number }
  | { kind: "sites"; count: number }
  | { kind: "endStock"; res: keyof Resources; atLeast: number }
  | { kind: "minStock"; res: "power" | "o2" | "water" | "food"; atLeast: number }
  | { kind: "built"; module: ModuleType; count: number }
  | { kind: "made"; res: "food" | "water" | "o2"; atLeast: number }
);

export interface HazardPlan {
  kind: HazardKind;
  startAt: number;
  /** Hours of warning before it starts. */
  warn: number;
  duration: number;
  strength: number;
}

export interface Fact {
  text: string;
  source: string;
  url: string;
}

export interface Mission {
  id: string;
  /** Position on the campaign map (free play = 0). */
  number: number;
  planet: Planet;
  title: string;
  tagline: string;
  /** Short "you will learn" bullets, written for players. */
  learn: string[];
  /** One-line learning objective for teachers. */
  objective: string;
  minutes: number;
  startT: number;
  endT: number;
  res: Resources;
  modules: { type: ModuleType; pad: number; light?: Light }[];
  rover?: { x: number; z: number; heading: number; battery: number };
  /** Modules the build menu offers. */
  build: ModuleType[];
  /** Whether habitat regolith shielding can be built. */
  shield: boolean;
  hazards: HazardPlan[];
  script: ScriptEntry[];
  goals: Goal[];
  stars: [StarRule, StarRule];
  briefing: string[];
  learned: string[];
  fact: Fact;
  quiz: { q: string; options: string[]; answer: number; why: string };
  /** Random events for replayable missions. */
  random?: { storms: number; dust: number; meteors: number; cards: string[] };
  /** Mission needed to unlock this one. */
  after?: string;
}

const ALL: ModuleType[] = [
  "solar",
  "battery",
  "oxygen",
  "recycler",
  "greenhouse",
  "shelter",
  "icedrill",
  "lab",
  "reactor",
];

export const MISSIONS: Mission[] = [
  {
    id: "first-light",
    number: 1,
    planet: "moon",
    title: "First Light",
    tagline: "Power up your outpost and survive your first lunar night.",
    learn: [
      "Solar arrays only work in sunlight",
      "Batteries save power for the night",
      "Electricity and water make oxygen",
    ],
    objective:
      "Energy storage: generation, storage and demand change between day and night.",
    minutes: 9,
    startT: 7,
    endT: 54,
    res: { power: 42, o2: 16.5, water: 220, food: 60, materials: 110, science: 0 },
    modules: [],
    build: ["solar", "battery", "oxygen"],
    shield: false,
    hazards: [],
    script: [
      { id: "dusk", at: 17.5, say: "Sunset at 20:00. After that, the solar arrays stop and the battery keeps the crew warm. Is it charging?" },
      { id: "night", at: 20.3, say: "The Sun has set. We're on battery power now. If it runs low, switch off the Oxygen Maker for a while: we have stored oxygen." },
      { id: "dawn", at: 28.5, say: "Sunrise in 90 minutes. Hang in there!" },
      { id: "day2", at: 30.5, say: "You made it through your first night! Mission Control wants a bigger power reserve before the next one: two Solar Arrays and two Battery Banks." },
      { id: "leak", at: 34, choice: "leak" },
      { id: "dusk2", at: 41.5, say: "Second sunset at 20:00. Open the Power panel: will the battery last until 06:00?" },
      { id: "dawn2", at: 52.5, say: "Almost sunrise on Day 3. Great work, Commander." },
    ],
    goals: [
      { id: "solar", kind: "build", module: "solar", count: 2, text: "Build 2 Solar Arrays" },
      { id: "oxygen", kind: "build", module: "oxygen", count: 1, text: "Build an Oxygen Maker" },
      { id: "battery", kind: "build", module: "battery", count: 2, text: "Build 2 Battery Banks" },
      { id: "night", kind: "survive", text: "Survive two lunar nights (until Day 3, 06:00)" },
    ],
    stars: [
      { kind: "noBrownout", text: "No power cuts all mission" },
      { kind: "endStock", res: "power", atLeast: 120, text: "Finish with 120+ kWh still stored" },
    ],
    briefing: [
      "Welcome to the Moon, Cadet! Your crew of four just landed near the lunar south pole.",
      "The habitat is running on its own small battery, and it's draining. First we need power, then oxygen.",
      "Get it all built before the Sun sets at 20:00, then keep the crew safe through two long, cold nights.",
    ],
    learned: [
      "Solar arrays make electricity only while the Sun shines.",
      "A battery stores daytime power for the night.",
      "The Oxygen Maker turns electricity and water into air to breathe.",
    ],
    fact: {
      text: "A full day–night cycle on the Moon lasts about 29.5 Earth days, so most places have about two weeks of darkness at a time. Real outposts will need big batteries, fuel cells or nuclear power to get through it.",
      source: "NASA Science · Moon facts",
      url: "https://science.nasa.gov/moon/facts/",
    },
    quiz: {
      q: "Why did the battery go down at night?",
      options: [
        "Solar arrays make no power in the dark, but the crew still needs it",
        "Batteries leak when it gets cold",
        "The crew switched on too many lights",
      ],
      answer: 0,
      why: "No sunlight means no solar power, so everything runs on stored energy until sunrise. The heaters even need extra power at night.",
    },
  },
  {
    id: "ice-hunters",
    number: 2,
    planet: "moon",
    title: "Ice Hunters",
    tagline: "Drive into a crater that never sees the Sun and bring back water.",
    learn: [
      "Making oxygen uses up water",
      "Ice hides in craters that are always dark",
      "Recycling saves water",
    ],
    objective:
      "Coupled systems: oxygen production depends on water; resources can be mined and recycled.",
    minutes: 11,
    startT: 8,
    endT: 80,
    res: { power: 150, o2: 36, water: 40, food: 80, materials: 45, science: 0 },
    modules: [
      { type: "solar", pad: 0 },
      { type: "solar", pad: 1 },
      { type: "battery", pad: 2 },
      { type: "oxygen", pad: 3 },
    ],
    build: ["solar", "battery", "oxygen", "recycler", "icedrill"],
    shield: false,
    hazards: [],
    script: [
      { id: "drill", at: 26, say: "Driving for ice takes hours. An Ice Drill on the crater's edge mines water by itself, but it costs 30 materials. The Boulder Field has plenty of building rock." },
      { id: "glint", at: 31, choice: "glint" },
      { id: "half", at: 44, say: "Halfway there. Remember: the rover's battery recharges on the dock, using the outpost's power." },
      { id: "airlock", at: 56, choice: "airlock" },
      { id: "late", at: 70, say: "Ten hours left. Is the water tank getting close to 200 L?" },
    ],
    goals: [
      { id: "ice", kind: "trips", trip: "ice", count: 2, text: "Bring ice home from Shadow Crater twice" },
      { id: "recycler", kind: "build", module: "recycler", count: 1, text: "Build a Water Recycler" },
      { id: "drill", kind: "build", module: "icedrill", count: 1, text: "Build an Ice Drill on the crater's edge" },
      { id: "water", kind: "stock", res: "water", atLeast: 200, text: "Store 200 L of water" },
      { id: "time", kind: "survive", text: "Keep the crew healthy until Day 4, 08:00" },
    ],
    stars: [
      { kind: "sites", count: 1, text: "Deliver a science sample too" },
      { kind: "minStock", res: "water", atLeast: 15, text: "Never let water fall below 15 L" },
    ],
    briefing: [
      "Bad news, Cadet: our water tanks are almost empty.",
      "The Oxygen Maker splits water to make air. No water means no oxygen!",
      "Good news: the dark crater next door is full of ice. Take the rover and bring some home.",
    ],
    learned: [
      "Making oxygen uses up water: on the Moon, water is air.",
      "Craters near the poles that never see sunlight hold ancient ice.",
      "A recycler cleans used water so the crew can use it again and again.",
    ],
    fact: {
      text: "In 2009 NASA's LCROSS mission crashed a rocket stage into Cabeus, a dark crater near the Moon's south pole, and found water in the cloud of debris.",
      source: "NASA Science · LCROSS",
      url: "https://science.nasa.gov/mission/lcross/",
    },
    quiz: {
      q: "Water kept going down even though the crew drank the same amount. Why?",
      options: [
        "The Oxygen Maker splits water to make oxygen",
        "Water boils away on the Moon",
        "The rover uses water as fuel",
      ],
      answer: 0,
      why: "Electrolysis splits water (H₂O) into hydrogen and oxygen. Breathing air and drinking water come from the same tank!",
    },
    after: "first-light",
  },
  {
    id: "green-thumb",
    number: 3,
    planet: "moon",
    title: "Green Thumb",
    tagline: "Grow fresh food without running out of power at night.",
    learn: [
      "Plants need light, water and power",
      "Grow lights compete with other systems at night",
      "Plan power for day and night",
    ],
    objective:
      "Trade-offs under constraints: food production competes with life support for limited stored energy.",
    minutes: 13,
    startT: 7,
    endT: 103,
    res: { power: 180, o2: 45, water: 260, food: 26, materials: 85, science: 0 },
    modules: [
      { type: "solar", pad: 0 },
      { type: "solar", pad: 1 },
      { type: "battery", pad: 2 },
      { type: "oxygen", pad: 3 },
      { type: "recycler", pad: 4 },
    ],
    build: ["solar", "battery", "oxygen", "recycler", "greenhouse", "icedrill", "lab"],
    shield: false,
    hazards: [],
    script: [
      { id: "dusk1", at: 18.5, say: "Sunset soon. Grow lights on High use 3 kW all night. Can the battery handle it? Try Low at night." },
      { id: "supply", at: 34, choice: "supply" },
      { id: "more", at: 40, say: "One greenhouse can't feed four people. Two can, but grow lights need more power, so plan for more solar and storage too." },
      { id: "airlock", at: 64, choice: "airlock" },
      { id: "harvest", at: 84, choice: "harvest" },
    ],
    goals: [
      { id: "gh", kind: "build", module: "greenhouse", count: 2, text: "Build 2 Greenhouses" },
      { id: "grow", kind: "grow", res: "food", atLeast: 40, text: "Grow 40 meals of fresh food" },
      { id: "time", kind: "survive", text: "Keep everyone fed until Day 5, 07:00" },
    ],
    stars: [
      { kind: "noBrownout", text: "No power cuts all mission" },
      { kind: "made", res: "food", atLeast: 55, text: "Grow 55+ meals in total" },
    ],
    briefing: [
      "The food we brought from Earth won't last: about two days left.",
      "Build a Greenhouse. Plants turn light, water and air into food, and make a little oxygen too.",
      "But grow lights need power, even at night. Plan carefully, Cadet!",
    ],
    learned: [
      "Plants need light to grow, so greenhouse lights use a lot of power.",
      "Dimming the lights at night saves the battery while plants keep growing.",
      "Food, water and power are all connected.",
    ],
    fact: {
      text: "Astronauts on the ISS have grown lettuce, cabbage and zinnia flowers in a small garden called Veggie, lit by red, blue and green LEDs. In 2021 they grew and tasted chile peppers too.",
      source: "NASA Science · Veggie",
      url: "https://science.nasa.gov/mission/veggie/",
    },
    quiz: {
      q: "The battery runs out at night when the grow lights are on High. What's the best fix?",
      options: [
        "Use Low at night and High during the day",
        "Build more solar arrays to use at night",
        "Switch off the habitat heaters",
      ],
      answer: 0,
      why: "Solar arrays can't help in the dark, and the heaters keep the crew safe. Dimming the lights at night saves stored power while the plants keep growing.",
    },
    after: "ice-hunters",
  },
  {
    id: "solar-storm",
    number: 4,
    planet: "moon",
    title: "Solar Storm",
    tagline: "A storm from the Sun is coming. Shield your crew from radiation.",
    learn: [
      "The Moon has no air or magnetic field to block radiation",
      "Thick walls of rock, water or regolith make good shields",
      "Warnings give you time to act",
    ],
    objective:
      "Risk management: shielding and sheltering protect the crew but cost materials and productivity.",
    minutes: 13,
    startT: 8,
    endT: 90,
    res: { power: 240, o2: 60, water: 260, food: 80, materials: 55, science: 0 },
    modules: [
      { type: "solar", pad: 0 },
      { type: "solar", pad: 1 },
      { type: "solar", pad: 6 },
      { type: "battery", pad: 2 },
      { type: "battery", pad: 7 },
      { type: "oxygen", pad: 3 },
      { type: "recycler", pad: 4 },
      { type: "greenhouse", pad: 5, light: 1 },
    ],
    rover: { x: -24.5, z: -108, heading: 2.95, battery: 78 },
    build: ["solar", "battery", "oxygen", "recycler", "greenhouse", "shelter", "lab", "icedrill"],
    shield: true,
    hazards: [
      { kind: "storm", startAt: 18, warn: 6, duration: 6, strength: 12 },
      { kind: "storm", startAt: 50, warn: 4, duration: 5, strength: 12 },
      { kind: "storm", startAt: 80, warn: 3, duration: 4, strength: 10 },
    ],
    script: [
      { id: "out", at: 9.1, say: "Maya and Noor are out in the rover at the Crater Wall Layers, far from home. Collect the sample, then think about getting back." },
      { id: "over1", at: 24.5, say: "That was close! The Sun is still active. Use the quiet time to collect another sample, but stay close to home." },
      { id: "experiment", at: 40, choice: "experiment" },
      { id: "over2", at: 55.5, say: "Two down. Forecasters expect one more storm, and this one may give us less warning." },
      { id: "crack", at: 64, choice: "crack" },
    ],
    goals: [
      { id: "home", kind: "home", text: "Bring the rover crew back to the dock" },
      { id: "protect", kind: "protect", text: "Build a Storm Shelter or shield the habitat" },
      { id: "samples", kind: "trips", trip: "science", count: 2, text: "Deliver 2 science samples" },
      { id: "time", kind: "survive", text: "Survive three storms (until Day 4, 18:00)" },
    ],
    stars: [
      { kind: "maxDose", below: 30, text: "Keep everyone under 30 mSv" },
      { kind: "sites", count: 4, text: "Deliver 4 science samples" },
    ],
    briefing: [
      "Cadet, our satellites are watching an active region on the Sun.",
      "If it erupts, a storm of fast particles reaches the Moon. There is no air or magnetic field here to stop them.",
      "Two of your crew are out in the rover. Be ready to bring them home!",
    ],
    learned: [
      "Solar storms fire dangerous particles that can reach the Moon within hours.",
      "Thick shielding made of rock, water or regolith stops most of the radiation.",
      "Warnings give you time to act, so plan ahead.",
    ],
    fact: {
      text: "If a solar storm hits during an Artemis flight, the crew builds a shelter inside Orion from bags of supplies, food and water. They have about an hour to build it and may stay inside for up to a day.",
      source: "NASA · Orion radiation protection plan",
      url: "https://www.nasa.gov/missions/artemis/orion/scientists-and-engineers-evaluate-orion-radiation-protection-plan/",
    },
    quiz: {
      q: "Where is the safest place during a solar storm?",
      options: [
        "Inside a shelter with thick walls",
        "In the rover, driving fast",
        "Outside, behind a big boulder",
      ],
      answer: 0,
      why: "Particles pass through thin walls and rover cabins. Thick, dense material like regolith or water stops most of them.",
    },
    after: "green-thumb",
  },
  {
    id: "red-planet",
    number: 5,
    planet: "mars",
    title: "Red Planet",
    tagline: "Make power and oxygen on Mars, then ride out a dust storm.",
    learn: [
      "Mars gets less than half the sunlight of the Moon",
      "Oxygen can be made from Mars air",
      "Nuclear power works day, night and in storms",
    ],
    objective:
      "Environment drives design: weaker sunlight and dust storms change which power system works best.",
    minutes: 15,
    startT: 7,
    endT: 127,
    res: { power: 120, o2: 24, water: 300, food: 70, materials: 140, science: 0 },
    modules: [
      { type: "solar", pad: 0 },
      { type: "solar", pad: 1 },
      { type: "battery", pad: 2 },
    ],
    build: ["solar", "battery", "oxygen", "recycler", "greenhouse", "shelter", "lab", "reactor"],
    shield: false,
    hazards: [
      { kind: "dust", startAt: 36, warn: 8, duration: 30, strength: 0.25 },
      { kind: "dust", startAt: 96, warn: 6, duration: 16, strength: 0.4 },
    ],
    script: [
      { id: "sunset1", at: 16.5, say: "Mars nights are long and cold too. Can your power last until 06:00?" },
      { id: "supply", at: 30, choice: "supply" },
      { id: "overheat", at: 56, choice: "overheat" },
      { id: "food", at: 70, say: "Fresh food matters on a long Mars mission. A Greenhouse works here too, if you have the power for its lights." },
      { id: "devil", at: 84, choice: "devil" },
    ],
    goals: [
      { id: "oxygen", kind: "build", module: "oxygen", count: 1, text: "Build a MOXIE Oxygen Maker" },
      { id: "grow", kind: "grow", res: "food", atLeast: 15, text: "Grow 15 meals of fresh food on Mars" },
      { id: "clean", kind: "clean", text: "Clean the dusty panels after a storm" },
      { id: "time", kind: "survive", text: "Survive two dust storms (until Sol 6, 07:00)" },
    ],
    stars: [
      { kind: "noBrownout", text: "No power cuts all mission" },
      { kind: "built", module: "reactor", count: 1, text: "Build a Fission Reactor" },
    ],
    briefing: [
      "Welcome to Mars, Commander! The air here is thin and mostly carbon dioxide.",
      "Mars is farther from the Sun, so your solar arrays make less than half the power they made on the Moon.",
      "Weather satellites see a dust storm building. Get your power ready.",
    ],
    learned: [
      "Mars gets about 43% of the sunlight the Moon gets.",
      "Oxygen can be made from Mars's carbon dioxide air, but it takes a lot of power.",
      "A fission reactor works day and night, even in a dust storm.",
    ],
    fact: {
      text: "MOXIE, a lunchbox-sized experiment on NASA's Perseverance rover, made 122 grams of oxygen from the Martian air between 2021 and 2023: about what a small dog breathes in 10 hours.",
      source: "NASA · MOXIE completes its mission",
      url: "https://www.nasa.gov/solar-system/nasas-oxygen-generating-experiment-moxie-completes-mars-mission/",
    },
    quiz: {
      q: "During the dust storm, which power source kept working best?",
      options: ["The fission reactor", "The solar arrays", "The rover's battery"],
      answer: 0,
      why: "Dust blocks sunlight for days or weeks. A reactor doesn't need the Sun, so it keeps going.",
    },
    after: "solar-storm",
  },
  {
    id: "mars-colony",
    number: 6,
    planet: "mars",
    title: "Mars Colony",
    tagline: "Everything at once: build a colony that makes what it needs.",
    learn: [
      "Balance power, air, water, food and shielding together",
      "Expect the unexpected",
      "Self-sufficient means making what you use",
    ],
    objective:
      "Systems thinking: design a self-sufficient outpost under uncertainty and evaluate it with data.",
    minutes: 20,
    startT: 7,
    endT: 199,
    res: { power: 120, o2: 30, water: 160, food: 50, materials: 150, science: 0 },
    modules: [
      { type: "solar", pad: 0 },
      { type: "solar", pad: 1 },
      { type: "battery", pad: 2 },
      { type: "oxygen", pad: 3 },
    ],
    build: ALL,
    shield: true,
    hazards: [],
    script: [],
    goals: [
      { id: "balance", kind: "balance", text: "Make oxygen, water and food faster than the crew uses them" },
      { id: "science", kind: "stock", res: "science", atLeast: 40, text: "Earn 40 science points" },
      { id: "time", kind: "survive", text: "Survive until Sol 9, 07:00" },
    ],
    stars: [
      { kind: "noBrownout", text: "No power cuts all mission" },
      { kind: "minHealth", atLeast: 80, text: "Everyone stays above 80% health" },
    ],
    briefing: [
      "This is it, Commander: your final training mission.",
      "Build a colony that makes its own air, water and food, and keep your crew safe for eight sols.",
      "Mission Control can't predict everything. Expect surprises!",
    ],
    learned: [
      "Real missions juggle every system at once.",
      "Backups and spare parts turn emergencies into problems you can fix.",
      "You think like a mission planner now!",
    ],
    fact: {
      text: "NASA's plan uses the Moon as a proving ground: what Artemis crews learn about power, water, food and radiation on the Moon will help the first people live on Mars.",
      source: "NASA · Artemis",
      url: "https://www.nasa.gov/humans-in-space/artemis/",
    },
    quiz: {
      q: "What does it mean for a colony to be self-sufficient?",
      options: [
        "It makes as much air, water and food as it uses",
        "It never needs electricity",
        "It has more modules than crew",
      ],
      answer: 0,
      why: "A self-sufficient colony doesn't depend on deliveries from Earth: production keeps up with what the crew uses.",
    },
    random: {
      storms: 1,
      dust: 1,
      meteors: 1,
      cards: ["supply", "leak", "fever", "devil", "experiment", "harvest", "airlock", "meteor", "overheat", "crack"],
    },
    after: "red-planet",
  },
  {
    id: "free-moon",
    number: 0,
    planet: "moon",
    title: "Free Play: Moon",
    tagline: "Build your dream lunar outpost. How long can you last?",
    learn: ["Every system, every hazard", "Random events each time"],
    objective: "Open-ended design challenge with random events.",
    minutes: 25,
    startT: 7,
    endT: 7 + 24 * 10,
    res: { power: 60, o2: 30, water: 160, food: 60, materials: 150, science: 0 },
    modules: [],
    build: ALL,
    shield: true,
    hazards: [],
    script: [],
    goals: [
      { id: "balance", kind: "balance", text: "Make oxygen, water and food faster than the crew uses them" },
      { id: "science", kind: "stock", res: "science", atLeast: 60, text: "Earn 60 science points" },
      { id: "time", kind: "survive", text: "Survive 10 days" },
    ],
    stars: [
      { kind: "noBrownout", text: "No power cuts all mission" },
      { kind: "maxDose", below: 25, text: "Keep everyone under 25 mSv" },
    ],
    briefing: [
      "Free play, Commander. A fresh landing site, a full build menu, and random events.",
      "Survive ten days and earn 60 science points. Good luck!",
    ],
    learned: [
      "There is more than one way to build a working outpost.",
      "Random events reward backups and spare resources.",
    ],
    fact: {
      text: "NASA picked regions near the lunar south pole for Artemis landings because of long periods of sunlight on the ridges and water ice in the dark craters nearby.",
      source: "NASA · Artemis III",
      url: "https://www.nasa.gov/missions/artemis/artemis-iii/",
    },
    quiz: {
      q: "Why do Artemis planners like the lunar south pole?",
      options: [
        "Sunny ridges for power and icy craters for water",
        "It is the warmest place on the Moon",
        "It has the thickest air",
      ],
      answer: 0,
      why: "High ridges get sunlight for long stretches, while nearby craters stay dark and cold enough to trap ice.",
    },
    random: {
      storms: 2,
      dust: 0,
      meteors: 1,
      cards: ["supply", "leak", "fever", "meteor", "glint", "experiment", "harvest", "airlock", "overheat", "crack"],
    },
    after: "first-light",
  },
  {
    id: "free-mars",
    number: 0,
    planet: "mars",
    title: "Free Play: Mars",
    tagline: "Weak sunlight, dust storms and surprises. Build a home on Mars.",
    learn: ["Every system, every hazard", "Random events each time"],
    objective: "Open-ended design challenge with random events.",
    minutes: 25,
    startT: 7,
    endT: 7 + 24 * 10,
    res: { power: 90, o2: 30, water: 160, food: 60, materials: 170, science: 0 },
    modules: [],
    build: ALL,
    shield: true,
    hazards: [],
    script: [],
    goals: [
      { id: "balance", kind: "balance", text: "Make oxygen, water and food faster than the crew uses them" },
      { id: "science", kind: "stock", res: "science", atLeast: 60, text: "Earn 60 science points" },
      { id: "time", kind: "survive", text: "Survive 10 sols" },
    ],
    stars: [
      { kind: "noBrownout", text: "No power cuts all mission" },
      { kind: "maxDose", below: 25, text: "Keep everyone under 25 mSv" },
    ],
    briefing: [
      "Free play on Mars, Commander. Full build menu, random dust storms and surprises.",
      "Survive ten sols and earn 60 science points. Good luck!",
    ],
    learned: [
      "Mars rewards steady power that doesn't depend on the Sun.",
      "Random events reward backups and spare resources.",
    ],
    fact: {
      text: "NASA's InSight lander studied marsquakes for four years. Its mission ended in 2022 when dust piled up on its solar panels and it ran out of power.",
      source: "NASA Science · InSight",
      url: "https://science.nasa.gov/mission/insight/",
    },
    quiz: {
      q: "Why did NASA's InSight lander stop working?",
      options: [
        "Dust covered its solar panels",
        "It ran out of oxygen",
        "A dust devil knocked it over",
      ],
      answer: 0,
      why: "Dust slowly blocked the sunlight reaching its panels until there wasn't enough power to keep going.",
    },
    random: {
      storms: 1,
      dust: 1,
      meteors: 1,
      cards: ["supply", "leak", "fever", "devil", "experiment", "harvest", "airlock", "meteor", "overheat", "crack"],
    },
    after: "red-planet",
  },
];

export const CAMPAIGN = MISSIONS.filter((m) => m.number > 0);
export const mission = (id: string) => {
  const m = MISSIONS.find((x) => x.id === id);
  if (!m) throw new Error(`Unknown mission ${id}`);
  return m;
};
