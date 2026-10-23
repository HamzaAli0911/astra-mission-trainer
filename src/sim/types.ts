export type Planet = "moon" | "mars";

export type ModuleType =
  | "habitat"
  | "solar"
  | "battery"
  | "oxygen"
  | "recycler"
  | "greenhouse"
  | "icedrill"
  | "shelter"
  | "lab"
  | "reactor";

/** Things the outpost stores. Units: kWh, kg, litres, meals, parts, points. */
export interface Resources {
  power: number;
  o2: number;
  water: number;
  food: number;
  materials: number;
  science: number;
}
export type ResourceKey = keyof Resources;

/** Greenhouse grow lights: off, low, high. */
export type Light = 0 | 1 | 2;

export interface Module {
  id: number;
  type: ModuleType;
  /** Index into the planet's build pads; the habitat sits at -1 (the centre). */
  pad: number;
  /** Construction hours completed. Finished when built >= the spec's build time. */
  built: number;
  on: boolean;
  light: Light;
  /** 0–100. Below DAMAGED the module stops working until repaired. */
  health: number;
  /** Hours of repair work left (0 = not being repaired). */
  repair: number;
}

export type CrewPlace = "habitat" | "shelter" | "rover";
export interface Crew {
  id: string;
  name: string;
  role: string;
  /** 0–100. A crew member at 0 ends the simulation. */
  health: number;
  /** Radiation dose this mission, millisieverts. */
  dose: number;
  place: CrewPlace;
}

export interface Cargo {
  water: number;
  materials: number;
  science: number;
  /** Ids of one-time science sites whose samples are on board. */
  samples: string[];
}

/** The pressurized crew rover. Position is metres; heading 0 faces north (−z). */
export interface Rover {
  x: number;
  z: number;
  heading: number;
  /** Signed speed, metres per training hour. */
  speed: number;
  /** Rover battery, percent. */
  battery: number;
  docked: boolean;
  /** Collecting at a site: hours of work left. */
  task: { site: string; left: number } | null;
  cargo: Cargo;
}

export type HazardKind = "storm" | "dust";
/** A scheduled environmental hazard with a warning period. */
export interface Hazard {
  id: number;
  kind: HazardKind;
  warnAt: number;
  startAt: number;
  endAt: number;
  /** Storm: extra dose rate outdoors (mSv/h). Dust: fraction of sunlight that gets through. */
  strength: number;
  phase: "pending" | "warned" | "active" | "over";
}

/** "alert" is a warning that pauses the game (a storm is coming); "danger" is an emergency. */
export type FeedKind = "info" | "good" | "warn" | "alert" | "danger" | "capcom";
export interface FeedItem {
  id: number;
  t: number;
  kind: FeedKind;
  text: string;
}

export interface HistoryPoint {
  t: number;
  power: number;
  o2: number;
  water: number;
  food: number;
  /** Highest crew dose. */
  dose: number;
  /** Power made and used this hour, kW. */
  made: number;
  used: number;
  /** Fraction of daylight, 0–1. */
  sun: number;
}

export interface Stats {
  /** Hours during which some system lacked power. */
  brownout: number;
  /** Hours during which the crew lacked oxygen, water or food. */
  shortage: number;
  minHealth: number;
  maxDose: number;
  /** One-time science sites delivered to base. */
  sites: string[];
  trips: { ice: number; regolith: number };
  /** Lowest stored amounts during the mission, for star criteria. */
  min: { power: number; o2: number; water: number; food: number };
  /** Hours the crew spent sheltering. */
  sheltered: number;
  /** Food, water and oxygen produced (not just stored). */
  made: { o2: number; water: number; food: number };
}

/** A timed mission event. `at` is in training hours since Day 1, 00:00. */
export type ScriptEntry = { id: string; at: number } & (
  | { say: string }
  | { choice: string }
  | { meteor: ModuleType | "any" }
  | { give: Partial<Resources>; say: string }
);

/** A decision card waiting for the player. The game pauses while one is open. */
export interface PendingChoice {
  card: string;
  t: number;
}

export interface GameState {
  version: 2;
  missionId: string;
  planet: Planet;
  /** Training hours since Day 1, 00:00. */
  t: number;
  startT: number;
  seed: number;
  res: Resources;
  modules: Module[];
  nextId: number;
  /** Regolith shielding over the habitat: hours of work done (complete at SHIELD_TIME). */
  shield: number;
  shieldStarted: boolean;
  sheltering: boolean;
  crew: Crew[];
  rover: Rover;
  hazards: Hazard[];
  /** Timed mission events (copied from the mission, plus random ones). */
  script: ScriptEntry[];
  /** Ids of script entries that have fired. */
  fired: string[];
  choice: PendingChoice | null;
  /** Dust on Mars solar panels, 0 (clean) – 1 (covered). */
  dust: number;
  /** Completed goal ids (goals stay complete once reached). */
  goals: string[];
  feed: FeedItem[];
  history: HistoryPoint[];
  stats: Stats;
  status: "playing" | "won" | "lost";
  endReason: string | null;
  /** Hours without power at the habitat (cold). */
  cold: number;
  /** Alerts that have fired and not yet cleared (each fires once until it clears). */
  alerts: string[];
}

/** Player decisions. Movement is real-time and handled by the rover module. */
export type Action =
  | { type: "build"; module: ModuleType; pad?: number }
  | { type: "shield" }
  | { type: "toggle"; id: number }
  | { type: "light"; id: number; level: Light }
  | { type: "repair"; id: number }
  | { type: "recycle"; id: number }
  | { type: "cancel"; id: number }
  | { type: "shelter"; on: boolean }
  | { type: "collect"; site: string }
  | { type: "clean" }
  | { type: "choose"; option: number };
