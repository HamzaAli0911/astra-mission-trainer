import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { AIRLOCKS, cellById, FURNITURE, LOCK_PANELS, PORTALS, type BuildingId, type Side } from "../../sim/base";
import { ball, box, cyl, keep, rbox, strut, torus } from "../kit";
import { ipaint, iplastic } from "../interior/lighting";
import { cableTray, extinguisher, footShadow, hazard, iglass, ilabel, screen, vent } from "../interior/parts";
import { campusInside, CELL_INDEX, cellCeiling, cellFloor } from "./lighting";
import { doorSign, gauge, grating, hangingSign, onWall, P, place, statusLamp, type Build, type Ctx } from "./kitset";
import { drawLock, drawStation } from "./screens";

/**
 * The rest of the campus's rooms: life support's machines, the greenhouse's racks, the storm shelter, the garage,
 * the science lab, the clinic, engineering, the stores, and the yard lock. Machines show their module's real state
 * (status lamps), tanks their store's real fill (gauges), the greenhouse grows with the greenhouse modules and the
 * stores' shelves fill with the stock: the scene keeps all of these in step with the mission.
 */

const label = (g: THREE.Object3D, text: string, w: number, x: number, y: number, z: number, ink = "#1d222b", plate: string | null = "#eceff2") => ilabel(g, text, w, x, y, z, ink, plate);
const pipeX = (g: THREE.Object3D, len: number, r: number, m: THREE.Material, x: number, y: number, z: number) => (cyl(g, r, r, len, m, x, y, z, 10).rotation.z = Math.PI / 2);

export const ROOM_BUILDERS: Record<string, Build> = {
  /* ---- Life support ---- */
  "o2-plant": (g, W, D, H, _f, ctx) => {
    // Electrolysis: a skid of cell stacks splitting water into oxygen and hydrogen, a separator, a control box.
    box(g, W, 0.16, D, P.gun(), 0, 0.08, 0);
    hazard(g, W, 0.08, 0, 0.12, D / 2 + 0.002);
    for (let i = 0; i < 4; i++) {
      const x = -W / 2 + 0.45 + i * ((W - 0.9) / 3);
      rbox(g, 0.42, 1.2, 1.3, 0.04, P.white(), x, 0.16 + 0.6, -0.3);
      for (let k = 0; k < 6; k++) box(g, 0.44, 0.02, 1.32, P.grey(), x, 0.3 + k * 0.18, -0.3);
    }
    cyl(g, 0.38, 0.38, H - 0.5, P.white(), W / 2 - 0.5, 0.16 + (H - 0.5) / 2, D / 2 - 0.6, 20);
    box(g, 0.78, 0.06, 0.78, P.gun(), W / 2 - 0.5, H - 0.32, D / 2 - 0.6);
    const green = ipaint("#3e9a5b", 0.4),
      blue = ipaint("#3d78c2", 0.4);
    pipeX(g, W - 0.4, 0.05, green, 0, H - 0.2, -D / 2 + 0.25);
    pipeX(g, W - 0.4, 0.05, blue, 0, 0.45, -D / 2 + 0.25);
    box(g, 0.6, 0.8, 0.3, P.panel(), -W / 2 + 0.5, 1.2, D / 2 - 0.2);
    statusLamp(g, ctx, "oxygen", -W / 2 + 0.5, 1.45, D / 2 - 0.04);
    label(g, "OXYGEN PLANT", 0.8, 0, H - 0.05, D / 2 - 0.04);
    label(g, "O2", 0.24, W / 2 - 0.5, 1.6, D / 2 - 0.6 + 0.385, "#ffffff", "#3e9a5b");
    footShadow(g, W, D, 0, 0, 0.5);
  },
  "co2-rack": (g, W, D, H, _f, ctx) => {
    box(g, W, H, D, P.panel(), 0, H / 2, 0);
    for (let i = 0; i < 3; i++) vent(g, W - 0.25, 0.32, 0, 0.45 + i * 0.55, D / 2 + 0.001);
    statusLamp(g, ctx, "lifesupport", W / 2 - 0.15, H - 0.2, D / 2 + 0.002);
    label(g, "CO2 REMOVAL", 0.7, -0.1, H - 0.2, D / 2 + 0.002);
    footShadow(g, W, D);
  },
  "water-plant": (g, W, D, H, _f, ctx) => {
    // Water recovery: distillation columns, filter beds, a brine tank and the control box.
    box(g, W, 0.16, D, P.gun(), 0, 0.08, 0);
    hazard(g, W, 0.08, 0, 0.12, D / 2 + 0.002);
    for (let i = 0; i < 3; i++) cyl(g, 0.3, 0.3, H - 0.4, P.white(), -W / 2 + 0.55 + i * 0.8, 0.16 + (H - 0.4) / 2, -0.6, 18);
    for (let i = 0; i < 4; i++) cyl(g, 0.12, 0.12, 0.9, ipaint("#3d78c2", 0.4), -W / 2 + 0.5 + i * 0.5, 0.65, 0.7, 12);
    cyl(g, 0.45, 0.45, 1.0, ipaint("#c7a14a", 0.5), W / 2 - 0.6, 0.66, 0.6, 18);
    pipeX(g, W - 0.4, 0.05, ipaint("#3d78c2", 0.4), 0, H - 0.25, -D / 2 + 0.2);
    box(g, 0.6, 0.8, 0.3, P.panel(), W / 2 - 0.5, 1.3, D / 2 - 0.2);
    statusLamp(g, ctx, "recycler", W / 2 - 0.5, 1.55, D / 2 - 0.04);
    label(g, "WATER RECOVERY", 0.9, 0, H - 0.05, D / 2 - 0.04);
    footShadow(g, W, D, 0, 0, 0.5);
  },
  "pump-skid": (g, W, D, H, _f, ctx) => {
    box(g, W, 0.12, D, P.gun(), 0, 0.06, 0);
    for (const x of [-W / 4, W / 4]) {
      cyl(g, 0.16, 0.16, 0.5, ipaint("#3d78c2", 0.4), x, 0.4, 0, 16).rotation.x = Math.PI / 2;
      cyl(g, 0.13, 0.13, 0.3, P.dark(), x, 0.4, 0.38, 14).rotation.x = Math.PI / 2;
      strut(g, x, 0.55, 0, x, H, -D / 2 + 0.1, 0.04, ipaint("#3d78c2", 0.4), 8);
    }
    statusLamp(g, ctx, "recycler", 0, 0.75, D / 2 + 0.002);
    label(g, "PUMPS", 0.36, 0, 0.92, D / 2 + 0.002);
  },
  "o2-tank": (g, W, D, H, _f, ctx) => {
    const r = Math.min(W, D) / 2 - 0.05;
    cyl(g, r, r, H - 0.5, P.white(), 0, 0.3 + (H - 0.5) / 2, 0, 24);
    ball(g, r, P.white(), 0, H - 0.2, 0, 20).scale.y = 0.4;
    torus(g, r + 0.005, 0.03, ipaint("#3e9a5b", 0.4), 0, H * 0.7, 0).rotation.x = Math.PI / 2;
    for (let i = 0; i < 4; i++) strut(g, Math.cos((i * Math.PI) / 2) * r * 0.8, 0, Math.sin((i * Math.PI) / 2) * r * 0.8, Math.cos((i * Math.PI) / 2) * r * 0.8, 0.36, Math.sin((i * Math.PI) / 2) * r * 0.8, 0.03, P.gun(), 6);
    gauge(g, ctx, "o2", 0, 0.8, r + 0.01, 0.1, 0.9, "#5ee0ff");
    label(g, "O2", 0.22, 0, 1.9, r + 0.012, "#ffffff", "#3e9a5b");
  },
  "water-tank": (g, W, D, H, _f, ctx) => {
    const r = Math.min(W, D) / 2 - 0.05;
    cyl(g, r, r, H - 0.3, ipaint("#dfe6ee", 0.5), 0, 0.15 + (H - 0.3) / 2, 0, 24);
    ball(g, r, ipaint("#dfe6ee", 0.5), 0, H - 0.15, 0, 20).scale.y = 0.3;
    torus(g, r + 0.005, 0.03, ipaint("#3d78c2", 0.4), 0, 0.4, 0).rotation.x = Math.PI / 2;
    gauge(g, ctx, "water", 0, 0.5, r + 0.01, 0.1, H - 0.9, "#4f9dff");
    label(g, "WATER", 0.34, 0, H - 0.25, r + 0.012, "#ffffff", "#3d78c2");
  },

  /* ---- Greenhouse ---- */
  "hydro-rack": (g, W, D, H, _f, ctx) => {
    // Three tiers of trays on a steel frame, an LED bar over each, the nutrient line along the top.
    const frame = P.gun();
    for (let x = -W / 2 + 0.05; x <= W / 2; x += W / 5) for (const z of [-D / 2 + 0.04, D / 2 - 0.04]) box(g, 0.04, H, 0.04, frame, x, H / 2, z);
    if (!ctx.out.growLights) ctx.out.growLights = new THREE.MeshStandardMaterial({ color: "#3a1d33", emissive: "#ff7ad9", emissiveIntensity: 1.2, roughness: 0.4, toneMapped: false });
    for (const y of [0.35, 1.05, 1.75]) {
      box(g, W - 0.1, 0.1, D - 0.12, ipaint("#e8ebe4", 0.5), 0, y, 0);
      box(g, W - 0.14, 0.02, D - 0.2, ipaint("#2f5d34", 0.8), 0, y + 0.055, 0);
      const led = new THREE.Mesh(new THREE.BoxGeometry(W - 0.2, 0.025, 0.08), ctx.out.growLights);
      led.position.set(0, y + 0.6, 0);
      g.add(led);
    }
    pipeX(g, W - 0.1, 0.025, ipaint("#3d78c2", 0.4), 0, H - 0.05, -D / 2 + 0.1);
    footShadow(g, W, D, 0, 0, 0.35);
  },
  "nutrient-tanks": (g, W, D, H) => {
    for (const x of [-W / 4, W / 4]) {
      cyl(g, Math.min(W / 4, D / 2) - 0.03, Math.min(W / 4, D / 2) - 0.03, H - 0.1, ipaint("#e8ebe4", 0.5), x, (H - 0.1) / 2, 0, 18);
      box(g, 0.05, H * 0.6, 0.012, iplastic("#4f9dff", 0.3), x, H * 0.4, D / 2 - 0.02);
    }
    label(g, "NUTRIENTS", 0.5, 0, H + 0.05, D / 2 - 0.02);
  },
  "gh-panel": (g, W, D, H, _f, ctx) => {
    box(g, W, H, D, P.panel(), 0, H / 2, 0);
    screen(g, W - 0.16, 0.42, 0, H - 0.45, D / 2 + 0.004, drawStation("food"), 320);
    statusLamp(g, ctx, "greenhouse", -W / 2 + 0.12, H - 0.85, D / 2 + 0.002);
    label(g, "GREENHOUSE", 0.5, 0.05, H - 0.85, D / 2 + 0.002);
    label(g, "GROW LIGHTS", 0.4, 0, 0.95, D / 2 + 0.002);
    for (let i = 0; i < 3; i++) cyl(g, 0.035, 0.035, 0.03, ipaint(["#5a6577", "#e8b425", "#ff7ad9"][i], 0.4), -0.18 + i * 0.18, 0.78, D / 2 + 0.015, 12).rotation.x = Math.PI / 2;
  },
  "potting-bench": (g, W, D, H) => {
    rbox(g, W, 0.05, D, 0.015, ipaint("#c9b48d", 0.6), 0, H - 0.025, 0);
    box(g, W - 0.1, H - 0.05, D - 0.1, P.panel(), 0, (H - 0.05) / 2, -0.02);
    for (let i = 0; i < 6; i++) {
      const x = -W / 2 + 0.5 + i * ((W - 1) / 5);
      box(g, 0.5, 0.06, 0.35, ipaint("#2f2a26", 0.9), x, H + 0.03, 0);
      for (let k = 0; k < 6; k++) ball(g, 0.025, ipaint("#7dbb52", 0.7), x - 0.18 + (k % 3) * 0.18, H + 0.08, -0.08 + Math.floor(k / 3) * 0.16, 6);
    }
    label(g, "SEEDLINGS", 0.5, 0, H - 0.2, D / 2 + 0.002);
  },
  "germination-cabinet": (g, W, D, H) => {
    box(g, W, H, D, P.white(), 0, H / 2, 0);
    box(g, W - 0.12, H - 0.2, 0.01, iglass("#ffd6f2", 0.25), 0, H / 2, D / 2 + 0.006);
    for (let i = 0; i < 4; i++) box(g, W - 0.2, 0.02, D - 0.15, P.grey(), 0, 0.3 + i * 0.4, 0);
    box(g, W - 0.2, 0.02, 0.04, new THREE.MeshStandardMaterial({ color: "#3a1d33", emissive: "#ff7ad9", emissiveIntensity: 1.4, toneMapped: false }), 0, H - 0.12, 0);
    label(g, "GERMINATION", 0.6, 0, H - 0.04, D / 2 + 0.012);
  },
  sink: (g, W, D, H) => {
    rbox(g, W, 0.05, D, 0.015, P.steel(), 0, H - 0.025, 0);
    box(g, W - 0.05, H - 0.05, D - 0.05, P.panel(), 0, (H - 0.05) / 2, 0);
    box(g, W * 0.6, 0.02, D * 0.5, P.dark(), 0, H + 0.002, 0);
    strut(g, 0, H, -D / 2 + 0.08, 0, H + 0.3, -D / 2 + 0.08, 0.015, P.steel(), 8);
    strut(g, 0, H + 0.3, -D / 2 + 0.08, 0, H + 0.28, -D / 2 + 0.25, 0.012, P.steel(), 8);
  },

  /* ---- Storm shelter ---- */
  "water-wall": (g, W, D, H, f, ctx) => {
    // Stacked water bladders in a steel frame: the mass that stops the storm's particles.
    const n = Math.max(1, Math.round(W / 1.1));
    for (let i = 0; i < n; i++) {
      const x = -W / 2 + (W / n) * (i + 0.5);
      for (let k = 0; k < 3; k++) rbox(g, W / n - 0.08, H / 3 - 0.08, D - 0.06, 0.05, ipaint("#3f7fb8", 0.35), x, (H / 3) * (k + 0.5), 0);
      box(g, 0.04, H, D + 0.02, P.gun(), -W / 2 + (W / n) * i, H / 2, 0);
    }
    if (f.id === "sh-wall-w") {
      gauge(g, ctx, "shelter", W / 2 - 0.5, 0.6, D / 2 + 0.03, 0.12, 1.6, "#5ee0ff");
      label(g, "WATER SHIELD", 0.7, W / 2 - 1.3, 2.1, D / 2 + 0.03, "#ffffff", "#2b4f86");
    }
  },
  "shelter-seat": (g, W, D) => {
    rbox(g, W - 0.04, 0.08, D - 0.1, 0.03, P.cushion(), 0, 0.46, 0.02);
    rbox(g, W - 0.04, 0.6, 0.08, 0.03, P.cushion(), 0, 0.82, -D / 2 + 0.06);
    for (const s of [-1, 1]) box(g, 0.05, 0.6, 0.012, ipaint("#e8b425", 0.6), s * 0.12, 0.82, -D / 2 + 0.11);
    for (const s of [-1, 1]) box(g, 0.04, 0.42, D - 0.2, P.gun(), s * (W / 2 - 0.06), 0.21, 0);
    footShadow(g, W, D, 0, 0, 0.3);
  },
  bunk: (g, W, D, H) => {
    for (const y of [0.4, 1.35]) {
      box(g, W, 0.06, D, P.gun(), 0, y, 0);
      rbox(g, W - 0.08, 0.12, D - 0.08, 0.04, ipaint("#5a6a84", 0.85), 0, y + 0.09, 0);
    }
    for (const [x, z] of [
      [-W / 2 + 0.03, -D / 2 + 0.03],
      [W / 2 - 0.03, -D / 2 + 0.03],
      [-W / 2 + 0.03, D / 2 - 0.03],
      [W / 2 - 0.03, D / 2 - 0.03],
    ])
      box(g, 0.05, H, 0.05, P.gun(), x, H / 2, z);
    footShadow(g, W, D);
  },
  "supply-locker": (g, W, D, H) => {
    const names = ["WATER", "FOOD", "MEDICAL", "RADIOS"];
    const n = Math.max(2, Math.round(W / 0.6));
    for (let i = 0; i < n; i++) {
      const x = -W / 2 + (W / n) * (i + 0.5);
      box(g, W / n - 0.015, H, D, P.white(), x, H / 2, 0);
      label(g, names[i % names.length], 0.34, x, H * 0.75, D / 2 + 0.003);
      box(g, 0.02, 0.16, 0.02, P.steel(), x + W / n / 2 - 0.08, H * 0.5, D / 2 + 0.012);
    }
  },

  /* ---- Garage and engineering ---- */
  "tool-rack": (g, W, D, H) => {
    box(g, W, H - 0.4, 0.04, ipaint("#4a5263", 0.7), 0, 0.4 + (H - 0.4) / 2, -D / 2 + 0.02);
    for (let i = 0; i < 14; i++) {
      const x = -W / 2 + 0.25 + (i % 7) * ((W - 0.5) / 6),
        y = 1.0 + Math.floor(i / 7) * 0.7;
      box(g, 0.05, 0.32 + (i % 3) * 0.08, 0.03, i % 2 ? P.steel() : ipaint("#c4702e", 0.5), x, y, -D / 2 + 0.06);
    }
    box(g, W, 0.8, D - 0.05, P.panel(), 0, 0.4, 0.02);
    label(g, "TOOLS", 0.5, 0, H - 0.1, -D / 2 + 0.045);
  },
  "parts-shelf": (g, W, D, H) => {
    for (const x of [-W / 2 + 0.03, W / 2 - 0.03]) box(g, 0.05, H, D, P.gun(), x, H / 2, 0);
    for (let k = 0; k < 4; k++) {
      const y = 0.15 + k * ((H - 0.25) / 3);
      box(g, W, 0.03, D, P.gun(), 0, y, 0);
      for (let i = 0; i < Math.floor(W / 0.55); i++) if ((i + k) % 3) rbox(g, 0.42, 0.3, D - 0.15, 0.02, ipaint(["#c4702e", "#5a6577", "#2e7d4f"][(i + k) % 3], 0.6), -W / 2 + 0.35 + i * 0.55, y + 0.17, 0);
    }
    label(g, "SPARE PARTS", 0.6, 0, H + 0.05, D / 2);
  },
  workbench: (g, W, D, H) => {
    rbox(g, W, 0.06, D, 0.015, ipaint("#6b5a44", 0.7), 0, H - 0.03, 0);
    for (const x of [-W / 2 + 0.1, W / 2 - 0.1]) box(g, 0.08, H - 0.06, D - 0.1, P.gun(), x, (H - 0.06) / 2, 0);
    box(g, W - 0.3, 0.04, D - 0.2, P.gun(), 0, 0.25, 0);
    box(g, 0.2, 0.14, 0.12, P.dark(), -W / 2 + 0.4, H + 0.07, D / 2 - 0.12);
    box(g, 0.5, 0.06, 0.25, P.steel(), W / 4, H + 0.03, 0);
    strut(g, W / 2 - 0.3, H, -D / 2 + 0.1, W / 2 - 0.3, H + 0.5, -D / 2 + 0.1, 0.015, P.gun(), 6);
    box(g, 0.24, 0.06, 0.12, ipaint("#e8eef8", 0.4), W / 2 - 0.3, H + 0.52, -D / 2 + 0.16);
    footShadow(g, W, D);
  },
  "maintenance-stand": (g, W, D, H) => {
    // A platform at roof height beside the crew rover's bay, with steps and a rail.
    box(g, W, 0.06, D - 1.2, P.gun(), 0, H, -0.6);
    hazard(g, W, 0.06, 0, H + 0.035, (D - 1.2) / 2 - 0.6 + 0.001);
    for (const [x, z] of [
      [-W / 2 + 0.05, -D / 2 + 0.05],
      [W / 2 - 0.05, -D / 2 + 0.05],
      [-W / 2 + 0.05, D / 2 - 1.25],
      [W / 2 - 0.05, D / 2 - 1.25],
    ])
      box(g, 0.06, H, 0.06, P.gun(), x, H / 2, z);
    for (let i = 0; i < 5; i++) box(g, W, 0.04, 0.24, P.gun(), 0, (H / 5) * (i + 0.5), D / 2 - 1.2 + i * 0.24);
    strut(g, W / 2 - 0.05, H, -D / 2 + 0.05, W / 2 - 0.05, H + 1.0, -D / 2 + 0.05, 0.02, P.steel(), 6);
    strut(g, W / 2 - 0.05, H + 1.0, -D / 2 + 0.05, W / 2 - 0.05, H + 1.0, D / 2 - 1.25, 0.02, P.steel(), 6);
  },
  printer: (g, W, D, H, _f, ctx) => {
    // A parts printer: a frame with a window, a print bed, a half-printed part, a control screen.
    box(g, W, 0.2, D, P.dark(), 0, 0.1, 0);
    for (const [x, z] of [
      [-W / 2 + 0.05, -D / 2 + 0.05],
      [W / 2 - 0.05, -D / 2 + 0.05],
      [-W / 2 + 0.05, D / 2 - 0.05],
      [W / 2 - 0.05, D / 2 - 0.05],
    ])
      box(g, 0.08, H - 0.2, 0.08, P.white(), x, 0.2 + (H - 0.2) / 2, z);
    box(g, W, 0.15, D, P.white(), 0, H - 0.075, 0);
    box(g, W - 0.16, H - 0.4, 0.01, iglass("#d6e6ee", 0.15), 0, H / 2, D / 2 - 0.02);
    box(g, W * 0.6, 0.04, D * 0.6, P.grey(), 0, 0.5, 0);
    cyl(g, 0.18, 0.22, 0.3, ipaint("#c4702e", 0.6), 0, 0.67, 0, 16);
    statusLamp(g, ctx, "damage", W / 2 - 0.2, H - 0.25, D / 2 + 0.01);
    label(g, "PARTS PRINTER", 0.6, -0.15, H - 0.08, D / 2 + 0.003);
  },
  "welding-bay": (g, W, D, H) => {
    box(g, W, 0.06, D, P.gun(), 0, 0.9, 0);
    box(g, W, 0.9, 0.04, P.gun(), 0, 0.45, -D / 2 + 0.02);
    box(g, 0.02, H + 0.6, D, ipaint("#7a3a2a", 0.85), W / 2, (H + 0.6) / 2, 0);
    hazard(g, W, 0.08, 0, 0.12, D / 2 + 0.001);
    label(g, "WELDING · EYES!", 0.6, 0, 1.4, -D / 2 + 0.05, "#1d222b", "#e8b425");
  },
  "repair-stand": (g, W, D, H, _f, ctx) => {
    // A module part up on the stand for repair: a pump housing with its pipe stubs, and the job's status.
    box(g, W, 0.08, D, P.gun(), 0, H - 0.6, 0);
    for (const x of [-W / 2 + 0.2, W / 2 - 0.2]) box(g, 0.1, H - 0.6, D - 0.4, P.gun(), x, (H - 0.6) / 2, 0);
    cyl(g, 0.4, 0.4, 1.4, P.white(), 0, H - 0.1, 0, 20).rotation.z = Math.PI / 2;
    for (const x of [-0.85, 0.85]) cyl(g, 0.1, 0.1, 0.3, P.steel(), x, H - 0.1, 0, 12).rotation.z = Math.PI / 2;
    statusLamp(g, ctx, "damage", 0, H - 0.5, D / 2 + 0.002, 0.08);
    label(g, "REPAIR BAY", 0.6, 0, H - 0.75, D / 2 + 0.002);
    footShadow(g, W, D, 0, 0, 0.45);
  },

  /* ---- Science ---- */
  "lab-island": (g, W, D, H) => {
    rbox(g, W, 0.04, D, 0.015, ipaint("#2b3038", 0.3), 0, H - 0.02, 0);
    box(g, W - 0.06, H - 0.04, D - 0.1, P.white(), 0, (H - 0.04) / 2, 0);
    // A service spine down the middle with sockets and a gas tap, sample trays, a sink at one end.
    box(g, W - 0.4, 0.3, 0.12, P.panel(), 0, H + 0.15, 0);
    box(g, 0.5, 0.02, 0.35, P.dark(), W / 2 - 0.4, H + 0.001, 0.2);
    for (let i = 0; i < 4; i++) {
      const x = -W / 2 + 0.6 + i * 1.3;
      box(g, 0.35, 0.03, 0.25, ipaint("#e8ebe4", 0.5), x, H + 0.015, 0.25);
      for (let k = 0; k < 6; k++) cyl(g, 0.015, 0.015, 0.05, ipaint(["#c4702e", "#8a7a6a", "#5a6577"][k % 3], 0.6), x - 0.12 + (k % 3) * 0.12, H + 0.055, 0.2 + Math.floor(k / 3) * 0.1, 8);
    }
    footShadow(g, W, D);
  },
  glovebox: (g, W, D, H) => {
    box(g, W, 0.8, D, P.gun(), 0, 0.4, 0);
    box(g, W, H - 0.8, D, P.steel(), 0, 0.8 + (H - 0.8) / 2, 0);
    box(g, W - 0.2, H - 1.1, 0.01, iglass("#d6e6ee", 0.18), 0, 0.8 + (H - 0.8) / 2, D / 2 + 0.006);
    for (const x of [-W / 6, W / 6]) torus(g, 0.11, 0.025, P.rubber(), x, 1.15, D / 2 + 0.01);
    label(g, "GLOVEBOX · SEALED SAMPLES", 0.9, 0, H - 0.1, D / 2 + 0.008);
  },
  "microscope-bench": (g, W, D, H) => {
    rbox(g, W, 0.04, D, 0.015, ipaint("#2b3038", 0.3), 0, H - 0.02, 0);
    box(g, W - 0.06, H - 0.04, D - 0.1, P.white(), 0, (H - 0.04) / 2, 0);
    for (const x of [-W / 4, W / 4]) {
      // A microscope: base, arm, stage, tube and the eyepieces angled towards you.
      box(g, 0.22, 0.04, 0.26, P.dark(), x, H + 0.02, 0);
      box(g, 0.05, 0.32, 0.06, P.dark(), x, H + 0.2, -0.08);
      box(g, 0.16, 0.02, 0.14, P.dark(), x, H + 0.16, 0.02);
      cyl(g, 0.03, 0.03, 0.18, P.white(), x, H + 0.31, 0.02, 12);
      cyl(g, 0.018, 0.018, 0.12, P.dark(), x, H + 0.43, 0.06, 10).rotation.x = -0.6;
    }
    screen(g, 0.5, 0.3, 0, H + 0.45, -D / 2 + 0.1, drawStation("science"), 320);
    label(g, "MICROSCOPY", 0.5, 0, H - 0.2, D / 2 + 0.002);
  },
  spectrometer: (g, W, D, H) => {
    // A mass spectrometer: a long instrument cabinet with a sample inlet, a vacuum pump below and its screen.
    rbox(g, W, H - 0.3, D, 0.03, P.white(), 0, 0.3 + (H - 0.3) / 2, 0);
    box(g, W - 0.1, 0.3, D - 0.1, P.dark(), 0, 0.15, 0);
    cyl(g, 0.12, 0.12, 0.3, P.steel(), -W / 3, H + 0.15, 0, 14);
    box(g, 0.6, 0.36, 0.02, iplastic("#0f1520", 0.3), W / 5, H - 0.4, D / 2 + 0.004);
    screen(g, 0.56, 0.32, W / 5, H - 0.4, D / 2 + 0.016, drawStation("science"), 256);
    label(g, "MASS SPECTROMETER", 0.8, -W / 6, H - 0.12, D / 2 + 0.004);
  },
  "core-rack": (g, W, D, H) => {
    // Rock cores in labelled trays: the ground's story in layers.
    for (let k = 0; k < 5; k++) {
      const y = 0.25 + k * ((H - 0.4) / 4);
      box(g, W, 0.03, D, P.gun(), 0, y, 0);
      for (let i = 0; i < 4; i++) cyl(g, 0.04, 0.04, D - 0.12, ipaint(["#8a8a86", "#6d6a66", "#a69a86", "#585652"][(i + k) % 4], 0.9), -W / 2 + 0.25 + i * ((W - 0.5) / 3), y + 0.06, 0, 10).rotation.x = Math.PI / 2;
    }
    for (const x of [-W / 2 + 0.03, W / 2 - 0.03]) box(g, 0.04, H, D, P.gun(), x, H / 2, 0);
    label(g, "CORE SAMPLES", 0.6, 0, H + 0.08, D / 2);
  },
  "sample-table": (g, W, D, H) => {
    rbox(g, W, 0.05, D, 0.015, ipaint("#2b3038", 0.3), 0, H - 0.025, 0);
    box(g, W - 0.1, H - 0.05, D - 0.1, P.white(), 0, (H - 0.05) / 2, 0);
    // Rock samples in labelled bags and trays, under a magnifier lamp.
    for (let i = 0; i < 7; i++) {
      const x = -W / 2 + 0.35 + i * ((W - 0.7) / 6);
      box(g, 0.32, 0.02, 0.32, ipaint("#e8ebe4", 0.5), x, H + 0.01, 0);
      ball(g, 0.06 + (i % 3) * 0.015, ipaint(["#6d6a66", "#8a7a6a", "#5a5650", "#a69a86"][i % 4], 0.95), x, H + 0.07, 0, 7).scale.set(1.2, 0.8, 1);
    }
    strut(g, W / 2 - 0.2, H, -D / 2 + 0.15, W / 2 - 0.2, H + 0.55, -D / 2 + 0.15, 0.015, P.gun(), 6);
    torus(g, 0.09, 0.015, P.dark(), W / 2 - 0.2, H + 0.56, -D / 2 + 0.3).rotation.x = Math.PI / 2;
    label(g, "SAMPLES FROM THE SITES", 0.9, 0, H - 0.25, D / 2 + 0.002);
  },
  "rock-saw": (g, W, D, H) => {
    box(g, W, 0.9, D, P.gun(), 0, 0.45, 0);
    box(g, W - 0.2, 0.5, D - 0.3, iglass("#d6e6ee", 0.2), 0, 1.15, 0);
    cyl(g, 0.22, 0.22, 0.02, P.steel(), 0, 1.1, 0, 24).rotation.x = Math.PI / 2;
    hazard(g, W, 0.06, 0, 0.88, D / 2 + 0.002);
    label(g, "ROCK SAW", 0.4, 0, H + 0.02, 0);
  },
  "fume-hood": (g, W, D, H) => {
    box(g, W, 0.9, D, P.white(), 0, 0.45, 0);
    box(g, W, H - 0.9, D, P.white(), 0, 0.9 + (H - 0.9) / 2, -0.05);
    box(g, W - 0.12, 0.7, 0.01, iglass("#d6e6ee", 0.2), 0, 1.3, D / 2 + 0.006);
    label(g, "SAMPLE PREP", 0.5, 0, H - 0.15, D / 2 - 0.04);
  },
  "sample-freezer": (g, W, D, H) => {
    rbox(g, W, H, D, 0.03, P.white(), 0, H / 2, 0);
    box(g, 0.25, 0.08, 0.01, iplastic("#0f1520", 0.3), 0, H - 0.25, D / 2 + 0.003);
    label(g, "SAMPLES −80 °C", 0.5, 0, H - 0.45, D / 2 + 0.003);
    box(g, 0.02, 0.3, 0.03, P.steel(), W / 2 - 0.08, H * 0.6, D / 2 + 0.015);
  },
  "sample-cabinet": (g, W, D, H) => {
    box(g, W, H, D, P.panel(), 0, H / 2, 0);
    const cols = Math.max(1, Math.round(W / 0.5)),
      rows = 6;
    for (let i = 0; i < cols; i++)
      for (let k = 0; k < rows; k++) {
        const x = -W / 2 + (W / cols) * (i + 0.5),
          y = 0.2 + k * ((H - 0.3) / rows);
        box(g, W / cols - 0.04, (H - 0.3) / rows - 0.04, 0.01, P.white(), x, y + (H - 0.3) / rows / 2, D / 2 + 0.006);
        box(g, 0.08, 0.015, 0.015, P.steel(), x, y + (H - 0.3) / rows - 0.06, D / 2 + 0.014);
      }
    label(g, "SAMPLE STORE", 0.6, 0, H + 0.05, D / 2);
  },

  /* ---- Clinic ---- */
  "exam-bed": (g, W, D, H) => {
    // Frame, mattress and a raised back (towards the wall).
    box(g, W - 0.06, 0.06, D - 0.06, P.steel(), 0, H - 0.18, 0);
    rbox(g, W - 0.1, 0.12, D * 0.62, 0.04, ipaint("#cfd8e6", 0.8), 0, H - 0.09, D * 0.17);
    const back = new THREE.Group();
    back.position.set(0, H - 0.15, -D / 2 + 0.35);
    back.rotation.x = -0.6;
    g.add(back);
    rbox(back, W - 0.1, 0.1, 0.7, 0.04, ipaint("#cfd8e6", 0.8), 0, 0.05, 0.3);
    for (const [x, z] of [
      [-W / 2 + 0.06, -D / 2 + 0.1],
      [W / 2 - 0.06, -D / 2 + 0.1],
      [-W / 2 + 0.06, D / 2 - 0.1],
      [W / 2 - 0.06, D / 2 - 0.1],
    ])
      cyl(g, 0.025, 0.025, H - 0.2, P.steel(), x, (H - 0.2) / 2, z, 8);
    footShadow(g, W, D, 0, 0, 0.35);
  },
  "med-cabinet": (g, W, D, H) => {
    box(g, W, H, D, P.white(), 0, H / 2, 0);
    box(g, 0.012, H - 0.1, 0.01, P.grey(), 0, H / 2, D / 2 + 0.005);
    // First aid: a white cross on green (the safety sign, not any organisation's emblem).
    box(g, 0.3, 0.3, 0.01, ipaint("#2e9a5b", 0.5), -W / 4, H - 0.35, D / 2 + 0.008);
    box(g, 0.2, 0.06, 0.012, P.white(), -W / 4, H - 0.35, D / 2 + 0.012);
    box(g, 0.06, 0.2, 0.012, P.white(), -W / 4, H - 0.35, D / 2 + 0.012);
    label(g, "MEDICAL SUPPLIES", 0.6, W / 6, H - 0.35, D / 2 + 0.006);
  },
  "ultrasound-cart": (g, W, D, H) => {
    box(g, W, 0.08, D, P.white(), 0, 0.15, 0);
    box(g, 0.08, H - 0.3, 0.08, P.steel(), 0, 0.15 + (H - 0.3) / 2, -D / 4);
    box(g, W, 0.25, 0.04, P.dark(), 0, H - 0.05, -D / 4);
    box(g, W - 0.06, 0.19, 0.01, iplastic("#0f2a3a", 0.3), 0, H - 0.05, -D / 4 + 0.025);
  },
  shelving: (g, W, D, H, f, ctx) => {
    for (const x of [-W / 2 + 0.03, W / 2 - 0.03]) box(g, 0.05, H, D, P.gun(), x, H / 2, 0);
    for (let k = 0; k < 4; k++) box(g, W, 0.03, D, P.gun(), 0, 0.12 + k * ((H - 0.2) / 3), 0);
    if (f.cell !== "log-store") return;
    // The stores: crates whose number follows the stock (food green, water blue, parts orange).
    const res: ("food" | "water" | "materials")[] = ["food", "water", "materials"];
    const kind = res[Number(f.id.slice(-1)) - 1] ?? "food";
    const color = kind === "food" ? "#5e9d3c" : kind === "water" ? "#3d78c2" : "#c4702e";
    const geo = new THREE.BoxGeometry(0.42, 0.34, D - 0.12);
    geo.setAttribute("cell", new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count).fill(CELL_INDEX.get(f.cell)!), 1));
    const mat = campusInside(new THREE.MeshStandardMaterial({ color, roughness: 0.6 }));
    const per = Math.floor((W - 0.2) / 0.5);
    const total = per * 3;
    const mesh = new THREE.InstancedMesh(geo, mat, total);
    const m4 = new THREE.Matrix4();
    for (let k = 0; k < 3; k++)
      for (let i = 0; i < per; i++) {
        m4.makeTranslation(-W / 2 + 0.35 + i * 0.5, 0.12 + k * ((H - 0.2) / 3) + 0.19, 0);
        mesh.setMatrixAt(k * per + i, m4);
      }
    mesh.userData.keep = true;
    g.add(mesh);
    ctx.out.stock.push({ res: kind, mesh, total });
    label(g, kind === "food" ? "FOOD" : kind === "water" ? "WATER" : "PARTS AND MATERIALS", 0.8, 0, H + 0.12, D / 2, "#ffffff", color);
  },
  pallet: (g, W, D, H) => {
    box(g, W, 0.14, D, ipaint("#8a6a44", 0.8), 0, 0.07, 0);
    for (let i = 0; i < 4; i++) rbox(g, W / 2 - 0.04, (H - 0.14) / 2 - 0.02, D / 2 - 0.04, 0.02, ipaint(i % 2 ? "#5a6577" : "#c4702e", 0.6), ((i % 2) - 0.5) * (W / 2), 0.14 + ((H - 0.14) / 2) * (Math.floor(i / 2) + 0.5), 0);
    footShadow(g, W, D);
  },
  "loading-platform": (g, W, D, H) => {
    box(g, W, H, D, P.gun(), 0, H / 2, 0);
    hazard(g, W, 0.08, 0, H - 0.04, D / 2 + 0.002);
    for (let i = 0; i < 3; i++) rbox(g, 1.1, 0.9, 0.9, 0.03, ipaint(["#5a6577", "#c4702e", "#3d78c2"][i], 0.6), -W / 2 + 2 + i * 4.5, H + 0.45, 0);
  },
};

/** An airlock's fittings: grated floor, its pressure display and panel, a beacon, lights over its doors, stripes. */
export function airlockFittings(g: THREE.Group, ctx: Ctx, id: "eva" | "yard") {
  const a = AIRLOCKS.find((x) => x.id === id)!;
  const lock = cellById(a.chamber)!;
  const inner = PORTALS.find((p) => p.id === a.inner)!,
    outer = PORTALS.find((p) => p.id === a.outer)!;
  const pnl = LOCK_PANELS.find((p) => p.airlock === id)!;
  const sideOf = (p: (typeof PORTALS)[number], cell: string): Side => {
    const r = cellById(cell)!.rect;
    return p.along === "x" ? (Math.abs(p.z - r.z0) < Math.abs(p.z - r.z1) ? "n" : "s") : Math.abs(p.x - r.x0) < Math.abs(p.x - r.x1) ? "w" : "e";
  };
  const atOf = (p: (typeof PORTALS)[number]) => (p.along === "x" ? p.x : p.z);
  grating(g, a.chamber, lock.rect.x0 + 0.3, lock.rect.z0 + 0.3, lock.rect.x1 - 0.3, lock.rect.z1 - 0.3);
  const panelSide: Side = Math.abs(pnl.inside.x - lock.rect.x1) < 0.2 ? "e" : Math.abs(pnl.inside.x - lock.rect.x0) < 0.2 ? "w" : Math.abs(pnl.inside.z - lock.rect.z0) < 0.2 ? "n" : "s";
  const along = panelSide === "e" || panelSide === "w" ? pnl.inside.z : pnl.inside.x;
  const gaugeAt = onWall(g, a.chamber, panelSide, along + (panelSide === "e" || panelSide === "w" ? -1.0 : 1.0), 1.75, 0.03);
  screen(gaugeAt, 0.8, 0.5, 0, 0, 0.02, drawLock(id), 384, true);
  box(gaugeAt, 0.88, 0.58, 0.04, P.black(), 0, 0, 0);
  const panel = onWall(g, a.chamber, panelSide, along, 1.25, 0);
  rbox(panel, 0.42, 0.56, 0.08, 0.02, P.panel(), 0, 0, 0.04);
  cyl(panel, 0.06, 0.06, 0.04, ipaint("#e8b425", 0.4), 0, 0.08, 0.1, 18).rotation.x = Math.PI / 2;
  label(panel, "CYCLE", 0.24, 0, -0.08, 0.082, "#1d222b", null);
  label(panel, "PRESS E", 0.24, 0, -0.18, 0.082, "#5a6577", null);
  const outSide = sideOf(outer, a.chamber),
    inSide = sideOf(inner, a.chamber);
  hazard(onWall(g, a.chamber, outSide, atOf(outer), 2.65, 0.012), outer.width + 0.4, 0.12, 0, 0, 0);
  doorSign(g, a.chamber, outSide, atOf(outer), "TO THE SURFACE", "#ffffff", "#c8322a");
  hazard(onWall(g, a.stage, sideOf(inner, a.stage), atOf(inner), 2.65, 0.012), inner.width + 0.4, 0.12, 0, 0, 0);
  doorSign(g, a.stage, sideOf(inner, a.stage), atOf(inner), "AIRLOCK", "#ffffff", "#c8322a");
  const beaconMat = new THREE.MeshStandardMaterial({ color: "#5a3d10", emissive: "#ffb020", emissiveIntensity: 0, roughness: 0.4 });
  const b = onWall(g, a.chamber, inSide, atOf(inner), 2.5, 0.08);
  cyl(b, 0.06, 0.07, 0.05, P.dark(), 0, -0.08, 0, 14);
  const dome = keep(new THREE.Group());
  b.add(dome);
  dome.add(new THREE.Mesh(new THREE.SphereGeometry(0.07, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), beaconMat));
  box(dome, 0.1, 0.03, 0.01, ipaint("#ffffff", 0.3), 0, 0.03, 0.04);
  ctx.out.beacons.push({ airlock: id, o: dome, mat: beaconMat });
  for (const [door, cell, side, at] of [
    [a.inner, a.chamber, inSide, atOf(inner)],
    [a.inner, a.stage, sideOf(inner, a.stage), atOf(inner)],
    [a.outer, a.chamber, outSide, atOf(outer)],
  ] as const) {
    const mat = new THREE.MeshStandardMaterial({ color: "#1a2a1a", emissive: "#3ee39a", emissiveIntensity: 1.6, roughness: 0.3, toneMapped: false });
    const l = onWall(g, cell, side, at + 0.9, 2.45, 0.02);
    l.add(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 14).rotateX(Math.PI / 2), mat));
    ctx.out.doorLights.push({ door, mat });
  }
}

/** Plants on the greenhouse's racks: four crops, each one instanced set (scaled with how well they grow). */
function greenhousePlants(g: THREE.Group, ctx: Ctx) {
  const racks = FURNITURE.filter((f) => f.kind === "hydro-rack");
  const cell = CELL_INDEX.get("gh-hall")!;
  const withCell = (geo: THREE.BufferGeometry) => {
    geo.setAttribute("cell", new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count).fill(cell), 1));
    return geo;
  };
  // Lettuce (a rosette of leaves), wheat (stalks with ears), tomatoes (a staked bush, fruit added below) and beans
  // (leaf pairs climbing a string): each a small model, coloured per vertex, drawn many times.
  const crops = [
    { geo: withCell(plant("lettuce")), dy: 0.0, spacing: 0.3 },
    { geo: withCell(plant("wheat")), dy: 0.0, spacing: 0.16 },
    { geo: withCell(plant("tomato")), dy: 0.0, spacing: 0.4 },
    { geo: withCell(plant("beans")), dy: 0.0, spacing: 0.3 },
  ];
  const m4 = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    e = new THREE.Euler(),
    s = new THREE.Vector3(),
    p = new THREE.Vector3();
  crops.forEach((crop, ci) => {
    const placements: THREE.Matrix4[] = [];
    racks.forEach((f, ri) => {
      if (ri % crops.length !== ci) return;
      for (const tier of [0.35, 1.05, 1.75])
        for (let z = f.rect.z0 + 0.25; z < f.rect.z1 - 0.15; z += crop.spacing)
          for (const dx of [-0.2, 0.2]) {
            const jitter = Math.sin(z * 13.1 + dx * 7 + tier * 3) * 0.5 + 0.5;
            p.set((f.rect.x0 + f.rect.x1) / 2 + dx, cellFloor(cellById("gh-hall")!) + tier + 0.06 + crop.dy, z);
            e.set(0, jitter * 6.28, 0);
            q.setFromEuler(e);
            const k = 0.85 + jitter * 0.3;
            s.set(k, k, k);
            placements.push(m4.compose(p, q, s).clone());
          }
    });
    const mesh = new THREE.InstancedMesh(crop.geo, leafMaterial(), placements.length);
    placements.forEach((mm, i) => mesh.setMatrixAt(i, mm));
    mesh.userData.keep = true;
    mesh.castShadow = false;
    g.add(mesh);
    ctx.out.plants.push({ mesh, base: placements });
  });
  // Tomatoes on the tomato plants (shown only when the plants are healthy).
  const tomato = withCell(new THREE.SphereGeometry(0.035, 8, 6));
  const fruit = ctx.out.plants[2].base.flatMap((b) =>
    [0, 1, 2].map((k) => {
      const at = new THREE.Vector3().setFromMatrixPosition(b);
      return new THREE.Matrix4().makeTranslation(at.x + Math.cos(k * 2.1) * 0.1, at.y + 0.16 + 0.08 * k, at.z + Math.sin(k * 2.1) * 0.1);
    }),
  );
  const tomatoes = new THREE.InstancedMesh(tomato, campusInside(new THREE.MeshStandardMaterial({ color: "#d9452f", roughness: 0.45 })), fruit.length);
  fruit.forEach((mm, i) => tomatoes.setMatrixAt(i, mm));
  tomatoes.userData.keep = true;
  tomatoes.name = "tomatoes";
  g.add(tomatoes);
  ctx.out.plants.push({ mesh: tomatoes, base: fruit });
}

let leaves: THREE.MeshStandardMaterial | null = null;
/** One material for every plant: leaves and stems coloured per vertex, a soft sheen. */
const leafMaterial = () => (leaves ??= campusInside(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, side: THREE.DoubleSide })));
/** A small plant model, standing on its tray at the origin: pieces merged into one geometry, coloured per vertex. */
function plant(kind: "lettuce" | "wheat" | "tomato" | "beans") {
  const parts: THREE.BufferGeometry[] = [];
  const add = (gm: THREE.BufferGeometry, color: string, m: THREE.Matrix4) => {
    const g = gm.toNonIndexed().applyMatrix4(m);
    const c = new THREE.Color(color);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.deleteAttribute("uv");
    parts.push(g);
  };
  const M = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, "YXZ")), new THREE.Vector3(sx, sy, sz));
  const leaf = new THREE.SphereGeometry(0.05, 7, 5);
  if (kind === "lettuce") {
    // Two rings of broad leaves curling up round a pale heart.
    for (let i = 0; i < 9; i++) add(leaf, i % 2 ? "#7dbb52" : "#8fcc5e", M(Math.cos(i * 0.7) * 0.06, 0.04, Math.sin(i * 0.7) * 0.06, 0, -i * 0.7, 0.55, 1.6, 0.3, 1.0));
    for (let i = 0; i < 6; i++) add(leaf, "#a9d977", M(Math.cos(i * 1.05 + 0.4) * 0.03, 0.07, Math.sin(i * 1.05 + 0.4) * 0.03, 0, -i * 1.05, 0.9, 1.1, 0.3, 0.8));
    add(new THREE.SphereGeometry(0.035, 7, 5), "#c9e6a0", M(0, 0.07, 0));
  } else if (kind === "wheat") {
    // Stalks with an ear of grain at the top.
    const stalk = new THREE.CylinderGeometry(0.004, 0.006, 0.36, 4);
    const ear = new THREE.CylinderGeometry(0.012, 0.007, 0.07, 5);
    for (let i = 0; i < 7; i++) {
      const a = i * 0.9,
        r = 0.03 + (i % 3) * 0.012,
        tilt = 0.08 + (i % 2) * 0.06;
      add(stalk, "#9bb35a", M(Math.cos(a) * r, 0.18, Math.sin(a) * r, Math.sin(a) * tilt, 0, Math.cos(a) * tilt));
      add(ear, "#d8bf62", M(Math.cos(a) * (r + 0.02), 0.39, Math.sin(a) * (r + 0.02), Math.sin(a) * tilt, 0, Math.cos(a) * tilt));
    }
  } else if (kind === "tomato") {
    // A bush of leaf clusters round a cane.
    add(new THREE.CylinderGeometry(0.006, 0.006, 0.5, 4), "#8a7a5a", M(0, 0.25, 0));
    const clump = new THREE.IcosahedronGeometry(0.075, 0);
    for (let i = 0; i < 7; i++) add(clump, i % 2 ? "#3f7f34" : "#4f8f3a", M(Math.cos(i * 1.7) * 0.08, 0.1 + i * 0.045, Math.sin(i * 1.7) * 0.08, i, i * 0.5, 0, 1.2, 0.8, 1.2));
  } else {
    // Beans: leaf pairs climbing a string.
    add(new THREE.CylinderGeometry(0.003, 0.003, 0.5, 3), "#d9d4c4", M(0, 0.25, 0));
    for (let i = 0; i < 6; i++) {
      const y = 0.06 + i * 0.075;
      for (const s of [-1, 1]) add(leaf, i % 2 ? "#5ea64a" : "#6fb85a", M(s * 0.04, y, 0, 0, i * 0.8, s * 0.6, 1.3, 0.25, 0.9));
    }
  }
  const merged = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  return merged;
}

/** Floor markings for the garage's two bays. */
function garageFloor(g: THREE.Group) {
  const c = cellById("garage")!;
  const at = place(g, "garage", 0, cellFloor(c) + 0.004, 0, "s");
  const yellow = ipaint("#e8b425", 0.6);
  for (const [x0, x1] of [
    [23.5, 31.5],
    [35.0, 42.0],
  ]) {
    for (const x of [x0, x1]) box(at, 0.12, 0.004, 13, yellow, x, 0, 61.5);
    box(at, x1 - x0, 0.004, 0.12, yellow, (x0 + x1) / 2, 0, 55.0);
  }
}

/** The fittings and signs of each of the other buildings. */
export function dressRooms(id: BuildingId, g: THREE.Group, ctx: Ctx) {
  switch (id) {
    case "lifesupport": {
      const plant = cellById("ls-plant")!;
      const top = cellCeiling(plant) - 0.35;
      // Colour-coded pipe runs under the ceiling: oxygen green, water blue, waste grey.
      const run = place(g, "ls-plant", -50, top, 35.5, "s");
      pipeX(run, 19.2, 0.07, ipaint("#3e9a5b", 0.4), 0, 0, -3.5);
      pipeX(run, 19.2, 0.07, ipaint("#3d78c2", 0.4), 0, -0.2, -3.2);
      pipeX(run, 19.2, 0.06, ipaint("#8d949e", 0.5), 0, 0.05, 3.8);
      for (let x = -9; x <= 9; x += 3) strut(run, x, 0.35, -3.35, x, -0.25, -3.35, 0.02, P.gun(), 6);
      doorSign(g, "ls-control", "s", -50, "LIFE SUPPORT", "#ffffff", "#2b6cb0");
      doorSign(g, "ls-plant", "s", -50, "PLANT ROOM ↓", "#1d222b", "#eceff2");
      const sch = onWall(g, "ls-control", "e", 42.8, 1.8, 0.03);
      screen(sch, 1.6, 0.9, 0, 0, 0.02, drawStation("o2"), 512, true);
      box(sch, 1.7, 1.0, 0.04, P.black(), 0, 0, 0);
      const sch2 = onWall(g, "ls-control", "w", 42.8, 1.8, 0.03);
      screen(sch2, 1.6, 0.9, 0, 0, 0.02, drawStation("water"), 512, true);
      box(sch2, 1.7, 1.0, 0.04, P.black(), 0, 0, 0);
      extinguisher(onWall(g, "ls-plant", "s", -52.6, 1.05, 0), 0, 0, 0);
      break;
    }
    case "greenhouse": {
      greenhousePlants(g, ctx);
      doorSign(g, "gh-hall", "n", -54, "GREENHOUSE", "#ffffff", "#2e7d4f");
      hangingSign(g, "gh-hall", -54, 52, "s", ["FOOD FROM THE GREENHOUSE MODULES", "LETTUCE · WHEAT · TOMATOES · BEANS"], 2.6);
      doorSign(g, "gh-hall", "s", -54, "PREP ROOM ↓", "#1d222b", "#eceff2");
      break;
    }
    case "shelter": {
      doorSign(g, "w1", "s", -27, "STORM SHELTER", "#1d222b", "#e8b425");
      hangingSign(g, "shelter", -27, 51.5, "s", ["STORM SHELTER", "WATER WALLS · 4 SEATS"], 2.0);
      break;
    }
    case "garage": {
      garageFloor(g);
      const board = onWall(g, "garage", "n", 37.2, 2.2, 0.03);
      screen(board, 1.2, 0.7, -0.68, 0, 0.02, drawStation("rover"), 384);
      screen(board, 1.2, 0.7, 0.68, 0, 0.02, drawStation("scout"), 384);
      box(board, 2.6, 0.84, 0.04, P.black(), 0, 0, 0);
      const s1 = onWall(g, "garage", "n", 27.5, 4.2, 0.02);
      label(s1, "CREW ROVER BAY · CHARGING", 2.6, 0, 0, 0, "#1d222b", "#e8b425");
      const s2 = onWall(g, "garage", "n", 38.5, 4.2, 0.02);
      label(s2, "SCIENCE ROVER · NUCLEAR (RTG) · NO CHARGER", 3.0, 0, 0, 0, "#ffffff", "#5a3d8a");
      break;
    }
    case "science": {
      doorSign(g, "sci-brief", "s", 46, "SCIENCE LAB", "#ffffff", "#5a3d8a");
      const sc = onWall(g, "sci-brief", "e", 42.3, 1.7, 0.03);
      screen(sc, 1.4, 0.8, 0, 0, 0.02, drawStation("science"), 512);
      box(sc, 1.5, 0.9, 0.04, P.black(), 0, 0, 0);
      doorSign(g, "sci-lab", "s", 36, "SAMPLE STORE", "#1d222b", "#eceff2");
      break;
    }
    case "clinic": {
      doorSign(g, "clinic-store", "s", -25.5, "CLINIC", "#ffffff", "#2e9a5b");
      const mon = onWall(g, "clinic-bays", "n", -26.4, 1.75, 0.55);
      screen(mon, 1.0, 0.6, 0, 0, 0.02, drawStation("crew"), 384, true);
      box(mon, 1.08, 0.68, 0.04, P.black(), 0, 0, 0);
      doorSign(g, "clinic-bays", "s", -32.5, "ISOLATION", "#1d222b", "#eceff2");
      break;
    }
    case "engineering": {
      doorSign(g, "eng-shop", "w", 47, "ENGINEERING", "#ffffff", "#c4702e");
      const peg = onWall(g, "eng-shop", "n", 91, 1.9, 0.01);
      box(peg, 4.0, 1.2, 0.03, ipaint("#4a5263", 0.7), 0, 0, 0.015);
      for (let i = 0; i < 18; i++) box(peg, 0.04, 0.24 + (i % 4) * 0.06, 0.03, i % 3 ? P.steel() : ipaint("#c4702e", 0.5), -1.8 + (i % 9) * 0.45, -0.25 + Math.floor(i / 9) * 0.55, 0.05);
      label(peg, "TOOL WALL", 0.6, 0, 0.72, 0.03);
      doorSign(g, "eng-shop", "s", 84, "REPAIR BAY ↓", "#1d222b", "#e8b425");
      doorSign(g, "eng-shop", "s", 96, "POWER DESK", "#1d222b", "#eceff2");
      cableTray(onWall(g, "eng-shop", "s", 88.4, 3.9, 0), 22, 0, 0, 0);
      break;
    }
    case "logistics": {
      doorSign(g, "log-store", "e", 47, "STORES", "#ffffff", "#c08a2e");
      doorSign(g, "log-store", "s", -86.4, "CARGO BAY ↓", "#1d222b", "#e8b425");
      break;
    }
    case "yard": {
      airlockFittings(g, ctx, "yard");
      doorSign(g, "yard-stage", "s", 21, "YARD LOCK", "#1d222b", "#e8b425");
      const up = onWall(g, "yard-stage", "w", 43.3, 2.75, 0.01);
      label(up, "SUIT UP HERE", 1.1, 0, 0, 0, "#1d222b", "#e8b425");
      break;
    }
  }
}
