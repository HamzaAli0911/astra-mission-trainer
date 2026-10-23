import { act, createState, step, updateDock } from "./engine";
import { CARDS } from "./cards";
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
        this.do({ type: "choose", option: this.choices[card.id] ?? 0 });
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

  /** Wait on the dock until the rover battery reaches `pct` (or `maxHours` pass). */
  charge(pct = 95, maxHours = 6) {
    const until = this.s.t + maxHours;
    while (this.s.rover.battery < pct && this.s.t < until && this.s.status === "playing") this.tick(0.25);
    return this;
  }
}
