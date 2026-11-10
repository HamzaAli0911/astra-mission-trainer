import { activeHazard, capacity, DOSE_LIMIT, flows, isBuilt, solarFactor } from "./core";
import { building, built, cellById, furnitureById, type Furniture, type Side, type Stage } from "./base";
import { daysLeft, fmt, perDay, status, worry, type Row } from "./inspect";
import { fact, type Fact } from "./library";
import { DAMAGED, MODULES, POWER_PRIORITY, RATES, REPAIR_COST, REPAIR_TIME, STORAGE, spec } from "./modules";
import { PLANETS } from "./planets";
import { SUIT_HOURS } from "./engine";
import { SCOUT_HOME, site, SITE_REACH, SITES } from "./world";
import type { Action, GameState, Module, ModuleType } from "./types";

/**
 * The campus's working stations: consoles, panels and benches you can walk up to and use (E). Each one shows live
 * numbers from the mission, says in a sentence why they matter, links one sourced fact, and, where the base really
 * has a switch for it, offers controls. Every control is an existing game action with the HUD's own rules and costs
 * (switch a module on or off, set grow lights, start a repair, take shelter, send a rover) or opens one of the HUD's
 * planners; nothing here changes a number the simulation doesn't. Pure: the 3D model and the walk read it.
 */
export interface Control {
  label: string;
  /** What it does: game actions, a rover sent somewhere, a HUD planner opened, or a message played again. */
  does: { act: Action[] } | { send: string; which: "rover" | "scout" } | { panel: "build" | "power" | "rover" } | { say: string };
  /** The setting in force now (a switch that's on, the grow-light level that's set). */
  on?: boolean;
  /** Why it can't be used right now (shown greyed out with this reason), or nothing. */
  off?: string;
}
export interface Station {
  id: string;
  title: string;
  /** The piece of furniture it is (you use it from its front), or a stretch of wall it hangs on. */
  furniture?: string;
  wall?: { cell: string; side: Side; at: number; width: number };
  live: (g: GameState) => Row[];
  /** Cause and effect in a sentence or two, from the live numbers. */
  why: (g: GameState) => string;
  fact: (g: GameState) => Fact;
  controls?: (g: GameState) => Control[];
  /** Something on it opens while you use it (an access door, a freezer lid). */
  opens?: boolean;
}

const builtOf = (g: GameState, type: ModuleType) => g.modules.filter((m) => m.type === type && isBuilt(m));
const nameOf = (g: GameState, m: Module) => spec(m.type, g.planet).name;
/** Power a module draws when it runs (kW), for the switches' labels. */
function draw(g: GameState, m: Module) {
  switch (m.type) {
    case "oxygen":
      return PLANETS[g.planet].oxygenPower;
    case "recycler":
      return RATES.recyclerKw;
    case "greenhouse":
      return RATES.greenhouseKw[m.light];
    case "icedrill":
      return RATES.drillKw;
    case "lab":
      return RATES.labKw;
    default:
      return 0;
  }
}
/** An on/off switch for a built module: the same toggle as the HUD's power panel. */
const switchFor = (g: GameState, m: Module, many: boolean): Control => {
  const name = nameOf(g, m) + (many ? ` ${builtOf(g, m.type).indexOf(m) + 1}` : "");
  return { label: m.on ? `Switch the ${name} off` : `Switch the ${name} on (${fmt(draw(g, m), 1)} kW)`, does: { act: [{ type: "toggle", id: m.id }] }, on: m.on };
};
const switches = (g: GameState, type: ModuleType) => {
  const list = builtOf(g, type);
  return list.map((m) => switchFor(g, m, list.length > 1));
};
/** Start a repair on each broken module: the HUD's repair, with its cost. */
const repairs = (g: GameState): Control[] =>
  g.modules
    .filter((m) => m.type !== "habitat" && isBuilt(m) && m.health < 100)
    .map((m) => ({
      label: m.repair > 0 ? `Repairing the ${nameOf(g, m)}…` : `Repair the ${nameOf(g, m)} (${REPAIR_COST} materials)`,
      does: { act: [{ type: "repair", id: m.id }] },
      off: m.repair > 0 ? "Repairs are already under way." : g.res.materials < REPAIR_COST ? `Repairs need ${REPAIR_COST} materials.` : undefined,
    }));
const shelterReady = (g: GameState) => g.modules.some((m) => m.type === "shelter" && isBuilt(m) && m.health >= DAMAGED);
const storm = (g: GameState) => g.hazards.find((h) => h.kind === "storm" && (h.phase === "warned" || h.phase === "active")) ?? null;
const shelterControl = (g: GameState): Control => ({
  label: g.sheltering ? "Leave the shelter (whole crew)" : "Take shelter now (whole crew)",
  does: { act: [{ type: "shelter", on: !g.sheltering }] },
  on: g.sheltering,
  off: !g.sheltering && !shelterReady(g) ? "Build a Storm Shelter first." : undefined,
});
const days = (stock: number, perHour: number) => (perHour > 1e-9 ? `${fmt(stock / perDay(perHour), 1)} days` : "a long time");

/** Where the crew rover is, in a few words. */
function roverStatus(g: GameState) {
  const rv = g.rover;
  if (rv.docked) return rv.battery < 99.5 ? `on the dock, charging (${fmt(rv.battery)}%)` : "on the dock, fully charged";
  const at = SITES.find((s) => Math.hypot(rv.x - s.x, rv.z - s.z) <= SITE_REACH);
  if (rv.task) return `collecting at ${site(rv.task.site)?.name[g.planet] ?? "a site"}`;
  if (at) return `at ${at.name[g.planet]}`;
  return Math.abs(rv.speed) > 0.5 ? "driving" : "stopped outside";
}
function scoutStatus(g: GameState) {
  const sc = g.scout;
  if (!sc) return "not on this mission";
  if (sc.task) return `studying ${site(sc.task.site)?.name[g.planet] ?? "a site"}`;
  const at = SITES.find((s) => Math.hypot(sc.x - s.x, sc.z - s.z) <= SITE_REACH);
  if (at) return `at ${at.name[g.planet]}`;
  return Math.abs(sc.speed) > 0.5 ? "driving" : "parked";
}
/** Send-a-rover buttons: the crew rover to the trips you repeat (ice, regolith) and its home, the science rover to a site it hasn't studied. */
function dispatch(g: GameState): Control[] {
  const rv = g.rover;
  const busy = rv.task ? "The crew is out collecting: wait for them to finish." : undefined;
  const near = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(rv.x - a.x, rv.z - a.z) - Math.hypot(rv.x - b.x, rv.z - b.z);
  const out: Control[] = SITES.filter((s) => s.kind === "ice" || s.kind === "regolith")
    .sort(near)
    .map((s) => ({ label: `Crew rover → ${s.name[g.planet]} (${s.kind === "ice" ? "water ice" : "regolith"})`, does: { send: s.id, which: "rover" as const }, off: busy }));
  if (!rv.docked) out.push({ label: "Crew rover → home to the dock", does: { send: "dock", which: "rover" }, off: busy });
  const sc = g.scout;
  if (sc) {
    const todo = SITES.filter((s) => !sc.studied.includes(s.id)).sort((a, b) => Math.hypot(sc.x - a.x, sc.z - a.z) - Math.hypot(sc.x - b.x, sc.z - b.z));
    const why = sc.task ? "The science rover is busy studying." : undefined;
    for (const s of todo.slice(0, 2)) out.push({ label: `Science rover → ${s.name[g.planet]}`, does: { send: s.id, which: "scout" }, off: why });
    if (Math.hypot(sc.x - SCOUT_HOME.x, sc.z - SCOUT_HOME.z) > 3) out.push({ label: "Science rover → back to its bay", does: { send: "home", which: "scout" }, off: why });
  }
  return out;
}

export const STATIONS: Station[] = [
  /* ---- Command HQ ---- */
  {
    id: "hq-power",
    title: "Power board (operations hall)",
    furniture: "hq-console-aw",
    live: (g) => {
      const f = flows(g);
      const cap = capacity(g).power;
      return [
        ["Battery", `${fmt((g.res.power / cap) * 100)}% (${fmt(g.res.power)} of ${fmt(cap)} kWh)`, g.res.power / cap < 0.2],
        ["Making / using", `${fmt(f.gen, 1)} / ${fmt(f.demand, 1)} kW`, f.gen < f.demand],
        ["Supply", f.short.power ? "SHORT: machines are switching off" : "every machine powered", f.short.power],
      ];
    },
    why: (g) => {
      const f = flows(g);
      const net = f.gen - f.demand;
      return net >= 0
        ? `Generation covers every machine with ${fmt(net, 1)} kW to spare, which charges the batteries. Switching a machine off here saves its power, but stops what it makes.`
        : `Machines want ${fmt(-net, 1)} kW more than the base makes, so the batteries are running down. If they empty, the least important machines lose power first.`;
    },
    fact: (g) => fact(g.planet === "mars" ? "Weaker sunlight, dusty panels" : "Nuclear power for the night"),
    controls: (g) => (["oxygen", "recycler", "greenhouse", "icedrill", "lab"] as ModuleType[]).flatMap((t) => switches(g, t)),
  },
  {
    id: "hq-dispatch",
    title: "Rover dispatch table",
    furniture: "hq-table",
    live: (g) => [
      ["Crew rover", roverStatus(g)],
      ["Its battery", `${fmt(g.rover.battery)}%`, g.rover.battery < 25],
      ["Science rover", scoutStatus(g)],
      ["Sites studied", `${g.scout?.studied.length ?? 0} of ${SITES.length}`],
    ],
    why: () => "Both rovers drive themselves along a planned route round rocks and craters. The crew rover brings home ice and regolith and charges on the dock; the science rover studies the ground at each site.",
    fact: (g) => fact(g.planet === "moon" ? "Ice in eternal shadow" : "Toxic dust"),
    controls: dispatch,
  },
  {
    id: "hq-alerts",
    title: "Alerts and faults board",
    furniture: "hq-crisis",
    live: (g) => {
      const s = storm(g);
      const dust = activeHazard(g, "dust");
      const broken = g.modules.filter((m) => isBuilt(m) && m.health < DAMAGED);
      const f = flows(g);
      return [
        ["Solar storm", s ? (s.phase === "warned" ? "WARNED: get to the shelter" : "ON NOW") : "none", !!s && !g.sheltering],
        ["Dust storm", g.planet === "mars" ? (dust ? "ON: less sunlight" : "none") : "– (no air on the Moon)", !!dust],
        ["Broken machines", broken.length ? broken.map((m) => nameOf(g, m)).join(", ") : "none", broken.length > 0],
        ["Running short", (["power", "o2", "water", "food"] as const).filter((k) => f.short[k]).join(", ") || "nothing", Object.values(f.short).some(Boolean)],
      ];
    },
    why: (g) => (storm(g) ? "A solar storm fires protons that walls and suits only partly stop. Everyone should be behind the shelter's water walls before it peaks." : "Every warning in the base comes up here, so the crew can deal with the most dangerous first."),
    fact: () => fact("No air, no shield"),
    controls: (g) => [...(storm(g) || g.sheltering ? [shelterControl(g)] : []), ...repairs(g)],
  },
  {
    id: "hq-comms",
    title: "Earth comms console",
    furniture: "hq-comms",
    live: (g) => {
      const last = g.feed.filter((f) => f.kind === "capcom").at(-1);
      return [
        ["Signal to Earth", g.planet === "mars" ? "3 to 22 min each way" : "about 1.3 s each way"],
        ["Messages from CAPCOM", `${g.feed.filter((f) => f.kind === "capcom").length}`],
        ["Last one", last ? `"${last.text.length > 70 ? `${last.text.slice(0, 68)}…` : last.text}"` : "–"],
      ];
    },
    why: (g) =>
      g.planet === "mars"
        ? "Radio waves take minutes to cross to Earth and back, so a Mars crew can't ask Mission Control and wait: they have to solve emergencies themselves."
        : "At the Moon's distance a radio message takes just over a second, so Mission Control can talk the crew through a problem almost live.",
    fact: (g) => fact(g.planet === "mars" ? "A conversation with a long pause" : "Why the south pole?"),
    controls: (g) => {
      const last = g.feed.filter((f) => f.kind === "capcom").at(-1);
      return [{ label: "Play CAPCOM's last message again", does: { say: last?.text ?? "" }, off: last ? undefined : "No messages yet." }];
    },
  },
  {
    id: "hq-build",
    title: "Construction planner",
    furniture: "hq-console-be",
    live: (g) => {
      const going = g.modules.filter((m) => !isBuilt(m));
      return [
        ["Materials", `${fmt(g.res.materials)} units`],
        ["Being built", going.length ? going.map((m) => `${nameOf(g, m)} ${fmt((m.built / MODULES[m.type].time) * 100)}%`).join(", ") : "nothing"],
        ["Modules working", `${g.modules.filter((m) => isBuilt(m) && m.type !== "habitat").length}`],
      ];
    },
    why: () => "Every new module is made from materials the rover brings home as regolith. Plan what the colony needs first: air, water, power, food, then shelter.",
    fact: () => fact("Printing spare parts in space"),
    controls: () => [{ label: "Open the build planner", does: { panel: "build" } }],
  },

  /* ---- I. Rover garage (walked in a suit) ---- */
  {
    id: "ga-board",
    title: "Garage service board",
    wall: { cell: "garage", side: "n", at: 37.2, width: 2.6 },
    live: (g) => {
      const rv = g.rover;
      const charging = rv.docked && rv.battery < 99.5;
      return [
        ["Crew rover", roverStatus(g)],
        ["Its charger", charging ? `${RATES.roverChargeKw} kW, +${RATES.roverChargePerHour}% an hour` : rv.docked ? "idle: battery full" : "waiting for the rover", false],
        ["Science rover", scoutStatus(g)],
        ["Its power", g.scout ? "a small nuclear generator (RTG): no charging" : "–"],
      ];
    },
    why: () => "The crew rover's batteries charge on the dock from the base's own power, so a long drive costs the base energy. The science rover carries a nuclear generator and never plugs in.",
    fact: (g) => fact(g.planet === "moon" ? "Ice in eternal shadow" : "Toxic dust"),
    controls: dispatch,
  },

  /* ---- C. Life support ---- */
  {
    id: "ls-oxygen",
    title: "Oxygen plant controls",
    furniture: "ls-console-w",
    live: (g) => {
      const f = flows(g);
      const s = status(g, "oxygen");
      return [
        ["Oxygen stored", `${fmt(g.res.o2, 1)} of ${STORAGE.o2} kg`, g.res.o2 < g.crew.length * 0.84],
        ["Made / breathed a day", `${fmt(perDay(f.o2.made), 1)} / ${fmt(perDay(f.o2.used), 1)} kg`, f.o2.made < f.o2.used],
        [g.planet === "mars" ? "MOXIE plant" : "Electrolysis plant", s, worry(s)],
      ];
    },
    why: (g) => {
      const f = flows(g);
      const plant = builtOf(g, "oxygen");
      if (!plant.length) return `No oxygen plant yet: the crew breathes from the tanks, about ${fmt(perDay(f.o2.used), 1)} kg a day. They'd last ${days(g.res.o2, f.o2.used)}.`;
      const how = g.planet === "mars" ? "pulls oxygen out of the carbon dioxide in Mars's air" : "splits water into oxygen and hydrogen";
      return plant.some((m) => m.on)
        ? `The plant ${how}, for ${PLANETS[g.planet].oxygenPower} kW. Switched off, the crew would breathe the tanks down in ${days(g.res.o2, f.o2.used)}.`
        : `It's off: the tanks are going down by ${fmt(perDay(f.o2.used - f.o2.made), 1)} kg a day, and will run out in ${days(g.res.o2, f.o2.used - f.o2.made)}.`;
    },
    fact: (g) => fact(g.planet === "mars" ? "Making oxygen from Mars air" : "Water becomes air"),
    controls: (g) => switches(g, "oxygen"),
  },
  {
    id: "ls-water",
    title: "Water recovery controls",
    furniture: "ls-console-e",
    live: (g) => {
      const f = flows(g);
      const s = status(g, "recycler");
      return [
        ["Water stored", `${fmt(g.res.water)} of ${STORAGE.water} L`, g.res.water < g.crew.length * 6],
        ["Recycler", s, worry(s)],
        ["Made / used a day", `${fmt(perDay(f.water.made))} / ${fmt(perDay(f.water.used))} L`, f.water.made < f.water.used],
        ["Supply", daysLeft(g.res.water, f.water.made - f.water.used), f.water.made < f.water.used],
      ];
    },
    why: (g) =>
      builtOf(g, "recycler").length
        ? `The recycler wins back ${Math.round(RATES.recyclerRecovery * 100)}% of the water the crew uses, for ${RATES.recyclerKw} kW. Without it every litre used is gone for good.`
        : "No recycler yet: every litre the crew drinks or washes with is lost. A recycler would win most of it back.",
    fact: () => fact("Recycling almost every drop"),
    controls: (g) => switches(g, "recycler"),
  },
  {
    id: "ls-co2",
    title: "CO2 removal rack",
    furniture: "ls-co2",
    live: (g) => {
      const on = !flows(g).short.power;
      return [
        ["Scrubber beds", on ? "taking turns: one soaks, one clears" : "on backup: power short", !on],
        ["CO2 breathed out", `about ${g.crew.length} kg a day`],
      ];
    },
    why: () => "Carbon dioxide has no colour or smell: only sensors know it's building up. The scrubber runs on the habitat's own supply, so it keeps going even when other machines lose power.",
    fact: () => fact("Scrubbing the air"),
  },
  {
    id: "ls-plant",
    title: "Oxygen plant (access door open)",
    furniture: "ls-o2-plant",
    opens: true,
    live: (g) => {
      const s = status(g, "oxygen");
      return [
        ["Plant", s, worry(s)],
        ["Inside", g.planet === "mars" ? "a hot ceramic cell stack (about 800 °C) that splits CO2" : "an electrolysis stack that splits water"],
        ["Makes when running", `${RATES.oxygenKgPerHour * 24} kg of oxygen a day each`],
      ];
    },
    why: (g) => (g.planet === "mars" ? "Mars's air is 95% carbon dioxide: split it, and the oxygen atoms are yours to breathe." : "Water from the ice drill or the tanks goes in; oxygen for breathing and hydrogen come out."),
    fact: (g) => fact(g.planet === "mars" ? "Making oxygen from Mars air" : "Water becomes air"),
  },

  /* ---- E. Greenhouse ---- */
  {
    id: "gh-lights",
    title: "Grow-light controls",
    furniture: "gh-panel",
    live: (g) => {
      const house = builtOf(g, "greenhouse");
      const f = flows(g);
      const light = house[0]?.light ?? 0;
      const s = status(g, "greenhouse");
      return [
        ["Greenhouse", s, worry(s)],
        ["Grow lights", house.length ? ["off", "low", "high"][light] : "–"],
        ["Power for light", `${fmt(house.reduce((a, m) => a + (m.on ? RATES.greenhouseKw[m.light] : 0), 0), 1)} kW`],
        ["Grown / eaten a day", `${fmt(perDay(f.food.made), 1)} / ${fmt(perDay(f.food.used), 1)} meals`, f.food.made < f.food.used],
      ];
    },
    why: (g) =>
      builtOf(g, "greenhouse").length
        ? `Low light grows ${fmt(perDay(RATES.greenhouseFood[1]), 1)} meals a day for ${RATES.greenhouseKw[1]} kW; high grows twice that for ${RATES.greenhouseKw[2]} kW. With the lights off, nothing grows.`
        : "No greenhouse module is built yet, so these racks stand empty. Build one and its crops grow here.",
    fact: () => fact("Gardens in space"),
    controls: (g) => {
      const house = builtOf(g, "greenhouse");
      if (!house.length) return [];
      return ([0, 1, 2] as const).map((level) => ({
        label: ["Grow lights off", "Grow lights low (1.5 kW)", "Grow lights high (3 kW)"][level],
        does: { act: house.map((m) => ({ type: "light" as const, id: m.id, level })) },
        on: house.every((m) => m.light === level),
      }));
    },
  },
  {
    id: "gh-rack",
    title: "Hydroponic rack",
    furniture: "gh-rack-4",
    live: (g) => {
      const house = builtOf(g, "greenhouse");
      const light = house[0]?.light ?? 0;
      return [
        ["Crops", "lettuce, dwarf wheat, tomatoes, beans"],
        ["Growing", !house.length ? "empty: no greenhouse module" : light === 0 ? "paused: lights off" : light === 1 ? "slowly, under low light" : "fast, under high light", !house.length || light === 0],
        ["Water a day", `${fmt(perDay(house.reduce((a, m) => a + RATES.greenhouseWater[m.light], 0)), 1)} L`],
      ];
    },
    why: () => "The roots hang in a thin film of flowing water with nutrients in it, not soil: lighter to bring from Earth, and the water is cleaned and used again.",
    fact: () => fact("Gardens in space"),
  },

  /* ---- K. Storm shelter ---- */
  {
    id: "sh-console",
    title: "Shelter dose console",
    furniture: "sh-console",
    live: (g) => {
      const s = storm(g);
      const outside = PLANETS[g.planet].background + (activeHazard(g, "storm")?.strength ?? 0);
      const top = Math.max(0, ...g.crew.map((c) => c.dose));
      return [
        ["Outside now", `${fmt(outside, 2)} mSv an hour`, !!activeHazard(g, "storm")],
        ["In here", `${fmt(outside * 0.1, 2)} mSv an hour (a tenth)`],
        ["Solar storm", s ? (s.phase === "warned" ? "WARNED" : "ON NOW") : "none", !!s && !g.sheltering],
        ["Highest crew dose", `${fmt(top, 1)} of ${DOSE_LIMIT} mSv`, top > DOSE_LIMIT * 0.75],
      ];
    },
    why: (g) =>
      g.sheltering
        ? "The crew is in here: the water walls stop most of the storm, but building and lab work wait until it's over."
        : "Water is a good shield because it's dense and full of hydrogen. In here the crew gets about a tenth of the dose outside; in the habitat, more than half.",
    fact: () => fact("Building a storm shelter"),
    controls: (g) => [shelterControl(g)],
  },

  /* ---- D. Science lab ---- */
  {
    id: "sci-intake",
    title: "Sample intake",
    furniture: "sci-rocks",
    live: (g) => [
      ["Sites sampled", g.stats.sites.length ? g.stats.sites.map((id) => site(id)?.name[g.planet] ?? id).join(", ") : "none yet"],
      ["On the rover now", `${g.rover.cargo.samples.length} sample${g.rover.cargo.samples.length === 1 ? "" : "s"}`],
      ["Studied by the science rover", `${g.scout?.studied.length ?? 0} site${g.scout?.studied.length === 1 ? "" : "s"}`],
      ["Science gathered", `${fmt(g.res.science)} points`],
    ],
    why: () => "Rock from each site tells a different part of the story: how old the ground is, whether water was there. The crew rover brings samples here to be cut, sorted and studied.",
    fact: (g) => fact(g.planet === "moon" ? "Why the south pole?" : "Toxic dust"),
  },
  {
    id: "sci-freezer",
    title: "Sample freezer (lid open)",
    furniture: "sci-freezer",
    opens: true,
    live: (g) => [
      ["Kept at", "−80 °C"],
      ["Samples stored", `${g.stats.sites.length}`],
      ["Why so cold", g.planet === "moon" ? "ice from the crater must not melt" : "ice and salts must stay as they were found"],
    ],
    why: () => "A sample is only useful if it reaches the scientists unchanged: frozen, sealed and labelled with where it came from.",
    fact: (g) => fact(g.planet === "moon" ? "Ice in eternal shadow" : "Toxic dust"),
  },

  /* ---- F. Clinic ---- */
  {
    id: "cl-health",
    title: "Crew health check",
    furniture: "cl-cart",
    live: (g) => g.crew.map((c): Row => [c.name, `health ${fmt(c.health)}% · ${fmt(c.dose, 1)} mSv · ${c.place === "habitat" ? "in the base" : c.place === "shelter" ? "sheltering" : c.place === "rover" ? "on the rover" : "outside"}`, c.health < 50 || c.dose > DOSE_LIMIT * 0.75]),
    why: () => "Health drops when air, water, food or warmth run short, and comes back when they don't. Radiation dose only adds up, which is why astronauts have a limit for a whole career.",
    fact: () => fact("No air, no shield"),
  },

  /* ---- G. Engineering ---- */
  {
    id: "en-power",
    title: "Power desk",
    furniture: "en-power-desk",
    live: (g) => {
      const f = flows(g);
      const cap = capacity(g).power;
      const sun = solarFactor(g);
      return [
        ["Battery", `${fmt((g.res.power / cap) * 100)}% of ${fmt(cap)} kWh`, g.res.power / cap < 0.2],
        ["Solar arrays", `${builtOf(g, "solar").length} · sunlight ${fmt(sun * 100)}%`],
        ["Making / using", `${fmt(f.gen, 1)} / ${fmt(f.demand, 1)} kW`, f.gen < f.demand],
      ];
    },
    why: (g) => {
      const order = (Object.keys(POWER_PRIORITY) as ModuleType[]).filter((t) => POWER_PRIORITY[t] > 0 && POWER_PRIORITY[t] < 9).sort((a, b) => POWER_PRIORITY[a] - POWER_PRIORITY[b]);
      return `When there isn't enough power, the habitat keeps it first, then: ${order.map((t) => spec(t, g.planet).name).join(", ")}. Switch off what you can spare before the batteries empty.`;
    },
    fact: (g) => fact(g.planet === "mars" ? "Weaker sunlight, dusty panels" : "Nuclear power for the night"),
    controls: (g) => (["oxygen", "recycler", "greenhouse", "icedrill", "lab"] as ModuleType[]).flatMap((t) => switches(g, t)),
  },
  {
    id: "en-repair",
    title: "Repair bay",
    furniture: "en-stand",
    live: (g) => {
      const worn = g.modules.filter((m) => isBuilt(m) && m.type !== "habitat" && m.health < 100);
      return [
        ["Needing repair", worn.length ? worn.map((m) => `${nameOf(g, m)} ${fmt(m.health)}%`).join(", ") : "nothing", worn.some((m) => m.health < DAMAGED)],
        ["Materials", `${fmt(g.res.materials)} units`, g.res.materials < REPAIR_COST],
      ];
    },
    why: () => `A repair takes the crew about ${REPAIR_TIME} hour and ${REPAIR_COST} materials of spare parts. Below ${DAMAGED}% a machine stops working altogether.`,
    fact: () => fact("Printing spare parts in space"),
    controls: repairs,
  },
  {
    id: "en-printer",
    title: "Parts printer",
    furniture: "en-printer-1",
    live: (g) => [
      ["Feedstock (materials)", `${fmt(g.res.materials)} units`],
      ["Prints", "brackets, valves, wheel spokes, tools"],
    ],
    why: () => "Printing parts on demand means the colony doesn't wait months for a spare from Earth, and carries fewer spares to begin with.",
    fact: () => fact("Printing spare parts in space"),
  },

  /* ---- J. Logistics ---- */
  {
    id: "lo-stores",
    title: "Stores inventory",
    furniture: "lo-shelves-1",
    live: (g) => {
      const f = flows(g);
      return [
        ["Meals", `${fmt(g.res.food)} of ${STORAGE.food} · ${daysLeft(g.res.food, f.food.made - f.food.used)}`, f.food.made < f.food.used && g.res.food < g.crew.length * 6],
        ["Water", `${fmt(g.res.water)} of ${STORAGE.water} L · ${daysLeft(g.res.water, f.water.made - f.water.used)}`, f.water.made < f.water.used && g.res.water < g.crew.length * 6],
        ["Materials", `${fmt(g.res.materials)} units`],
      ];
    },
    why: () => "The shelves fill and empty with the real stores. Before a long storm, check there's enough to wait it out.",
    fact: () => fact("Gardens in space"),
  },

  /* ---- H. EVA complex ---- */
  {
    id: "eva-dust",
    title: "Dust station",
    furniture: "eva-brushes",
    live: (g) =>
      g.planet === "mars"
        ? [
            ["Dust on the solar panels", `${fmt(g.dust * 100)}%`, g.dust > 0.3],
            ["Their power lost to it", `about ${fmt(g.dust * 100)}%`, g.dust > 0.3],
          ]
        : [
            ["Moon dust", "sharp as ground glass, and it clings"],
            ["Suits brushed here", "before they go in, every time"],
          ],
    why: (g) =>
      g.planet === "mars"
        ? "Dust settles on the panels and cuts their power. Brushing them clean (outside, in a suit) brings the power back."
        : "With no wind or water to wear it smooth, Moon dust stays sharp. Brushing it off here keeps it out of the crew's lungs and the machines.",
    fact: (g) => fact(g.planet === "mars" ? "Toxic dust" : "Long days, long nights"),
  },
  {
    id: "eva-service",
    title: "Suit service bench",
    furniture: "eva-service",
    live: (g) => [
      ["Alex's suit", g.eva ? `outside, ${fmt(g.eva.left, 1)} h left` : "on its rack, charged"],
      ["Suit time when full", `${SUIT_HOURS} h`],
      ["Checked before every walk", "seals, oxygen, battery, cooling water"],
    ],
    why: () => "A spacesuit is a small spacecraft: its own air, power and cooling. One leak and the walk is over, so it's checked every time.",
    fact: () => fact("No air, no shield"),
  },
];

/** A station's furniture (if it's on one), its room, the floor you use it from (-1: outdoors, in a suit), and its front edge. */
export function stationSpot(st: Station) {
  const f = st.furniture ? furnitureById(st.furniture)! : null;
  const cell = cellById(f ? f.cell : st.wall!.cell)!;
  return { f, cell, level: cell.kind === "hangar" ? -1 : cell.level, face: f ? frontEdge(f) : wallEdge(st.wall!) };
}
/** A strip of wall a board hangs on, as a line just in front of it. */
function wallEdge(w: NonNullable<Station["wall"]>, out = 0.05) {
  const r = cellById(w.cell)!.rect,
    h = w.width / 2;
  if (w.side === "n") return { ax: w.at - h, az: r.z0 + out, bx: w.at + h, bz: r.z0 + out };
  if (w.side === "s") return { ax: w.at - h, az: r.z1 - out, bx: w.at + h, bz: r.z1 - out };
  if (w.side === "w") return { ax: r.x0 + out, az: w.at - h, bx: r.x0 + out, bz: w.at + h };
  return { ax: r.x1 - out, az: w.at - h, bx: r.x1 - out, bz: w.at + h };
}
/** The front of a piece of furniture (the side you use it from), as a line just in front of it. */
export function frontEdge(f: Furniture, out = 0.05) {
  const r = f.rect;
  switch (f.face) {
    case "n":
      return { ax: r.x0, az: r.z0 - out, bx: r.x1, bz: r.z0 - out };
    case "s":
      return { ax: r.x0, az: r.z1 + out, bx: r.x1, bz: r.z1 + out };
    case "w":
      return { ax: r.x0 - out, az: r.z0, bx: r.x0 - out, bz: r.z1 };
    default:
      return { ax: r.x1 + out, az: r.z0, bx: r.x1 + out, bz: r.z1 };
  }
}
/** The point on a line nearest to (x, z). */
export function nearestOn(s: { ax: number; az: number; bx: number; bz: number }, x: number, z: number) {
  const vx = s.bx - s.ax,
    vz = s.bz - s.az;
  const t = Math.max(0, Math.min(1, ((x - s.ax) * vx + (z - s.az) * vz) / (vx * vx + vz * vz || 1)));
  return { x: s.ax + vx * t, z: s.az + vz * t };
}
/** The stations in a mission's campus (those in buildings it has). */
export const stationsFor = (stage: Stage) => STATIONS.filter((s) => built(building(stationSpot(s).cell.building), stage));
export const stationById = (id: string) => STATIONS.find((s) => s.id === id);
