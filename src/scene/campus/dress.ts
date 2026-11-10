import * as THREE from "three";
import { BUILDINGS, built, cellById, FURNITURE, furnitureById, MEZZANINE, PORTALS, windowsOn, type Side, type Stage } from "../../sim/base";
import { capacity, isBuilt } from "../../sim/core";
import type { InteriorState } from "../../sim/interior";
import { DAMAGED } from "../../sim/modules";
import type { GameState, Planet } from "../../sim/types";
import { ball, box, cyl, keep, rbox, strut, torus } from "../kit";
import { crewFigure } from "../interior/crew";
import { homePiece, suit } from "../interior/furniture";
import { ifabric, imetal, ipaint, iplastic } from "../interior/lighting";
import { beginLabels, cableTray, CREW_COLOR, extinguisher, finishLabels, footShadow, hazard, ilabel, screen, screens, vent } from "../interior/parts";
import { bakeProps } from "./bake";
import { cellCeiling, cellFloor } from "./lighting";
import { clearRuns, doorSign, grating, hangingSign, handrail, inBox, onWall, P, place, type Build, type CampusDressing, type Ctx } from "./kitset";
import { airlockFittings, ROOM_BUILDERS, dressRooms } from "./rooms";
import { CONSOLE_STATIONS, drawLobbyMap, drawStation, drawSuitCheck, drawTable, drawWall } from "./screens";

/**
 * The campus's furniture, fittings and signs, built room by room with the home's kit and re-lit for the campus
 * (campus/bake.ts). Furniture stands in its box from the plan (sim/base.ts: FURNITURE), so what you bump into is
 * what you see; fittings on the walls (screens, vents, trays, rails, signs) stay within a hand's depth of the wall.
 */

/* ---------- Furniture ---------- */

const consoleDesk: Build = (g, W, D, H, f) => {
  const top = ipaint("#3e4656", 0.45),
    body = P.navy();
  rbox(g, W, 0.045, D, 0.018, top, 0, H - 0.022, 0);
  // The back (towards the room's front) is a closed panel; the seats' side is open for knees.
  box(g, W - 0.04, H - 0.06, 0.04, body, 0, (H - 0.06) / 2, -D / 2 + 0.03);
  for (const x of [-W / 2 + 0.03, W / 2 - 0.03]) box(g, 0.04, H - 0.06, D - 0.06, body, x, (H - 0.06) / 2, 0);
  // A thin light rail along the operator's edge, and cable ducts behind.
  box(g, W - 0.1, 0.012, 0.012, iplastic("#2d6cdf", 0.3), 0, H - 0.05, D / 2 - 0.01);
  box(g, W - 0.06, 0.08, 0.1, P.dark(), 0, H + 0.04, -D / 2 + 0.07);
  const seats = Math.max(1, Math.round(W / 1.9));
  const kinds = CONSOLE_STATIONS[f.id] ?? [];
  for (let i = 0; i < seats; i++) {
    const cx = -W / 2 + (W / seats) * (i + 0.5);
    for (const [k, dx] of [
      [0, -0.34],
      [1, 0.34],
    ] as const) {
      const kind = kinds[(i * 2 + k) % Math.max(1, kinds.length)];
      const s = new THREE.Group();
      s.position.set(cx + dx, H + 0.42, -D / 2 + 0.2);
      s.rotation.y = -dx * 0.35;
      s.rotation.x = -0.08;
      g.add(s);
      if (kind) screen(s, 0.6, 0.36, 0, 0, 0, drawStation(kind), 384);
      box(s, 0.05, 0.25, 0.04, P.gun(), 0, -0.3, -0.04);
    }
    box(g, 0.08, 0.02, 0.12, P.gun(), cx, H + 0.01, -D / 2 + 0.22);
    // Keyboard and a trackball.
    rbox(g, 0.44, 0.02, 0.15, 0.008, P.black(), cx, H + 0.012, D / 2 - 0.22);
    ball(g, 0.025, iplastic("#5a6577", 0.3), cx + 0.32, H + 0.02, D / 2 - 0.22, 10);
    ilabel(g, (kinds[i * 2] ? kinds[i * 2].toUpperCase() : "STATION") as string, 0.34, cx, H - 0.25, -D / 2 + 0.005 + 0.001, "#cfd8e6", null).rotation.y = Math.PI;
  }
  footShadow(g, W, D, 0, 0, 0.4);
};

const BUILDERS: Record<string, Build> = {
  console: consoleDesk,
  chair: (g, W, D) => homePiece("command-chair", g, W, D, 1.0),
  bench: (g, W, D, H) => {
    rbox(g, W, 0.08, D, 0.03, P.cushion(), 0, H - 0.04, 0);
    for (const x of [-W / 2 + 0.08, W / 2 - 0.08]) box(g, 0.05, H - 0.08, D - 0.08, P.gun(), x, (H - 0.08) / 2, 0);
    box(g, W - 0.2, 0.03, 0.04, P.gun(), 0, 0.12, 0);
    footShadow(g, W, D, 0, 0, 0.35);
  },
  "situation-table": (g, W, D, H) => {
    // A table whose whole top is a screen: the colony and the sites, live.
    rbox(g, W, 0.06, D, 0.03, P.dark(), 0, H - 0.03, 0);
    const s = new THREE.Group();
    s.position.set(0, H + 0.002, 0);
    s.rotation.x = -Math.PI / 2;
    g.add(s);
    screen(s, W - 0.16, D - 0.16, 0, 0, 0, drawTable, 768);
    box(g, W - 0.5, H - 0.08, D - 0.5, P.navy(), 0, (H - 0.08) / 2, 0);
    box(g, W - 0.1, 0.015, 0.015, iplastic("#5ee0ff", 0.3), 0, H - 0.05, D / 2 + 0.002);
    footShadow(g, W, D, 0, 0, 0.45);
    ilabel(g, "SITUATION TABLE", 0.6, 0, H - 0.3, D / 2 - 0.24, "#cfd8e6", null);
  },
  "crisis-station": (g, W, D, H) => {
    // Emergency controls in a striped frame: the master alarm, shelter call, fans and a direct line.
    box(g, W, H - 0.7, D, P.panel(), 0, 0.7 + (H - 0.7) / 2, 0);
    box(g, W - 0.2, H - 0.95, 0.02, P.dark(), 0, 0.7 + (H - 0.7) / 2, D / 2 + 0.005);
    hazard(g, W, 0.08, 0, H - 0.04, D / 2 + 0.012);
    hazard(g, W, 0.08, 0, 0.74, D / 2 + 0.012);
    const buttons: [string, string][] = [
      ["MASTER ALARM", "#d93a32"],
      ["SHELTER CALL", "#e8b425"],
      ["VENT FANS", "#3b8bd9"],
      ["EARTH LINE", "#3ee39a"],
    ];
    buttons.forEach(([name, color], i) => {
      const x = -W / 2 + 0.45 + i * ((W - 0.9) / 3);
      cyl(g, 0.07, 0.08, 0.05, ipaint(color, 0.35), x, 1.35, D / 2 + 0.04, 18).rotation.x = Math.PI / 2;
      ilabel(g, name, 0.42, x, 1.12, D / 2 + 0.018, "#ffffff", null);
    });
    ilabel(g, "EMERGENCY", 1.0, 0, H - 0.2, D / 2 + 0.018, "#ffffff", "#c8322a");
    rbox(g, 0.12, 0.24, 0.08, 0.02, P.black(), W / 2 - 0.3, 1.6, D / 2 + 0.05);
    extinguisher(g, -W / 2 - 0.25, 1.05, -D / 2 + 0.02);
  },
  closet: (g, W, D, H) => {
    const n = Math.max(2, Math.round(W / 0.62));
    for (let i = 0; i < n; i++) {
      const x = -W / 2 + (W / n) * (i + 0.5);
      box(g, W / n - 0.02, H, D, P.panel(), x, H / 2, 0);
      box(g, 0.02, 0.18, 0.02, P.steel(), x + W / n / 2 - 0.08, H * 0.55, D / 2 + 0.012);
      vent(g, W / n - 0.18, 0.12, x, H - 0.18, D / 2 + 0.001);
    }
    ilabel(g, "EQUIPMENT", 0.5, 0, H * 0.82, D / 2 + 0.003, "#1d222b", "#eceff2");
    footShadow(g, W, D);
  },
  "window-rail": (g, W, D, H) => {
    // A leaning ledge at the windows, on brackets.
    rbox(g, W, 0.04, D - 0.05, 0.015, ipaint("#4a5263", 0.45), 0, H, -0.02);
    for (let x = -W / 2 + 0.6; x <= W / 2 - 0.5; x += 2.4) strut(g, x, 0.02, -D / 2 + 0.03, x, H - 0.02, -D / 2 + 0.03, 0.02, P.steel(), 8);
  },
  "map-kiosk": (g, W, D, H) => {
    box(g, 0.3, H - 0.6, 0.18, P.dark(), 0, (H - 0.6) / 2, -0.04);
    const s = new THREE.Group();
    s.position.set(0, H - 0.32, 0.02);
    s.rotation.x = -0.32;
    g.add(s);
    screen(s, W - 0.1, 0.62, 0, 0, 0, drawLobbyMap, 640);
    rbox(g, 0.6, 0.04, 0.4, 0.02, P.gun(), 0, 0.02, 0);
    footShadow(g, W, D, 0, 0, 0.4);
  },
  planter: (g, W, D, H) => {
    rbox(g, W, H, D, 0.04, ipaint("#7b6a55", 0.8), 0, H / 2, 0);
    box(g, W - 0.08, 0.04, D - 0.08, ipaint("#3b2e22", 0.95), 0, H - 0.03, 0);
    // Lettuces and herbs: low, leafy clumps in two rows.
    for (let i = 0; i < 8; i++) {
      const x = -W / 2 + 0.16 + (i % 4) * ((W - 0.32) / 3),
        z = (i < 4 ? -1 : 1) * (D / 4);
      for (let k = 0; k < 5; k++) ball(g, 0.07 + (k % 2) * 0.02, ipaint(k % 2 ? "#5e9d3c" : "#7dbb52", 0.75), x + Math.cos(k * 1.3) * 0.05, H + 0.05 + (k % 3) * 0.03, z + Math.sin(k * 1.3) * 0.05, 8);
    }
  },
  table: (g, W, D, H) => {
    rbox(g, W, 0.05, D, 0.04, ipaint("#d8d2c6", 0.5), 0, H - 0.025, 0);
    for (const x of [-W / 2 + 0.5, W / 2 - 0.5]) box(g, 0.12, H - 0.05, D - 0.5, P.gun(), x, (H - 0.05) / 2, 0);
    box(g, 0.5, 0.03, 0.2, P.black(), 0, H + 0.015, 0);
    footShadow(g, W, D, 0, 0, 0.4);
  },
  "server-rack": (g, W, D, H, _f, ctx) => {
    box(g, W - 0.01, H, D, P.dark(), 0, H / 2, 0);
    // A perforated front door with the status lights showing through.
    box(g, W - 0.06, H - 0.12, 0.012, ipaint("#2b3038", 0.6), 0, H / 2, D / 2 + 0.003);
    for (let i = 0; i < 9; i++) box(g, W - 0.12, 0.012, 0.004, ipaint("#1b1f26", 0.7), 0, 0.18 + i * 0.2, D / 2 + 0.011);
    for (let i = 0; i < 6; i++) {
      const led = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.008, 0.004), ctx.out.leds);
      led.position.set(-W / 2 + 0.1 + (i % 3) * 0.04, 0.35 + Math.floor(i / 3) * 0.6, D / 2 + 0.012);
      g.add(led);
    }
    box(g, 0.02, 0.2, 0.02, P.steel(), W / 2 - 0.06, H * 0.55, D / 2 + 0.014);
  },
  "cooling-unit": (g, W, D, H) => {
    box(g, W, H, D, P.panel(), 0, H / 2, 0);
    vent(g, W - 0.2, 0.6, 0, H - 0.45, D / 2 + 0.001);
    vent(g, W - 0.2, 0.4, 0, 0.3, D / 2 + 0.001);
    box(g, 0.24, 0.12, 0.01, iplastic("#0f1520", 0.3), W / 2 - 0.25, 1.15, D / 2 + 0.003);
    ilabel(g, "COOLING", 0.4, -W / 4, 1.15, D / 2 + 0.003, "#1d222b", null);
    footShadow(g, W, D);
  },
  "suit-rack": (g, W, D, H, f, ctx) => {
    const frame = P.gun();
    for (const x of [-W / 2 + 0.04, W / 2 - 0.04]) box(g, 0.05, H, 0.05, frame, x, H / 2, -D / 2 + 0.06);
    box(g, W, 0.05, 0.08, frame, 0, H - 0.03, -D / 2 + 0.06);
    box(g, W - 0.04, 0.03, D - 0.05, P.rubber(), 0, 0.015, 0);
    // A helmet shelf above, and the boot grate under.
    box(g, W - 0.1, 0.03, 0.3, P.steel(), 0, H + 0.32, -D / 2 + 0.16);
    for (let i = 0; i < 9; i++) box(g, 0.012, 0.012, D - 0.08, P.steel(), -W / 2 + 0.08 + (i * (W - 0.16)) / 8, 0.035, 0);
    const crew: [string, string][] = f.id === "eva-rack-e" ? [["maya", "M. CHEN"], ["alex", "A. RIVERA"]] : f.id === "eva-rack-w" ? [["sam", "S. OKAFOR"], ["noor", "N. AL-HASSAN"]] : [["", "SPARE 1"], ["", "SPARE 2"]];
    crew.forEach(([id, name], i) => {
      const s = suit(g, (i - 0.5) * (W / 2), id ? CREW_COLOR[id] : "#9aa3b0", name, false);
      if (id === "alex") ctx.out.alexSuit = keep(s);
    });
    footShadow(g, W, D, 0, 0, 0.45);
  },
  lockers: (g, W, D, H) => {
    const n = Math.max(2, Math.round(W / 0.55));
    const names = ["MAYA", "ALEX", "SAM", "NOOR", "SPARE", "TOOLS", "MEDICAL", "SPARE"];
    for (let i = 0; i < n; i++) {
      const x = -W / 2 + (W / n) * (i + 0.5);
      box(g, W / n - 0.015, H, D, i % 2 ? P.panel() : P.white(), x, H / 2, 0);
      vent(g, W / n - 0.2, 0.1, x, H - 0.16, D / 2 + 0.001);
      box(g, 0.02, 0.16, 0.02, P.steel(), x + W / n / 2 - 0.07, H * 0.5, D / 2 + 0.012);
      ilabel(g, names[i % names.length], 0.3, x, H * 0.72, D / 2 + 0.003, "#1d222b", "#eceff2");
    }
    footShadow(g, W, D);
  },
  "service-bench": (g, W, D, H) => {
    rbox(g, W, 0.05, D, 0.015, ipaint("#5a6170", 0.5), 0, H - 0.025, 0);
    box(g, W - 0.05, H - 0.05, D - 0.05, P.panel(), 0, (H - 0.05) / 2, 0);
    for (let i = 0; i < 3; i++) box(g, (W - 0.15) / 3, 0.18, 0.012, P.grey(), -W / 2 + 0.05 + ((W - 0.15) / 3) * (i + 0.5) + i * 0.025, H - 0.18, D / 2 + 0.001);
    // A helmet on its stand, gloves, and the leak-check box.
    cyl(g, 0.03, 0.05, 0.2, P.gun(), -W / 4, H + 0.1, 0, 12);
    ball(g, 0.15, ifabric("#eceae4", 0.85), -W / 4, H + 0.33, 0, 18);
    ball(g, 0.152, imetal("#c99a3c", 0.12), -W / 4, H + 0.33, 0.04, 18).scale.set(1, 0.85, 0.6);
    for (const dx of [0.1, 0.24]) rbox(g, 0.1, 0.05, 0.16, 0.02, ifabric("#c8c3b8", 0.9), W / 4 + dx - 0.17, H + 0.025, 0.05);
    rbox(g, 0.3, 0.2, 0.22, 0.02, P.dark(), W / 4, H + 0.1, -0.12);
    ilabel(g, "SUIT SERVICE", 0.5, 0, H - 0.4, D / 2 + 0.003, "#1d222b", "#eceff2");
  },
  "brush-station": (g, W, D, H) => {
    box(g, W, H, D, P.panel(), 0, H / 2, 0);
    for (let i = 0; i < 4; i++) {
      const x = -W / 2 + 0.3 + i * ((W - 0.6) / 3);
      box(g, 0.06, 0.35, 0.05, ipaint("#c78a3a", 0.95), x, H - 0.4, D / 2 + 0.04);
      box(g, 0.02, 0.2, 0.02, P.gun(), x, H - 0.12, D / 2 + 0.04);
    }
    ilabel(g, "BRUSH OFF THE DUST", 0.7, 0, H - 0.05 + 0.15, D / 2 + 0.003, "#1d222b", "#eceff2");
  },
  vacuum: (g, _W, D, H) => {
    cyl(g, D / 2 - 0.05, D / 2 - 0.02, H - 0.1, P.white(), 0, (H - 0.1) / 2, 0, 20);
    cyl(g, D / 2 - 0.02, D / 2 - 0.02, 0.1, P.dark(), 0, H - 0.05, 0, 20);
    torus(g, 0.16, 0.025, P.rubber(), 0, H * 0.6, D / 2 - 0.02).rotation.y = Math.PI / 2;
    ilabel(g, "DUST VACUUM", 0.36, 0, H * 0.35, D / 2 - 0.015, "#1d222b", null);
  },
};

/* ---------- Fittings ---------- */

/** A pressurised corridor: structural ribs, handrails both sides, cable trays high up, air vents, a guide stripe. */
function corridor(parent: THREE.Group, cell: string, stripe: string) {
  const c = cellById(cell)!;
  const r = c.rect;
  const alongX = r.x1 - r.x0 > r.z1 - r.z0;
  const [sideA, sideB]: [Side, Side] = alongX ? ["n", "s"] : ["w", "e"];
  const y0 = cellFloor(c),
    y1 = cellCeiling(c);
  const len = alongX ? r.x1 - r.x0 : r.z1 - r.z0,
    start = alongX ? r.x0 : r.z0;
  const wins = [...windowsOn(cell, sideA), ...windowsOn(cell, sideB)];
  const rib = ipaint("#9aa6b6", 0.5);
  // Ribs every 2.4 m, but never across a window or a door.
  const doorsAt = PORTALS.filter((p) => p.a === cell || p.b === cell).map((p) => (alongX ? p.x : p.z));
  for (let u = start + 1.2; u < start + len - 0.6; u += 2.4) {
    if (wins.some((w) => Math.abs(w.at - u) < w.width / 2 + 0.25) || doorsAt.some((d) => Math.abs(d - u) < 1.3)) continue;
    const g = place(parent, cell, alongX ? u : (r.x0 + r.x1) / 2, y0, alongX ? (r.z0 + r.z1) / 2 : u, alongX ? "e" : "s");
    // (Local x runs across the corridor.)
    const width = alongX ? r.z1 - r.z0 : r.x1 - r.x0;
    for (const s of [-1, 1]) box(g, 0.08, y1 - y0, 0.18, rib, s * (width / 2 - 0.04), (y1 - y0) / 2, 0);
    box(g, width, 0.1, 0.18, rib, 0, y1 - y0 - 0.05, 0);
  }
  // Handrails and cable trays along both walls, clear of the doors.
  for (const side of [sideA, sideB]) {
    for (const [a, b] of clearRuns(cell, side, 0.35)) {
      handrail(parent, cell, side, a, b);
      const t = onWall(parent, cell, side, (a + b) / 2, y1 - 0.22, 0);
      cableTray(t, b - a, 0, 0, 0);
    }
  }
  // Air vents in the ceiling, and a guide stripe down the floor (each wing has its colour).
  for (let u = start + 2.4; u < start + len - 1; u += 4.8) {
    const g = place(parent, cell, alongX ? u : (r.x0 + r.x1) / 2, y1 - 0.012, alongX ? (r.z0 + r.z1) / 2 : u, "s");
    g.rotation.x = Math.PI / 2;
    vent(g, 0.6, 0.3, 0, 0, 0);
  }
  const s = place(parent, cell, alongX ? r.x0 + len / 2 : (r.x0 + r.x1) / 2, y0 + 0.003, alongX ? (r.z0 + r.z1) / 2 : r.z0 + len / 2, "s");
  box(s, alongX ? len - 0.4 : 0.1, 0.004, alongX ? 0.1 : len - 0.4, ipaint(stripe, 0.6), 0, 0, 0);
}

/* ---------- The buildings ---------- */

function dressHQ(g: THREE.Group, ctx: Ctx) {
  const hall = cellById("hq-hall")!;
  const top = cellCeiling(hall);
  // The display wall above the lobby doors: sixteen metres of live mission status.
  const wall = onWall(g, "hq-hall", "n", 0, 5.6, 0.04);
  box(wall, 16.5, 4.5, 0.12, P.dark(), 0, 0, -0.03);
  screen(wall, 16, 4, 0, 0, 0.04, drawWall, 2048);
  box(wall, 16.6, 0.08, 0.2, P.gun(), 0, -2.3, 0.02);
  ilabel(wall, "MISSION OPERATIONS", 3.2, 0, 2.62, 0.04, "#2b3a55", null);
  // Tall structural ribs up the hall's long walls, cable trays along their tops, vents between.
  for (const side of ["w", "e"] as Side[])
    for (const z of [41.6, 44.4, 50.0, 53.0]) {
      const r = onWall(g, "hq-hall", side, z, top / 2 + 0.25, 0);
      box(r, 0.36, top - 0.5, 0.22, ipaint("#9aa6b6", 0.5), 0, 0, 0.11);
    }
  for (const side of ["w", "e"] as Side[]) {
    const t = onWall(g, "hq-hall", side, 48.3, top - 0.35, 0);
    cableTray(t, 15.6, 0, 0, 0);
  }
  for (const x of [-11, -6, 6, 11]) {
    const v = onWall(g, "hq-hall", "n", x, top - 1.0, 0.01);
    vent(v, 1.2, 0.5, 0, 0, 0);
  }
  // Signs: where the doors go.
  doorSign(g, "hq-hall", "w", 47, "WEST WING ←", "#ffffff", "#2e7d4f");
  doorSign(g, "hq-hall", "e", 47, "EAST WING · EVA →", "#ffffff", "#b5651d");
  doorSign(g, "hq-lobby", "s", 0, "OPERATIONS", "#ffffff", "#2b4f86");
  doorSign(g, "hq-lobby", "n", 0, "HAB-1 ↑", "#ffffff", "#5a6577");
  doorSign(g, "hq-lobby", "w", 37.4, "BRIEFING", "#1d222b", "#eceff2");
  doorSign(g, "hq-lobby", "e", 37.4, "COMMS ROOM", "#1d222b", "#eceff2");
  const name = onWall(g, "hq-lobby", "s", -4, 2.2, 0.02);
  ilabel(name, "COMMAND HQ", 2.4, 0, 0.35, 0, "#2b4f86", null);
  ilabel(name, "Mission operations · briefing · Earth link", 2.4, 0, 0.0, 0, "#5a6577", null);
  extinguisher(onWall(g, "hq-hall", "w", 42.2, 1.05, 0), 0, 0, 0);
  extinguisher(onWall(g, "hq-mezzanine", "e", 53.2, MEZZANINE + 1.05, 0), 0, 0, 0);
  // The briefing room's screen (the mission's goals), and the comms room's cable runs.
  const brief = onWall(g, "hq-briefing", "n", -10.2, 2.0, 0.03);
  screen(brief, 3.0, 1.4, 0, 0, 0.02, drawStation("overview"), 768);
  box(brief, 3.12, 1.52, 0.04, P.black(), 0, 0, 0);
  const tray = onWall(g, "hq-equipment", "n", 10.4, 3.25, 0);
  cableTray(tray, 7.4, 0, 0, 0);
  // The commander at the flight director's desk (while her routine has her at work).
  const seat = furnitureById("hq-fd-chair-2")!;
  const maya = crewFigure("maya", "sit");
  const at = place(g, "hq-mezzanine", (seat.rect.x0 + seat.rect.x1) / 2, MEZZANINE + 0.5, (seat.rect.z0 + seat.rect.z1) / 2 + 0.05, "n");
  at.add(maya);
  ctx.out.crew.push({ id: "maya", spot: "hq-ops", o: maya });
}

function dressEVA(g: THREE.Group, ctx: Ctx) {
  // Suit check over the service bench; the airlock's pressure beside its panel; the panel itself.
  const check = onWall(g, "eva-suit", "s", 52.6, 2.05, 0.03);
  screen(check, 1.2, 0.68, 0, 0, 0.02, drawSuitCheck, 512);
  box(check, 1.28, 0.76, 0.04, P.black(), 0, 0, 0);
  doorSign(g, "eva-suit", "s", 56, "DUST LOCK ↓", "#1d222b", "#e8b425");
  doorSign(g, "eva-suit", "n", 60, "EAST SPINE ↑", "#1d222b", "#eceff2");
  const suitUp = onWall(g, "eva-suit", "n", 64.5, 3.32, 0.01);
  ilabel(suitUp, "SUIT UP HERE", 1.1, 0, 0, 0, "#1d222b", "#e8b425");
  extinguisher(onWall(g, "eva-suit", "w", 54.9, 1.05, 0), 0, 0, 0);
  // The dust lock: air-shower manifolds on both long walls, a grated floor, stripes at the airlock door.
  const dust = cellById("eva-dust")!;
  for (const side of ["n", "s"] as Side[])
    for (const [a, b] of clearRuns("eva-dust", side, 0.4)) {
      const m = onWall(g, "eva-dust", side, (a + b) / 2, 1.2, 0);
      cyl(m, 0.035, 0.035, b - a, P.steel(), 0, 0, 0.08, 10).rotation.z = Math.PI / 2;
      for (let x = -(b - a) / 2 + 0.25; x < (b - a) / 2 - 0.2; x += 0.35) cyl(m, 0.018, 0.012, 0.08, P.gun(), x, 0, 0.13, 8).rotation.x = Math.PI / 2;
      for (let x = -(b - a) / 2 + 0.25; x < (b - a) / 2 - 0.2; x += 1.2) strut(m, x, 0, 0, x, 0, 0.08, 0.015, P.gun(), 6);
    }
  grating(g, "eva-dust", dust.rect.x0 + 0.6, dust.rect.z0 + 0.3, dust.rect.x1 - 0.3, dust.rect.z1 - 0.3);
  // The airlock itself (both airlocks share these fittings: campus/rooms.ts).
  airlockFittings(g, ctx, "eva");
}

function dressLink(g: THREE.Group) {
  corridor(g, "link", "#d0a03a");
  hangingSign(g, "link", 0, 31.5, "s", ["COMMAND HQ ↓", "EAST WING · EVA"], 1.7);
  hangingSign(g, "link", 0, 11.0, "n", ["HAB-1 ↑", "CREW RESIDENCE"], 1.7);
}

export async function dressCampus(planet: Planet, stage: Stage, pause: () => Promise<boolean>): Promise<CampusDressing | null> {
  const leds = new THREE.MeshStandardMaterial({ color: "#05220f", emissive: "#3ee39a", emissiveIntensity: 1.4, roughness: 0.4, toneMapped: false });
  const out: CampusDressing = { groups: new Map(), screens: [], alexSuit: null, beacons: [], doorLights: [], leds, crew: [], status: [], gauges: [], plants: [], growLights: null, stock: [] };
  const ctx: Ctx = { planet, out };
  const firstScreen = screens.length;
  beginLabels();
  for (const b of BUILDINGS) {
    if (b.kind === "compound" || b.id === "hab" || !built(b, stage)) continue;
    const g = new THREE.Group();
    g.name = `${b.id}-dressing`;
    for (const f of FURNITURE) {
      if (cellById(f.cell)?.building !== b.id) continue;
      const build = BUILDERS[f.kind] ?? ROOM_BUILDERS[f.kind];
      if (!build) continue;
      const { g: piece, W, D } = inBox(g, f);
      build(piece, W, D, f.h, f, ctx);
    }
    if (b.id === "link") dressLink(g);
    else if (b.id === "w1") corridor(g, "w1", "#2e7d4f");
    else if (b.id === "e1") corridor(g, "e1", "#b5651d");
    else if (b.id === "hq") dressHQ(g, ctx);
    else if (b.id === "eva") dressEVA(g, ctx);
    else dressRooms(b.id, g, ctx);
    out.groups.set(b.id, g);
    if (!(await pause())) {
      finishLabels();
      return null;
    }
  }
  finishLabels();
  for (const g of out.groups.values()) bakeProps(g);
  out.screens = screens.splice(firstScreen);
  return out;
}

export type { CampusDressing } from "./kitset";

const LAMP = { on: "#3ee39a", off: "#ffb020", broken: "#ff4d5e" } as const;
const grow = new THREE.Matrix4();
/**
 * Keep the campus's machines, gauges, plants and stores showing the mission's real state (call a couple of times a
 * second): a status lamp is green while its modules run, amber when they're switched off, red when one is damaged,
 * and dark when none is built; tanks and shelves follow the stores; the greenhouse grows only with the greenhouse
 * modules (none built: empty racks, lights off).
 */
export function keepInStep(d: CampusDressing, g: GameState, st: InteriorState) {
  const cap = capacity(g);
  for (const s of d.status) {
    let state: keyof typeof LAMP | "none";
    if (s.bind === "lifesupport") state = st.lights === "emergency" ? "off" : "on";
    else if (s.bind === "damage") state = g.modules.some((m) => isBuilt(m) && m.health < DAMAGED) ? "broken" : "on";
    else {
      const ms = g.modules.filter((m) => m.type === s.bind && isBuilt(m));
      state = !ms.length ? "none" : ms.some((m) => m.health < DAMAGED) ? "broken" : ms.some((m) => m.on) ? "on" : "off";
    }
    s.mat.emissive.set(state === "none" ? "#20262e" : LAMP[state]);
    s.mat.emissiveIntensity = state === "none" ? 0.2 : 1.6;
  }
  const fill = (res: string) =>
    res === "o2" ? g.res.o2 / cap.o2 : res === "water" ? g.res.water / cap.water : res === "food" ? g.res.food / cap.food : res === "materials" ? g.res.materials / 150 : g.modules.some((m) => m.type === "shelter" && isBuilt(m)) ? 1 : 0;
  for (const k of d.gauges) k.o.scale.y = Math.max(0.02, Math.min(1, fill(k.res)));
  for (const k of d.stock) k.mesh.count = Math.round(k.total * Math.max(0, Math.min(1, fill(k.res))));
  // The greenhouse: plants sized by how well they grow, fruit only on healthy plants, lights with the modules' setting.
  const houses = g.modules.filter((m) => m.type === "greenhouse" && isBuilt(m));
  const lit = houses.filter((m) => m.on && m.health >= DAMAGED);
  const scale = houses.length ? 0.45 + 0.55 * st.plants : 0;
  for (const p of d.plants) {
    const tomatoes = p.mesh.name === "tomatoes";
    p.mesh.visible = houses.length > 0 && (!tomatoes || st.plants > 0.7);
    if (!p.mesh.visible || p.mesh.userData.scale === scale) continue;
    p.mesh.userData.scale = scale;
    grow.makeScale(scale, scale, scale);
    p.base.forEach((b, i) => p.mesh.setMatrixAt(i, tomatoes ? b : new THREE.Matrix4().multiplyMatrices(b, grow)));
    p.mesh.instanceMatrix.needsUpdate = true;
  }
  if (d.growLights) d.growLights.emissiveIntensity = lit.length && st.lights !== "emergency" ? 0.5 + 0.5 * (Math.max(...lit.map((m) => m.light)) / 2) : 0.04;
}
