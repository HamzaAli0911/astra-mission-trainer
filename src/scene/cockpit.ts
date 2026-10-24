import * as THREE from "three";
import type { Planet } from "../sim/types";
import { ball, box, cyl, finalize, glass, light, paint, pipe, rbox, strut, torus } from "./kit";

/** Where the driver's eyes are, in the rover's own frame (forward is −z). */
export const EYE = new THREE.Vector3(-0.42, 2.0, 0.05);

export interface CockpitData {
  planet: Planet;
  battery: number;
  /** −1…1 of top speed (negative is reverse). */
  speed: number;
  heading: number;
  mode: "parked" | "auto" | "manual" | "working";
  /** The destination, relative to the rover (metres east and south). */
  target: { name: string; dx: number; dz: number } | null;
  sites: { dx: number; dz: number; color: string; done: boolean }[];
  dock: { dx: number; dz: number };
  cargo: { water: number; materials: number; samples: number };
  clock: string;
  day: boolean;
  storm: boolean;
  dust: boolean;
  crater: boolean;
  lights: boolean;
}

const W = 512,
  H = 320;
const C = { bg: "#060d1c", line: "rgba(120,170,255,0.16)", text: "#e8f0ff", dim: "#8ea3c8", cyan: "#5ee0ff", orange: "#ff8a3d", green: "#3ee39a", amber: "#ffb020", red: "#ff4d5e" };
const FONT = "Lexend Variable, system-ui, sans-serif";

function panel(ctx: CanvasRenderingContext2D, title: string) {
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
  const g = ctx.createRadialGradient(W / 2, H * 0.4, 20, W / 2, H / 2, W * 0.75);
  g.addColorStop(0, "rgba(40,80,160,0.22)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 1;
  for (let x = 0; x <= W; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  for (let y = 0; y <= H; y += 32) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(120,170,255,0.45)";
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, W - 4, H - 4);
  ctx.fillStyle = C.dim;
  ctx.font = `600 22px ${FONT}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(title, 22, 38);
}

function chip(ctx: CanvasRenderingContext2D, text: string, color: string) {
  ctx.font = `700 20px ${FONT}`;
  const w = ctx.measureText(text).width + 26;
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.18;
  ctx.fillRect(W - w - 20, 16, w, 32);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.strokeRect(W - w - 20, 16, w, 32);
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.fillText(text, W - 20 - w / 2, 39);
}

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

function drawDrive(ctx: CanvasRenderingContext2D, d: CockpitData) {
  panel(ctx, "DRIVE");
  const mode = { parked: ["PARKED", C.dim], auto: ["AUTOPILOT", C.cyan], manual: ["MANUAL", C.orange], working: ["CREW OUTSIDE", C.amber] }[d.mode];
  chip(ctx, mode[0], mode[1]);
  // Speed dial: top speed of a real crewed rover is about 12 km/h.
  const kmh = Math.abs(d.speed) * 12;
  const cx = 150,
    cy = 205,
    r = 100;
  ctx.lineCap = "round";
  ctx.lineWidth = 16;
  ctx.strokeStyle = "rgba(255,255,255,0.1)";
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI * 0.8, Math.PI * 2.2);
  ctx.stroke();
  ctx.strokeStyle = d.speed < 0 ? C.amber : C.cyan;
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI * 0.8, Math.PI * (0.8 + 1.4 * Math.min(1, Math.abs(d.speed))));
  ctx.stroke();
  ctx.lineCap = "butt";
  ctx.fillStyle = C.text;
  ctx.textAlign = "center";
  ctx.font = `700 64px ${FONT}`;
  ctx.fillText(kmh.toFixed(0), cx, cy + 14);
  ctx.font = `600 20px ${FONT}`;
  ctx.fillStyle = C.dim;
  ctx.fillText(d.speed < -0.02 ? "km/h  REVERSE" : "km/h", cx, cy + 46);
  // Battery.
  const b = d.battery / 100;
  const col = b > 0.5 ? C.green : b > 0.25 ? C.amber : C.red;
  ctx.textAlign = "left";
  ctx.font = `600 20px ${FONT}`;
  ctx.fillStyle = C.dim;
  ctx.fillText("BATTERY", 290, 120);
  ctx.font = `700 52px ${FONT}`;
  ctx.fillStyle = col;
  ctx.fillText(`${Math.round(d.battery)}%`, 290, 176);
  for (let i = 0; i < 10; i++) {
    ctx.fillStyle = i < Math.round(b * 10) ? col : "rgba(255,255,255,0.1)";
    ctx.fillRect(290 + i * 20, 196, 15, 36);
  }
  ctx.font = `600 18px ${FONT}`;
  ctx.fillStyle = d.lights ? C.cyan : C.dim;
  ctx.fillText(d.lights ? "● HEADLIGHTS ON" : "○ HEADLIGHTS OFF", 290, 270);
}

function drawNav(ctx: CanvasRenderingContext2D, d: CockpitData) {
  panel(ctx, "NAVIGATION");
  // Compass tape across the top.
  const deg = (((-d.heading * 180) / Math.PI) % 360 + 360) % 360;
  ctx.save();
  ctx.beginPath();
  ctx.rect(246, 14, 250, 36);
  ctx.clip();
  ctx.font = `700 20px ${FONT}`;
  ctx.textAlign = "center";
  for (let k = -8; k <= 16; k++) {
    const a = k * 45;
    const x = 371 + (a - deg) * 2.0;
    if (x < 230 || x > 512) continue;
    ctx.fillStyle = k % 8 === 0 ? C.orange : C.text;
    ctx.fillText(COMPASS[((k % 8) + 8) % 8], x, 40);
  }
  ctx.restore();
  ctx.fillStyle = C.orange;
  ctx.beginPath();
  ctx.moveTo(371, 52);
  ctx.lineTo(364, 62);
  ctx.lineTo(378, 62);
  ctx.fill();
  // Radar: the rover in the middle, pointing up; 150 m to the edge.
  const cx = 150,
    cy = 190,
    R = 108,
    range = 150;
  ctx.strokeStyle = "rgba(94,224,255,0.35)";
  ctx.lineWidth = 2;
  for (const k of [1, 0.5]) {
    ctx.beginPath();
    ctx.arc(cx, cy, R * k, 0, Math.PI * 2);
    ctx.stroke();
  }
  const place = (dx: number, dz: number) => {
    // World offset into the rover's frame: forward is up.
    const s = Math.sin(d.heading),
      c = Math.cos(d.heading);
    const right = dx * c - dz * s,
      fwd = -(dx * s + dz * c);
    const k = Math.min(1, R / Math.max(1, (Math.hypot(right, fwd) / range) * R));
    return { x: cx + (right / range) * R * k, y: cy - (fwd / range) * R * k, edge: k < 1 };
  };
  for (const s of d.sites) {
    const p = place(s.dx, s.dz);
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.edge ? 5 : 7, 0, Math.PI * 2);
    ctx.fillStyle = s.done ? "rgba(255,255,255,0.25)" : s.color;
    ctx.fill();
  }
  const dock = place(d.dock.dx, d.dock.dz);
  ctx.fillStyle = "#ffc94a";
  ctx.fillRect(dock.x - 6, dock.y - 6, 12, 12);
  if (d.target) {
    const p = place(d.target.dx, d.target.dz);
    ctx.strokeStyle = C.orange;
    ctx.setLineDash([8, 6]);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.fillStyle = C.orange;
  ctx.beginPath();
  ctx.moveTo(cx, cy - 14);
  ctx.lineTo(cx + 10, cy + 10);
  ctx.lineTo(cx, cy + 4);
  ctx.lineTo(cx - 10, cy + 10);
  ctx.fill();
  // Destination.
  ctx.textAlign = "left";
  ctx.fillStyle = C.dim;
  ctx.font = `600 18px ${FONT}`;
  ctx.fillText("DESTINATION", 285, 120);
  ctx.fillStyle = C.text;
  ctx.font = `700 26px ${FONT}`;
  const name = d.target?.name ?? "None";
  const words = name.split(" ");
  let line = "",
    y = 154;
  for (const w of words) {
    if (ctx.measureText(`${line} ${w}`).width > 210 && line) {
      ctx.fillText(line, 285, y);
      line = w;
      y += 30;
    } else line = line ? `${line} ${w}` : w;
  }
  ctx.fillText(line, 285, y);
  if (d.target) {
    ctx.fillStyle = C.cyan;
    ctx.font = `700 40px ${FONT}`;
    ctx.fillText(`${Math.round(Math.hypot(d.target.dx, d.target.dz))} m`, 285, y + 52);
  }
}

function drawSystems(ctx: CanvasRenderingContext2D, d: CockpitData) {
  panel(ctx, "SYSTEMS");
  ctx.textAlign = "right";
  ctx.font = `600 20px ${FONT}`;
  ctx.fillStyle = C.text;
  ctx.fillText(d.clock, W - 22, 38);
  const rows: [string, string, string][] = [
    ["Water ice", `${Math.round(d.cargo.water)} L`, d.cargo.water > 0 ? C.cyan : C.dim],
    ["Regolith", `${Math.round(d.cargo.materials)} kg`, d.cargo.materials > 0 ? C.orange : C.dim],
    ["Samples", `${d.cargo.samples}`, d.cargo.samples > 0 ? C.green : C.dim],
  ];
  ctx.font = `600 20px ${FONT}`;
  ctx.textAlign = "left";
  ctx.fillStyle = C.dim;
  ctx.fillText("CARGO", 22, 82);
  rows.forEach(([k, v, c], i) => {
    const y = 116 + i * 34;
    ctx.fillStyle = C.text;
    ctx.font = `500 22px ${FONT}`;
    ctx.textAlign = "left";
    ctx.fillText(k, 22, y);
    ctx.fillStyle = c;
    ctx.font = `700 22px ${FONT}`;
    ctx.textAlign = "right";
    ctx.fillText(v, W - 22, y);
  });
  // Outside conditions.
  let text = d.day ? "Sunlight" : "Night: lights on";
  let color = d.day ? C.green : C.cyan;
  if (d.crater) [text, color] = ["Dark crater: battery drains fast", C.cyan];
  if (d.dust) [text, color] = ["Dust storm: low sunlight", C.amber];
  if (d.storm) [text, color] = ["RADIATION STORM: go home!", C.red];
  const flash = d.storm && Math.floor(performance.now() / 400) % 2 === 0;
  ctx.fillStyle = flash ? "rgba(255,77,94,0.3)" : "rgba(255,255,255,0.06)";
  ctx.fillRect(16, 236, W - 32, 62);
  ctx.textAlign = "left";
  ctx.fillStyle = C.dim;
  ctx.font = `600 16px ${FONT}`;
  ctx.fillText("OUTSIDE", 30, 258);
  ctx.fillStyle = color;
  ctx.font = `700 22px ${FONT}`;
  ctx.fillText(text, 30, 286);
}

function makeScreen(draw: (ctx: CanvasRenderingContext2D, d: CockpitData) => void) {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  mat.color.setScalar(1.15);
  return {
    mat,
    update(d: CockpitData) {
      draw(ctx, d);
      tex.needsUpdate = true;
    },
  };
}

/**
 * The inside of the rover: dashboard with three live screens, window frames,
 * the co-driver's seat and the suitports at the back. Shown only in the driver's view.
 */
export function buildCockpit() {
  const g = new THREE.Group();
  // Cabin surfaces glow faintly (the crew's own lights), so the inside reads at night too.
  const lit = (color: string, rough: number, metal = 0, glow = 0.5) =>
    new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, emissive: "#252d40", emissiveIntensity: glow });
  const shell = lit("#5b6374", 0.85, 0.1),
    trim = lit("#2f3644", 0.7, 0.2),
    soft = lit("#6c7588", 0.95),
    frame = lit("#9aa3b4", 0.4, 0.6, 0.3),
    accent = paint("#ff8a3d", 0.5);
  // Floor and ceiling. The canopy (front) and side windows are glass; everything else is wall.
  box(g, 1.96, 0.04, 3.6, trim, 0, 1.06, 0.05);
  box(g, 1.96, 0.05, 2.8, shell, 0, 2.24, 0.36);
  for (const x of [-1, 1]) {
    // Below the windows: up to the belt line (lower at the front, where the canopy wraps round).
    box(g, 0.04, 0.74, 2.83, shell, x * 0.99, 1.43, 0.335);
    box(g, 0.04, 0.54, 0.7, shell, x * 0.97, 1.33, -1.42);
    // Behind and between the side windows.
    box(g, 0.04, 0.44, 1.45, shell, x * 0.99, 2.02, 1.025);
    box(g, 0.04, 0.44, 0.2, shell, x * 0.99, 2.02, -0.96);
    box(g, 0.04, 0.1, 1.16, shell, x * 0.99, 2.19, -0.3);
    // Side window frames, and an orange stripe at the belt line.
    box(g, 0.06, 0.04, 1.16, frame, x * 0.98, 1.82, -0.3);
    box(g, 0.06, 0.04, 1.16, frame, x * 0.98, 2.14, -0.3);
    box(g, 0.05, 0.035, 2.6, accent, x * 0.965, 1.62, 0.4);
    // A-pillars along the canopy's edges.
    strut(g, x * 0.92, 1.58, -1.86, x * 0.96, 2.22, -1.06, 0.04, trim);
  }
  // Window glass: a faint tint and reflections.
  for (const x of [-1, 1]) {
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(1.16, 0.32), glass("#9fd6ff", 0.08));
    pane.position.set(x * 1.0, 1.98, -0.3);
    pane.rotation.y = (x * Math.PI) / 2;
    g.add(pane);
  }
  const shield = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.16), glass("#9fd6ff", 0.06));
  shield.position.set(0, 1.857, -1.473);
  shield.rotation.x = 0.87;
  g.add(shield);
  // Header beam over the canopy, and the overhead switch panel.
  box(g, 1.96, 0.07, 0.12, trim, 0, 2.21, -1.04);
  rbox(g, 0.62, 0.06, 0.34, 0.02, trim, 0, 2.2, -0.18);
  for (let i = 0; i < 4; i++) ball(g, 0.018, light(i === 0 ? "#3ee39a" : "#5ee0ff", 1.4), -0.18 + i * 0.12, 2.165, -0.08, 6);
  // Ceiling light and grab handles.
  box(g, 0.9, 0.012, 0.08, light("#fff1d8", 0.8), 0, 2.212, 0.65);
  for (const x of [-0.8, 0.8]) pipe(g, [[x, 2.21, 0.35], [x, 2.15, 0.42], [x, 2.15, 1.38], [x, 2.21, 1.45]], 0.016, frame, 5);
  // Dashboard under the canopy.
  rbox(g, 1.9, 0.42, 0.7, 0.08, trim, 0, 1.4, -1.55).rotation.x = 0.1;
  rbox(g, 1.86, 0.06, 0.56, 0.03, soft, 0, 1.6, -1.36).rotation.x = -0.08;
  // A control yoke in front of the driver, and a joystick for the co-driver.
  torus(g, 0.15, 0.022, frame, EYE.x, 1.62, -0.62, Math.PI).rotation.x = -0.35;
  cyl(g, 0.025, 0.025, 0.3, frame, EYE.x, 1.55, -0.78, 8).rotation.x = 1.2;
  cyl(g, 0.02, 0.025, 0.16, frame, 0.42, 1.52, -0.4, 8);
  ball(g, 0.04, paint("#1b2029", 0.6), 0.42, 1.62, -0.4, 10);
  // Centre console between the seats, and a side panel by the driver's left hand.
  rbox(g, 0.3, 0.3, 0.7, 0.04, trim, 0, 1.22, -0.12);
  const leds = [light("#3ee39a", 0.6), light("#ffb020", 0.6), light("#5ee0ff", 0.6)];
  for (let i = 0; i < 6; i++) box(g, 0.05, 0.015, 0.035, leds[i % 3], -0.08 + (i % 3) * 0.08, 1.375, -0.3 + Math.floor(i / 3) * 0.12);
  rbox(g, 0.08, 0.24, 0.42, 0.03, trim, -0.94, 1.48, -0.95);
  for (let i = 0; i < 4; i++) box(g, 0.008, 0.022, 0.03, leds[i % 3], -0.896, 1.45 + (i % 2) * 0.06, -1.05 + Math.floor(i / 2) * 0.16);
  // Co-driver's seat and the driver's armrest.
  rbox(g, 0.52, 0.12, 0.52, 0.05, soft, 0.42, 1.36, 0.1);
  rbox(g, 0.52, 0.72, 0.12, 0.05, soft, 0.42, 1.74, 0.38).rotation.x = -0.12;
  rbox(g, 0.12, 0.08, 0.5, 0.03, soft, EYE.x + 0.32, 1.55, 0.05);
  // Back wall with the two suitports the crew climb through.
  box(g, 2.0, 1.3, 0.04, shell, 0, 1.72, 1.72);
  for (const x of [-0.48, 0.48]) {
    torus(g, 0.32, 0.05, frame, x, 1.75, 1.69);
    cyl(g, 0.3, 0.3, 0.03, paint("#c9ced8", 0.6), x, 1.75, 1.7, 24).rotation.x = Math.PI / 2;
    box(g, 0.2, 0.05, 0.02, light("#3ee39a", 1.5), x, 2.12, 1.69);
  }
  finalize(g);
  // Screens: driving, navigation, systems.
  const screens = [makeScreen(drawDrive), makeScreen(drawNav), makeScreen(drawSystems)];
  const at: [number, number, number, number][] = [
    [EYE.x, 1.78, -1.22, 0.12],
    [0.08, 1.78, -1.25, -0.02],
    [0.58, 1.78, -1.22, -0.2],
  ];
  screens.forEach((s, i) => {
    const [x, y, z, yaw] = at[i];
    const bezel = new THREE.Mesh(new THREE.BoxGeometry(0.47, 0.31, 0.03), lit("#141922", 0.5));
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.2625), s.mat);
    const holder = new THREE.Group();
    holder.position.set(x, y, z);
    holder.rotation.set(-0.5, yaw, 0, "YXZ");
    face.position.z = 0.017;
    holder.add(bezel, face);
    g.add(holder);
  });
  g.visible = false;
  let last = 0;
  return {
    group: g,
    /** Redraw the screens (a few times a second is plenty). */
    update(d: CockpitData, now: number) {
      if (now - last < 0.2) return;
      last = now;
      for (const s of screens) s.update(d);
    },
  };
}
