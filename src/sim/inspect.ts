import { capacity, DOSE_LIMIT, flows, isBuilt } from "./core";
import { BLOCKS, HOME, polar, type Level } from "./home";
import { fact, type Fact } from "./library";
import { DAMAGED, STORAGE } from "./modules";
import type { GameState, ModuleType } from "./types";

/**
 * Things inside the home you can look at closely (E): each shows live numbers from the mission and one sourced
 * fact from the science library. Pure: positions come from the floor plan, numbers from the game state.
 */
export interface Inspect {
  id: string;
  title: string;
  level: Level;
  x: number;
  z: number;
  /** Live readings: label, value, and whether it's a worry. */
  live: (g: GameState) => Row[];
  fact: (g: GameState) => Fact;
}
export type Row = [label: string, value: string, warn?: boolean];

const at = (block: string) => {
  const k = BLOCKS.find((b) => b.id === block)!;
  return { level: k.level, ...polar(k.bearing, k.r) };
};
const perDay = (perHour: number) => perHour * 24;
const fmt = (n: number, d = 0) => (Math.abs(n) < 1e-9 ? "0" : n.toFixed(d));
const status = (g: GameState, type: ModuleType) => {
  const m = g.modules.find((x) => x.type === type && isBuilt(x));
  if (!m) return "not built";
  if (m.health < DAMAGED) return m.repair > 0 ? "being repaired" : "FAULT: needs repair";
  if (!m.on) return "switched off";
  const r = flows(g).ratio[m.id] ?? 1;
  return r < 0.5 ? "short of power" : "working";
};
const worry = (s: string) => s !== "working";
const daysLeft = (stock: number, net: number) => (net >= -1e-9 ? "keeping up" : `${fmt(stock / -perDay(net), 1)} days left`);

export const INSPECTS: Inspect[] = [
  {
    id: "o2",
    title: "Oxygen supply",
    ...at("eclss-o2"),
    live: (g) => {
      const f = flows(g);
      const s = status(g, "oxygen");
      return [
        ["Oxygen stored", `${fmt(g.res.o2, 1)} of ${STORAGE.o2} kg`, g.res.o2 < g.crew.length * 0.84],
        ["Made / used a day", `${fmt(perDay(f.o2.made), 1)} / ${fmt(perDay(f.o2.used), 1)} kg`],
        [g.planet === "mars" ? "MOXIE plant" : "Electrolysis plant", s, worry(s)],
      ];
    },
    fact: (g) => fact(g.planet === "mars" ? "Making oxygen from Mars air" : "Water becomes air"),
  },
  {
    id: "co2",
    title: "CO2 scrubber",
    ...at("eclss-co2"),
    live: (g) => {
      const on = !flows(g).short.power;
      return [
        ["Scrubber", on ? "running" : "on backup: power short", !on],
        ["CO2 breathed out", `about ${fmt(g.crew.length * 1, 0)} kg a day`],
      ];
    },
    fact: () => fact("Scrubbing the air"),
  },
  {
    id: "water",
    title: "Water recovery",
    ...at("eclss-water"),
    live: (g) => {
      const f = flows(g);
      const s = status(g, "recycler");
      return [
        ["Recycler", s, worry(s)],
        ["Made / used a day", `${fmt(perDay(f.water.made))} / ${fmt(perDay(f.water.used))} L`],
      ];
    },
    fact: () => fact("Recycling almost every drop"),
  },
  {
    id: "tanks",
    title: "Water tanks",
    ...at("eclss-tanks"),
    live: (g) => {
      const f = flows(g);
      return [
        ["Water stored", `${fmt(g.res.water)} of ${STORAGE.water} L`, g.res.water < g.crew.length * 6],
        ["Supply", daysLeft(g.res.water, f.water.made - f.water.used), f.water.made < f.water.used],
      ];
    },
    fact: (g) => fact(g.planet === "moon" ? "Ice in eternal shadow" : "Recycling almost every drop"),
  },
  {
    id: "power",
    title: "Power console",
    ...at("command-desk-1"),
    live: (g) => {
      const f = flows(g);
      const cap = capacity(g).power;
      return [
        ["Battery", `${fmt((g.res.power / cap) * 100)}% (${fmt(g.res.power, 1)} of ${fmt(cap)} kWh)`, g.res.power / cap < 0.2],
        ["Making / using", `${fmt(f.gen, 1)} / ${fmt(f.demand, 1)} kW`, f.gen < f.demand],
        ["Supply", f.short.power ? "SHORT: some machines are off" : "everything powered", f.short.power],
      ];
    },
    fact: (g) => fact(g.planet === "mars" ? "Weaker sunlight, dusty panels" : "Nuclear power for the night"),
  },
  {
    id: "food",
    title: "Food store",
    ...at("galley-store"),
    live: (g) => {
      const f = flows(g);
      return [
        ["Meals on the shelves", `${fmt(g.res.food)} of ${STORAGE.food}`, g.res.food < g.crew.length * 6],
        ["Grown / eaten a day", `${fmt(perDay(f.food.made), 1)} / ${fmt(perDay(f.food.used), 1)} meals`],
        ["Supply", daysLeft(g.res.food, f.food.made - f.food.used), f.food.made < f.food.used],
      ];
    },
    fact: () => fact("Gardens in space"),
  },
  {
    id: "garden",
    title: "Food wall",
    ...at("garden-rack-1"),
    live: (g) => {
      const s = status(g, "greenhouse");
      const house = g.modules.find((m) => m.type === "greenhouse" && isBuilt(m));
      return [
        ["Greenhouse", s, worry(s)],
        ["Grow lights", !house ? "–" : ["off", "low", "high"][house.light]],
        ["Fresh food", "lettuce and dwarf tomatoes"],
      ];
    },
    fact: () => fact("Gardens in space"),
  },
  {
    id: "medical",
    title: "Medical bay",
    ...at("medical-couch"),
    live: (g) => g.crew.map((c): Row => [c.name, `health ${fmt(c.health)}% · dose ${fmt(c.dose, 1)} mSv`, c.health < 50]),
    fact: () => fact("No air, no shield"),
  },
  {
    id: "dosimeter",
    title: "Storm shelter",
    level: 0,
    ...polar(250, HOME.shelter - 0.35),
    live: (g) => {
      const storm = g.hazards.find((h) => h.kind === "storm" && (h.phase === "warned" || h.phase === "active"));
      const top = Math.max(0, ...g.crew.map((c) => c.dose));
      return [
        ["Highest crew dose", `${fmt(top, 1)} of ${DOSE_LIMIT} mSv`, top > DOSE_LIMIT * 0.75],
        ["Solar storm", storm ? (storm.phase === "warned" ? "WARNED: take shelter" : "ON NOW") : "none", !!storm && !g.sheltering],
        ["Crew", g.sheltering ? "sheltering here" : "about the outpost"],
      ];
    },
    fact: () => fact("Building a storm shelter"),
  },
  {
    id: "comms",
    title: "Comms console",
    ...at("command-desk-2"),
    live: (g) => [
      ["Signal to Earth", g.planet === "mars" ? "3 to 22 min each way (now about 12)" : "about 1.3 s each way"],
      ["Last message", g.feed.filter((f) => f.kind === "capcom").at(-1)?.text.slice(0, 60) ?? "–"],
    ],
    fact: (g) => fact(g.planet === "mars" ? "A conversation with a long pause" : "Why the south pole?"),
  },
  {
    id: "suits",
    title: "Suit rack",
    // (The rack across the room: Alex's suit, for walking outside, is on the other one.)
    ...at("suit-rack-w"),
    live: (g) => [
      ["Suits", `${4 - (g.rover.task ? 2 : 0)} on the racks${g.rover.task ? ", 2 outside" : ""}`],
      ["Crew outside", g.rover.task ? "collecting at a site" : "none"],
    ],
    fact: (g) => fact(g.planet === "mars" ? "Toxic dust" : "Long days, long nights"),
  },
  {
    id: "printer",
    title: "Parts printer",
    ...at("lab-printer"),
    live: (g) => [
      ["Materials", `${fmt(g.res.materials)} units`],
      ["Science gathered", `${fmt(g.res.science)} points`],
    ],
    fact: () => fact("Printing spare parts in space"),
  },
  {
    id: "exercise",
    title: "Treadmill",
    ...at("exercise-treadmill"),
    live: (g) => [
      ["Gravity", g.planet === "mars" ? "3.71 m/s² (38% of Earth's)" : "1.62 m/s² (17% of Earth's)"],
      ["Crew health", `${fmt(g.crew.reduce((a, c) => a + c.health, 0) / g.crew.length)}% on average`],
    ],
    fact: () => fact("Two hours of exercise a day"),
  },
];
