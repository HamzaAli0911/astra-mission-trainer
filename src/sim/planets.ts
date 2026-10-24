import type { Planet } from "./types";

/**
 * Planet settings. Real relationships, compressed time:
 * - One training day is 24 h with a long night; a real lunar day–night cycle lasts
 *   about 29.5 Earth days, and a Mars sol lasts 24 h 39 min.
 * - Mars receives about 43% of the sunlight the Moon does (it is ~1.5× farther from the Sun).
 * - Background radiation: ≈1.3 mSv/day on the lunar surface (Chang'e-4 LND) and
 *   ≈0.7 mSv/day on Mars (Curiosity RAD). Values here are rounded training values.
 */
export interface PlanetSpec {
  name: string;
  /** "Day" on the Moon, "Sol" on Mars. */
  dayWord: string;
  sunrise: number;
  sunset: number;
  /** Solar array output relative to the Moon. */
  solar: number;
  /** Outdoor background radiation, mSv per hour. */
  background: number;
  /** Habitat power draw in kW: pumps, fans, lights by day, plus heaters at night. */
  habitatDay: number;
  habitatNight: number;
  /** Oxygen maker power (kW) and water use (L/h): electrolysis on the Moon, CO₂ splitting on Mars. */
  oxygenPower: number;
  oxygenWater: number;
  /** Rover battery % per metre driven. */
  roverDrain: number;
}

export const PLANETS: Record<Planet, PlanetSpec> = {
  moon: {
    name: "Moon",
    dayWord: "Day",
    sunrise: 6,
    sunset: 20,
    solar: 1,
    background: 0.055,
    habitatDay: 1.2,
    habitatNight: 2.5,
    oxygenPower: 1.5,
    oxygenWater: 0.23,
    roverDrain: 0.16,
  },
  mars: {
    name: "Mars",
    dayWord: "Sol",
    sunrise: 6,
    sunset: 18,
    solar: 0.43,
    background: 0.03,
    habitatDay: 1.2,
    habitatNight: 2,
    oxygenPower: 3.5,
    oxygenWater: 0,
    roverDrain: 0.18,
  },
};

const smooth = (a: number, b: number, v: number) => {
  const x = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return x * x * (3 - 2 * x);
};
const hourOf = (t: number) => ((t % 24) + 24) % 24;

/** 1 in daylight, 0 at night, with a one-hour twilight at each end. */
export function daylight(planet: Planet, t: number) {
  const { sunrise, sunset } = PLANETS[planet];
  const h = hourOf(t);
  return Math.min(
    smooth(sunrise - 0.5, sunrise + 0.5, h),
    1 - smooth(sunset - 0.5, sunset + 0.5, h),
  );
}

/**
 * Fraction of full sunlight on the solar arrays. On the Moon's polar ridge, vertical
 * tracking arrays see a low Sun at a steady angle all day; on Mars output peaks at noon.
 */
export function sunlight(planet: Planet, t: number) {
  const v = daylight(planet, t);
  if (planet === "moon" || v <= 0) return v;
  const { sunrise, sunset } = PLANETS[planet];
  const shape = Math.sin((Math.PI * (hourOf(t) - sunrise)) / (sunset - sunrise));
  return v * (0.55 + 0.45 * Math.max(0, shape));
}

export const isDaytime = (planet: Planet, t: number) => {
  const h = hourOf(t);
  return h >= PLANETS[planet].sunrise && h < PLANETS[planet].sunset;
};

/** Hours until the next sunset (by day) or sunrise (by night). */
export function hoursToSunChange(planet: Planet, t: number) {
  const { sunrise, sunset } = PLANETS[planet];
  const h = hourOf(t);
  if (h >= sunrise && h < sunset) return sunset - h;
  return h < sunrise ? sunrise - h : 24 - h + sunrise;
}

export const dayOf = (t: number) => Math.floor(t / 24) + 1;
export function clockOf(t: number) {
  const h = hourOf(t),
    whole = Math.floor(h),
    m = Math.floor((h - whole) * 60);
  return `${String(whole).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
