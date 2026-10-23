import {
  CREW_NEEDS,
  DAMAGED,
  EVA_O2,
  MODULES,
  POWER_PRIORITY,
  RATES,
  SHIELD_TIME,
  STORAGE,
} from "./modules";
import { daylight, PLANETS, sunlight } from "./planets";
import type { GameState, Hazard, Module, ModuleType } from "./types";

/** Size of one simulation step, in training hours. */
export const SIM_STEP = 0.05;
/** Training dose limit per crew member, mSv. */
export const DOSE_LIMIT = 50;

export const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

export const isBuilt = (m: Module) => m.built >= MODULES[m.type].time;
/** Built, switched on, not damaged and not under repair. */
export const isWorking = (m: Module) =>
  isBuilt(m) && m.on && m.health >= DAMAGED && m.repair <= 0;
export const countBuilt = (s: GameState, type: ModuleType) =>
  s.modules.filter((m) => m.type === type && isBuilt(m)).length;
export const hasWorking = (s: GameState, type: ModuleType) =>
  s.modules.some((m) => m.type === type && isWorking(m));
export const shieldDone = (s: GameState) => s.shield >= SHIELD_TIME;

export const activeHazard = (s: GameState, kind: Hazard["kind"]) =>
  s.hazards.find((h) => h.kind === kind && h.phase === "active") ?? null;

export function capacity(s: GameState) {
  const banks = s.modules.filter(
    (m) => m.type === "battery" && isBuilt(m) && m.health >= DAMAGED,
  ).length;
  return {
    power: RATES.habitatKwh + banks * RATES.batteryKwh,
    o2: STORAGE.o2,
    water: STORAGE.water,
    food: STORAGE.food,
  };
}

/** Sunlight reaching the arrays: time of day, dust storms and dusty panels. */
export function solarFactor(s: GameState, t = s.t) {
  const storm = activeHazard(s, "dust");
  return (
    sunlight(s.planet, t) *
    PLANETS[s.planet].solar *
    (storm ? storm.strength : 1) *
    (1 - s.dust * 0.6)
  );
}

export function generation(s: GameState, t = s.t) {
  const sun = solarFactor(s, t);
  let kw = 0;
  for (const m of s.modules) {
    if (!isWorking(m)) continue;
    if (m.type === "solar") kw += RATES.solarKw * sun;
    else if (m.type === "reactor") kw += RATES.reactorKw;
  }
  return kw;
}

/** Power a module asks for right now, kW. */
export function demandOf(s: GameState, m: Module, t = s.t) {
  if (!isWorking(m)) return 0;
  const P = PLANETS[s.planet];
  switch (m.type) {
    case "habitat": {
      const d = daylight(s.planet, t);
      return P.habitatNight + (P.habitatDay - P.habitatNight) * d;
    }
    case "oxygen":
      return P.oxygenPower;
    case "recycler":
      return RATES.recyclerKw;
    case "greenhouse":
      return RATES.greenhouseKw[m.light];
    case "icedrill":
      return RATES.drillKw;
    case "shelter":
      return s.sheltering ? RATES.shelterKw : 0;
    case "lab":
      return s.sheltering ? 0 : RATES.labKw;
    default:
      return 0;
  }
}

export interface Flow {
  made: number;
  used: number;
}
export interface Flows {
  /** kW generated, requested and actually delivered. */
  gen: number;
  demand: number;
  used: number;
  /** Fraction of its demand each module received, by module id (rover charger = -1). */
  ratio: Record<number, number>;
  roverKw: number;
  o2: Flow;
  water: Flow;
  food: Flow;
  science: number;
  /** What ran short this step. */
  short: { power: boolean; o2: boolean; water: boolean; food: boolean };
  /** Machines starved of water (oxygen maker on the Moon, greenhouse), 0–1. */
  waterForMachines: number;
}

/**
 * Every resource flow for the next `dt` hours, per hour. The single source of truth:
 * the engine applies it, and the interface shows it as trends and forecasts.
 * Power goes to the most important systems first when there is not enough.
 */
export function flows(s: GameState, dt = SIM_STEP, t = s.t): Flows {
  const P = PLANETS[s.planet];
  const gen = generation(s, t);
  const loads: { id: number; kw: number; prio: number }[] = [];
  for (const m of s.modules) {
    const kw = demandOf(s, m, t);
    if (kw > 0) loads.push({ id: m.id, kw, prio: POWER_PRIORITY[m.type] });
  }
  const roverWants =
    s.rover.docked && s.rover.battery < 99.9 ? RATES.roverChargeKw : 0;
  if (roverWants) loads.push({ id: -1, kw: roverWants, prio: 8 });
  loads.sort((a, b) => a.prio - b.prio);
  const demand = loads.reduce((a, l) => a + l.kw, 0);
  let left = gen + s.res.power / dt,
    used = 0;
  const ratio: Record<number, number> = {};
  for (const l of loads) {
    const r = clamp(left / l.kw, 0, 1);
    ratio[l.id] = r;
    left -= l.kw * r;
    used += l.kw * r;
  }
  // How much of each kind of machine is effectively running (sum of power ratios).
  const running = (type: ModuleType) =>
    s.modules.reduce((sum, m) => {
      if (m.type !== type || !isWorking(m)) return sum;
      return sum + (ratio[m.id] ?? (demandOf(s, m, t) > 0 ? 0 : 1));
    }, 0);
  const crew = s.crew.length;

  // Water: the crew drinks first; machines share what is left.
  const crewWater = CREW_NEEDS.water * crew;
  const recycled =
    crewWater * RATES.recyclerRecovery * Math.min(1, running("recycler"));
  const mined = RATES.drillWater * running("icedrill");
  const oxygenWater = P.oxygenWater * running("oxygen");
  let greenhouseWater = 0;
  for (const m of s.modules)
    if (m.type === "greenhouse" && isWorking(m))
      greenhouseWater += RATES.greenhouseWater[m.light] * (ratio[m.id] ?? 0);
  const waterIn = s.res.water / dt + recycled + mined;
  const crewDrinks = Math.min(crewWater, waterIn);
  const machineWater = oxygenWater + greenhouseWater;
  const waterForMachines =
    machineWater > 0
      ? clamp((waterIn - crewDrinks) / machineWater, 0, 1)
      : 1;

  // Food and the greenhouse's bit of oxygen.
  let food = 0,
    plantO2 = 0;
  for (const m of s.modules) {
    if (m.type !== "greenhouse" || !isWorking(m)) continue;
    const r = (ratio[m.id] ?? 0) * waterForMachines;
    food += RATES.greenhouseFood[m.light] * r * (s.sheltering ? 0.5 : 1);
    plantO2 += RATES.greenhouseO2[m.light] * r;
  }
  const o2Made =
    RATES.oxygenKgPerHour *
      running("oxygen") *
      (P.oxygenWater > 0 ? waterForMachines : 1) +
    plantO2;
  const o2Used = CREW_NEEDS.o2 * crew + (s.rover.docked ? 0 : EVA_O2);
  const foodUsed = CREW_NEEDS.food * crew;

  return {
    gen,
    demand,
    used,
    ratio,
    roverKw: roverWants * (ratio[-1] ?? 0),
    o2: { made: o2Made, used: o2Used },
    water: {
      made: recycled + mined,
      used: crewDrinks + machineWater * waterForMachines,
    },
    food: { made: food, used: foodUsed },
    science: s.sheltering ? 0 : running("lab") * RATES.labScience,
    short: {
      power: used < demand - 1e-6,
      o2: s.res.o2 / dt + o2Made < o2Used,
      water: crewDrinks < crewWater - 1e-9,
      food: s.res.food / dt + food < foodUsed,
    },
    waterForMachines,
  };
}
