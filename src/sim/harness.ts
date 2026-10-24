import { act, advance, createState, step, updateDock } from "./engine";
import { CARDS, cantAfford } from "./cards";
import { approachPoint, followRoute, planRoute, type Point } from "./rover";
import type { Action, GameState } from "./types";
import { DOCK, site } from "./world";

/**
 * A scripted player for tests and balancing: applies actions, drives the rover
 * along autopilot routes and advances time exactly the way the game store does.
 */
export class Runner {
  s: GameState;
  route: Point[] = [];
  errors: string[] = [];
  /** Option picked for each decision card (default: the first). */
  choices: Record<string, number> = {};
  /** Called every simulated half hour, even mid-trip: a player's reflexes. */
  reflex?: (r: Runner) => void;
  private nextReflex = 0;

  constructor(id: string, seed?: number) {
    this.s = createState(id, seed);
  }

  do(a: Action) {
    const r = act(this.s, a);
    if (!r.ok) this.errors.push(`${this.s.t.toFixed(2)} ${a.type}: ${r.message}`);
    this.s = r.state;
    return r.ok;
  }

  /** Plan an autopilot route to a site (stopping beside it) or the dock. */
  goTo(target: string) {
    const r = this.s.rover;
    let goal: Point | null;
    if (target === "dock") goal = { ...DOCK };
    else {
      const where = site(target)!;
      goal = approachPoint(r, where, this.s.modules, 0) ?? where;
      const d = Math.hypot(goal.x - where.x, goal.z - where.z);
      if (d > 3) goal = approachPoint(r, where, this.s.modules, 1);
    }
    this.route = goal ? planRoute(r, goal, this.s.modules) : [];
    return this.route.length > 0;
  }

  /** Advance `hours` of training time in 0.05 h steps, moving the rover and answering cards. */
  tick(hours: number) {
    const end = this.s.t + hours;
    while (this.s.t < end - 1e-9 && this.s.status === "playing") {
      if (this.s.choice) {
        const card = CARDS[this.s.choice.card];
        const want = this.choices[card.id] ?? 0;
        const pick = cantAfford(this.s.res, card.options[want]) ? card.options.findIndex((o) => !cantAfford(this.s.res, o)) : want;
        this.do({ type: "choose", option: Math.max(0, pick) });
        continue;
      }
      const dt = Math.min(0.05, end - this.s.t);
      if (this.route.length) {
        const out = followRoute(this.s.rover, this.route, dt, this.s.modules, this.s.planet);
        this.s.rover = out.rover;
        this.route = out.route;
      }
      updateDock(this.s);
      step(this.s, dt);
      if (this.reflex && this.s.t >= this.nextReflex) {
        this.nextReflex = this.s.t + 0.5;
        this.reflex(this);
      }
    }
    return this;
  }

  /** Drive to a target and wait until the rover arrives (or gives up). */
  drive(target: string, maxHours = 12) {
    if (!this.goTo(target)) {
      this.errors.push(`${this.s.t.toFixed(2)} no route to ${target}`);
      return this;
    }
    const until = this.s.t + maxHours;
    while (this.route.length && this.s.t < until && this.s.status === "playing") this.tick(0.05);
    if (target === "dock") this.tick(0.1);
    return this;
  }

  /** Collect at a site and wait for the crew to finish. */
  collect(siteId: string) {
    if (!this.do({ type: "collect", site: siteId })) return this;
    while (this.s.rover.task && this.s.status === "playing") this.tick(0.05);
    return this;
  }

  until(t: number) {
    return this.tick(Math.max(0, t - this.s.t));
  }

  /** A careful trip: wait out storm warnings on the dock, then drive, collect and come home. */
  trip(siteId: string) {
    const stormy = () => this.s.hazards.some((h) => h.kind === "storm" && (h.phase === "warned" || h.phase === "active"));
    // Long drives need a clear forecast: don't set off if a warning is due within 10 hours.
    const soon = () => this.s.hazards.some((h) => h.kind === "storm" && h.phase === "pending" && h.warnAt - this.s.t < 10);
    while ((stormy() || soon()) && this.s.status === "playing") this.tick(0.5);
    return this.charge(90).drive(siteId).collect(siteId).drive("dock");
  }

  /** Wait on the dock until the rover battery reaches `pct` (or `maxHours` pass). */
  charge(pct = 95, maxHours = 6) {
    const until = this.s.t + maxHours;
    while (this.s.rover.battery < pct && this.s.t < until && this.s.status === "playing") this.tick(0.25);
    return this;
  }
}

/** Advance time like `advance`, answering any decision card with its first affordable option (a player who just clicks on). */
export function advanceAnswering(prev: GameState, hours: number): GameState {
  let s = prev;
  const end = prev.t + hours;
  while (s.status === "playing" && s.t < end - 1e-9) {
    if (s.choice) {
      const card = CARDS[s.choice.card];
      const pick = Math.max(0, card.options.findIndex((o) => !cantAfford(s.res, o)));
      s = act(s, { type: "choose", option: pick }).state;
      continue;
    }
    s = advance(s, end - s.t);
  }
  return s;
}
