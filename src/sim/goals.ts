import { countBuilt, DOSE_LIMIT, flows, isBuilt, shieldDone } from "./core";
import type { Goal, Mission, StarRule } from "./missions";
import type { GameState } from "./types";

export interface GoalProgress {
  done: boolean;
  /** 0–1 for a progress bar. */
  fraction: number;
  /** Short readout, e.g. "120 / 150 L". */
  label: string;
}

const UNITS = {
  power: "kWh",
  o2: "kg",
  water: "L",
  food: "meals",
  materials: "",
  science: "pts",
};
const ratio = (v: number, target: number) =>
  Math.max(0, Math.min(1, target ? v / target : 1));

/** Live progress toward one goal (latched goals are reported done by the engine). */
export function goalProgress(
  s: GameState,
  g: Goal,
  m: Mission,
): GoalProgress {
  const latched = s.goals.includes(g.id);
  switch (g.kind) {
    case "build": {
      const n = countBuilt(s, g.module);
      return {
        done: latched || n >= g.count,
        fraction: ratio(n, g.count),
        label: `${Math.min(n, g.count)} / ${g.count}`,
      };
    }
    case "stock": {
      const v = s.res[g.res];
      return {
        done: latched || v >= g.atLeast,
        fraction: ratio(v, g.atLeast),
        label: `${Math.floor(v)} / ${g.atLeast} ${UNITS[g.res]}`.trim(),
      };
    }
    case "grow": {
      const v = s.stats.made[g.res];
      return {
        done: latched || v >= g.atLeast,
        fraction: ratio(v, g.atLeast),
        label: `${Math.floor(v)} / ${g.atLeast} ${UNITS[g.res]}`,
      };
    }
    case "trips": {
      const n =
        g.trip === "science" ? s.stats.sites.length : s.stats.trips[g.trip];
      return {
        done: latched || n >= g.count,
        fraction: ratio(n, g.count),
        label: `${Math.min(n, g.count)} / ${g.count}`,
      };
    }
    case "protect": {
      const ok =
        shieldDone(s) ||
        s.modules.some((x) => x.type === "shelter" && isBuilt(x));
      return { done: latched || ok, fraction: ok ? 1 : 0, label: ok ? "Ready" : "Not yet" };
    }
    case "home": {
      const ok = s.rover.docked;
      return { done: latched || ok, fraction: ok ? 1 : 0, label: ok ? "Docked" : "Out" };
    }
    case "clean": {
      const stormOver = s.hazards.some(
        (h) => h.kind === "dust" && h.phase === "over",
      );
      const ok = stormOver && s.dust < 0.05;
      return {
        done: latched || ok,
        fraction: ok ? 1 : 0,
        label: !stormOver ? "After the storm" : ok ? "Clean" : "Dusty",
      };
    }
    case "balance": {
      const f = flows(s);
      const parts = [
        f.o2.made >= f.o2.used,
        f.water.made >= f.water.used,
        f.food.made >= f.food.used,
      ];
      const n = parts.filter(Boolean).length;
      return {
        done: latched || n === 3,
        fraction: n / 3,
        label: `${n} / 3 balanced`,
      };
    }
    case "survive": {
      const span = m.endT - m.startT;
      const done = latched || s.t >= m.endT;
      return {
        done,
        fraction: ratio(s.t - m.startT, span),
        label: done ? "Done" : `${Math.max(0, Math.ceil(m.endT - s.t))} h left`,
      };
    }
  }
}

export function starMet(s: GameState, r: StarRule): boolean {
  switch (r.kind) {
    case "noBrownout":
      return s.stats.brownout < 0.1;
    case "minHealth":
      return s.stats.minHealth >= r.atLeast;
    case "maxDose":
      return s.stats.maxDose < r.below;
    case "sites":
      return s.stats.sites.length >= r.count;
    case "endStock":
      return s.res[r.res] >= r.atLeast;
    case "minStock":
      return s.stats.min[r.res] >= r.atLeast;
    case "built":
      return countBuilt(s, r.module) >= r.count;
    case "made":
      return s.stats.made[r.res] >= r.atLeast;
  }
}

/** 0 for a failed mission, otherwise 1 + extra stars earned. */
export function starsFor(s: GameState, m: Mission) {
  if (s.status !== "won") return 0;
  return 1 + m.stars.filter((r) => starMet(s, r)).length;
}

export const doseShare = (dose: number) => Math.min(1, dose / DOSE_LIMIT);
