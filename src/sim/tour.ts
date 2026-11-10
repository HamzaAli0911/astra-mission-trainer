import { built, building, buildingAt, type Stage } from "./base";
import type { Floor } from "./home";
import { INSPECTS } from "./inspect";
import { stationById, stationSpot } from "./stations";

/**
 * The colony tour: the base's main buildings in walking order (Hab-1 first, then the HQ, the west wing, the east
 * wing, and the garage outside), each stop finished by using or looking closely at one thing there (E). A mission
 * whose campus is smaller gets Hab-1's own rooms in place of the wings it hasn't built. Pure.
 */
export interface TourStop {
  /** The card that finishes the stop: a campus station or one of Hab-1's close looks. */
  card: string;
  title: string;
  /** Where it is and what it's for, in a sentence or two. */
  text: string;
}

const ALL: (TourStop & { from?: Stage; or?: TourStop })[] = [
  { card: "food", title: "Housing", text: "Hab-1 is the crew's home: quarters upstairs, the galley and the food store down here. Look at the food store." },
  { card: "hq-power", title: "Command HQ", text: "South through the link to the HQ: the operations hall, where every system's numbers meet. Use the power board on the front row." },
  {
    card: "ls-oxygen",
    title: "Life support",
    text: "West along the spine: the life support block makes the air and cleans the water. Use the oxygen plant's controls.",
    from: 1,
    or: { card: "o2", title: "Life support", text: "In Hab-1, north off the hall: the life-support room makes the air. Look at the oxygen supply." },
  },
  {
    card: "gh-lights",
    title: "Greenhouse",
    text: "Further west: the greenhouse grows food under LED light. Use the grow-light panel by the door.",
    from: 1,
    or: { card: "garden", title: "Food", text: "Up Hab-1's stair, in the garden: the food wall grows under LED light. Look at it." },
  },
  {
    card: "sh-console",
    title: "Storm shelter",
    text: "Back along the spine: the storm shelter, walled with water against solar storms. Use its dose console.",
    from: 1,
    or: { card: "dosimeter", title: "Storm shelter", text: "In Hab-1's core, behind the water walls: the storm shelter. Look at its dosimeter." },
  },
  {
    card: "sci-intake",
    title: "Laboratory",
    text: "East through the HQ and along the east spine: the science lab, where samples from the rovers are studied. Look at the sample intake.",
    from: 1,
    or: { card: "printer", title: "Workshop", text: "In Hab-1's lab: the parts printer turns materials into spares. Look at it." },
  },
  { card: "en-power", title: "Engineering", text: "At the far end of the east spine: engineering, with the repair bay and the power desk. Use the power desk.", from: 2 },
  { card: "eva-dust", title: "EVA complex", text: "Back west along the spine: the EVA complex, where the crew suit up and go outside. Look at the dust station.", from: 0 },
  { card: "ga-board", title: "Rover garage", text: "The garage has no air: suit up in the EVA complex, go out through its airlock and walk west to the garage's side door. Use the service board." },
];

/** The tour for a mission's campus. */
export function colonyTour(stage: Stage): TourStop[] {
  return ALL.flatMap((s) => (s.from === undefined || s.from <= stage ? [{ card: s.card, title: s.title, text: s.text }] : s.or ? [s.or] : []));
}

/** Where a card's thing is: a point at its front, its floor (-1: outdoors), and the building it's in. */
export function cardSpot(card: string): { x: number; z: number; level: Floor | -1 } | null {
  const st = stationById(card);
  if (st) {
    const sp = stationSpot(st);
    return { x: (sp.face.ax + sp.face.bx) / 2, z: (sp.face.az + sp.face.bz) / 2, level: sp.level as Floor | -1 };
  }
  const p = INSPECTS.find((x) => x.id === card);
  return p ? { x: p.x, z: p.z, level: p.level } : null;
}
/** Is a card's thing in a building this mission has? */
export function cardBuilt(card: string, stage: Stage) {
  const sp = cardSpot(card);
  if (!sp) return false;
  const b = buildingAt(sp.x, sp.z, sp.level === 2 ? 2 : 0);
  return !b || b === "hab" || built(building(b), stage);
}
