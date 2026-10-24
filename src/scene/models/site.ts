import * as THREE from "three";
import type { Planet } from "../../sim/types";
import { addDetail, DETAIL } from "../surface";
import { ball, bolts, box, canvasTexture, cone, contactShadow, cyl, fabric, finalize, foil, geo, keep, lathe, light, metal, mesh, paint, pipe, rbox, rubber, shared, soil, strut, torus, visor, windowPane } from "../kit";
import { C, cabinet, hazard, label } from "./common";

/** A landing leg: main strut with a shock absorber, two side braces and a footpad. */
function landingLeg(g: THREE.Object3D, a: number, top: number, low: number, rIn: number, rOut: number, frame: THREE.Material) {
  const c = Math.cos(a),
    s = Math.sin(a);
  const tx = -s,
    tz = c;
  strut(g, c * rIn, top, s * rIn, c * rOut, 0.32, s * rOut, 0.075, frame, 10);
  // A shiny piston sleeve over the lower main strut.
  strut(g, c * (rIn + (rOut - rIn) * 0.55), top - (top - 0.32) * 0.55, s * (rIn + (rOut - rIn) * 0.55), c * rOut, 0.32, s * rOut, 0.095, metal("#d0d5dd", 0.25), 12);
  for (const k of [-1, 1]) strut(g, c * rIn * 0.9 + tx * k * 0.6, low, s * rIn * 0.9 + tz * k * 0.6, c * rOut, 0.34, s * rOut, 0.04, frame, 6);
  lathe(g, "footpad", [[0, 0], [0.42, 0], [0.5, 0.05], [0.46, 0.1], [0.12, 0.2], [0, 0.22]], metal("#b9c0cb", 0.4), c * rOut, 0.02, s * rOut, 24);
}

/** The lander that brought the crew: scenery beside the outpost. */
export function buildLander(planet: Planet) {
  const g = new THREE.Group();
  const frame = metal("#9aa3b4", 0.38),
    white = paint(C.white, 0.45, 0.1),
    grey = paint(C.grey, 0.5, 0.3),
    dark = paint(C.dark, 0.55, 0.35);
  const beacon = light("#ff4d5e", 3);
  if (planet === "moon") {
    contactShadow(g, 4.4, 4.4, 0.4, 0.02);
    // Descent stage: an octagonal box of tanks under gold and silver insulation.
    cyl(g, 1.95, 1.95, 1.3, foil("#cf9c3c"), 0, 2.05, 0, 8).rotation.y = Math.PI / 8;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      if (i % 2) box(g, 1.2, 1.1, 0.02, foil("#c8ccd3"), Math.cos(a) * 1.81, 2.05, Math.sin(a) * 1.81).rotation.y = -a + Math.PI / 2;
    }
    for (const y of [1.38, 2.72]) cyl(g, 2.0, 2.0, 0.08, dark, 0, y, 0, 8).rotation.y = Math.PI / 8;
    lathe(g, "lm-bell", [[0.78, 0.55], [0.68, 0.72], [0.52, 1.0], [0.42, 1.25], [0.38, 1.4]], metal("#4a4f59", 0.45), 0, 0, 0, 32);
    torus(g, 0.78, 0.03, metal("#6c7380", 0.4), 0, 0.55, 0).rotation.x = Math.PI / 2;
    for (let i = 0; i < 4; i++) landingLeg(g, (i / 4) * Math.PI * 2 + Math.PI / 4, 2.45, 1.45, 1.75, 3.4, frame);
    // Ladder down the front (+z) leg, and a porch.
    const la = Math.PI / 4 + Math.PI / 2;
    const lc = Math.cos(la),
      ls = Math.sin(la);
    for (const k of [-1, 1]) strut(g, lc * 1.95 + ls * 0.25 * k, 2.6, ls * 1.95 - lc * 0.25 * k, lc * 3.2 + ls * 0.25 * k, 0.45, ls * 3.2 - lc * 0.25 * k, 0.02, frame, 6);
    for (let k = 1; k < 8; k++) {
      const t = k / 8;
      const x = lc * (1.95 + 1.25 * t),
        z = ls * (1.95 + 1.25 * t);
      box(g, 0.5, 0.03, 0.05, frame, x, 2.6 - 2.15 * t, z).rotation.y = -la + Math.PI / 2;
    }
    // Ascent stage: a faceted crew cabin with forward windows, a top hatch and thruster quads.
    lathe(g, "lm-cabin", [[0, 2.78], [1.25, 2.78], [1.35, 3.0], [1.35, 4.2], [1.15, 4.65], [0.75, 4.85], [0, 4.9]], white, 0, 0, 0, 10).rotation.y = Math.PI / 10;
    box(g, 2.66, 0.12, 2.66, hazard(), 0, 2.88, 0).scale.set(1, 1, 1);
    for (const sx of [-1, 1]) {
      const w = windowPane(g, 0.42, 0.55, 0.12, metal("#c3cad6", 0.3), visor(), rubber(), sx * 0.45, 4.1, -1.33, 0.05);
      w.rotation.y = Math.PI;
      w.rotation.x = 0.12;
    }
    rbox(g, 0.85, 1.0, 0.1, 0.08, grey, 0, 3.45, 1.33);
    torus(g, 0.32, 0.04, frame, 0, 3.55, 1.39);
    label(g, "ASTRA LANDER", 1.2, 0, 4.42, 1.25);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const x = Math.cos(a) * 1.42,
        z = Math.sin(a) * 1.42;
      rbox(g, 0.26, 0.26, 0.26, 0.04, dark, x, 4.2, z);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = cone(g, 0.045, 0.14, metal("#3a3f4a", 0.4), x + dx * 0.18, 4.2, z + dz * 0.18, 10);
        n.rotation.set(dz * Math.PI / 2, 0, -dx * Math.PI / 2);
      }
    }
    cyl(g, 0.42, 0.42, 0.22, paint(C.off, 0.5), 0, 5.0, 0, 20);
    bolts(g, 12, 0.32, frame, 0, 5.12, 0, 0.02).rotation.x = -Math.PI / 2;
    cyl(g, 0.035, 0.035, 1.1, frame, 0.95, 5.25, 0.5, 6);
    const dishMat = shared("lander-dish", () => addDetail(new THREE.MeshStandardMaterial({ color: "#eef0f3", roughness: 0.45, metalness: 0.1, side: THREE.DoubleSide }), DETAIL.paint));
    const dish = lathe(g, "lander-dish", [[0, 0], [0.2, 0.02], [0.38, 0.08], [0.44, 0.11]], dishMat, 0.95, 5.85, 0.5, 28);
    dish.rotation.x = -0.8;
    ball(g, 0.06, beacon, -1.0, 4.95, -0.5, 8);
    cyl(g, 0.05, 0.06, 0.08, dark, -1.0, 4.9, -0.5, 10);
  } else {
    contactShadow(g, 4.4, 4.4, 0.4, 0.02);
    // A squat Mars lander: its heat shield underneath, landing legs and a capsule on top.
    lathe(g, "marslander", [[0, 1.0], [2.7, 1.05], [2.75, 1.3], [2.5, 1.7], [1.7, 3.5], [1.15, 4.1], [0.9, 4.25], [0, 4.3]], white, 0, 0, 0, 64);
    cyl(g, 2.75, 2.6, 0.3, paint("#4a3b35", 0.9), 0, 1.0, 0, 64);
    // Scorched lower edge from entry.
    torus(g, 2.62, 0.07, paint(C.orange, 0.5), 0, 1.55, 0).rotation.x = Math.PI / 2;
    for (let i = 0; i < 4; i++) landingLeg(g, (i / 4) * Math.PI * 2 + Math.PI / 4, 1.3, 1.05, 2.2, 3.5, frame);
    for (const a of [-0.35, 0.35]) {
      const w = windowPane(g, 0.42, 0.36, 0.1, metal("#c3cad6", 0.3), visor(), rubber(), Math.sin(a) * 2.02, 2.95, -Math.cos(a) * 2.02, 0.05);
      w.rotation.order = "YXZ";
      w.rotation.set(0.42, Math.PI - a, 0);
    }
    const hatch = new THREE.Group();
    hatch.position.set(0, 2.25, 2.3);
    hatch.rotation.x = -0.42;
    g.add(hatch);
    rbox(hatch, 0.95, 1.15, 0.12, 0.1, grey, 0, 0, 0);
    torus(hatch, 0.3, 0.035, frame, 0, 0.12, 0.08);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const x = Math.cos(a) * 1.38,
        z = Math.sin(a) * 1.38;
      rbox(g, 0.3, 0.2, 0.3, 0.04, dark, x, 3.85, z).rotation.y = -a;
      const n = cone(g, 0.05, 0.14, metal("#3a3f4a", 0.4), Math.cos(a) * 1.55, 3.85, Math.sin(a) * 1.55, 10);
      n.rotation.set(0, -a, -Math.PI / 2);
    }
    label(g, "ASTRA LANDER", 1.3, 0, 3.3, 1.87).rotation.x = -0.42;
    // Ladder down to the ground from the hatch.
    for (const k of [-1, 1]) strut(g, k * 0.28, 1.65, 2.55, k * 0.28, 0.05, 3.35, 0.022, frame, 6);
    for (let k = 1; k < 6; k++) box(g, 0.56, 0.03, 0.05, frame, 0, 1.65 - k * 0.27, 2.55 + k * 0.133);
    cyl(g, 0.04, 0.04, 1.3, frame, 0.5, 4.9, 0.3, 6);
    ball(g, 0.07, beacon, 0.5, 5.6, 0.3, 8);
  }
  finalize(g);
  g.userData.beacon = beacon;
  return g;
}

/** Hexagonal build pad of sintered regolith with an outline that lights up while you choose a pad. */
export function buildPad(planet: Planet, kind: "base" | "ice" | "far") {
  const g = new THREE.Group();
  const top = planet === "mars" ? "#94705f" : "#85888e";
  // Sintered tiles: a slightly raised hexagon with a chamfered edge and seams.
  lathe(g, "pad-hex", [[2.95, 0], [2.85, 0.08], [2.65, 0.2], [0, 0.2]], soil(top), 0, 0, 0, 6);
  const seam = paint(planet === "mars" ? "#7c5848" : "#73777f", 0.95, 0);
  for (let i = 0; i < 3; i++) box(g, 4.6, 0.012, 0.03, seam, 0, 0.205, 0).rotation.y = (i * Math.PI) / 3;
  for (const r of [1.3]) {
    const ring = mesh(geo("pad-seam-ring", () => new THREE.RingGeometry(r - 0.015, r + 0.015, 6, 1).rotateX(-Math.PI / 2)), seam, g, 0, 0.207, 0);
    ring.rotation.y = Math.PI / 6;
  }
  const color = kind === "ice" ? "#7fdcff" : kind === "far" ? "#ff9a57" : "#9fb3ff";
  // Small recessed marker lights at the corners (dim: they guide, they don't shine).
  const marker = light(color, 0.35);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    cyl(g, 0.07, 0.07, 0.02, marker, Math.cos(a) * 2.55, 0.205, Math.sin(a) * 2.55, 10);
  }
  const ring = keep(new THREE.Mesh(new THREE.RingGeometry(2.5, 2.8, 6, 1), light(color, 1.4)));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.23;
  (ring.material as THREE.MeshStandardMaterial).transparent = true;
  (ring.material as THREE.MeshStandardMaterial).opacity = 0.35;
  (ring.material as THREE.MeshStandardMaterial).depthWrite = false;
  g.add(ring);
  finalize(g);
  for (const o of g.children) o.castShadow = false;
  g.userData.ring = ring;
  return g;
}

let dockTexture: THREE.Texture | null = null;
/** The rover's charging pad, with guide lights and a charging post. */
export function buildDock(planet: Planet) {
  const g = new THREE.Group();
  if (!dockTexture) {
    dockTexture = canvasTexture(512, 512, (c) => {
      c.fillStyle = "#454b58";
      c.fillRect(0, 0, 512, 512);
      // Concrete-like speckle and panel seams.
      for (let i = 0; i < 2600; i++) {
        const v = 60 + ((i * 37) % 40);
        c.fillStyle = `rgba(${v},${v + 4},${v + 12},0.35)`;
        c.fillRect((i * 97) % 512, (i * 61 + ((i * 13) % 7)) % 512, 2 + (i % 3), 2 + (i % 2));
      }
      c.strokeStyle = "rgba(20,24,32,0.6)";
      c.lineWidth = 3;
      for (const p of [170, 342]) {
        c.beginPath();
        c.moveTo(p, 0);
        c.lineTo(p, 512);
        c.moveTo(0, p);
        c.lineTo(512, p);
        c.stroke();
      }
      c.strokeStyle = "#e0b23e";
      c.lineWidth = 16;
      c.strokeRect(26, 26, 460, 460);
      c.setLineDash([30, 22]);
      c.lineWidth = 7;
      c.strokeRect(66, 66, 380, 380);
      c.setLineDash([]);
      c.fillStyle = "#e0b23e";
      for (let i = 0; i < 3; i++) {
        c.beginPath();
        const y = 140 + i * 90;
        c.moveTo(160, y + 50);
        c.lineTo(256, y);
        c.lineTo(352, y + 50);
        c.lineTo(352, y + 78);
        c.lineTo(256, y + 28);
        c.lineTo(160, y + 78);
        c.fill();
      }
    });
    dockTexture.anisotropy = 8;
    dockTexture.userData.shared = true;
  }
  const top = shared("dock-top", () => addDetail(new THREE.MeshStandardMaterial({ map: dockTexture, roughness: 0.85, metalness: 0.05 }), { ...DETAIL.rock, bump: 0.5, grime: 0.35 }));
  const side = paint(planet === "mars" ? "#6d5348" : "#5c6270", 0.85, 0.1);
  const slab = new THREE.Mesh(geo("dock-slab", () => new THREE.BoxGeometry(5.2, 0.2, 5.2)), [side, side, top, side, side, side]);
  slab.position.y = 0.1;
  slab.receiveShadow = true;
  g.add(slab);
  const guide = light("#ffc94a", 1.5);
  for (const x of [-2.5, 2.5])
    for (const z of [-2.5, 2.5]) {
      cyl(g, 0.12, 0.14, 0.06, paint(C.dark, 0.5, 0.3), x, 0.23, z, 12);
      cyl(g, 0.07, 0.07, 0.03, guide, x, 0.27, z, 10);
    }
  // Charging post: a cabinet with a cable reel, an arm and the connector.
  cabinet(g, 0.55, 1.6, 0.5, C.off, -3.05, 0, 0);
  box(g, 0.57, 0.1, 0.52, hazard(), -3.05, 1.45, 0);
  label(g, "CHARGE", 0.45, -3.05, 1.25, 0.256, "#1d222b");
  cyl(g, 0.22, 0.22, 0.12, rubber("#2b2f37"), -3.05, 0.9, 0.31, 20).rotation.x = Math.PI / 2;
  strut(g, -3.05, 1.65, 0, -2.45, 1.4, 0, 0.045, metal("#9aa3b4", 0.38));
  pipe(g, [[-2.45, 1.4, 0], [-2.38, 1.2, 0.05], [-2.4, 1.0, 0.1]], 0.03, rubber("#1e2128"), 6);
  const plug = light("#3ee39a", 2);
  rbox(g, 0.14, 0.18, 0.14, 0.03, paint(C.dark, 0.5, 0.3), -2.4, 0.95, 0.1);
  ball(g, 0.04, plug, -2.4, 1.06, 0.18, 8);
  rbox(g, 0.18, 0.18, 0.03, 0.02, plug, -3.05, 1.05, 0.26);
  finalize(g);
  g.userData.plug = plug;
  g.userData.guide = guide;
  return g;
}

/** A survey marker the crew leave at a site they have explored: a stake with a small flag and a beacon. */
export function buildFlag() {
  const g = new THREE.Group();
  cyl(g, 0.025, 0.035, 2.0, metal("#c9ced8", 0.35), 0, 1.0, 0, 8);
  // A flag on a horizontal top bar (there's no wind on the Moon to hold it out).
  box(g, 0.75, 0.025, 0.025, metal("#c9ced8", 0.35), 0.38, 1.93, 0);
  const cloth = shared("survey-flag", () => {
    const m = fabric("#3cc9a0", 0.8).clone();
    m.side = THREE.DoubleSide;
    return m;
  });
  const flag = mesh(
    geo("survey-flag", () => {
      const p = new THREE.PlaneGeometry(0.72, 0.46, 8, 4);
      const a = p.attributes.position;
      for (let i = 0; i < a.count; i++) a.setZ(i, Math.sin(a.getX(i) * 9) * 0.025);
      p.computeVertexNormals();
      return p;
    }),
    cloth,
    g,
    0.38,
    1.69,
    0,
  );
  flag.castShadow = true;
  ball(g, 0.035, light("#7ef0c8", 1.6), 0, 2.03, 0, 8);
  rbox(g, 0.45, 0.25, 0.32, 0.04, paint(C.off, 0.5), 0.35, 0.13, 0.3);
  label(g, "SURVEYED", 0.4, 0.35, 0.16, 0.465);
  return finalize(g);
}

/** Scaffolding, a jib crane and work lights, drawn while a module is under construction. */
export function scaffold(height: number) {
  const g = new THREE.Group();
  const pole = paint("#e8a72a", 0.55, 0.3),
    steel = metal("#9aa3b4", 0.38),
    plank = paint("#b9bec7", 0.8, 0.2);
  const xs = [-1.7, 1.7],
    zs = [-1.3, 1.3];
  for (const x of xs)
    for (const z of zs) {
      cyl(g, 0.045, 0.045, height, pole, x, height / 2, z, 8);
      rbox(g, 0.2, 0.03, 0.2, 0.01, steel, x, 0.015, z);
    }
  for (const y of [height * 0.33, height * 0.7, height]) {
    for (const z of zs) box(g, 3.45, 0.045, 0.045, pole, 0, y, z);
    for (const x of xs) box(g, 0.045, 0.045, 2.65, pole, x, y, 0);
    for (const x of xs) for (const z of zs) ball(g, 0.06, steel, x, y, z, 8);
  }
  for (const z of zs) strut(g, -1.7, 0.1, z, 1.7, height * 0.33, z, 0.025, steel);
  for (const x of xs) strut(g, x, 0.1, -1.3, x, height * 0.33, 1.3, 0.025, steel);
  for (let i = 0; i < 3; i++) rbox(g, 3.4, 0.04, 0.22, 0.01, plank, 0, height * 0.7 + 0.045, -1.22 + i * 0.24);
  // Jib crane on the north-east corner.
  cyl(g, 0.08, 0.1, height + 1.6, steel, 1.7, (height + 1.6) / 2, -1.3, 10);
  strut(g, 1.7, height + 1.5, -1.3, -0.4, height + 1.25, 0.2, 0.05, pole);
  strut(g, 1.7, height + 0.9, -1.3, 0.4, height + 1.32, -0.3, 0.025, steel);
  cyl(g, 0.008, 0.008, 1.4, paint(C.dark), -0.4, height + 0.55, 0.2, 4);
  rbox(g, 0.18, 0.14, 0.18, 0.03, hazard(), -0.4, height - 0.2, 0.2);
  const lamp = light("#fff1d6", 2);
  for (const x of xs) {
    rbox(g, 0.24, 0.14, 0.12, 0.03, paint(C.dark, 0.5), x, height + 0.12, 1.3);
    box(g, 0.2, 0.1, 0.01, lamp, x, height + 0.12, 1.365);
  }
  return finalize(g);
}

