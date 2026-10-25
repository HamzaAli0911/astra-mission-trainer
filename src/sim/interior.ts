import { capacity, flows, isBuilt } from "./core";
import { CREW_NEEDS, DAMAGED, STORAGE } from "./modules";
import type { GameState, ModuleType } from "./types";

/**
 * What the inside of the home shows, worked out from the mission alone (pure: the 3D view only reads this).
 * Lights follow the clock and the power; alarms, faults, empty shelves and rationing signs follow the supplies.
 */
export type LightMode = "normal" | "dim" | "emergency";
export type DayPhase = "morning" | "day" | "evening" | "night";
export interface InteriorState {
  /** Normal; dim and amber when the battery is low; emergency red when the power can't keep everything on. */
  lights: LightMode;
  phase: DayPhase;
  /** Lamp brightness 0–1 and colour (RGB 0–1): cool in the morning, neutral by day, warm in the evening, low at night. */
  brightness: number;
  color: [number, number, number];
  /** Low lights along the floor, at night or in a blackout. */
  pathLights: boolean;
  /** In a power shortage only the life-support screens stay on. */
  screens: "all" | "essential";
  /** How fast the life-support fans turn, 0–1. */
  fans: number;
  /** The most urgent alarm sounding inside, if any. */
  alarm: null | "storm" | "o2" | "power";
  storm: "none" | "warned" | "active";
  sheltering: boolean;
  /** The shelter's hatch stands open while a storm is coming or on. */
  shelterOpen: boolean;
  dust: boolean;
  o2Low: boolean;
  waterLow: boolean;
  foodLow: boolean;
  /** Battery charge 0–1, and whether it's low (under 20%). */
  battery: number;
  batteryLow: boolean;
  /** Food on the shelves and water in the tanks, 0–1 of what they hold. */
  foodFill: number;
  waterFill: number;
  /** Equipment that's broken (damaged modules), by what it does. */
  faults: Partial<Record<ModuleType, boolean>>;
  /** How well the food wall is growing, 0–1 (needs the greenhouse working and lit). */
  plants: number;
}

const PHASE_COLOR: Record<DayPhase, [number, number, number]> = {
  morning: [0.8, 0.9, 1],
  day: [1, 0.97, 0.92],
  evening: [1, 0.72, 0.46],
  night: [1, 0.66, 0.4],
};
const PHASE_BRIGHT: Record<DayPhase, number> = { morning: 0.92, day: 1, evening: 0.78, night: 0.3 };

export function dayPhase(t: number): DayPhase {
  const h = ((t % 24) + 24) % 24;
  return h >= 5 && h < 9 ? "morning" : h >= 9 && h < 17 ? "day" : h >= 17 && h < 21 ? "evening" : "night";
}

export function interiorState(g: GameState): InteriorState {
  const f = flows(g);
  const cap = capacity(g);
  const battery = Math.max(0, Math.min(1, g.res.power / Math.max(1e-6, cap.power)));
  const batteryLow = battery < 0.2;
  const lights: LightMode = f.short.power ? "emergency" : batteryLow ? "dim" : "normal";
  const phase = dayPhase(g.t);
  const color: [number, number, number] = lights === "emergency" ? [1, 0.16, 0.1] : lights === "dim" ? [1, 0.68, 0.34] : PHASE_COLOR[phase];
  const brightness = lights === "emergency" ? 0.16 : PHASE_BRIGHT[phase] * (lights === "dim" ? 0.55 : 1);
  const storm = g.hazards.find((h) => h.kind === "storm" && (h.phase === "warned" || h.phase === "active"));
  const stormPhase = storm ? (storm.phase as "warned" | "active") : "none";
  // A day's supply for the crew is the line for "low".
  const crew = g.crew.length;
  const o2Low = g.res.o2 < crew * CREW_NEEDS.o2 * 24;
  const waterLow = g.res.water < crew * CREW_NEEDS.water * 24 * 2;
  const foodLow = g.res.food < crew * CREW_NEEDS.food * 24 * 2;
  const faults: InteriorState["faults"] = {};
  for (const m of g.modules) if (isBuilt(m) && m.health < DAMAGED) faults[m.type] = true;
  const house = g.modules.find((m) => m.type === "greenhouse" && isBuilt(m));
  const plants = !house ? 0.35 : house.health < DAMAGED || !house.on ? 0.45 : Math.min(1, 0.55 + 0.45 * (f.ratio[house.id] ?? 0) * (house.light / 2));
  return {
    lights,
    phase,
    brightness,
    color,
    pathLights: phase === "night" || lights === "emergency",
    screens: lights === "emergency" ? "essential" : "all",
    fans: lights === "emergency" ? 0.25 : 1,
    alarm: stormPhase !== "none" && !g.sheltering ? "storm" : o2Low ? "o2" : lights === "emergency" ? "power" : null,
    storm: stormPhase,
    sheltering: g.sheltering,
    shelterOpen: stormPhase !== "none" || g.sheltering,
    dust: g.hazards.some((h) => h.kind === "dust" && h.phase === "active"),
    o2Low,
    waterLow,
    foodLow,
    battery,
    batteryLow,
    foodFill: Math.max(0, Math.min(1, g.res.food / STORAGE.food)),
    waterFill: Math.max(0, Math.min(1, g.res.water / STORAGE.water)),
    faults,
    plants,
  };
}
