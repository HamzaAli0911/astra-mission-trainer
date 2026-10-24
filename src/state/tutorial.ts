import { countBuilt } from "../sim/core";
import type { GameState, ModuleType } from "../sim/types";
import { site } from "../sim/world";
import type { GameStore, Speed } from "./game";
import type { UIStore } from "./ui";

/**
 * Guided first missions. Each step is one small thing to do, explained by CAPCOM
 * and finished by actually doing it. The clock is held while CAPCOM explains and
 * runs while you wait for something to happen, so nothing can go wrong mid-lesson.
 */
export interface Ctx {
  game: GameState;
  ui: UIStore;
  store: GameStore;
}
export interface Step {
  id: string;
  say: string;
  /** Spotlight: a CSS selector, or "3d:<anchor>" for something in the world. */
  target?: string | ((c: Ctx) => string | undefined);
  /** Finished when this returns true. Steps without it show a Next button. */
  done?: (c: Ctx) => boolean;
  /** Label for the Next button. */
  next?: string;
  /** Hold the clock during this step. */
  hold: boolean;
  /** Game speed while this step runs. */
  speed?: Speed;
  /** Hint shown under the text (keys, touch). */
  hint?: string;
}

const has = (g: GameState, t: ModuleType) => g.modules.some((m) => m.type === t);
const buildTarget = (t: ModuleType) => (c: Ctx) =>
  c.ui.panel === "build" ? `[data-build="${t}"]` : `[data-dock="build"]`;

const FIRST_LIGHT: Step[] = [
  {
    id: "hello",
    hold: true,
    say: "Welcome to the Moon, Cadet! I'm Jo, your CAPCOM: the person at Mission Control who talks to the crew. Let's get your outpost running.",
    next: "Let's go!",
  },
  {
    id: "look",
    hold: true,
    target: "3d:habitat",
    say: "This dome is your habitat, home to four astronauts. Drag to look around. Scroll or pinch to zoom.",
    done: (c) => c.ui.looked > 0,
    next: "Next",
  },
  {
    id: "resources",
    hold: true,
    target: ".resource-bar",
    say: "Up here are your crew's lifelines: power, oxygen, water and food. If one runs out, the crew is in trouble.",
    next: "Next",
  },
  {
    id: "drain",
    hold: true,
    target: '[data-res="power"]',
    say: "See the red arrow? Power is draining: the habitat runs on its own small battery. Let's build something that makes electricity.",
    next: "Next",
  },
  {
    id: "open-build",
    hold: true,
    target: '[data-dock="build"]',
    say: "Tap Build.",
    hint: "Keyboard: B",
    done: (c) => c.ui.panel === "build",
  },
  {
    id: "solar",
    hold: true,
    target: buildTarget("solar"),
    say: "Pick the Solar Array and tap Build. It turns sunlight into electricity.",
    done: (c) => has(c.game, "solar"),
  },
  {
    id: "wait-solar",
    hold: false,
    speed: 4,
    target: '[data-tut="clock"]',
    say: "Building takes 3 hours, so I've sped up time. Watch the clock!",
    done: (c) => countBuilt(c.game, "solar") > 0,
  },
  {
    id: "power-up",
    hold: true,
    target: '[data-res="power"]',
    say: "Power is flowing! The array makes more than the habitat uses, and the spare power charges the battery. The arrow is green now.",
    next: "Next",
  },
  {
    id: "oxygen",
    hold: true,
    target: buildTarget("oxygen"),
    say: "Next, air! The crew breathes 3.4 kg of oxygen a day, and we have less than two days left. Build an Oxygen Maker.",
    done: (c) => has(c.game, "oxygen"),
  },
  {
    id: "wait-oxygen",
    hold: false,
    speed: 4,
    target: '[data-res="water"]',
    say: "The Oxygen Maker uses electricity to split water into oxygen and hydrogen. So it uses up a little of our water too.",
    done: (c) => countBuilt(c.game, "oxygen") > 0,
  },
  {
    id: "open-power",
    hold: true,
    target: '[data-dock="power"]',
    say: "Every machine uses power. Open the Power panel to see your power budget.",
    hint: "Keyboard: P",
    done: (c) => c.ui.panel === "power",
  },
  {
    id: "budget",
    hold: true,
    target: ".power-balance",
    say: "Yellow is the power you make, orange is the power you use. Below are switches for each machine: switching one off saves power, but it stops working.",
    next: "Got it",
  },
  {
    id: "night",
    hold: true,
    target: '[data-tut="clock"]',
    say: "The Sun sets at 20:00. At night solar arrays make NOTHING, and the heaters need MORE power. We need to store energy for the dark.",
    next: "Next",
  },
  {
    id: "battery",
    hold: true,
    target: buildTarget("battery"),
    say: "Build a Battery Bank to save spare daytime power for the night. Tip: a second Solar Array will fill it faster.",
    done: (c) => has(c.game, "battery"),
  },
  {
    id: "go",
    hold: true,
    target: '[data-tut="speed"]',
    say: "You're ready, Commander! Get the crew through the night. Use these buttons to speed up time. If the battery runs low, switch off the Oxygen Maker for a while: the crew has stored oxygen.",
    next: "Start the clock",
  },
];

const near = (g: GameState, id: string, d: number) => {
  const s = site(id)!;
  return Math.hypot(g.rover.x - s.x, g.rover.z - s.z) < d;
};

const ICE_HUNTERS: Step[] = [
  {
    id: "water",
    hold: true,
    target: '[data-res="water"]',
    say: "Look at the water: it's low, and the Oxygen Maker drinks it to make air! Time to go ice hunting.",
    next: "Next",
  },
  {
    id: "open-rover",
    hold: true,
    target: '[data-dock="rover"]',
    say: "Open the Rover panel.",
    hint: "Keyboard: R",
    done: (c) => c.ui.panel === "rover",
  },
  {
    id: "go-ice",
    hold: true,
    target: (c) => (c.ui.panel === "rover" ? '[data-site="ice"]' : '[data-dock="rover"]'),
    say: "Find Shadow Crater and tap Go. The rover drives itself. You can also steer it yourself with W A S D or the arrow keys.",
    done: (c) => c.store.target === "ice" || !c.game.rover.docked,
  },
  {
    id: "drive",
    hold: false,
    speed: 2,
    target: "3d:rover-body",
    say: "On our way! The crater floor never sees sunlight, so it's about −230 °C. The rover's battery drains faster in the cold and dark.",
    done: (c) => near(c.game, "ice", 5.5) || !!c.game.rover.task || c.game.rover.cargo.water > 0,
  },
  {
    id: "collect",
    hold: true,
    target: '[data-act="collect"]',
    say: "We're here! Tap Collect. Maya and Noor will step outside and dig up some ice.",
    done: (c) => !!c.game.rover.task || c.game.rover.cargo.water > 0,
  },
  {
    id: "digging",
    hold: false,
    speed: 2,
    target: "3d:rover-body",
    say: "Digging... The rover can only carry one load of ice at a time.",
    done: (c) => c.game.rover.cargo.water > 0,
  },
  {
    id: "home",
    hold: true,
    target: '[data-act="home"]',
    say: "Got it! Now drive home to the dock to unload the ice.",
    done: (c) => c.store.target === "dock" || c.game.rover.docked,
  },
  {
    id: "driving-home",
    hold: false,
    speed: 2,
    target: "3d:rover-body",
    say: "Heading home. The rover recharges on the dock, using the outpost's power. Tip: press Cockpit (bottom right, or V) to ride in the driver's seat.",
    done: (c) => c.game.stats.trips.ice > 0,
  },
  {
    id: "recycler",
    hold: true,
    target: buildTarget("recycler"),
    say: "+45 L of water! Now build a Water Recycler. It cleans used water so the crew can use it again.",
    done: (c) => has(c.game, "recycler"),
  },
  {
    id: "done",
    hold: true,
    say: "Nice driving, Commander! Now fill the tanks to 200 L before Day 4, and build an Ice Drill to mine water for you. Watch the rover's battery on long trips.",
    next: "Let's do this",
  },
];

const RED_PLANET: Step[] = [
  {
    id: "mars-power",
    hold: true,
    target: '[data-dock="power"]',
    say: "Mars is about 1.5 times farther from the Sun than the Moon. Open the Power panel and look at how much your solar arrays make.",
    done: (c) => c.ui.panel === "power",
  },
  {
    id: "mars-sun",
    hold: true,
    target: ".power-balance",
    say: "Less than half the power we had on the Moon! On Mars, oxygen comes from the air: a MOXIE maker splits carbon dioxide, and that needs lots of power. Plan your power first.",
    next: "Got it",
  },
];

export const TUTORIALS: Record<string, Step[]> = {
  "first-light": FIRST_LIGHT,
  "ice-hunters": ICE_HUNTERS,
  "red-planet": RED_PLANET,
};
