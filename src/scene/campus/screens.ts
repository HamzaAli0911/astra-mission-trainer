import { BUILDINGS, built, stageOf } from "../../sim/base";
import { capacity, DOSE_LIMIT, flows, isBuilt, type Flows } from "../../sim/core";
import { CREW, SUIT_HOURS } from "../../sim/engine";
import { goalProgress } from "../../sim/goals";
import { mission } from "../../sim/missions";
import { spec } from "../../sim/modules";
import { clockOf, dayOf, PLANETS } from "../../sim/planets";
import type { GameState } from "../../sim/types";
import { SITES, WORLD } from "../../sim/world";
import type { ScreenData } from "../interior/parts";

/**
 * What the campus's screens show, all from the mission itself (nothing here is decoration): the operations hall's
 * display wall, the consoles' systems, the situation table's map, the comms link, the colony map in the lobby, the
 * EVA complex's suit check and each airlock's pressure. Drawn a few times a second onto canvas textures.
 */
export interface CampusData {
  g: GameState;
  f: Flows;
  cap: ReturnType<typeof capacity>;
  /** Each airlock's chamber: its pressure (0 vacuum, 1 full) and what it's doing. */
  locks: Record<string, { pressure: number; cycle: string }>;
}
export const campusScreenData = (g: GameState, base: ScreenData, locks: CampusData["locks"]): ScreenData => ({ ...base, campus: { g, f: flows(g), cap: capacity(g), locks } satisfies CampusData });
const dataOf = (d: ScreenData) => d.campus as CampusData;

const C = {
  bg: "#0a1222",
  panel: "#111c33",
  line: "#22324f",
  text: "#e8eef8",
  dim: "#8fa3c4",
  power: "#ffc94a",
  o2: "#5ee0ff",
  water: "#4f9dff",
  food: "#7fdc6a",
  danger: "#ff5a5f",
  warn: "#ffb020",
  good: "#3ee39a",
  science: "#c48bff",
};
const FONT = "Lexend Variable, system-ui, sans-serif";

function text(c: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color = C.text, align: CanvasTextAlign = "left", weight = 600) {
  c.font = `${weight} ${Math.round(size)}px ${FONT}`;
  c.fillStyle = color;
  c.textAlign = align;
  c.textBaseline = "alphabetic";
  c.fillText(s, x, y);
}
function bar(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, frac: number, color: string) {
  c.fillStyle = C.line;
  c.beginPath();
  c.roundRect(x, y, w, h, h / 2);
  c.fill();
  c.fillStyle = color;
  c.beginPath();
  c.roundRect(x, y, Math.max(h, w * Math.max(0, Math.min(1, frac))), h, h / 2);
  c.fill();
}
/** A screen's frame: background, a coloured header with its title, and the time. */
function frame(c: CanvasRenderingContext2D, w: number, h: number, title: string, color: string, d: CampusData) {
  c.fillStyle = C.bg;
  c.fillRect(0, 0, w, h);
  const top = Math.round(h * 0.17);
  c.fillStyle = C.panel;
  c.fillRect(0, 0, w, top);
  c.fillStyle = color;
  c.fillRect(0, top - Math.max(2, h * 0.012), w, Math.max(2, h * 0.012));
  text(c, title, w * 0.04, top * 0.7, top * 0.55, color, "left", 700);
  text(c, clockOf(d.g.t), w * 0.96, top * 0.7, top * 0.42, C.dim, "right", 500);
  return top;
}
const hours = (h: number) => (h >= 48 ? `${Math.floor(h / 24)} days` : h >= 1 ? `${Math.floor(h)} h` : `${Math.max(0, Math.round(h * 60))} min`);
/** How long a store lasts at its current rate, or that it's filling. */
function lasts(stock: number, made: number, used: number) {
  const net = made - used;
  if (net >= -1e-6) return { label: net > 1e-6 ? "filling" : "steady", bad: false };
  const h = stock / -net;
  return { label: `lasts ${hours(h)}`, bad: h < 24 };
}
const fix = (v: number, n = 1) => (Math.abs(v) >= 100 ? Math.round(v).toString() : v.toFixed(n));

/* ---------- The consoles' systems ---------- */

export type Station = "power" | "o2" | "water" | "food" | "rover" | "scout" | "eva" | "radiation" | "comms" | "build" | "science" | "crew" | "overview" | "capcom";
export const STATION_TITLE: Record<Station, string> = {
  power: "POWER",
  o2: "OXYGEN",
  water: "WATER",
  food: "FOOD",
  rover: "CREW ROVER",
  scout: "SCIENCE ROVER",
  eva: "EVA",
  radiation: "RADIATION",
  comms: "EARTH LINK",
  build: "CONSTRUCTION",
  science: "SCIENCE",
  crew: "CREW HEALTH",
  overview: "FLIGHT DIRECTOR",
  capcom: "CAPCOM",
};
const STATION_COLOR: Record<Station, string> = { power: C.power, o2: C.o2, water: C.water, food: C.food, rover: C.warn, scout: C.science, eva: C.warn, radiation: C.danger, comms: C.o2, build: C.dim, science: C.science, crew: C.good, overview: C.text, capcom: C.o2 };

/** A store's readout: the amount against what it holds, made and used per hour, and how long it lasts. */
function store(c: CanvasRenderingContext2D, w: number, h: number, top: number, value: number, max: number, unit: string, made: number, used: number, color: string) {
  const l = lasts(value, made, used);
  text(c, `${fix(value, 0)}`, w * 0.05, top + h * 0.3, h * 0.24, C.text, "left", 700);
  text(c, `/ ${fix(max, 0)} ${unit}`, w * 0.05 + c.measureText(`${fix(value, 0)}`).width + w * 0.02, top + h * 0.3, h * 0.11, C.dim, "left", 500);
  bar(c, w * 0.05, top + h * 0.38, w * 0.9, h * 0.07, value / Math.max(1e-6, max), color);
  text(c, `+${fix(made)} made`, w * 0.05, top + h * 0.6, h * 0.1, C.good, "left", 600);
  text(c, `−${fix(used)} used / h`, w * 0.95, top + h * 0.6, h * 0.1, C.warn, "right", 600);
  text(c, l.label, w * 0.05, top + h * 0.76, h * 0.12, l.bad ? C.danger : C.text, "left", 700);
}

export function drawStation(kind: Station) {
  return (c: CanvasRenderingContext2D, w: number, h: number, sd: ScreenData) => {
    const d = dataOf(sd);
    if (!d) return;
    const { g, f, cap } = d;
    const top = frame(c, w, h, STATION_TITLE[kind], STATION_COLOR[kind], d);
    switch (kind) {
      case "power": {
        const net = f.gen - f.used;
        text(c, `${fix(g.res.power, 0)}`, w * 0.05, top + h * 0.3, h * 0.24, C.text, "left", 700);
        text(c, `/ ${fix(cap.power, 0)} kWh`, w * 0.05 + c.measureText(`${fix(g.res.power, 0)}`).width + w * 0.02, top + h * 0.3, h * 0.11, C.dim, "left", 500);
        bar(c, w * 0.05, top + h * 0.38, w * 0.9, h * 0.07, g.res.power / cap.power, C.power);
        text(c, `+${fix(f.gen)} kW made`, w * 0.05, top + h * 0.6, h * 0.1, C.good);
        text(c, `−${fix(f.used)} kW used`, w * 0.95, top + h * 0.6, h * 0.1, C.warn, "right");
        const l = net >= 0 ? { label: "charging", bad: false } : { label: `battery lasts ${hours(g.res.power / -net)}`, bad: g.res.power / -net < 12 };
        text(c, f.short.power ? "NOT ENOUGH POWER" : l.label, w * 0.05, top + h * 0.76, h * 0.12, f.short.power || l.bad ? C.danger : C.text, "left", 700);
        break;
      }
      case "o2":
        store(c, w, h, top, g.res.o2, cap.o2, "kg", f.o2.made, f.o2.used, C.o2);
        break;
      case "water":
        store(c, w, h, top, g.res.water, cap.water, "L", f.water.made, f.water.used, C.water);
        break;
      case "food":
        store(c, w, h, top, g.res.food, cap.food, "meals", f.food.made, f.food.used, C.food);
        break;
      case "rover": {
        const r = g.rover;
        text(c, `${Math.round(r.battery)}%`, w * 0.05, top + h * 0.3, h * 0.24, C.text, "left", 700);
        text(c, "battery", w * 0.05 + c.measureText(`${Math.round(r.battery)}%`).width + w * 0.03, top + h * 0.3, h * 0.11, C.dim, "left", 500);
        bar(c, w * 0.05, top + h * 0.38, w * 0.9, h * 0.07, r.battery / 100, r.battery < 25 ? C.danger : C.warn);
        const state = r.docked ? "Docked in the garage, charging" : r.task ? `Working at ${SITES.find((s) => s.id === r.task!.site)?.name[g.planet] ?? "a site"}` : Math.abs(r.speed) > 1 ? "Driving" : "Stopped outside";
        text(c, state, w * 0.05, top + h * 0.6, h * 0.11, C.text, "left", 600);
        const load = r.cargo.water ? `${r.cargo.water} L of ice water` : r.cargo.materials ? `${r.cargo.materials} materials` : r.cargo.samples.length ? `${r.cargo.samples.length} sample(s)` : "Cargo bay empty";
        text(c, load, w * 0.05, top + h * 0.76, h * 0.1, C.dim, "left", 500);
        break;
      }
      case "scout": {
        const s = g.scout;
        if (!s) {
          text(c, "Not on this mission", w * 0.05, top + h * 0.4, h * 0.12, C.dim);
          break;
        }
        text(c, "Nuclear power (RTG)", w * 0.05, top + h * 0.3, h * 0.11, C.text, "left", 700);
        text(c, "never needs charging", w * 0.05, top + h * 0.43, h * 0.09, C.dim, "left", 500);
        text(c, s.task ? `Studying: ${Math.ceil(s.task.left * 10) / 10} h left` : Math.abs(s.speed) > 1 ? "Driving" : "Parked", w * 0.05, top + h * 0.6, h * 0.11, C.text);
        text(c, `${s.studied.length} site(s) studied`, w * 0.05, top + h * 0.76, h * 0.1, C.science, "left", 600);
        break;
      }
      case "eva": {
        const out = !!g.eva;
        text(c, out ? "Alex is outside" : "Nobody outside", w * 0.05, top + h * 0.3, h * 0.14, out ? C.warn : C.text, "left", 700);
        if (out) {
          bar(c, w * 0.05, top + h * 0.38, w * 0.9, h * 0.07, g.eva!.left / SUIT_HOURS, g.eva!.left < 1 ? C.danger : C.o2);
          text(c, `suit air: ${hours(g.eva!.left)}`, w * 0.05, top + h * 0.56, h * 0.1, C.text);
        } else text(c, `Suits ready: ${SUIT_HOURS} h of air each`, w * 0.05, top + h * 0.5, h * 0.1, C.dim, "left", 500);
        const lock = d.locks.eva;
        if (lock) text(c, `Airlock: ${Math.round(lock.pressure * 101)} kPa${lock.cycle !== "none" ? " · cycling" : ""}`, w * 0.05, top + h * 0.76, h * 0.1, lock.cycle !== "none" ? C.warn : C.dim, "left", 600);
        break;
      }
      case "radiation": {
        const dose = Math.max(0, ...g.crew.map((m) => m.dose));
        const storm = g.hazards.find((x) => x.kind === "storm" && x.phase !== "over" && x.phase !== "pending");
        text(c, `${dose.toFixed(1)} mSv`, w * 0.05, top + h * 0.3, h * 0.2, C.text, "left", 700);
        text(c, `highest dose · limit ${DOSE_LIMIT}`, w * 0.05, top + h * 0.42, h * 0.08, C.dim, "left", 500);
        bar(c, w * 0.05, top + h * 0.47, w * 0.9, h * 0.06, dose / DOSE_LIMIT, dose > DOSE_LIMIT * 0.7 ? C.danger : C.warn);
        const line = storm ? (storm.phase === "active" ? "STORM NOW: get in the shelter" : `Storm at ${clockOf(storm.startAt)}`) : "No storm warning";
        text(c, line, w * 0.05, top + h * 0.68, h * 0.11, storm ? C.danger : C.good, "left", 700);
        text(c, g.sheltering ? "Crew sheltering" : "Crew at work", w * 0.05, top + h * 0.8, h * 0.09, C.dim, "left", 500);
        break;
      }
      case "comms": {
        const capcom = [...g.feed].reverse().find((x) => x.kind === "capcom");
        text(c, g.planet === "mars" ? "Signal delay ≈ 12 min" : "Signal delay 1.3 s", w * 0.05, top + h * 0.28, h * 0.12, C.text, "left", 700);
        text(c, g.planet === "mars" ? "each way, Mars to Earth" : "each way, Moon to Earth", w * 0.05, top + h * 0.4, h * 0.08, C.dim, "left", 500);
        wrap(c, capcom ? `“${capcom.text}”` : "No messages yet.", w * 0.05, top + h * 0.56, w * 0.9, h * 0.085, C.text, 3);
        break;
      }
      case "build": {
        const done = g.modules.filter((m) => isBuilt(m) && m.type !== "habitat");
        const building = g.modules.filter((m) => !isBuilt(m));
        const broken = done.filter((m) => m.health < 100);
        text(c, `${done.length}`, w * 0.05, top + h * 0.3, h * 0.24, C.text, "left", 700);
        text(c, "modules working", w * 0.05 + c.measureText(`${done.length}`).width + w * 0.03, top + h * 0.3, h * 0.1, C.dim, "left", 500);
        text(c, building.length ? `Building: ${building.map((m) => spec(m.type, g.planet).name).join(", ")}` : "Nothing being built", w * 0.05, top + h * 0.52, h * 0.09, C.text, "left", 500);
        text(c, broken.length ? `Needs repair: ${broken.map((m) => spec(m.type, g.planet).name).join(", ")}` : "No damage", w * 0.05, top + h * 0.68, h * 0.09, broken.length ? C.danger : C.good, "left", 600);
        text(c, `${Math.floor(g.res.materials)} materials in store`, w * 0.05, top + h * 0.84, h * 0.09, C.dim, "left", 500);
        break;
      }
      case "science": {
        text(c, `${Math.floor(g.res.science)}`, w * 0.05, top + h * 0.3, h * 0.24, C.science, "left", 700);
        text(c, "science points", w * 0.05 + c.measureText(`${Math.floor(g.res.science)}`).width + w * 0.03, top + h * 0.3, h * 0.1, C.dim, "left", 500);
        text(c, `${g.stats.sites.length} sample(s) brought home`, w * 0.05, top + h * 0.52, h * 0.1, C.text);
        text(c, `${g.scout?.studied.length ?? 0} site(s) studied by the Scout`, w * 0.05, top + h * 0.68, h * 0.1, C.text);
        text(c, `${f.science > 0 ? `+${f.science.toFixed(1)} / h from the lab` : "Lab idle or not built"}`, w * 0.05, top + h * 0.84, h * 0.09, C.dim, "left", 500);
        break;
      }
      case "crew": {
        g.crew.forEach((m, i) => {
          const y = top + h * (0.2 + i * 0.19);
          text(c, CREW.find((x) => x.id === m.id)?.name.split(" ")[0] ?? m.id, w * 0.05, y, h * 0.1, C.text, "left", 700);
          bar(c, w * 0.38, y - h * 0.07, w * 0.4, h * 0.06, m.health / 100, m.health < 50 ? C.danger : C.good);
          text(c, m.place === "habitat" ? "base" : m.place, w * 0.95, y, h * 0.08, C.dim, "right", 500);
        });
        break;
      }
      case "overview":
      case "capcom": {
        if (kind === "capcom") {
          const lines = g.feed.filter((x) => x.kind === "capcom").slice(-3);
          let y = top + h * 0.22;
          for (const l of lines) y = wrap(c, l.text, w * 0.05, y, w * 0.9, h * 0.075, C.text, 3) + h * 0.05;
          if (!lines.length) text(c, "No messages from Earth yet.", w * 0.05, top + h * 0.3, h * 0.09, C.dim);
          break;
        }
        const m = mission(g.missionId);
        text(c, m.title, w * 0.05, top + h * 0.22, h * 0.11, C.text, "left", 700);
        m.goals.slice(0, 3).forEach((goal, i) => {
          const p = goalProgress(g, goal, m);
          const y = top + h * (0.4 + i * 0.19);
          wrap(c, goal.text, w * 0.05, y, w * 0.62, h * 0.07, p.done ? C.good : C.text, 1);
          text(c, p.done ? "done" : p.label, w * 0.95, y, h * 0.07, p.done ? C.good : C.dim, "right", 600);
          bar(c, w * 0.05, y + h * 0.03, w * 0.9, h * 0.035, p.fraction, p.done ? C.good : C.o2);
        });
        break;
      }
    }
  };
}

/** Text wrapped to a width (at most `lines` lines); returns the baseline of the last line. */
function wrap(c: CanvasRenderingContext2D, s: string, x: number, y: number, w: number, size: number, color: string, lines: number) {
  c.font = `500 ${Math.round(size)}px ${FONT}`;
  const words = s.split(" ");
  let line = "",
    n = 0;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (c.measureText(test).width > w && line) {
      text(c, n === lines - 1 ? `${line}…` : line, x, y, size, color, "left", 500);
      n++;
      y += size * 1.25;
      line = word;
      if (n >= lines) return y;
    } else line = test;
  }
  if (line) text(c, line, x, y, size, color, "left", 500);
  return y;
}

/* ---------- Maps ---------- */

/** The colony and its sites from above: the campus's buildings, the sites, both rovers. */
function map(c: CanvasRenderingContext2D, x: number, y: number, size: number, d: CampusData, span = WORLD) {
  const { g } = d;
  const to = (v: number) => (v + span) / (span * 2);
  c.save();
  c.beginPath();
  c.roundRect(x, y, size, size, size * 0.03);
  c.clip();
  c.fillStyle = g.planet === "mars" ? "#2a1610" : "#15181e";
  c.fillRect(x, y, size, size);
  c.strokeStyle = "rgba(143,163,196,0.18)";
  c.lineWidth = Math.max(1, size / 400);
  for (let k = -span; k <= span; k += 50) {
    c.beginPath();
    c.moveTo(x + to(k) * size, y);
    c.lineTo(x + to(k) * size, y + size);
    c.moveTo(x, y + to(k) * size);
    c.lineTo(x + size, y + to(k) * size);
    c.stroke();
  }
  const stage = stageOf(g.missionId);
  for (const b of BUILDINGS) {
    const r = b.rect;
    c.fillStyle = b.kind === "compound" ? "rgba(255,201,74,0.35)" : built(b, stage) ? "#d6dde8" : "rgba(214,221,232,0.3)";
    c.fillRect(x + to(r.x0) * size, y + to(r.z0) * size, Math.max(1.5, ((r.x1 - r.x0) / (span * 2)) * size), Math.max(1.5, ((r.z1 - r.z0) / (span * 2)) * size));
  }
  for (const s of SITES) {
    const done = g.stats.sites.includes(s.id) || g.scout?.studied.includes(s.id);
    c.fillStyle = s.kind === "ice" ? C.o2 : s.kind === "regolith" ? C.warn : C.science;
    c.globalAlpha = done ? 0.4 : 1;
    c.beginPath();
    c.arc(x + to(s.x) * size, y + to(s.z) * size, size * 0.018, 0, Math.PI * 2);
    c.fill();
    c.globalAlpha = 1;
    text(c, s.name[g.planet], x + to(s.x) * size + size * 0.025, y + to(s.z) * size + size * 0.012, size * 0.034, C.dim, "left", 500);
  }
  const rover = (r: { x: number; z: number; heading: number }, color: string) => {
    c.save();
    c.translate(x + to(r.x) * size, y + to(r.z) * size);
    c.rotate(-r.heading);
    c.fillStyle = color;
    c.beginPath();
    c.moveTo(0, -size * 0.03);
    c.lineTo(size * 0.02, size * 0.022);
    c.lineTo(-size * 0.02, size * 0.022);
    c.closePath();
    c.fill();
    c.restore();
  };
  if (g.scout) rover(g.scout, C.science);
  rover(g.rover, C.warn);
  c.restore();
}

/** The operations hall's display wall: the colony map, the four stores, and the crew, storms and goals. */
export function drawWall(c: CanvasRenderingContext2D, w: number, h: number, sd: ScreenData) {
  const d = dataOf(sd);
  if (!d) return;
  const { g, f, cap } = d;
  c.fillStyle = "#050a14";
  c.fillRect(0, 0, w, h);
  const pad = h * 0.05;
  // Left: the map.
  map(c, pad, pad, h - pad * 2, d);
  // Middle: power, oxygen, water, food.
  const x0 = h + pad,
    mw = w * 0.42;
  text(c, `${PLANETS[g.planet].dayWord.toUpperCase()} ${dayOf(g.t)} · ${clockOf(g.t)}`, x0, pad + h * 0.08, h * 0.08, C.dim, "left", 600);
  const rows: [string, number, number, string, string, number, number][] = [
    ["POWER", g.res.power, cap.power, "kWh", C.power, f.gen, f.used],
    ["OXYGEN", g.res.o2, cap.o2, "kg", C.o2, f.o2.made, f.o2.used],
    ["WATER", g.res.water, cap.water, "L", C.water, f.water.made, f.water.used],
    ["FOOD", g.res.food, cap.food, "meals", C.food, f.food.made, f.food.used],
  ];
  rows.forEach(([name, v, max, unit, color, made, used], i) => {
    const y = pad + h * (0.22 + i * 0.19);
    text(c, name, x0, y, h * 0.065, color, "left", 700);
    text(c, `${fix(v, 0)} / ${fix(max, 0)} ${unit}`, x0 + mw * 0.32, y, h * 0.065, C.text, "left", 600);
    const l = name === "POWER" ? (made >= used ? { label: "charging", bad: false } : { label: `lasts ${hours(v / (used - made))}`, bad: v / (used - made) < 12 }) : lasts(v, made, used);
    text(c, l.label, x0 + mw, y, h * 0.06, l.bad ? C.danger : C.dim, "right", 600);
    bar(c, x0, y + h * 0.03, mw, h * 0.04, v / Math.max(1e-6, max), color);
  });
  // Right: storms, the crew, the mission's goals.
  const x1 = x0 + mw + w * 0.04,
    rw = w - x1 - pad;
  const storm = g.hazards.find((x) => x.phase === "warned" || x.phase === "active");
  c.fillStyle = storm ? (storm.kind === "storm" ? "rgba(255,90,95,0.18)" : "rgba(255,176,32,0.16)") : "rgba(62,227,154,0.1)";
  c.beginPath();
  c.roundRect(x1, pad, rw, h * 0.22, h * 0.03);
  c.fill();
  const warn = storm ? (storm.kind === "storm" ? (storm.phase === "active" ? "RADIATION STORM: SHELTER" : `RADIATION STORM AT ${clockOf(storm.startAt)}`) : storm.phase === "active" ? "DUST STORM: SAVE POWER" : `DUST STORM AT ${clockOf(storm.startAt)}`) : "SPACE WEATHER: QUIET";
  text(c, warn, x1 + rw * 0.04, pad + h * 0.14, h * 0.07, storm ? (storm.kind === "storm" ? C.danger : C.warn) : C.good, "left", 700);
  g.crew.forEach((m, i) => {
    const y = pad + h * (0.36 + i * 0.1);
    text(c, CREW.find((x) => x.id === m.id)?.name ?? m.id, x1, y, h * 0.055, C.text, "left", 600);
    text(c, `${Math.round(m.health)}% · ${m.place === "habitat" ? "in the base" : m.place === "eva" ? "outside" : m.place}`, x1 + rw, y, h * 0.05, m.health < 50 ? C.danger : C.dim, "right", 500);
  });
  const m = mission(g.missionId);
  const goal = m.goals.map((x) => ({ x, p: goalProgress(g, x, m) })).find((x) => !x.p.done);
  if (goal) {
    text(c, "NEXT GOAL", x1, pad + h * 0.78, h * 0.045, C.dim, "left", 600);
    wrap(c, goal.x.text, x1, pad + h * 0.85, rw, h * 0.05, C.text, 1);
    bar(c, x1, pad + h * 0.88, rw, h * 0.025, goal.p.fraction, C.o2);
  }
}

/** The situation table's map: the whole area, close up. */
export function drawTable(c: CanvasRenderingContext2D, w: number, h: number, sd: ScreenData) {
  const d = dataOf(sd);
  if (!d) return;
  c.fillStyle = "#050a14";
  c.fillRect(0, 0, w, h);
  map(c, (w - h) / 2, 0, h, d);
  text(c, "COLONY AND SITES", w * 0.02, h * 0.07, h * 0.05, C.dim, "left", 600);
}

/** The colony map in the lobby: the campus's buildings with their names, and where you are. */
export function drawLobbyMap(c: CanvasRenderingContext2D, w: number, h: number, sd: ScreenData) {
  const d = dataOf(sd);
  if (!d) return;
  const stage = stageOf(d.g.missionId);
  c.fillStyle = "#0a1222";
  c.fillRect(0, 0, w, h);
  text(c, "COLONY MAP", w * 0.03, h * 0.1, h * 0.07, C.text, "left", 700);
  // The campus's extent, fitted to the screen.
  const xs = BUILDINGS.filter((b) => b.kind !== "compound").flatMap((b) => [b.rect.x0, b.rect.x1]),
    zs = BUILDINGS.filter((b) => b.kind !== "compound").flatMap((b) => [b.rect.z0, b.rect.z1]);
  const [ax, bx, az, bz] = [Math.min(...xs) - 4, Math.max(...xs) + 4, Math.min(...zs) - 4, Math.max(...zs) + 4];
  const k = Math.min((w * 0.94) / (bx - ax), (h * 0.8) / (bz - az));
  const ox = (w - (bx - ax) * k) / 2,
    oz = h * 0.15;
  const X = (v: number) => ox + (v - ax) * k,
    Z = (v: number) => oz + (v - az) * k;
  for (const b of BUILDINGS) {
    if (b.kind === "compound") continue;
    const r = b.rect;
    const on = built(b, stage);
    c.fillStyle = b.id === "hq" ? "#2b4f86" : b.kind === "hangar" ? "#5a4b2a" : on ? "#22324f" : "rgba(34,50,79,0.35)";
    c.fillRect(X(r.x0), Z(r.z0), (r.x1 - r.x0) * k, (r.z1 - r.z0) * k);
    if (b.letter && (r.x1 - r.x0) * k > 30) text(c, on ? b.name.replace(/ \(.*\)/, "") : `${b.name} (planned)`, X((r.x0 + r.x1) / 2), Z((r.z0 + r.z1) / 2) + h * 0.015, Math.min(h * 0.032, (r.x1 - r.x0) * k * 0.09), on ? C.text : C.dim, "center", 600);
  }
  // You are here (the lobby).
  c.fillStyle = C.warn;
  c.beginPath();
  c.arc(X(0), Z(37.2), h * 0.018, 0, Math.PI * 2);
  c.fill();
  text(c, "YOU ARE HERE", X(0) + h * 0.03, Z(37.2) - h * 0.03, h * 0.035, C.warn, "left", 700);
}

/** The EVA complex's suit check: the suits, and the air each holds. */
export function drawSuitCheck(c: CanvasRenderingContext2D, w: number, h: number, sd: ScreenData) {
  const d = dataOf(sd);
  if (!d) return;
  const top = frame(c, w, h, "SUIT CHECK", C.warn, d);
  const out = d.g.eva;
  CREW.forEach((m, i) => {
    const y = top + h * (0.2 + i * 0.18);
    const worn = out && m.id === "alex";
    text(c, m.name.split(" ")[0], w * 0.05, y, h * 0.09, C.text, "left", 700);
    bar(c, w * 0.36, y - h * 0.06, w * 0.4, h * 0.05, worn ? out!.left / SUIT_HOURS : 1, worn ? C.warn : C.good);
    text(c, worn ? `${hours(out!.left)} left` : `${SUIT_HOURS} h · ready`, w * 0.95, y, h * 0.07, worn ? C.warn : C.dim, "right", 600);
  });
}

/** An airlock's pressure: a big dial of the chamber's air, and the doors' rule. */
export function drawLock(id: string) {
  return (c: CanvasRenderingContext2D, w: number, h: number, sd: ScreenData) => {
    const d = dataOf(sd);
    if (!d) return;
    const lock = d.locks[id] ?? { pressure: 1, cycle: "none" };
    const top = frame(c, w, h, "AIRLOCK", lock.cycle !== "none" ? C.warn : C.o2, d);
    const kpa = Math.round(lock.pressure * 101);
    text(c, `${kpa}`, w * 0.05, top + h * 0.38, h * 0.32, lock.cycle !== "none" ? C.warn : C.text, "left", 700);
    text(c, "kPa", w * 0.05 + c.measureText(`${kpa}`).width + w * 0.03, top + h * 0.38, h * 0.12, C.dim, "left", 600);
    bar(c, w * 0.05, top + h * 0.48, w * 0.9, h * 0.07, lock.pressure, lock.cycle !== "none" ? C.warn : C.o2);
    const say = lock.cycle === "out" ? "PUMPING DOWN" : lock.cycle === "in" ? "FILLING WITH AIR" : lock.pressure >= 1 ? "INNER DOOR MAY OPEN" : "OUTER DOOR MAY OPEN";
    text(c, say, w * 0.05, top + h * 0.72, h * 0.1, lock.cycle !== "none" ? C.warn : C.good, "left", 700);
  };
}

/** Which systems each operations console shows (two screens per seat). */
export const CONSOLE_STATIONS: Record<string, Station[]> = {
  "hq-console-aw": ["power", "o2", "water", "food", "comms", "crew"],
  "hq-console-ae": ["rover", "scout", "eva", "radiation", "science", "build"],
  "hq-console-bw": ["o2", "water", "radiation", "crew", "eva", "power"],
  "hq-console-be": ["build", "science", "rover", "scout", "food", "comms"],
  "hq-fd-desk": ["overview", "power", "o2", "radiation", "rover", "crew"],
  "hq-capcom-desk": ["capcom", "comms", "eva"],
  "hq-comms": ["comms", "capcom"],
};
