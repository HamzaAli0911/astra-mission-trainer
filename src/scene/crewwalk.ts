import * as THREE from "three";
import { cellAt, type Stage } from "../sim/base";
import { placeOf, type Place } from "../sim/crew";
import { floorY, stepLength, type Floor, type Where } from "../sim/home";
import type { CrewSpot } from "../sim/interior";
import { navPath, type NavPoint } from "../sim/nav";
import { bakeProps } from "./campus/bake";
import { CELL_INDEX } from "./campus/lighting";
import { crewBody, gait, mergeJoints, mix, POSTURES, posture, type Body, type Posture } from "./interior/crew";

/**
 * The crew on their feet: each person walks from place to place as the routine (sim/interior.ts) moves them, along a
 * real way through doors and corridors and up the stairs (sim/nav.ts), at a person's pace, and sits, lies down or
 * gets on the cycle when they arrive. Only what you could see is walked out in full: a stretch of the way out of
 * sight is skipped (so the crew keep up with a mission running at 3.5 seconds an hour), and they come into view
 * already walking, never popping up at a desk in front of you. Each person has two bodies, lit for Hab-1 and for
 * the campus; the one for where they are shows.
 */
const PACE = 1.2;
/** Seconds to sit down, get into a bunk or stand back up. */
const SETTLE = 0.7;

type State = "out" | "settled" | "rising" | "walking" | "settling";
interface Person {
  id: string;
  hab: Body;
  campus: Body;
  spot: CrewSpot | null;
  /** Where they are now, or last were; and where they're going. */
  at: Place | null;
  to: Place | null;
  path: NavPoint[] | null;
  leg: number;
  x: number;
  z: number;
  where: Where;
  /** Facing, as the bodies' y rotation. */
  turn: number;
  /** 0 standing (or walking), 1 fully in the place's pose. */
  t: number;
  state: State;
  phase: number;
  speed: number;
  cell: number;
  /** The spot they set off from (settled there), for reusing the way. */
  from: CrewSpot | null;
  /** Seconds before getting up (people don't all stand up at the same moment). */
  wait: number;
  /** How far to the right of the way they're keeping (to pass someone coming the other way). */
  side: number;
}
const turnFor = (bearingDeg: number) => Math.PI - THREE.MathUtils.degToRad(bearingDeg);
const level = (w: Where): Floor => (w === "stair" ? 0 : w === "hq-stair" ? 0 : w);
const inHab = (x: number, z: number, w: Where) => w === 1 || w === "stair" || (w === 0 && Math.hypot(x, z) < 4.96);

export function crewWalkers(ids: string[], gravity: number) {
  const people: Person[] = ids.map((id) => {
    const hab = crewBody(id);
    mergeJoints(hab.root);
    const campus = crewBody(id);
    campus.root.userData.cell = 0;
    bakeProps(campus.root);
    hab.root.visible = campus.root.visible = false;
    return { id, hab, campus, spot: null, at: null, to: null, path: null, leg: 0, x: 0, z: 0, where: 0, turn: 0, t: 0, state: "out", phase: 0, speed: 0, cell: -1, from: null, wait: 0, side: 0 };
  });
  const stride = stepLength(gravity) * 0.8;

  /** Put a person straight into a place (out of sight). */
  const settleAt = (p: Person, place: Place) => {
    Object.assign(p, { at: place, to: null, path: null, x: place.x, z: place.z, where: place.floor, turn: turnFor(place.yaw), t: 1, state: "settled", speed: 0 });
  };
  // Ways between places, worked out once (the same commute every day).
  const ways = new Map<string, NavPoint[] | null>();
  const plan = (p: Person, stage: Stage) => {
    const to = p.to!;
    const from = { x: p.x, z: p.z, floor: level(p.where) };
    const key = p.from ? `${stage}|${p.id}|${p.from}>${p.spot}` : null;
    let way = key ? ways.get(key) : undefined;
    if (way === undefined) {
      way = navPath(from, { ...to.approach, floor: to.floor }, stage);
      if (way && way.length < 2) way = null;
      if (key) ways.set(key, way);
    }
    p.path = way;
    p.leg = 1;
  };

  return {
    people,
    /** Where everyone on their feet is (for doors that slide open as they come). */
    bodies() {
      return people.filter((p) => p.state !== "out").map((p) => ({ x: p.x, z: p.z, level: level(p.where) as number }));
    },
    /**
     * One frame: follow the routine's places, walking what can be seen. `seen` says whether a point could be in view
     * (its building is drawn); `show` whether Hab-1's inside is drawn.
     */
    update(dt: number, spots: { id: string; spot: CrewSpot | null }[], stage: Stage, seen: (x: number, z: number, where: Where) => boolean, habShown: boolean, anyInView: boolean, clock: number, reduced: boolean) {
      for (const p of people) {
        const want = spots.find((s) => s.id === p.id)?.spot ?? null;
        if (want !== p.spot) {
          p.from = p.state === "settled" ? p.spot : null;
          p.spot = want;
          if (!want) {
            p.state = "out";
          } else {
            const place = placeOf(p.id, want);
            // (Nothing of theirs in view, start or end: they're simply there.)
            if (p.state === "out" || !p.at || (!anyInView && !seen(place.x, place.z, place.floor))) settleAt(p, place);
            else {
              p.to = place;
              p.path = null;
              p.state = p.t > 0 ? "rising" : "walking";
              p.wait = p.state === "rising" ? 0.3 + 1.1 * people.indexOf(p) : 0;
              if (p.state === "walking") plan(p, stage);
            }
          }
        }
        // Out of sight, the whole change happens at once (no one sees them walk the corridors meanwhile).
        const visible = p.state !== "out" && seen(p.x, p.z, p.where);
        if (p.state === "rising") {
          p.wait -= dt;
          if (!visible || reduced) p.t = 0;
          else if (p.wait <= 0) p.t = Math.max(0, p.t - dt / SETTLE);
          const a = p.at!;
          const k = 1 - p.t;
          p.x = a.x + (a.approach.x - a.x) * k;
          p.z = a.z + (a.approach.z - a.z) * k;
          if (p.t === 0) {
            p.state = "walking";
            plan(p, stage);
          }
        }
        if (p.state === "walking") {
          const path = p.path;
          if (!path) {
            // No way found (a locked wing, say): they're there the next moment, out of sight.
            if (!seen(p.to!.x, p.to!.z, p.to!.floor) || !visible) settleAt(p, p.to!);
            else p.state = "settling";
          } else {
            // Skip the stretch no one can see, up to where it comes into view (a doorway, usually).
            skip: while (p.leg < path.length && !seen(p.x, p.z, p.where)) {
              const q = path[p.leg];
              const d = Math.hypot(q.x - p.x, q.z - p.z);
              const n = Math.max(1, Math.ceil(d / 0.4));
              const w = typeof q.where === "number" ? q.where : p.where;
              for (let i = 1; i < n; i++) {
                const x = p.x + ((q.x - p.x) * i) / n,
                  z = p.z + ((q.z - p.z) * i) / n;
                if (seen(x, z, w)) {
                  p.x += ((q.x - p.x) * (i - 1)) / n;
                  p.z += ((q.z - p.z) * (i - 1)) / n;
                  break skip;
                }
              }
              Object.assign(p, { x: q.x, z: q.z, where: q.where });
              p.leg++;
            }
            if (p.leg >= path.length) {
              p.state = "settling";
            } else {
              const q = path[p.leg];
              let dx = q.x - p.x,
                dz = q.z - p.z,
                d = Math.hypot(dx, dz);
              // Meeting someone coming the other way: keep to the right (eased out near a corner or a door).
              let meet = 0;
              for (const o of people) {
                if (o === p || o.state !== "walking" || o.where !== p.where) continue;
                const ox = o.x - p.x,
                  oz = o.z - p.z,
                  od = Math.hypot(ox, oz);
                if (od < 2.6 && d > 1e-4 && (ox * dx + oz * dz) / (od * d) > 0.5 && o.path && o.leg < o.path.length) {
                  const oq = o.path[o.leg];
                  if ((oq.x - o.x) * dx + (oq.z - o.z) * dz < 0) meet = 1;
                }
              }
              p.side += ((meet ? 0.32 : 0) - p.side) * Math.min(1, dt * 3);
              if (p.side > 0.01 && d > 1e-4) {
                const k = p.side * Math.min(1, d / 1.2);
                const tx = q.x + (-dz / d) * k,
                  tz = q.z + (dx / d) * k;
                dx = tx - p.x;
                dz = tz - p.z;
                d = Math.hypot(dx, dz);
              }
              // Keep a step behind anyone just ahead going the same way (no walking through each other).
              let pace = PACE;
              for (const o of people) {
                if (o === p || o.state === "out" || o.where !== p.where) continue;
                const ox = o.x - p.x,
                  oz = o.z - p.z,
                  od = Math.hypot(ox, oz);
                if (od < 1.1 && d > 1e-4 && (ox * dx + oz * dz) / (od * d || 1) > 0.3) pace = Math.min(pace, Math.max(0, (od - 0.6) * 2.4));
              }
              p.speed += (pace - p.speed) * Math.min(1, dt * 4);
              const go = Math.min(d, p.speed * dt);
              if (d > 1e-4) {
                p.x += (dx / d) * go;
                p.z += (dz / d) * go;
                // Turn to face the way they're walking, gently.
                let diff = Math.PI - Math.atan2(dx, -dz) - p.turn;
                diff = Math.atan2(Math.sin(diff), Math.cos(diff));
                p.turn += Math.sign(diff) * Math.min(Math.abs(diff), dt * 5);
              }
              p.phase += (go / stride) * Math.PI;
              // (Reaching a point puts them on its floor or stair: up a flight, on the next floor at its end.)
              if (d - go < 0.05) {
                p.where = q.where;
                p.leg++;
              }
            }
          }
        }
        if (p.state === "settling") {
          const to = p.to!;
          if (!visible || reduced) p.t = 1;
          else p.t = Math.min(1, p.t + dt / SETTLE);
          const k = p.t * p.t * (3 - 2 * p.t);
          p.x = to.approach.x + (to.x - to.approach.x) * k;
          p.z = to.approach.z + (to.z - to.approach.z) * k;
          p.where = to.floor;
          let diff = turnFor(to.yaw) - p.turn;
          diff = Math.atan2(Math.sin(diff), Math.cos(diff));
          p.turn = p.t === 1 ? turnFor(to.yaw) : p.turn + diff * Math.min(1, dt * 6);
          p.speed = Math.max(0, p.speed - dt * 3);
          if (p.t === 1) {
            p.at = to;
            p.to = null;
            p.path = null;
            p.state = "settled";
          }
        }
        // The body: posed, placed, and the right one of the two shown.
        const out = p.state === "out";
        const habNow = !out && inHab(p.x, p.z, p.where);
        p.hab.root.visible = habNow && habShown;
        p.campus.root.visible = !out && !habNow && visible;
        if (out) continue;
        const body = habNow ? p.hab : p.campus;
        const place = p.state === "settled" || p.state === "rising" ? p.at! : (p.to ?? p.at!);
        const pose = POSTURES[place.pose];
        const walking = p.state === "walking" ? Math.min(1, p.speed / PACE) : 0;
        let base: Posture = gait(p.phase, walking);
        // At work: the treadmill walks in place, the cycle pedals; sitting at a desk, a little movement now and then.
        let target = pose;
        if (p.state === "settled" && p.spot === "treadmill" && !reduced) {
          p.phase += dt * 5.5;
          target = gait(p.phase, 0.8);
        } else if (p.state === "settled" && p.spot === "cycle" && !reduced) {
          const s = Math.sin(clock * 4.5 + p.id.length);
          target = { ...pose, thigh: [pose.thigh[0] + 0.3 * s, pose.thigh[1] - 0.3 * s], knee: [pose.knee[0] - 0.25 * s, pose.knee[1] + 0.25 * s] };
        } else if (!reduced) base = { ...base, hipsY: base.hipsY + 0.004 * Math.sin(clock * 1.7 + p.id.length) };
        const k = p.t * p.t * (3 - 2 * p.t);
        posture(body, mix(base, target, k));
        const y = floorY({ x: p.x, z: p.z, where: p.where }) + place.y * k;
        body.root.position.set(p.x, y, p.z);
        body.root.rotation.set(0, p.turn, 0);
        // The campus body takes the light of the room it's in.
        if (!habNow) {
          const c = cellAt(p.x, p.z, level(p.where) === 2 ? 2 : 0);
          const idx = c ? (CELL_INDEX.get(c.id) ?? 0) : 0;
          if (idx !== p.cell) {
            p.cell = idx;
            body.root.traverse((o) => {
              const a = (o as THREE.Mesh).geometry?.attributes?.cell as THREE.BufferAttribute | undefined;
              if (!a) return;
              (a.array as Float32Array).fill(idx);
              a.needsUpdate = true;
            });
          }
        }
      }
    },
  };
}
export type CrewWalkers = ReturnType<typeof crewWalkers>;
