import * as THREE from "three";
import type { Planet } from "../../sim/types";
import { addDetail, DETAIL } from "../surface";
import { bolts, box, contactShadow, cyl, keep, lathe, light, metal, paint, pipe, rbox, rubber, shared, soil, strut, torus } from "../kit";
import { C, cabinet, cells, hazard, label, radiationSign, skid, soilColor, statusLamp, type ModuleView } from "./common";

/** A triangular lattice mast between two heights (three longerons with zig-zag lacing). */
function latticeMast(p: THREE.Object3D, y0: number, y1: number, r: number, m: THREE.Material) {
  const corners = [0, 1, 2].map((i) => [Math.cos((i / 3) * Math.PI * 2 + Math.PI / 2) * r, Math.sin((i / 3) * Math.PI * 2 + Math.PI / 2) * r]);
  for (const [x, z] of corners) strut(p, x, y0, z, x, y1, z, 0.022, m, 6);
  const step = 0.42;
  for (let y = y0, k = 0; y < y1 - 0.01; y += step, k++)
    for (let i = 0; i < 3; i++) {
      const [ax, az] = corners[i],
        [bx, bz] = corners[(i + 1) % 3];
      const ya = k % 2 ? y : Math.min(y1, y + step),
        yb = k % 2 ? Math.min(y1, y + step) : y;
      strut(p, ax, ya, az, bx, yb, bz, 0.011, m, 4);
    }
}

export function buildSolar(view: ModuleView, planet: Planet) {
  const g = view.group;
  const frame = metal("#c3cad6", 0.32),
    dark = metal("#5d6573", 0.5);
  const yaw = keep(new THREE.Group()),
    tilt = keep(new THREE.Group());
  if (planet === "moon") {
    // Near the lunar pole the Sun skims the horizon, so arrays stand tall and vertical and turn to follow it.
    contactShadow(g, 1.9, 1.9, 0.5, 0.02);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.5;
      strut(g, Math.cos(a) * 0.4, 0.55, Math.sin(a) * 0.4, Math.cos(a) * 1.6, 0.08, Math.sin(a) * 1.6, 0.05, frame);
      strut(g, Math.cos(a) * 0.45, 0.2, Math.sin(a) * 0.45, Math.cos(a) * 1.6, 0.08, Math.sin(a) * 1.6, 0.03, frame);
      cyl(g, 0.2, 0.24, 0.06, dark, Math.cos(a) * 1.6, 0.03, Math.sin(a) * 1.6, 14);
    }
    // Base canister holding the rotation drive.
    lathe(g, "vsat-base", [[0, 0], [0.5, 0], [0.55, 0.06], [0.55, 0.55], [0.5, 0.62], [0.35, 0.66], [0, 0.66]], paint(C.off, 0.5, 0.2), 0, 0, 0, 36);
    torus(g, 0.555, 0.03, paint(C.orange, 0.5), 0, 0.45, 0).rotation.x = Math.PI / 2;
    bolts(g, 12, 0.42, dark, 0, 0.665, 0, 0.02).rotation.x = -Math.PI / 2;
    label(g, "VSAT-2", 0.5, 0, 0.3, 0.56);
    view.status = statusLamp(g, 0.3, 0.74, 0.25);
    pipe(g, [[0.45, 0.2, 0.3], [0.8, 0.06, 0.6], [1.4, 0.04, 1.0]], 0.035, rubber("#2b2f37"), 6);
    yaw.position.y = 0.66;
    g.add(yaw);
    cyl(yaw, 0.2, 0.24, 0.24, dark, 0, 0.12, 0, 18);
    latticeMast(yaw, 0.24, 6.3, 0.11, frame);
    // A stowage box at the foot of the blanket, which unrolls upward from it.
    rbox(yaw, 1.95, 0.26, 0.3, 0.04, paint(C.off, 0.5, 0.2), 0, 1.0, -0.26);
    tilt.position.set(0, 3.75, -0.26);
    yaw.add(tilt);
    box(tilt, 1.8, 5.0, 0.025, cells(2, 5.5), 0, 0, -0.012);
    box(tilt, 1.8, 5.0, 0.012, paint("#e2e5ea", 0.6), 0, 0, 0.008);
    for (const x of [-0.92, 0.92]) {
      box(tilt, 0.03, 5.06, 0.05, frame, x, 0, 0);
      strut(tilt, x, 2.55, 0.05, x * 0.2, 2.72, 0.16, 0.006, frame, 4);
      strut(tilt, x, -2.55, 0.05, x * 0.2, -2.72, 0.16, 0.006, frame, 4);
    }
    for (const y of [-2.53, 2.53]) box(tilt, 1.9, 0.06, 0.07, frame, 0, y, 0.01);
    // The blanket's harness running down the back.
    box(tilt, 0.04, 4.9, 0.02, paint(C.dark, 0.6), 0.4, 0, 0.03);
    const beacon = light("#ff4d5e", 3);
    view.blink.push(beacon);
    cyl(yaw, 0.04, 0.05, 0.1, beacon, 0, 6.38, 0, 8);
    view.top = 7.2;
  } else {
    // On Mars the Sun climbs high: a table array on a gimbal that tilts toward it. Dust dulls the cells.
    contactShadow(g, 2.2, 2.2, 0.45, 0.02);
    lathe(g, "table-pier", [[0, 0], [0.62, 0], [0.62, 0.12], [0.34, 0.2], [0.24, 0.32], [0, 0.32]], paint("#8a7f78", 0.9), 0, 0, 0, 28);
    cabinet(g, 0.4, 0.42, 0.26, C.grey, 0.62, 0, 0.32);
    view.status = statusLamp(g, 0.62, 0.5, 0.3);
    yaw.position.y = 0.3;
    g.add(yaw);
    torus(yaw, 0.26, 0.05, metal("#8892a6", 0.4), 0, 0.05, 0).rotation.x = Math.PI / 2;
    for (const sx of [-1, 1]) {
      rbox(yaw, 0.12, 1.4, 0.2, 0.03, frame, sx * 0.34, 0.75, 0);
      cyl(yaw, 0.09, 0.09, 0.08, dark, sx * 0.42, 1.38, 0, 14).rotation.z = Math.PI / 2;
    }
    rbox(yaw, 0.78, 0.12, 0.3, 0.03, frame, 0, 0.14, 0);
    tilt.position.y = 1.38;
    yaw.add(tilt);
    cyl(tilt, 0.07, 0.07, 1.0, frame, 0, 0, 0, 14).rotation.z = Math.PI / 2;
    box(tilt, 4.2, 2.6, 0.035, cells(4, 2.5, 0.35), 0, 0, -0.06);
    box(tilt, 4.2, 2.6, 0.015, paint("#dcdfe4", 0.6), 0, 0, -0.035);
    for (const x of [-2.12, 2.12]) box(tilt, 0.05, 2.66, 0.08, frame, x, 0, -0.05);
    for (const y of [-1.32, 1.32]) box(tilt, 4.3, 0.05, 0.08, frame, 0, y, -0.05);
    // Backing truss.
    for (const x of [-1.5, -0.5, 0.5, 1.5]) box(tilt, 0.05, 2.5, 0.06, frame, x, 0, 0.0);
    for (const x of [-1.5, 0.5]) {
      strut(tilt, x, 1.2, 0.02, x + 1, -1.2, 0.02, 0.018, frame, 4);
      strut(tilt, x, -1.2, 0.02, x + 1, 1.2, 0.02, 0.018, frame, 4);
    }
    strut(tilt, -1.0, 0, 0.03, 0, 0, 0.08, 0.025, frame, 6);
    strut(tilt, 1.0, 0, 0.03, 0, 0, 0.08, 0.025, frame, 6);
    view.top = 3.6;
  }
  view.yaw = yaw;
  view.tilt = tilt;
}

export function buildBattery(view: ModuleView) {
  const g = view.group;
  contactShadow(g, 1.8, 1.4, 0.55, 0.02);
  const deck = skid(g, 2.8, 2.0, 0.28);
  const steel = metal("#9aa3b4", 0.4),
    dark = paint(C.dark, 0.6, 0.3);
  // The battery enclosure: a white insulated cabinet with deep cooling fins on both ends.
  cabinet(g, 2.3, 1.45, 1.45, C.off, 0, deck, 0);
  for (const sx of [-1, 1])
    for (let i = 0; i < 9; i++) box(g, 0.24, 1.2, 0.025, steel, sx * 1.27, deck + 0.72, -0.6 + i * 0.15);
  box(g, 2.32, 0.1, 1.47, hazard(), 0, deck + 0.06, 0);
  // Charge display: five small indicator segments on a dark panel.
  rbox(g, 0.62, 0.24, 0.04, 0.02, dark, -0.55, deck + 1.05, 0.74);
  view.bars = [];
  for (let i = 0; i < 5; i++) {
    const m = light("#3ee39a", 0.2);
    view.bars.push(m);
    box(g, 0.08, 0.1, 0.015, m, -0.75 + i * 0.1, deck + 1.05, 0.765);
  }
  label(g, "Li-ION 40 kWh", 0.7, 0.45, deck + 1.1, 0.735);
  label(g, "HIGH VOLTAGE", 0.6, 0.45, deck + 0.9, 0.735, "#b8860b");
  // Roof: two fans in shrouds behind grilles.
  for (const x of [-0.55, 0.55]) {
    cyl(g, 0.42, 0.44, 0.16, dark, x, deck + 1.53, 0, 32);
    torus(g, 0.42, 0.025, steel, x, deck + 1.61, 0).rotation.x = Math.PI / 2;
    const fan = keep(new THREE.Group());
    fan.position.set(x, deck + 1.56, 0);
    g.add(fan);
    for (let k = 0; k < 7; k++) {
      const b = box(fan, 0.36, 0.015, 0.11, metal("#8892a6", 0.4), 0.18, 0, 0);
      b.rotation.x = 0.35;
      b.parent!.remove(b);
      const arm = new THREE.Group();
      arm.rotation.y = (k / 7) * Math.PI * 2;
      arm.add(b);
      fan.add(arm);
    }
    cyl(fan, 0.06, 0.06, 0.05, dark, 0, 0, 0, 12);
    view.spin.push(fan);
    for (let k = -3; k <= 3; k++) box(g, 0.8 - Math.abs(k) * 0.07, 0.01, 0.015, steel, x, deck + 1.625, k * 0.1);
  }
  // Power conduits down to the ground.
  pipe(g, [[1.15, deck + 0.5, 0.5], [1.35, deck + 0.3, 0.75], [1.4, 0.06, 1.1]], 0.04, rubber("#2b2f37"), 6);
  pipe(g, [[1.15, deck + 0.35, 0.55], [1.3, 0.2, 0.85], [1.32, 0.05, 1.2]], 0.03, paint(C.orange, 0.6), 6);
  view.status = statusLamp(g, 1.0, deck + 1.55, 0.6);
  view.top = 2.3;
}

export function buildReactor(view: ModuleView, planet: Planet) {
  const g = view.group;
  const steel = metal("#8c95a6", 0.38),
    dark = metal("#4f5664", 0.5),
    white = paint("#eef0f2", 0.45, 0.1),
    pipeMat = metal("#b8c0cc", 0.35);
  contactShadow(g, 2.6, 2.6, 0.5, 0.02);
  // Buried in a berm of regolith, which shields the outpost from the reactor's radiation.
  lathe(g, "reactor-berm", [[0, 0], [2.45, 0], [2.3, 0.08], [1.6, 0.42], [1.15, 0.5], [0, 0.5]], soil(soilColor(planet)), 0, 0, 0, 48);
  torus(g, 2.7, 0.07, paint("#f2c230", 0.55), 0, 0.03, 0).rotation.x = Math.PI / 2;
  // The reactor vessel and its shadow shield (a thick tapered plug), then the power conversion section.
  lathe(g, "reactor-vessel", [[0, 0.45], [0.66, 0.45], [0.7, 0.55], [0.7, 1.2], [0.85, 1.32], [0.85, 1.5], [0.62, 1.6], [0, 1.6]], dark, 0, 0, 0, 36);
  for (const y of [0.7, 0.95, 1.15]) torus(g, 0.705, 0.02, steel, 0, y, 0).rotation.x = Math.PI / 2;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    // Stirling engines turn the heat into electricity.
    const ex = Math.cos(a) * 0.5,
      ez = Math.sin(a) * 0.5;
    cyl(g, 0.16, 0.16, 0.55, white, ex, 1.9, ez, 18);
    cyl(g, 0.17, 0.17, 0.05, steel, ex, 2.18, ez, 18);
    cyl(g, 0.17, 0.17, 0.05, steel, ex, 1.62, ez, 18);
  }
  cyl(g, 0.3, 0.3, 0.7, steel, 0, 1.95, 0, 18);
  // The radiator: a mast carrying six tall white panels set edge-on round it (like NASA's Fission
  // Surface Power concepts). Heat pipes carry the waste heat up and out into the panels.
  const radiator = shared("reactor-radiator", () => addDetail(new THREE.MeshStandardMaterial({ color: "#eef0f2", roughness: 0.5, metalness: 0.1 }), DETAIL.paint));
  const pipeLine = metal("#7d8595", 0.4);
  cyl(g, 0.24, 0.3, 3.0, white, 0, 3.75, 0, 24);
  for (const y of [2.6, 3.7, 4.8]) torus(g, 0.245, 0.03, steel, 0, y, 0).rotation.x = Math.PI / 2;
  lathe(g, "reactor-cap", [[0, 5.25], [0.3, 5.25], [0.34, 5.32], [0.2, 5.44], [0, 5.47]], steel, 0, 0, 0, 24);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    const p = new THREE.Group();
    p.rotation.y = -a;
    g.add(p);
    // Each panel stands out from the mast on two arms, edge-on to the mast.
    box(p, 1.35, 2.7, 0.04, radiator, 1.05, 3.85, 0);
    box(p, 1.39, 0.06, 0.07, steel, 1.05, 5.22, 0);
    box(p, 1.39, 0.06, 0.07, steel, 1.05, 2.48, 0);
    for (const y of [2.8, 4.9]) strut(p, 0.26, y, 0, 0.4, y, 0, 0.03, steel, 6);
    // Heat pipes up each face.
    for (let k = 0; k < 5; k++) for (const sz of [-1, 1]) box(p, 0.02, 2.6, 0.012, pipeLine, 0.5 + k * 0.27, 3.85, sz * 0.026);
    strut(p, 0.3, 2.55, 0, 1.7, 2.55, 0, 0.025, pipeLine, 5);
  }
  // Power conditioning unit, and the cable run toward the outpost (+z).
  cabinet(g, 0.7, 0.6, 0.5, C.grey, 0, 0.5, 1.6);
  pipe(g, [[0, 0.6, 1.85], [0, 0.3, 2.3], [0, 0.05, 2.9]], 0.06, rubber("#2b2f37"), 8);
  pipe(g, [[0.3, 1.6, 0.4], [0.35, 1.0, 1.0], [0.2, 0.75, 1.4]], 0.04, pipeMat, 6);
  // A few small "operating" indicators (the only lights: nothing nuclear glows).
  const indicator = light("#ffb020", 1);
  view.glow.push(indicator);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    box(g, 0.08, 0.04, 0.04, indicator, Math.cos(a) * 0.72, 1.4, Math.sin(a) * 0.72).rotation.y = -a;
  }
  for (const a of [0.8, 2.4, 4.0, 5.6]) {
    cyl(g, 0.03, 0.03, 1.2, steel, Math.cos(a) * 2.95, 0.6, Math.sin(a) * 2.95, 6);
    const sign = box(g, 0.4, 0.4, 0.02, radiationSign(), Math.cos(a) * 2.95, 1.25, Math.sin(a) * 2.95);
    sign.rotation.y = -a + Math.PI / 2;
  }
  label(g, "FSP-1  KEEP OUT", 1.0, 0, 0.62, 1.86);
  view.status = statusLamp(g, 0.3, 1.12, 1.6);
  view.top = 5.5;
}
