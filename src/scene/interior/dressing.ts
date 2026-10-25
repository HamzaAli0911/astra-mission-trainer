import * as THREE from "three";
import { HOME, polar, rad, ROOMS, STAIR, stairPoint, type Level } from "../../sim/home";
import { box, cyl, keep, mesh, rbox, strut, torus } from "../kit";
import { living } from "./furniture";
import { ifabric, imetal, ipaint, iplastic } from "./lighting";
import { cableTray, extinguisher, handle, hazard, ilabel, screen, vent, type ScreenData } from "./parts";
import { HATCH } from "./structure";

/** A frame on a wall: at a bearing and distance from the centre, `y` up, turned to face the centre (+z) or away. */
function onWall(g: THREE.Group, bearing: number, r: number, y: number, outward = false) {
  const f = new THREE.Group();
  const p = polar(bearing, r);
  f.position.set(p.x, y, p.z);
  f.rotation.y = -rad(bearing) + (outward ? Math.PI : 0);
  g.add(f);
  return f;
}
/** A frame on a radial partition at bearing `edge`, on its clockwise (+1) or other (−1) face, `along` out from the centre. */
function onPartition(g: THREE.Group, edge: number, side: 1 | -1, along: number, y: number) {
  const f = new THREE.Group();
  const n = polar(edge, 1),
    t = { x: -n.z, z: n.x };
  const off = side * (HOME.wall / 2 + 0.002);
  f.position.set(n.x * along + t.x * off, y, n.z * along + t.z * off);
  // Facing away from the partition, into the room on that side.
  f.rotation.y = -rad(edge) + (side > 0 ? Math.PI / 2 : -Math.PI / 2);
  g.add(f);
  return f;
}

const fmt = (n: number) => Math.round(n).toString();
/** The command room's big screen: the whole outpost at a glance, and how far behind Earth is. */
function drawSummary(c: CanvasRenderingContext2D, w: number, h: number, d: ScreenData) {
  c.fillStyle = "#06101f";
  c.fillRect(0, 0, w, h);
  c.fillStyle = "#8fd3ff";
  c.font = `700 ${h * 0.09}px Lexend Variable, system-ui, sans-serif`;
  c.fillText(`OUTPOST STATUS · ${d.time}`, w * 0.04, h * 0.13);
  const rows: [string, string, number][] = [
    ["POWER", `${fmt(d.power)} / ${fmt(d.powerMax)} kWh`, d.power / Math.max(1, d.powerMax)],
    ["OXYGEN", `${fmt(d.o2)} kg`, Math.min(1, d.o2 / 20)],
    ["WATER", `${fmt(d.water)} L`, Math.min(1, d.water / 200)],
    ["FOOD", `${d.foodDays.toFixed(1)} days`, Math.min(1, d.foodDays / 20)],
  ];
  rows.forEach(([name, value, k], i) => {
    const y = h * (0.28 + i * 0.15);
    c.fillStyle = "#c2cbec";
    c.font = `600 ${h * 0.07}px Lexend Variable, system-ui, sans-serif`;
    c.fillText(name, w * 0.04, y);
    c.fillText(value, w * 0.3, y);
    c.fillStyle = "#1c2a44";
    c.fillRect(w * 0.62, y - h * 0.05, w * 0.33, h * 0.05);
    c.fillStyle = k < 0.25 ? "#ff5470" : k < 0.5 ? "#ffc23d" : "#3ee39a";
    c.fillRect(w * 0.62, y - h * 0.05, w * 0.33 * Math.max(0, Math.min(1, k)), h * 0.05);
  });
  c.fillStyle = d.storm ? "#ff5cb0" : "#8fd3ff";
  c.font = `700 ${h * 0.075}px Lexend Variable, system-ui, sans-serif`;
  c.fillText(d.storm ? "SOLAR STORM: SHELTER!" : `SIGNAL TO EARTH: ${d.delay} EACH WAY`, w * 0.04, h * 0.92);
}
/** Life support's panel: the air and water the machines are keeping up. */
function drawLifeSupport(c: CanvasRenderingContext2D, w: number, h: number, d: ScreenData) {
  c.fillStyle = "#04140f";
  c.fillRect(0, 0, w, h);
  c.fillStyle = "#3ee39a";
  c.font = `700 ${h * 0.12}px Lexend Variable, system-ui, sans-serif`;
  c.fillText("LIFE SUPPORT", w * 0.06, h * 0.18);
  c.font = `600 ${h * 0.1}px Lexend Variable, system-ui, sans-serif`;
  c.fillStyle = "#c9f5df";
  c.fillText(`O2 store   ${fmt(d.o2)} kg`, w * 0.06, h * 0.42);
  c.fillText(`Water      ${fmt(d.water)} L`, w * 0.06, h * 0.6);
  c.fillText(`CO2 scrub  ${d.power > 0 ? "ON" : "OFF"}`, w * 0.06, h * 0.78);
  c.fillStyle = "#8fd3ff";
  c.fillText(`Recovered  98%`, w * 0.06, h * 0.94);
}
/** The shelter's dosimeter: the crew's radiation dose so far. */
function drawDosimeter(c: CanvasRenderingContext2D, w: number, h: number, d: ScreenData) {
  c.fillStyle = "#14081a";
  c.fillRect(0, 0, w, h);
  c.fillStyle = d.storm ? "#ff5cb0" : "#c48bff";
  c.font = `700 ${h * 0.16}px Lexend Variable, system-ui, sans-serif`;
  c.fillText("DOSIMETER", w * 0.07, h * 0.24);
  c.font = `700 ${h * 0.3}px Lexend Variable, system-ui, sans-serif`;
  c.fillStyle = "#f3e8ff";
  c.fillText(`${d.dose.toFixed(1)} mSv`, w * 0.07, h * 0.66);
  c.font = `600 ${h * 0.13}px Lexend Variable, system-ui, sans-serif`;
  c.fillStyle = d.storm ? "#ff5cb0" : "#a99bc4";
  c.fillText(d.storm ? (d.sheltering ? "STORM · CREW SHELTERED" : "STORM · TAKE SHELTER") : "BACKGROUND LEVEL", w * 0.07, h * 0.88);
}

/** Signs, rails, vents, safety kit and the wall-mounted equipment of every room. */
export function dress(g: THREE.Group, planet: "moon" | "mars") {
  const sign = (text: string, bearing: number, r: number, level: Level, w = 0.5, outward = false) => ilabel(onWall(g, bearing, r, HOME.floor[level] + 2.28, outward), text, w, 0, 0, 0.004, "#1d222b");

  // Room names over every doorway (on the hall side), crew names on their quarters.
  for (const m of ROOMS) {
    if (m.door === undefined) continue;
    if (m.core) {
      const f = onWall(g, m.door, HOME.core + 0.002, HOME.floor[m.level] + 2.25, true);
      ilabel(f, m.id === "shelter" ? "STORM SHELTER" : "COMMAND", 0.62, 0, 0, 0.004, m.id === "shelter" ? "#ffffff" : "#1d222b", m.id === "shelter" ? "#b0352f" : "#eceff2");
      continue;
    }
    const text = m.id.startsWith("q") ? m.name.replace("'s quarters", "").toUpperCase() : m.name.toUpperCase();
    sign(text, m.door, HOME.hall - HOME.wall / 2 - 0.002, m.level, 0.46);
  }
  sign("AIRLOCK", HATCH.bearing, HOME.lining - 0.04, 0, 0.42);
  hazard(onWall(g, HATCH.bearing, HOME.lining - 0.1, HOME.floor[0] + 0.004), HATCH.w + 0.3, 0.08, 0, 0, 0).rotation.x = -Math.PI / 2;

  // Handrails along the hall on both floors, on the core's face (something to hold in a hurry).
  for (const level of [0, 1] as const)
    for (let b = 0; b < 360; b += 30) {
      const door = ROOMS.find((m) => m.core && m.level === level)!.door!;
      if (Math.abs(((b + 15 - door + 540) % 360) - 180) < 24) continue;
      handle(onWall(g, b + 15, HOME.core + 0.002, HOME.floor[level] + 1.0, true), 0.6, 0, 0, 0);
    }

  // Air vents high on the walls, cable trays along the hall, extinguishers by the stair and the galley.
  for (const [b, level] of [
    [185, 0],
    [246, 0],
    [310, 0],
    [0, 0],
    [46, 0],
    [78, 0],
    [227.5, 1],
    [272.5, 1],
    [317.5, 1],
    [2.5, 1],
    [60, 1],
    [185, 1],
  ] as [number, Level][])
    vent(onWall(g, b + 12, HOME.lining - 0.01, HOME.floor[level] + 2.35), 0.36, 0.14, 0, 0, 0);
  for (const level of [0, 1] as const)
    for (let b = 0; b < 360; b += 45) cableTray(onWall(g, b + 22.5, HOME.core + 0.002, HOME.floor[level] + 2.42, true), 1.1, 0, 0, 0);
  extinguisher(onWall(g, 92, HOME.core + 0.002, HOME.floor[0] + 1.1, true), 0, 0, 0);
  extinguisher(onWall(g, 140, HOME.core + 0.002, HOME.floor[1] + 1.1, true), 0, 0, 0);
  extinguisher(onPartition(g, 290, -1, 3.2, HOME.floor[0] + 1.1), 0, 0, 0);

  // Suit room: a dust vacuum with its hose, and brushes, by the hatch (Mars dust is fine, clingy and toxic).
  const vac = onWall(g, 172, HOME.lining - 0.01, HOME.floor[0] + 1.25);
  rbox(vac, 0.3, 0.42, 0.18, 0.04, ipaint("#e1a13a", 0.5), 0, 0, 0.09);
  ilabel(vac, "DUST VAC", 0.24, 0, 0.12, 0.185, "#1d222b", null);
  torus(vac, 0.14, 0.022, iplastic("#2b3038"), 0, -0.35, 0.12).rotation.y = Math.PI / 2;
  for (let i = 0; i < 3; i++) box(vac, 0.04, 0.22, 0.03, ipaint("#7a5a3a", 0.8), -0.22 + i * 0.06, -0.05, 0.03);
  if (planet === "mars") ilabel(onWall(g, 196, HOME.lining - 0.01, HOME.floor[0] + 1.62), "PERCHLORATE DUST: BRUSH OFF BEFORE ENTERING", 0.62, 0, 0, 0.004, "#7a2b14", "#f5e6c8");

  // Galley: a menu board, a calendar of meals from Earth.
  const board = onWall(g, 250, HOME.lining - 0.01, HOME.floor[0] + 1.5);
  rbox(board, 0.5, 0.36, 0.02, 0.02, ipaint("#2f3a46", 0.6), 0, 0, 0.01);
  ilabel(board, "TONIGHT: CURRY + FRESH SALAD", 0.44, 0, 0.08, 0.022, "#f3f6ff", null);
  ilabel(board, "FROM THE FOOD WALL", 0.36, 0, -0.06, 0.022, "#7fd36e", null);

  // Life support: ducts along the ceiling, the oxygen line coming in from outside, a live panel.
  for (const b of [339, 352.5, 6]) {
    const d = onWall(g, b, HOME.lining - 0.25, HOME.floor[0] + 2.45);
    box(d, 0.28, 0.2, 0.36, imetal("#b9c0ca", 0.4), 0, 0, 0);
  }
  const line = onWall(g, 330, HOME.lining - 0.08, HOME.floor[0] + 2.05);
  strut(line, 0, 0, 0, 0.9, 0, 0.0, 0.03, ipaint("#2f6fb0", 0.35, 0.3), 8);
  ilabel(onWall(g, 333, HOME.lining - 0.01, HOME.floor[0] + 2.15), planet === "mars" ? "O2 FROM MOXIE PLANT" : "O2 FROM ELECTROLYSIS", 0.5, 0, 0, 0.004, "#2f6fb0", "#eaf2fb");
  screen(onWall(g, 15, HOME.hall + HOME.wall / 2 + 0.002, HOME.floor[0] + 1.5, true), 0.5, 0.32, 0, 0, 0.01, drawLifeSupport, 256, true);

  // Lab: the tool wall on the partition, a sample rack.
  const tools = onPartition(g, 30, 1, 4.25, HOME.floor[0] + 1.45);
  box(tools, 0.8, 0.6, 0.015, ipaint("#c9b48f", 0.7), 0, 0, 0.008);
  for (let i = 0; i < 6; i++) {
    strut(tools, -0.3 + i * 0.12, -0.18, 0.03, -0.3 + i * 0.12, 0.12, 0.03, 0.012, imetal("#5d6573", 0.4), 6);
    box(tools, 0.05, 0.03, 0.03, ipaint(i % 2 ? "#c8322a" : "#2f6fb0", 0.5), -0.3 + i * 0.12, 0.14, 0.03);
  }
  ilabel(tools, "TOOLS", 0.24, 0, 0.24, 0.018, "#1d222b", null);

  // Medical bay: the defibrillator and the ultrasound on its arm.
  const aed = onPartition(g, 62, 1, 4.2, HOME.floor[0] + 1.35);
  rbox(aed, 0.28, 0.32, 0.12, 0.03, ipaint("#1f8a4c", 0.5), 0, 0, 0.06);
  ilabel(aed, "AED", 0.16, 0, 0.06, 0.122, "#ffffff", null);
  const us = onWall(g, 70, HOME.lining - 0.01, HOME.floor[0] + 1.55);
  strut(us, 0, 0, 0.02, 0, 0, 0.3, 0.02, imetal("#b9c0ca"), 8);
  screen(us, 0.34, 0.22, 0, 0, 0.32, (c, w, h) => {
    c.fillStyle = "#020406";
    c.fillRect(0, 0, w, h);
    const grd = c.createRadialGradient(w / 2, h * 0.1, 4, w / 2, h * 0.1, h * 0.95);
    grd.addColorStop(0, "#9aa7b4");
    grd.addColorStop(0.6, "#2b3540");
    grd.addColorStop(1, "#020406");
    c.fillStyle = grd;
    c.beginPath();
    c.moveTo(w / 2, h * 0.08);
    c.arc(w / 2, h * 0.08, h * 0.9, Math.PI * 0.3, Math.PI * 0.7);
    c.fill();
    c.fillStyle = "#8fd3ff";
    c.font = `600 ${h * 0.09}px Lexend Variable, system-ui, sans-serif`;
    c.fillText("ULTRASOUND", w * 0.04, h * 0.95);
  });

  // Storm shelter: walls lined with water bags (water stops radiation), and the dosimeter by the door.
  const bag = ipaint("#5b93cf", 0.35);
  for (let b = 0; b < 360; b += 15) {
    const door = 250;
    if (Math.abs(((b + 7.5 - door + 540) % 360) - 180) < 22) continue;
    for (const y of [1.08, 1.55, 2.02]) {
      // (Not behind the emergency locker.)
      if (Math.abs(b + 7.5 - 205) < 12 && y < 1.7) continue;
      const f = onWall(g, b + 7.5, HOME.shelter - 0.005, HOME.floor[0] + y);
      rbox(f, 0.36, 0.42, 0.06, 0.08, bag, 0, 0, 0.03);
    }
  }
  screen(onWall(g, 250, HOME.shelter - 0.005, HOME.floor[0] + 2.33), 0.32, 0.2, 0, 0, 0.01, drawDosimeter, 256, true);
  ilabel(onWall(g, 285, HOME.shelter - 0.005, HOME.floor[0] + 0.75), "WATER WALLS · 40 cm", 0.36, 0, 0, 0.004, "#ffffff", "#2f6fb0");

  // Command: the big screen with the outpost's summary and the signal delay to Earth.
  screen(onWall(g, 80, HOME.command - 0.005, HOME.floor[1] + 1.55), 1.0, 0.56, 0, 0, 0.01, drawSummary, 512);
  ilabel(onWall(g, 30, HOME.command - 0.005, HOME.floor[1] + 1.95), "COMMS · CAPCOM LINK", 0.44, 0, 0, 0.01, "#1d222b");
  // The hatch up to the cupola, in the ceiling over the ladder.
  cyl(g, 0.46, 0.46, 0.06, imetal("#5d6573", 0.45), 0, HOME.ceiling[1] - 0.03, 0, 32);

  // Exercise: a poster and the session board.
  ilabel(onWall(g, 30, HOME.lining - 0.01, HOME.floor[1] + 1.7), "2 HOURS A DAY KEEPS BONES STRONG", 0.6, 0, 0, 0.004, "#1d222b", "#f2e6d0");

  // Path lights: small LEDs along the hall floor on both floors, lit at night and in a blackout.
  const path = (living.path = new THREE.MeshStandardMaterial({ color: "#ffd9a0", emissive: "#ffb85c", emissiveIntensity: 0, roughness: 0.4, toneMapped: false }));
  for (const level of [0, 1] as const)
    for (let b = 0; b < 360; b += 10) {
      const p = polar(b + 5, HOME.core + 0.02);
      const led = mesh(new THREE.BoxGeometry(0.08, 0.02, 0.015), path, g, p.x, HOME.floor[level] + 0.12, p.z);
      led.rotation.y = -rad(b + 5);
      led.castShadow = false;
    }

  // Storm beacons over the shelter's door and in the command room: red, turning, only during a storm.
  living.beaconLight = new THREE.MeshStandardMaterial({ color: "#ff3a2e", emissive: "#ff2a1e", emissiveIntensity: 0, roughness: 0.3, toneMapped: false, transparent: true, opacity: 0.85 });
  for (const [b, level] of [
    [250, 0],
    [165, 1],
  ] as [number, Level][]) {
    const f = onWall(g, b + 14, HOME.core + 0.002, HOME.floor[level] + 2.3, true);
    cyl(f, 0.07, 0.08, 0.04, ipaint("#2b3038", 0.5), 0, -0.04, 0.09, 16);
    const head = keep(new THREE.Group());
    head.position.set(0, 0.04, 0.09);
    f.add(head);
    mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.12, 16), living.beaconLight, head);
    mesh(new THREE.BoxGeometry(0.11, 0.08, 0.012), imetal("#d9dde2", 0.2), head, 0, 0, 0.015);
    living.beacons.push(head);
  }

  // Signs for hard times: water rationing at the galley and the hygiene room, food running out, oxygen low.
  const warn = (list: THREE.Object3D[], text: string, bearing: number, r: number, y: number, w: number, outward = false) => {
    const sign = keep(ilabel(onWall(g, bearing, r, y, outward), text, w, 0, 0, 0.01, "#ffffff", "#c8322a"));
    sign.visible = false;
    list.push(sign);
  };
  warn(living.signs.water, "WATER RATIONING: 2 L EACH TODAY", 240, HOME.lining - 0.02, HOME.floor[0] + 1.95, 0.56);
  warn(living.signs.water, "SHOWER CLOSED: SAVE WATER", 310, HOME.hall + HOME.wall / 2 + 0.003, HOME.floor[0] + 1.75, 0.42, true);
  warn(living.signs.food, "FOOD LOW: HALF RATIONS", 212, HOME.lining - 0.02, HOME.floor[0] + 2.05, 0.44);
  warn(living.signs.o2, "O2 LOW: CHECK THE OXYGEN PLANT", 345, HOME.hall + HOME.wall / 2 + 0.003, HOME.floor[0] + 1.85, 0.5, true);

  // Stowage: cargo bags strapped in the space beside the stairwell upstairs (reached over the rail).
  const cargo = ifabric("#d8cfbc", 0.9),
    strap = ifabric("#3d4b5e", 0.8);
  for (let i = 0; i < 5; i++) {
    const u = -STAIR.half + 0.5 + i * 0.75;
    const p = stairPoint(u, STAIR.outer + 0.26);
    const f = new THREE.Group();
    f.position.set(p.x, HOME.floor[1], p.z);
    f.rotation.y = -rad(STAIR.bearing);
    g.add(f);
    rbox(f, 0.62, 0.42, 0.3, 0.08, cargo, 0, 0.21, 0);
    rbox(f, 0.56, 0.34, 0.27, 0.08, cargo, 0.04, 0.6, 0.0);
    for (const x of [-0.16, 0.16]) box(f, 0.05, 0.84, 0.31, strap, x, 0.42, 0);
    ilabel(f, ["SPARES", "FILTERS", "CLOTHES", "SEEDS", "MEDICAL"][i], 0.28, 0, 0.3, 0.152, "#1d222b", null);
  }
}
