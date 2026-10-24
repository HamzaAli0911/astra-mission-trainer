import type { ModuleType, Planet, Resources } from "./types";

/**
 * Decision cards: short events where every option has a cost. The game pauses
 * while a card is open, and each option lists its consequences up front.
 */
export type Effect =
  | { give: Partial<Resources> }
  | { damage: ModuleType | "any" }
  | { health: number; crew: number }
  | { dust: number }
  | { rover: number }
  | { chance: number; yes: Effect[]; no: Effect[]; yesText: string; noText: string };

export interface CardOption {
  label: string;
  /** Plain-language consequence shown on the button. */
  result: string;
  effects: Effect[];
}
export interface Card {
  id: string;
  icon: "lander" | "leak" | "fever" | "meteor" | "glint" | "devil" | "flask" | "plant" | "airlock" | "battery" | "solar";
  title: string;
  text: string;
  planets?: Planet[];
  /** Only shown if the outpost has a finished module of this type. */
  needs?: ModuleType;
  options: CardOption[];
  /** What this decision teaches, shown after choosing. */
  lesson: string;
}

export const CARDS: Record<string, Card> = {
  supply: {
    id: "supply",
    icon: "lander",
    title: "A cargo lander has arrived!",
    text: "It can only stay a short time. Your crew has time to unload ONE crate. Which do you need most?",
    options: [
      { label: "Food crate", result: "+45 meals", effects: [{ give: { food: 45 } }] },
      { label: "Spare parts", result: "+45 materials", effects: [{ give: { materials: 45 } }] },
      { label: "Water tanks", result: "+120 L water", effects: [{ give: { water: 120 } }] },
    ],
    lesson: "Every kilogram launched from Earth is expensive, so mission planners choose cargo carefully.",
  },
  leak: {
    id: "leak",
    icon: "leak",
    title: "Hiss! A water pipe is leaking.",
    text: "A fitting in the habitat cracked. Fix it now with spare parts, or mop up and lose the water.",
    options: [
      { label: "Fix it now", result: "−10 materials", effects: [{ give: { materials: -10 } }] },
      { label: "Mop up", result: "−35 L water", effects: [{ give: { water: -35 } }] },
    ],
    lesson: "Spare parts are a resource too. Crews trade one kind of supply for another all the time.",
  },
  fever: {
    id: "fever",
    icon: "fever",
    title: "Sam has a fever.",
    text: "Your botanist feels unwell. A rest day means less work gets done. Pushing on could make Sam sicker.",
    options: [
      { label: "Rest for a day", result: "−10 science, Sam recovers", effects: [{ give: { science: -10 } }, { health: 100, crew: 2 }] },
      { label: "Keep working", result: "Sam's health −30", effects: [{ health: -30, crew: 2 }] },
    ],
    lesson: "Crew health is a resource you protect. Flight surgeons watch every astronaut closely.",
  },
  meteor: {
    id: "meteor",
    icon: "meteor",
    title: "Meteor shower forecast",
    text: "Tiny fast rocks may rain down tonight. With no air to burn them up, they hit the ground at high speed.",
    options: [
      { label: "Build a regolith berm", result: "−15 materials, no damage", effects: [{ give: { materials: -15 } }] },
      {
        label: "Take the chance",
        result: "60% chance a module is damaged",
        effects: [
          {
            chance: 0.6,
            yes: [{ damage: "any" }],
            no: [],
            yesText: "A micrometeoroid hit the outpost! Repair the damaged module.",
            noText: "Lucky! The meteors missed the outpost.",
          },
        ],
      },
    ],
    lesson: "The Moon has no atmosphere to burn up meteors, so outposts need shielding or spare parts.",
  },
  glint: {
    id: "glint",
    icon: "glint",
    title: "Something glints in the dark",
    text: "The rover's camera spotted a shiny rock. Driving over to scan it uses rover battery.",
    options: [
      { label: "Scan it", result: "+20 science, −20% rover battery", effects: [{ give: { science: 20 } }, { rover: -20 }] },
      { label: "Ignore it", result: "Nothing happens", effects: [] },
    ],
    lesson: "Exploring costs energy and time, but discoveries are the reason we go.",
  },
  devil: {
    id: "devil",
    icon: "devil",
    title: "A dust devil is heading your way!",
    text: "A spinning column of dust is crossing the plain. It might blow your panels clean, or cover them in dust.",
    planets: ["mars"],
    options: [
      { label: "Fold the panels", result: "−12 kWh, safe", effects: [{ give: { power: -12 } }] },
      {
        label: "Let it pass",
        result: "50/50: cleaner or dustier panels",
        effects: [
          {
            chance: 0.5,
            yes: [{ dust: -1 }],
            no: [{ dust: 0.35 }],
            yesText: "Whoosh! The dust devil blew the panels clean.",
            noText: "The dust devil coated the panels in dust. Clean them when you can.",
          },
        ],
      },
    ],
    lesson: "Dust devils really have cleaned the solar panels of Mars rovers like Spirit and Opportunity.",
  },
  experiment: {
    id: "experiment",
    icon: "flask",
    title: "Rush experiment request",
    text: "Mission Control asks you to run a power-hungry experiment for scientists on Earth.",
    options: [
      { label: "Run it", result: "+15 science, −15 kWh", effects: [{ give: { science: 15, power: -15 } }] },
      { label: "Not today", result: "Save the power", effects: [] },
    ],
    lesson: "Science and survival compete for the same power. Commanders balance both.",
  },
  harvest: {
    id: "harvest",
    icon: "plant",
    title: "The peppers are ripe!",
    text: "Your greenhouse grew a bumper crop. Eat them now, or study the seeds to grow better plants.",
    options: [
      { label: "Eat them", result: "+15 meals", effects: [{ give: { food: 15 } }] },
      { label: "Study the seeds", result: "+12 science", effects: [{ give: { science: 12 } }] },
    ],
    lesson: "In 2021 astronauts on the ISS grew and tasted chile peppers in space for the first time.",
  },
  overheat: {
    id: "overheat",
    icon: "battery",
    title: "A battery cell is overheating",
    text: "One cell in a Battery Bank is running hot. Swap it now with spare parts, or keep it running and hope it holds until you have materials to spare.",
    needs: "battery",
    options: [
      { label: "Swap the cell", result: "−15 materials", effects: [{ give: { materials: -15 } }] },
      {
        label: "Keep it running",
        result: "50% chance the Battery Bank fails until repaired",
        effects: [
          {
            chance: 0.5,
            yes: [{ damage: "battery" }],
            no: [],
            yesText: "The hot cell failed and a Battery Bank shut down. Repair it before the Sun sets!",
            noText: "The cell cooled down. The Battery Bank is fine, for now.",
          },
        ],
      },
    ],
    lesson: "Batteries can overheat. Spacecraft batteries are watched cell by cell, and spare parts are packed for exactly this.",
  },
  crack: {
    id: "crack",
    icon: "solar",
    title: "A solar array is damaged",
    text: "A tiny impact cracked the cover glass on a Solar Array and it shut itself down. Repair it now, or leave it and fix it later.",
    needs: "solar",
    options: [
      { label: "Repair it now", result: "−10 materials, keeps making power", effects: [{ give: { materials: -10 } }] },
      { label: "Fix it later", result: "One array stops until you repair it", effects: [{ damage: "solar" }] },
    ],
    lesson: "Spare parts now or lost power later: crews weigh repairs against what they will need next.",
  },
  airlock: {
    id: "airlock",
    icon: "airlock",
    title: "The airlock seal is worn",
    text: "Every trip outside wears the airlock seal. Replace it now, or let a little air leak out.",
    options: [
      { label: "Replace the seal", result: "−12 materials", effects: [{ give: { materials: -12 } }] },
      { label: "Live with the leak", result: "−3 kg oxygen", effects: [{ give: { o2: -3 } }] },
    ],
    lesson: "Every airlock cycle loses a little air. Engineers design seals and pumps to save it.",
  },
};

/** Resources an option spends that the outpost must actually have (other losses can simply happen). */
const SPEND: (keyof Resources)[] = ["materials", "science"];

/** Why an option can't be chosen right now (it costs more than the outpost has), or null if it can. */
export function cantAfford(res: Resources, option: CardOption): string | null {
  for (const e of option.effects)
    if ("give" in e)
      for (const k of SPEND) {
        const v = e.give[k];
        if (v !== undefined && v < 0 && res[k] < -v) return `Needs ${-v} ${k}`;
      }
  return null;
}
