import type { ModuleType, Planet } from "./types";

/**
 * The outpost's equipment. Rates are per training hour for a crew of four.
 * Crew needs (per person per day): 0.84 kg oxygen, about 3 L water, 3 meals.
 * Equipment numbers are simplified training values chosen so that each
 * real relationship (water → oxygen, light → food, sunlight → power) is visible.
 */
export const CREW_NEEDS = {
  o2: 0.035, // kg per person per hour (0.84 kg/day)
  water: 0.125, // litres per person per hour (3 L/day)
  food: 0.125, // meals per person per hour (3 meals/day)
};
/** Extra oxygen used while the rover is out (airlock and suit losses), kg/h. */
export const EVA_O2 = 0.04;

export const RATES = {
  solarKw: 6, // per array in full lunar sunlight
  batteryKwh: 120, // per battery bank
  habitatKwh: 60, // the habitat's own battery
  oxygenKgPerHour: 0.2, // per oxygen maker
  recyclerRecovery: 0.85, // fraction of the crew's used water recovered
  recyclerKw: 0.8,
  greenhouseKw: [0, 1.5, 3],
  greenhouseFood: [0, 0.18, 0.36], // meals per hour
  greenhouseWater: [0, 0.08, 0.16],
  greenhouseO2: [0, 0.01, 0.02],
  drillKw: 2.5,
  drillWater: 1.5,
  shelterKw: 0.5, // only while the crew is inside
  labKw: 1.5,
  labScience: 1,
  reactorKw: 10,
  roverChargeKw: 2.5,
  roverChargePerHour: 25, // % per hour on the dock
};

export const STORAGE = {
  o2: 90,
  water: 400,
  food: 150,
};

export const SHIELD_TIME = 4;
export const SHIELD_COST = 30;
export const REPAIR_COST = 10;
export const REPAIR_TIME = 1;
/** Below this health a module stops working. */
export const DAMAGED = 50;

export interface ModuleSpec {
  type: ModuleType;
  name: string;
  /** Accent colour used in the UI and on the model. */
  color: string;
  cost: number;
  /** Training hours to build. */
  time: number;
  /** One line: what it does. */
  does: string;
  /** One line: the catch (the trade-off). */
  catch: string;
  /** A real-world connection. */
  real: string;
  /** Different wording on Mars. */
  mars?: { does?: string; catch?: string; name?: string };
}

export const MODULES: Record<ModuleType, ModuleSpec> = {
  habitat: {
    type: "habitat",
    name: "Habitat",
    color: "#e9eef8",
    cost: 0,
    time: 0,
    does: `Home for 4 crew: air, warmth and a ${RATES.habitatKwh} kWh battery.`,
    catch: "Its heaters need twice as much power at night.",
    real: "The Moon's surface can drop below −170 °C at night, so habitats need heating.",
    mars: { catch: "Mars nights reach −80 °C, so its heaters need extra power at night." },
  },
  solar: {
    type: "solar",
    name: "Solar Array",
    color: "#ffc94a",
    cost: 20,
    time: 3,
    does: "Makes 6 kW of electricity in sunlight.",
    catch: "Makes nothing at night.",
    real: "On the Moon's south pole, tall arrays can catch sunlight that skims the horizon.",
    mars: {
      does: "Makes about 2.6 kW in sunlight (Mars is farther from the Sun).",
      catch: "Nothing at night, and dust storms or dusty panels cut it further.",
    },
  },
  battery: {
    type: "battery",
    name: "Battery Bank",
    color: "#ffad3b",
    cost: 15,
    time: 2,
    does: `Stores ${RATES.batteryKwh} kWh so daytime power lasts through the night.`,
    catch: "Stores power but never makes any.",
    real: "Batteries and fuel cells carry spacecraft and rovers through the dark.",
  },
  oxygen: {
    type: "oxygen",
    name: "Oxygen Maker",
    color: "#5ee0ff",
    cost: 25,
    time: 3,
    does: "Makes 4.8 kg of oxygen a day. The crew breathes 3.4 kg.",
    catch: "It splits water: uses 1.5 kW and 5.5 L of water a day.",
    real: "On the ISS, electricity splits water into oxygen and hydrogen.",
    mars: {
      name: "MOXIE Oxygen Maker",
      does: "Makes 4.8 kg of oxygen a day from carbon dioxide in the air.",
      catch: "Needs no water, but uses 3.5 kW of power.",
    },
  },
  recycler: {
    type: "recycler",
    name: "Water Recycler",
    color: "#4f95ff",
    cost: 20,
    time: 2,
    does: "Cleans and returns 85% of the water the crew uses.",
    catch: "Uses 0.8 kW. It can only recycle water that was already used.",
    real: "The ISS recycles about 98% of its water, even sweat and urine.",
  },
  greenhouse: {
    type: "greenhouse",
    name: "Greenhouse",
    color: "#63d471",
    cost: 30,
    time: 4,
    does: "Grows up to 8.6 meals a day and adds a little oxygen.",
    catch: "Grow lights use 1.5–3 kW, even at night. Plants need water.",
    real: "Astronauts have grown lettuce, peppers and zinnias in the Veggie garden on the ISS.",
  },
  icedrill: {
    type: "icedrill",
    name: "Ice Drill",
    color: "#a8e6ff",
    cost: 30,
    time: 4,
    does: "Mines 36 L of water a day from buried ice.",
    catch: "Must sit on the ice pad. Uses 2.5 kW.",
    real: "Water ice at the Moon's south pole is a big reason Artemis is going there.",
  },
  shelter: {
    type: "shelter",
    name: "Storm Shelter",
    color: "#c48bff",
    cost: 25,
    time: 3,
    does: "Thick walls block 90% of solar storm radiation.",
    catch: "While the crew hides inside, the lab and building stop and crops grow at half speed.",
    real: "Water, food and regolith make good shields. Orion astronauts build a shelter from stowage bags.",
  },
  lab: {
    type: "lab",
    name: "Science Lab",
    color: "#7ef0c8",
    cost: 20,
    time: 3,
    does: "Earns 1 science point every hour.",
    catch: "Uses 1.5 kW, and stops while the crew shelters.",
    real: "Science is why we explore: every outpost is also a laboratory.",
  },
  reactor: {
    type: "reactor",
    name: "Fission Reactor",
    color: "#ff9a57",
    cost: 60,
    time: 6,
    does: "Makes 10 kW day and night, in any weather.",
    catch: "Costly, and it must sit on the far pad, away from the crew.",
    real: "NASA's Fission Surface Power project is designing small reactors for the Moon and Mars.",
  },
};

/** Name and text for this planet. */
export function spec(type: ModuleType, planet: Planet) {
  const base = MODULES[type];
  if (planet !== "mars" || !base.mars) return base;
  return {
    ...base,
    name: base.mars.name ?? base.name,
    does: base.mars.does ?? base.does,
    catch: base.mars.catch ?? base.catch,
  };
}

/** Build menu order. */
export const BUILD_ORDER: ModuleType[] = [
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

/** Lower number = gets power first when there is not enough to go round. */
export const POWER_PRIORITY: Record<ModuleType, number> = {
  habitat: 0,
  oxygen: 1,
  shelter: 2,
  recycler: 3,
  greenhouse: 4,
  icedrill: 5,
  lab: 6,
  battery: 9,
  solar: 9,
  reactor: 9,
};
