import { CARDS, cantAfford, type Effect } from "./cards";
import {
  activeHazard,
  capacity,
  clamp,
  DOSE_LIMIT,
  flows,
  isBuilt,
  shieldDone,
} from "./core";
import { goalProgress } from "./goals";
import { mission, type Mission } from "./missions";
import {
  DAMAGED,
  MODULES,
  RATES,
  REPAIR_COST,
  REPAIR_TIME,
  SHIELD_COST,
  SHIELD_TIME,
  spec,
} from "./modules";
import { clockOf, daylight, PLANETS } from "./planets";
import { atDock, headingTo, modulePos } from "./rover";
import type {
  Action,
  FeedKind,
  GameState,
  Module,
  ModuleType,
  Resources,
  ScriptEntry,
} from "./types";
import { COLLECT_TIME, DOCK, HAUL, PADS, padFits, site, SITE_REACH } from "./world";

export const CREW = [
  { id: "maya", name: "Maya Chen", role: "Commander" },
  { id: "alex", name: "Alex Rivera", role: "Engineer" },
  { id: "sam", name: "Sam Okafor", role: "Botanist" },
  { id: "noor", name: "Noor Al-Hassan", role: "Geologist" },
];
/** The two crew who ride in the rover. */
export const EVA_CREW = ["maya", "noor"];

const lcg = (seed: number) => (Math.imul(seed, 1664525) + 1013904223) >>> 0;

export function feed(s: GameState, kind: FeedKind, text: string) {
  const id = (s.feed[s.feed.length - 1]?.id ?? 0) + 1;
  s.feed.push({ id, t: s.t, kind, text });
  if (s.feed.length > 80) s.feed.splice(0, s.feed.length - 80);
}

export function createState(id: string, seed = 2026): GameState {
  const m = mission(id);
  const s: GameState = {
    version: 2,
    missionId: id,
    planet: m.planet,
    t: m.startT,
    startT: m.startT,
    seed: seed >>> 0 || 1,
    res: { ...m.res },
    modules: [
      { id: 1, type: "habitat", pad: -1, built: 0, on: true, light: 0, health: 100, repair: 0 },
    ],
    nextId: 2,
    shield: 0,
    shieldStarted: false,
    sheltering: false,
    crew: CREW.map((c) => ({ ...c, health: 100, dose: 0, place: "habitat" as const })),
    rover: {
      x: DOCK.x,
      z: DOCK.z,
      heading: Math.PI,
      speed: 0,
      battery: 100,
      docked: true,
      task: null,
      cargo: { water: 0, materials: 0, science: 0, samples: [] },
    },
    hazards: m.hazards.map((h, i) => ({
      id: i + 1,
      kind: h.kind,
      warnAt: h.startAt - h.warn,
      startAt: h.startAt,
      endAt: h.startAt + h.duration,
      strength: h.strength,
      phase: "pending" as const,
    })),
    script: m.script.map((e) => ({ ...e })),
    fired: [],
    choice: null,
    dust: 0,
    goals: [],
    feed: [],
    history: [],
    stats: {
      brownout: 0,
      shortage: 0,
      minHealth: 100,
      maxDose: 0,
      sites: [],
      trips: { ice: 0, regolith: 0 },
      min: { power: m.res.power, o2: m.res.o2, water: m.res.water, food: m.res.food },
      sheltered: 0,
      made: { o2: 0, water: 0, food: 0 },
    },
    status: "playing",
    endReason: null,
    cold: 0,
    alerts: [],
  };
  for (const pm of m.modules)
    s.modules.push({
      id: s.nextId++,
      type: pm.type,
      pad: pm.pad,
      built: MODULES[pm.type].time,
      on: true,
      light: pm.light ?? 2,
      health: 100,
      repair: 0,
    });
  if (m.rover) {
    s.rover = {
      ...s.rover,
      x: m.rover.x,
      z: m.rover.z,
      heading: m.rover.heading,
      battery: m.rover.battery,
      docked: false,
    };
  } else s.rover.heading = headingTo(DOCK, { x: 0, z: 40 });
  if (m.random) addRandomEvents(s, m);
  placeCrew(s);
  s.history.push(snapshot(s));
  return s;
}

/** Seeded random hazards and decision cards, spread out so they never pile up. */
function addRandomEvents(s: GameState, m: Mission) {
  const r = m.random!;
  let seed = s.seed;
  const rand = () => (seed = lcg(seed)) / 4294967296;
  const from = m.startT + 12,
    to = m.endT - 8;
  const slots: number[] = [];
  const slot = () => {
    for (let tries = 0; tries < 40; tries++) {
      const t = from + rand() * (to - from);
      if (slots.every((x) => Math.abs(x - t) > 9)) {
        slots.push(t);
        return t;
      }
    }
    return from + rand() * (to - from);
  };
  let hid = s.hazards.length;
  for (let i = 0; i < r.storms; i++) {
    const start = Math.round(slot() * 2) / 2,
      warn = 3 + Math.round(rand() * 3);
    s.hazards.push({
      id: ++hid,
      kind: "storm",
      warnAt: start - warn,
      startAt: start,
      endAt: start + 4 + Math.round(rand() * 2),
      strength: 12 + Math.round(rand() * 4),
      phase: "pending",
    });
  }
  if (s.planet === "mars")
    for (let i = 0; i < r.dust; i++) {
      const start = Math.round(slot());
      s.hazards.push({
        id: ++hid,
        kind: "dust",
        warnAt: start - 8,
        startAt: start,
        endAt: start + 18 + Math.round(rand() * 12),
        strength: 0.25,
        phase: "pending",
      });
    }
  for (let i = 0; i < r.meteors; i++)
    s.script.push({ id: `meteor-${i}`, at: Math.round(slot() * 2) / 2, meteor: "any" });
  const days = (m.endT - m.startT) / 24;
  const cards = r.cards.filter((c) => !CARDS[c].planets || CARDS[c].planets!.includes(s.planet));
  const n = Math.min(cards.length, Math.max(2, Math.round(days * 0.7)));
  for (let i = 0; i < n; i++) {
    const k = Math.floor(rand() * cards.length);
    const [card] = cards.splice(k, 1);
    s.script.push({ id: `card-${card}`, at: Math.round(slot() * 2) / 2, choice: card });
  }
  s.script.sort((a, b) => a.at - b.at);
  s.seed = seed;
}

/** Where each crew member is: the rover crew rides along while the rover is out. */
function placeCrew(s: GameState) {
  for (const c of s.crew)
    c.place =
      EVA_CREW.includes(c.id) && !s.rover.docked
        ? "rover"
        : s.sheltering
          ? "shelter"
          : "habitat";
}

function snapshot(s: GameState) {
  const f = flows(s);
  return {
    t: Math.round(s.t * 100) / 100,
    power: s.res.power,
    o2: s.res.o2,
    water: s.res.water,
    food: s.res.food,
    dose: Math.max(...s.crew.map((c) => c.dose)),
    made: f.gen,
    used: f.used,
    sun: daylight(s.planet, s.t),
  };
}

const capFor = (s: GameState, k: keyof Resources) => {
  const c = capacity(s);
  return k === "materials" || k === "science" ? Infinity : c[k];
};

/** Pick a module for a meteor or a damage effect, using the seeded generator. */
function pickModule(s: GameState, type: ModuleType | "any") {
  const options = s.modules.filter(
    (m) =>
      m.type !== "habitat" &&
      isBuilt(m) &&
      m.health >= DAMAGED &&
      (type === "any" || m.type === type),
  );
  if (!options.length) return null;
  s.seed = lcg(s.seed);
  return options[s.seed % options.length];
}

function damage(s: GameState, m: Module, cause: string) {
  m.health = 30;
  feed(
    s,
    "danger",
    `${cause} The ${spec(m.type, s.planet).name} was hit and stopped working. Repair it for ${REPAIR_COST} materials.`,
  );
}

function fire(s: GameState, e: ScriptEntry) {
  s.fired.push(e.id);
  if ("choice" in e) {
    const card = CARDS[e.choice];
    const relevant = !card?.needs || s.modules.some((m) => m.type === card.needs && isBuilt(m));
    if (card && (!card.planets || card.planets.includes(s.planet)) && relevant) s.choice = { card: e.choice, t: s.t };
  } else if ("meteor" in e) {
    const target = pickModule(s, e.meteor);
    if (target) damage(s, target, "Meteorite impact!");
  } else if ("give" in e) {
    for (const [k, v] of Object.entries(e.give) as [keyof Resources, number][])
      s.res[k] = clamp(s.res[k] + v, 0, capFor(s, k));
    feed(s, "good", e.say);
  } else feed(s, "capcom", e.say);
}

function alertOnce(s: GameState, key: string, on: boolean, kind: FeedKind, text: string) {
  const had = s.alerts.includes(key);
  if (on && !had) {
    s.alerts.push(key);
    feed(s, kind, text);
  } else if (!on && had) s.alerts = s.alerts.filter((k) => k !== key);
}

function end(s: GameState, status: "won" | "lost", reason: string) {
  s.status = status;
  s.endReason = reason;
  s.rover.speed = 0;
  feed(s, status === "won" ? "good" : "danger", reason);
}

/**
 * Advance the simulation by `dt` training hours, in place. Order: script and hazards,
 * power and resources, construction and repairs, rover work, radiation, health,
 * alerts, history, then goals and the mission result.
 */
export function step(s: GameState, dt: number) {
  if (s.status !== "playing" || s.choice) return;
  const m = mission(s.missionId);
  const P = PLANETS[s.planet];
  const prevHour = Math.floor(s.t + 1e-9);
  s.t += dt;
  s.t = Math.round(s.t * 1e6) / 1e6;

  for (const e of s.script)
    if (!s.fired.includes(e.id) && s.t >= e.at - 1e-9) fire(s, e);

  for (const h of s.hazards) {
    if (h.phase === "pending" && s.t >= h.warnAt - 1e-9) {
      h.phase = "warned";
      const hours = Math.max(0, Math.round(h.startAt - s.t));
      feed(
        s,
        "alert",
        h.kind === "storm"
          ? `Solar flare spotted! A radiation storm arrives at ${clockOf(h.startAt)} (in ${hours} h). Get the rover home and the crew under cover.`
          : `A dust storm is coming at ${clockOf(h.startAt)} (in ${hours} h). It will block most sunlight for about ${Math.round(h.endAt - h.startAt)} h. Charge up!`,
      );
    }
    if (h.phase === "warned" && s.t >= h.startAt - 1e-9) {
      h.phase = "active";
      feed(
        s,
        "danger",
        h.kind === "storm"
          ? "Radiation storm! Everyone into the Storm Shelter now."
          : "Dust storm! Solar power is down to a quarter. Save power wherever you can.",
      );
    }
    if (h.phase === "active" && s.t >= h.endAt - 1e-9) {
      h.phase = "over";
      if (h.kind === "storm")
        feed(s, "good", "The radiation storm has passed. It's safe to go outside again.");
      else {
        s.dust = clamp(s.dust + 0.6, 0, 1);
        feed(s, "warn", "The dust storm is over, but the solar panels are covered in dust. Clean them to get full power back.");
      }
    }
  }

  // Power, life support and food.
  const f = flows(s, dt);
  const cap = capacity(s);
  s.res.power = clamp(s.res.power + (f.gen - f.used) * dt, 0, cap.power);
  s.res.o2 = clamp(s.res.o2 + (f.o2.made - f.o2.used) * dt, 0, cap.o2);
  s.res.water = clamp(s.res.water + (f.water.made - f.water.used) * dt, 0, cap.water);
  s.res.food = clamp(s.res.food + (f.food.made - f.food.used) * dt, 0, cap.food);
  s.res.science += f.science * dt;
  s.stats.made.o2 += f.o2.made * dt;
  s.stats.made.water += f.water.made * dt;
  s.stats.made.food += f.food.made * dt;
  if (f.short.power) s.stats.brownout += dt;
  if (f.short.o2 || f.short.water || f.short.food) s.stats.shortage += dt;
  if (s.sheltering) s.stats.sheltered += dt;
  if (f.roverKw > 0)
    s.rover.battery = Math.min(
      100,
      s.rover.battery + RATES.roverChargePerHour * (f.roverKw / RATES.roverChargeKw) * dt,
    );

  // Construction and repairs need the crew, so they pause while everyone shelters.
  const work = s.sheltering ? 0 : dt;
  for (const mod of s.modules) {
    const time = MODULES[mod.type].time;
    if (mod.built < time) {
      mod.built = Math.min(time, mod.built + work);
      if (mod.built >= time)
        feed(s, "good", `${spec(mod.type, s.planet).name} is online!`);
    }
    if (mod.repair > 0) {
      mod.repair = Math.max(0, mod.repair - work);
      if (mod.repair === 0) {
        mod.health = 100;
        feed(s, "good", `${spec(mod.type, s.planet).name} repaired.`);
      }
    }
  }
  if (s.shieldStarted && s.shield < SHIELD_TIME) {
    s.shield = Math.min(SHIELD_TIME, s.shield + work);
    if (shieldDone(s))
      feed(s, "good", "Regolith shielding finished! The habitat now blocks 75% of radiation.");
  }

  // Rover work and unloading.
  const rv = s.rover;
  if (rv.task) {
    const where = site(rv.task.site);
    if (!where || Math.hypot(rv.x - where.x, rv.z - where.z) > SITE_REACH + 0.6) {
      rv.task = null;
      feed(s, "info", "Collecting stopped: the rover drove away.");
    } else if (activeHazard(s, "storm")) {
      rv.task = null;
      feed(s, "warn", "Collecting stopped: the crew climbed back into the rover to hide from the storm.");
    } else {
      rv.task.left -= dt;
      if (rv.task.left <= 0) {
        if (where.kind === "ice") rv.cargo.water += HAUL.ice.water;
        else if (where.kind === "regolith") rv.cargo.materials += HAUL.regolith.materials;
        else {
          rv.cargo.science += HAUL.science.science;
          rv.cargo.samples.push(where.id);
        }
        rv.task = null;
        feed(
          s,
          "good",
          where.kind === "ice"
            ? `Ice collected: ${HAUL.ice.water} L of water on board. Drive back to the dock to unload it.`
            : where.kind === "regolith"
              ? `Regolith loaded: ${HAUL.regolith.materials} materials on board. Drive back to the dock to unload.`
              : `Sample collected at ${where.name[s.planet]}! Bring it home for ${HAUL.science.science} science.`,
        );
      }
    }
  }
  if (rv.docked) {
    const c = rv.cargo;
    if (c.water || c.materials || c.science) {
      const parts: string[] = [];
      if (c.water) {
        s.res.water = clamp(s.res.water + c.water, 0, cap.water);
        s.stats.trips.ice++;
        parts.push(`+${c.water} L water`);
      }
      if (c.materials) {
        s.res.materials += c.materials;
        s.stats.trips.regolith++;
        parts.push(`+${c.materials} materials`);
      }
      if (c.science) {
        s.res.science += c.science;
        for (const id of c.samples) if (!s.stats.sites.includes(id)) s.stats.sites.push(id);
        parts.push(`+${c.science} science`);
      }
      rv.cargo = { water: 0, materials: 0, science: 0, samples: [] };
      feed(s, "good", `Rover unloaded: ${parts.join(", ")}.`);
    }
  }
  placeCrew(s);

  // Radiation: background plus any storm, reduced by whatever is between the crew and space.
  const storm = activeHazard(s, "storm");
  const outdoor = P.background + (storm ? storm.strength : 0);
  const habitatFactor = shieldDone(s) ? 0.25 : 0.6;
  const shelterOk = s.modules.some(
    (x) => x.type === "shelter" && isBuilt(x) && x.health >= DAMAGED,
  );
  for (const c of s.crew) {
    const factor =
      c.place === "rover"
        ? rv.task
          ? 1
          : 0.8
        : c.place === "shelter" && shelterOk
          ? 0.1
          : habitatFactor;
    c.dose += outdoor * factor * dt;
  }

  // Health: shortages and cold hurt; good conditions heal.
  const habitat = s.modules.find((x) => x.type === "habitat")!;
  if ((f.ratio[habitat.id] ?? 1) < 0.5) s.cold += dt;
  else s.cold = Math.max(0, s.cold - dt * 2);
  for (const c of s.crew) {
    let harm = 0;
    if (f.short.o2) harm += 20;
    if (f.short.water) harm += 4;
    if (f.short.food) harm += 2;
    if (c.place !== "rover" && s.cold > 1) harm += 5;
    c.health = clamp(c.health + (harm > 0 ? -harm : 1.5) * dt, 0, 100);
  }

  // Records for stars and the debrief.
  const st = s.stats;
  st.minHealth = Math.min(st.minHealth, ...s.crew.map((c) => c.health));
  st.maxDose = Math.max(st.maxDose, ...s.crew.map((c) => c.dose));
  st.min.power = Math.min(st.min.power, s.res.power);
  st.min.o2 = Math.min(st.min.o2, s.res.o2);
  st.min.water = Math.min(st.min.water, s.res.water);
  st.min.food = Math.min(st.min.food, s.res.food);

  // Alerts fire once and re-arm when the problem clears.
  const daily = { o2: f.o2.used * 24, food: f.food.used * 24 };
  alertOnce(s, "power", f.short.power, "danger", "Power ran out! Some systems are shutting down. Switch something off, or make more power.");
  alertOnce(s, "cold", s.cold > 1, "danger", "The habitat is getting dangerously cold! Its heaters need power.");
  alertOnce(s, "o2-low", s.res.o2 < daily.o2 && f.o2.made < f.o2.used, "warn", `Less than a day of oxygen left (${s.res.o2.toFixed(1)} kg). Check the Oxygen Maker has power${P.oxygenWater ? " and water" : ""}.`);
  alertOnce(s, "o2-out", f.short.o2, "danger", "Out of oxygen! The crew can't breathe. Make oxygen right now!");
  alertOnce(s, "water-out", f.short.water, "danger", "Out of water! The crew is getting thirsty. Find ice or recycle water.");
  alertOnce(s, "water-low", s.res.water < 12 && f.water.made < f.water.used, "warn", "Water is almost gone. The Oxygen Maker needs water too!");
  alertOnce(s, "food-low", s.res.food < daily.food && f.food.made < f.food.used, "warn", "Less than a day of food left. Grow more, or switch the grow lights to High.");
  alertOnce(s, "food-out", f.short.food, "danger", "Out of food! The crew is going hungry.");
  for (const c of s.crew) {
    alertOnce(s, `hurt-${c.id}`, c.health < 50, "danger", `${c.name} is in bad shape (${Math.round(c.health)}% health). Fix what is hurting the crew!`);
    alertOnce(s, `dose-${c.id}`, c.dose >= DOSE_LIMIT * 0.7, "danger", `${c.name}'s radiation dose is ${c.dose.toFixed(0)} mSv. The limit is ${DOSE_LIMIT} mSv: get under cover!`);
  }

  if (Math.floor(s.t + 1e-9) > prevHour) {
    s.history.push(snapshot(s));
    if (s.history.length > 260) s.history.shift();
  }

  // Goals and the result.
  for (const g of m.goals)
    if (g.kind !== "survive" && !s.goals.includes(g.id) && goalProgress(s, g, m).done) {
      s.goals.push(g.id);
      feed(s, "good", `Goal complete: ${g.text}!`);
    }
  const hurt = s.crew.find((c) => c.health <= 0);
  const dosed = s.crew.find((c) => c.dose >= DOSE_LIMIT);
  if (hurt)
    end(s, "lost", `${hurt.name}'s health reached zero. On a real mission, the crew would have to give up and fly home.`);
  else if (dosed)
    end(s, "lost", `${dosed.name} received ${dosed.dose.toFixed(0)} mSv of radiation, over the ${DOSE_LIMIT} mSv limit. The flight surgeon ended the mission.`);
  else if (s.t >= m.endT - 1e-9) {
    for (const g of m.goals) if (g.kind === "survive" && !s.goals.includes(g.id)) s.goals.push(g.id);
    const missing = m.goals.filter((g) => !s.goals.includes(g.id));
    if (!missing.length) end(s, "won", "Mission complete! Every goal reached and the crew is safe.");
    else end(s, "lost", `Time ran out before this goal was done: ${missing[0].text}.`);
  }
}

/** Pure: a new state `hours` later, simulated in fixed steps. */
export function advance(prev: GameState, hours: number, stepSize = 0.05): GameState {
  const s = structuredClone(prev);
  let left = hours;
  while (left > 1e-9 && s.status === "playing" && !s.choice) {
    const dt = Math.min(stepSize, left);
    step(s, dt);
    left -= dt;
  }
  return s;
}

export type Result = { state: GameState; ok: boolean; message?: string };

function applyEffects(s: GameState, effects: Effect[]) {
  for (const e of effects) {
    if ("give" in e) {
      for (const [k, v] of Object.entries(e.give) as [keyof Resources, number][])
        s.res[k] = clamp(s.res[k] + v, 0, capFor(s, k));
    } else if ("damage" in e) {
      const target = pickModule(s, e.damage);
      if (target) damage(s, target, "Impact!");
    } else if ("health" in e) {
      const c = s.crew[e.crew];
      if (c) c.health = clamp(c.health + e.health, 5, 100);
    } else if ("dust" in e) s.dust = clamp(s.dust + e.dust, 0, 1);
    else if ("rover" in e) s.rover.battery = clamp(s.rover.battery + e.rover, 0, 100);
    else {
      s.seed = lcg(s.seed);
      const yes = s.seed / 4294967296 < e.chance;
      feed(s, yes ? "warn" : "good", yes ? e.yesText : e.noText);
      applyEffects(s, yes ? e.yes : e.no);
    }
  }
}

/** The best free pad for a module: inner ring first. */
export function freePad(s: GameState, type: ModuleType) {
  return (
    PADS.find((p) => padFits(type, p.kind) && !s.modules.some((m) => m.pad === p.id)) ?? null
  );
}

/** Apply a player decision. Returns the new state, or the old one with a friendly message. */
export function act(prev: GameState, a: Action): Result {
  const no = (message: string): Result => ({ state: prev, ok: false, message });
  if (prev.status !== "playing") return no("This mission is over.");
  if (prev.choice && a.type !== "choose") return no("Make a decision on the event card first.");
  const s = structuredClone(prev);
  const m = mission(s.missionId);
  const find = (id: number) => s.modules.find((x) => x.id === id);
  switch (a.type) {
    case "build": {
      const sp = spec(a.module, s.planet);
      if (!m.build.includes(a.module)) return no(`${sp.name}s aren't part of this mission.`);
      if (s.res.materials < sp.cost)
        return no(`Not enough materials: a ${sp.name} needs ${sp.cost}. Bring regolith home with the rover.`);
      const pad = a.pad === undefined ? freePad(s, a.module) : PADS[a.pad];
      if (!pad)
        return no(
          a.module === "icedrill"
            ? "The ice pad already has a drill on it."
            : a.module === "reactor"
              ? "The far pad is already in use."
              : "Every build pad is full. Recycle a module to make room.",
        );
      if (!padFits(a.module, pad.kind))
        return no(
          a.module === "icedrill"
            ? "Ice Drills only work on the ice pad, at the crater's edge."
            : a.module === "reactor"
              ? "Reactors go on the far pad, away from the crew."
              : "That pad is for something else.",
        );
      if (s.modules.some((x) => x.pad === pad.id)) return no("That pad is already taken.");
      const p = modulePos({ pad: pad.id });
      if (!s.rover.docked && Math.hypot(s.rover.x - p.x, s.rover.z - p.z) < 4.5)
        return no("The rover is parked on that pad. Move it first.");
      s.res.materials -= sp.cost;
      s.modules.push({
        id: s.nextId++,
        type: a.module,
        pad: pad.id,
        built: 0,
        on: true,
        light: 2,
        health: 100,
        repair: 0,
      });
      feed(s, "info", `Building a ${sp.name}. Ready in ${sp.time} hours.`);
      break;
    }
    case "shield": {
      if (!m.shield) return no("Habitat shielding isn't part of this mission.");
      if (s.shieldStarted) return no("The habitat is already being shielded.");
      if (s.res.materials < SHIELD_COST)
        return no(`Shielding needs ${SHIELD_COST} materials. Bring regolith home with the rover.`);
      s.res.materials -= SHIELD_COST;
      s.shieldStarted = true;
      feed(s, "info", `Piling regolith over the habitat. Ready in ${SHIELD_TIME} hours.`);
      break;
    }
    case "toggle": {
      const x = find(a.id);
      if (!x) return no("That module is gone.");
      if (x.type === "habitat") return no("The habitat keeps the crew alive. It stays on!");
      x.on = !x.on;
      feed(s, "info", `${spec(x.type, s.planet).name} switched ${x.on ? "on" : "off"}.`);
      break;
    }
    case "light": {
      const x = find(a.id);
      if (!x || x.type !== "greenhouse") return no("Only greenhouses have grow lights.");
      x.light = a.level;
      x.on = a.level > 0 ? true : x.on;
      break;
    }
    case "repair": {
      const x = find(a.id);
      if (!x) return no("That module is gone.");
      if (x.health >= 100) return no("Nothing to repair.");
      if (x.repair > 0) return no("Repairs are already under way.");
      if (s.res.materials < REPAIR_COST) return no(`Repairs need ${REPAIR_COST} materials.`);
      s.res.materials -= REPAIR_COST;
      x.repair = REPAIR_TIME;
      feed(s, "info", `Repairing the ${spec(x.type, s.planet).name}.`);
      break;
    }
    case "recycle":
    case "cancel": {
      const x = find(a.id);
      if (!x) return no("That module is gone.");
      if (x.type === "habitat") return no("The crew lives in the habitat!");
      const cost = MODULES[x.type].cost,
        refund = isBuilt(x) ? Math.floor(cost / 2) : cost;
      s.modules = s.modules.filter((y) => y.id !== x.id);
      s.res.materials += refund;
      s.res.power = Math.min(s.res.power, capacity(s).power);
      feed(
        s,
        "info",
        `${spec(x.type, s.planet).name} ${isBuilt(x) ? "recycled" : "cancelled"}: +${refund} materials back.`,
      );
      break;
    }
    case "shelter": {
      if (a.on === s.sheltering) return { state: prev, ok: true };
      if (a.on && !s.modules.some((x) => x.type === "shelter" && isBuilt(x) && x.health >= DAMAGED))
        return no("Build a Storm Shelter first.");
      s.sheltering = a.on;
      placeCrew(s);
      feed(
        s,
        "info",
        a.on
          ? "Crew moved into the Storm Shelter. Building and lab work are paused."
          : "Crew is back at work.",
      );
      break;
    }
    case "collect": {
      const where = site(a.site);
      const rv = s.rover;
      if (!where) return no("Unknown site.");
      if (rv.docked) return no("Drive the rover to the site first.");
      if (Math.hypot(rv.x - where.x, rv.z - where.z) > SITE_REACH)
        return no("Get the rover closer to the marker first.");
      if (rv.task) return no("The crew is already collecting.");
      if (activeHazard(s, "storm")) return no("Too dangerous! Wait for the radiation storm to pass.");
      if (where.kind === "science") {
        if (s.stats.sites.includes(where.id) || rv.cargo.samples.includes(where.id))
          return no("You already have a sample from here.");
      } else if (rv.cargo.water || rv.cargo.materials)
        return no("The cargo bay is full. Unload it at the dock first.");
      rv.task = { site: where.id, left: COLLECT_TIME };
      rv.speed = 0;
      feed(s, "info", `Maya and Noor step outside to collect at ${where.name[s.planet]}.`);
      break;
    }
    case "clean": {
      if (s.planet !== "mars" || s.dust < 0.05) return no("The panels are already clean.");
      if (activeHazard(s, "dust")) return no("Wait for the dust storm to end, or the panels will just get dusty again.");
      if (s.sheltering) return no("The crew is sheltering. Get back to work first.");
      s.dust = 0;
      s.res.o2 = Math.max(0, s.res.o2 - 0.3);
      feed(s, "good", "Alex and Sam brushed the panels clean. Full solar power is back!");
      break;
    }
    case "choose": {
      if (!s.choice) return no("There is no decision waiting.");
      const card = CARDS[s.choice.card];
      const option = card?.options[a.option];
      if (!option) return no("Pick one of the options.");
      const short = cantAfford(s.res, option);
      if (short) return no(`${short}. Pick another option.`);
      s.choice = null;
      feed(s, "info", `${card.title} You chose: ${option.label}.`);
      applyEffects(s, option.effects);
      break;
    }
  }
  return { state: s, ok: true };
}

/** Called by the store every frame after moving the rover: docking and leaving the dock. */
export function updateDock(s: GameState) {
  const docked = atDock(s.rover) && Math.abs(s.rover.speed) < 2;
  if (docked !== s.rover.docked) {
    s.rover.docked = docked;
    placeCrew(s);
  }
}

export { DOSE_LIMIT };
