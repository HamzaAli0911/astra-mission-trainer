import { activeHazard, capacity, flows, hasWorking, isBuilt, isWorking, SIM_STEP } from "./core";
import { mission } from "./missions";
import { DAMAGED, REPAIR_COST, spec } from "./modules";
import { clockOf, hoursToSunChange, isDaytime, PLANETS } from "./planets";
import type { Action, GameState, ModuleType } from "./types";

/**
 * The advisor turns the simulation into plain-language guidance: what is going
 * wrong, why, and one button that helps. CAPCOM, alert cards and the debrief use it.
 */
export type Fix =
  | { kind: "act"; label: string; action: Action }
  | { kind: "build"; label: string; module: ModuleType }
  | { kind: "panel"; label: string; panel: "power" | "rover" | "build" }
  | { kind: "rover"; label: string; target: string };

export interface Advice {
  id: string;
  level: "danger" | "warn" | "tip";
  text: string;
  fix?: Fix;
}

/** When stored power, oxygen, water and food run out at the current settings (hours from now; null = not within the window). */
export interface Forecast {
  power: number | null;
  o2: number | null;
  water: number | null;
  food: number | null;
  /** Lowest battery level reached in the window, kWh. */
  powerLow: number;
}

/** Project the next `hours` with today's switches: no events, no construction. */
export function forecast(s: GameState, hours = 24, dt = 0.25): Forecast {
  const res = { ...s.res };
  const cap = capacity(s);
  const probe: GameState = { ...s, res, choice: null };
  const out: Forecast = { power: null, o2: null, water: null, food: null, powerLow: res.power };
  for (let h = 0; h < hours; h += dt) {
    const f = flows(probe, dt, s.t + h);
    res.power = Math.min(cap.power, Math.max(0, res.power + (f.gen - f.used) * dt));
    res.o2 = Math.min(cap.o2, Math.max(0, res.o2 + (f.o2.made - f.o2.used) * dt));
    res.water = Math.min(cap.water, Math.max(0, res.water + (f.water.made - f.water.used) * dt));
    res.food = Math.min(cap.food, Math.max(0, res.food + (f.food.made - f.food.used) * dt));
    out.powerLow = Math.min(out.powerLow, res.power);
    if (out.power === null && f.short.power) out.power = h;
    if (out.o2 === null && res.o2 <= 0) out.o2 = h;
    if (out.water === null && res.water <= 0) out.water = h;
    if (out.food === null && res.food <= 0) out.food = h;
  }
  return out;
}

/** Hours of a resource left at the current net rate (Infinity when not shrinking). */
export function hoursLeft(stock: number, made: number, used: number) {
  const net = made - used;
  return net >= -1e-6 ? Infinity : stock / -net;
}

export function advise(s: GameState): Advice[] {
  if (s.status !== "playing") return [];
  const m = mission(s.missionId);
  const P = PLANETS[s.planet];
  const f = flows(s, SIM_STEP);
  const out: Advice[] = [];
  const name = (t: ModuleType) => spec(t, s.planet).name;
  const can = (t: ModuleType) => m.build.includes(t);
  const storm = activeHazard(s, "storm");
  const nextStorm = s.hazards.find((h) => h.kind === "storm" && h.phase === "warned");
  const shelter = s.modules.find((x) => x.type === "shelter" && isBuilt(x) && x.health >= DAMAGED);

  // Radiation first: it is the fastest way to lose a crew member.
  if (storm) {
    if (!s.rover.docked)
      out.push({ id: "storm-rover", level: "danger", text: "The rover crew is outside in a radiation storm! Drive home to the dock.", fix: { kind: "rover", label: "Drive home", target: "dock" } });
    if (shelter && !s.sheltering)
      out.push({ id: "storm-shelter", level: "danger", text: "Radiation storm! Move the crew into the Storm Shelter.", fix: { kind: "act", label: "Take shelter", action: { type: "shelter", on: true } } });
    else if (!shelter && can("shelter"))
      out.push({ id: "storm-noshelter", level: "danger", text: "There is no shelter yet. The habitat's thin walls let a lot through. Build a Storm Shelter as fast as you can.", fix: { kind: "build", label: "Build a shelter", module: "shelter" } });
  } else if (nextStorm) {
    const hrs = Math.max(0, nextStorm.startAt - s.t);
    if (!s.rover.docked)
      out.push({ id: "warn-rover", level: "warn", text: `A radiation storm arrives at ${clockOf(nextStorm.startAt)}. Get the rover crew home before then.`, fix: { kind: "rover", label: "Drive home", target: "dock" } });
    if (!shelter && !s.modules.some((x) => x.type === "shelter") && can("shelter"))
      out.push({ id: "warn-build-shelter", level: "warn", text: `Storm in ${Math.ceil(hrs)} h. A Storm Shelter takes 3 h to build. Start now!`, fix: { kind: "build", label: "Build a shelter", module: "shelter" } });
  } else if (s.sheltering)
    out.push({ id: "unshelter", level: "tip", text: "The storm is over. Let the crew get back to work.", fix: { kind: "act", label: "Back to work", action: { type: "shelter", on: false } } });

  // Life support.
  const o2Hours = hoursLeft(s.res.o2, f.o2.made, f.o2.used);
  if (o2Hours < 30) {
    const maker = s.modules.find((x) => x.type === "oxygen");
    if (!maker && can("oxygen"))
      out.push({ id: "o2-build", level: o2Hours < 10 ? "danger" : "warn", text: `Oxygen lasts about ${Math.floor(o2Hours)} h. Build an ${name("oxygen")}.`, fix: { kind: "build", label: `Build ${name("oxygen")}`, module: "oxygen" } });
    else if (maker && !maker.on)
      out.push({ id: "o2-off", level: "warn", text: `The ${name("oxygen")} is switched off and oxygen is falling.`, fix: { kind: "act", label: "Switch it on", action: { type: "toggle", id: maker.id } } });
    else if (maker && isWorking(maker) && P.oxygenWater > 0 && f.waterForMachines < 0.9)
      out.push({ id: "o2-water", level: "danger", text: "The Oxygen Maker has no water to split! Bring ice home or recycle water.", fix: { kind: "rover", label: "Go get ice", target: "ice" } });
    else if (maker && isWorking(maker) && (f.ratio[maker.id] ?? 1) < 0.9)
      out.push({ id: "o2-power", level: "danger", text: "The Oxygen Maker isn't getting enough power. Switch off something less important.", fix: { kind: "panel", label: "Open power", panel: "power" } });
  }
  const waterHours = hoursLeft(s.res.water, f.water.made, f.water.used);
  if (waterHours < 36) {
    if (!s.modules.some((x) => x.type === "recycler") && can("recycler"))
      out.push({ id: "water-recycle", level: "warn", text: `Water lasts about ${Math.floor(waterHours)} h. A Water Recycler gives back most of what the crew uses.`, fix: { kind: "build", label: "Build a recycler", module: "recycler" } });
    else if (!s.rover.cargo.water)
      out.push({ id: "water-ice", level: "warn", text: `Water lasts about ${Math.floor(waterHours)} h. Send the rover for ice.`, fix: { kind: "rover", label: "Go get ice", target: "ice" } });
  }
  const foodHours = hoursLeft(s.res.food, f.food.made, f.food.used);
  if (foodHours < 30 && can("greenhouse") && !s.modules.some((x) => x.type === "greenhouse"))
    out.push({ id: "food-gh", level: "warn", text: `Food lasts about ${Math.floor(foodHours)} h. Build a Greenhouse.`, fix: { kind: "build", label: "Build a greenhouse", module: "greenhouse" } });

  // Power: will the battery make it?
  const fc = forecast(s, 18);
  if (f.short.power)
    out.push({ id: "power-out", level: "danger", text: "Out of power! Switch off the lab, drill or grow lights, or build more power.", fix: { kind: "panel", label: "Open power", panel: "power" } });
  else if (fc.power !== null && fc.power < 12) {
    const when = clockOf(s.t + fc.power);
    out.push({
      id: "power-forecast",
      level: fc.power < 3 ? "danger" : "warn",
      text: isDaytime(s.planet, s.t)
        ? `At this rate the battery runs out at ${when}. Make more power, or use less after sunset.`
        : `At this rate the battery runs out at ${when}, before sunrise. Switch something off.`,
      fix: { kind: "panel", label: "Open power", panel: "power" },
    });
  }

  // Repairs, dust, rover.
  for (const x of s.modules)
    if (isBuilt(x) && x.health < DAMAGED && x.repair <= 0)
      out.push(
        s.res.materials >= REPAIR_COST
          ? { id: `repair-${x.id}`, level: "warn", text: `The ${name(x.type)} is damaged and not working.`, fix: { kind: "act", label: `Repair (${REPAIR_COST} materials)`, action: { type: "repair", id: x.id } } }
          : { id: `repair-${x.id}`, level: "warn", text: `The ${name(x.type)} is damaged, and repairs need ${REPAIR_COST} materials. Haul regolith with the rover, or recycle a module you can spare.`, fix: { kind: "rover", label: "Get regolith", target: "regolith" } },
      );
  if (s.dust > 0.2 && !activeHazard(s, "dust"))
    out.push({ id: "dust", level: "warn", text: "Dust is blocking the solar panels. Clean them for full power.", fix: { kind: "act", label: "Clean panels", action: { type: "clean" } } });
  const rv = s.rover;
  if (!rv.docked && (rv.cargo.water || rv.cargo.materials || rv.cargo.science) && !rv.task)
    out.push({ id: "unload", level: "tip", text: "The rover is carrying cargo. Drive back to the dock to unload it.", fix: { kind: "rover", label: "Drive home", target: "dock" } });
  if (!rv.docked && rv.battery < 25)
    out.push({ id: "rover-low", level: "warn", text: `Rover battery at ${Math.round(rv.battery)}%. Head home to recharge.`, fix: { kind: "rover", label: "Drive home", target: "dock" } });

  // Night is coming.
  if (isDaytime(s.planet, s.t) && hoursToSunChange(s.planet, s.t) < 3 && s.res.power < capacity(s).power * 0.6 && hasWorking(s, "solar"))
    out.push({ id: "dusk", level: "tip", text: `Sunset at ${clockOf(s.t + hoursToSunChange(s.planet, s.t))} and the battery isn't full. Plan for the night.`, fix: { kind: "panel", label: "Open power", panel: "power" } });

  return out;
}

/** The most useful single suggestion right now. */
export const topAdvice = (s: GameState) => advise(s)[0] ?? null;

/** After a failed mission: what to try next time, starting with the cause. */
export function lessonsFromFailure(s: GameState): string[] {
  const out: string[] = [];
  const reason = s.endReason ?? "";
  const m = mission(s.missionId);
  if (/radiation|mSv/.test(reason)) {
    out.push("Build a Storm Shelter before the storm arrives, and press Shelter (H) as soon as it hits. Get the rover home first: its thin walls let a lot through.");
    if (m.shield) out.push("Regolith shielding over the habitat protects the crew all the time, even when they're not in the shelter.");
  } else if (/health/.test(reason)) {
    if (s.stats.min.o2 <= 0.1) out.push("Oxygen ran out. Keep an Oxygen Maker running, give it power, and on the Moon make sure it has water.");
    if (s.stats.min.water <= 0.1) out.push("Water ran out. Recycle it and bring ice home with the rover before the tanks get low.");
    if (s.stats.min.food <= 0.1) out.push("Food ran out. Greenhouses take time to build and grow, so start them early.");
    if (s.stats.brownout > 1) out.push("The power ran out, so the heaters stopped. Store energy in batteries before night and switch off what you don't need.");
  } else if (/Time ran out/.test(reason)) {
    const missing = m.goals.find((g) => !s.goals.includes(g.id) && g.kind !== "survive");
    if (missing) out.push(`Plan for every goal from the start: "${missing.text}" wasn't done in time. Speed up time only when everything is on track.`);
  }
  // Top up with the advisor's view of the final state, if the cause alone said little.
  for (const a of advise({ ...s, status: "playing" })) if (out.length < 2 && a.level !== "tip") out.push(a.text);
  if (!out.length) out.push("Watch the days-left counters under each supply, and open the Power panel before sunset.");
  return out.slice(0, 3);
}
