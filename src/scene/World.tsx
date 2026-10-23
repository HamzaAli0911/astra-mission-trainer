import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { activeHazard, capacity, flows, isBuilt, isWorking, shieldDone } from "../sim/core";
import { MODULES, SHIELD_TIME } from "../sim/modules";
import { daylight, PLANETS } from "../sim/planets";
import { modulePos } from "../sim/rover";
import type { GameState, Module, Planet } from "../sim/types";
import { CRATER, DOCK, inShadow, PADS, padFits, SITES, terrainHeight } from "../sim/world";
import { useGame } from "../state/game";
import { useUI } from "../state/ui";
import { tick } from "../lib/sound";
import { anchors, followers, scene3d } from "./anchors";
import { buildRocks, buildSiteMarker, buildSky, buildTerrain, dustSystem, iceSparkles, PALETTE, stormStreaks } from "./environment";
import { dispose, light, paint } from "./kit";
import { buildAstronaut, buildDock, buildFlag, buildModule, buildPad, buildRover, scaffold, type ModuleView } from "./models";

const HOME = new THREE.Vector3(0, 0, 2);
const MARS_NIGHT = new THREE.Color("#07060d"),
  MARS_NOON = new THREE.Color("#d4a27c"),
  MARS_DUST = new THREE.Color("#9c6b4b"),
  MARS_DUSK = new THREE.Color("#6d8fb8"),
  MARS_LIGHT = new THREE.Color("#ffd9b8");
const OFFSET = new THREE.Vector3(22, 27, 33);

function sunDirection(planet: Planet, t: number) {
  const P = PLANETS[planet];
  const h = ((t % 24) + 24) % 24;
  const f = (h - P.sunrise) / (P.sunset - P.sunrise);
  const az = Math.PI * f;
  const el = Math.sin(Math.PI * f) * (planet === "moon" ? 0.44 : 1.0);
  return new THREE.Vector3(Math.cos(az) * Math.cos(el), Math.sin(el), -Math.sin(az) * Math.cos(el)).normalize();
}

interface Entry {
  id: number;
  type: Module["type"];
  pad: number;
  view: ModuleView;
  scaffold: THREE.Group | null;
  cable: { group: THREE.Group; flow: THREE.MeshStandardMaterial; tex: THREE.Texture; dir: number } | null;
}

let cableTexture: THREE.Texture | null = null;
function flowTexture() {
  if (cableTexture) return cableTexture;
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 4;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, 64, 4);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, 22, 4);
  cableTexture = new THREE.CanvasTexture(c);
  cableTexture.wrapS = THREE.RepeatWrapping;
  return cableTexture;
}

function buildCable(m: Module, planet: Planet): Entry["cable"] {
  const p = modulePos(m);
  const d = Math.hypot(p.x, p.z);
  if (d < 1) return null;
  const ux = p.x / d,
    uz = p.z / d;
  const start = new THREE.Vector3(ux * 3.4, 0, uz * 3.4),
    end = new THREE.Vector3(p.x - ux * 2.5, 0, p.z - uz * 2.5);
  const pts: THREE.Vector3[] = [];
  const n = Math.max(4, Math.ceil(start.distanceTo(end) / 2));
  for (let i = 0; i <= n; i++) {
    const v = start.clone().lerp(end, i / n);
    const bend = Math.sin((i / n) * Math.PI) * 0.6;
    v.x += -uz * bend;
    v.z += ux * bend;
    v.y = terrainHeight(v.x, v.z, planet) + 0.09;
    pts.push(v);
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const group = new THREE.Group();
  const cord = new THREE.Mesh(new THREE.TubeGeometry(curve, n * 6, 0.07, 6), paint("#262b36", 0.9));
  cord.receiveShadow = true;
  group.add(cord);
  const tex = flowTexture().clone();
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.set(Math.max(1, Math.round(curve.getLength() / 1.6)), 1);
  tex.needsUpdate = true;
  const flow = light("#ffc94a", 1.6);
  flow.alphaMap = tex;
  flow.transparent = true;
  flow.depthWrite = false;
  const strip = new THREE.Mesh(new THREE.TubeGeometry(curve, n * 6, 0.085, 6), flow);
  group.add(strip);
  const gen = m.type === "solar" || m.type === "reactor";
  return { group, flow, tex, dir: gen ? -1 : 1 };
}

export function World() {
  const host = useRef<HTMLDivElement>(null);
  const planet = useGame((s) => s.game.planet);
  const key = useGame((s) => `${s.game.missionId}:${s.game.seed}`);
  const reduce = useUI((s) => s.settings.motion);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    } catch {
      setFailed(true);
      return;
    }
    const reduced = reduce || matchMedia("(prefers-reduced-motion: reduce)").matches;
    let ratio = Math.min(devicePixelRatio, 1.75);
    renderer.setPixelRatio(ratio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = planet === "mars" ? 1.1 : 1.22;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.className = "world-canvas";
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.3, 2000);
    camera.position.copy(HOME).add(OFFSET);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(HOME);
    controls.enableDamping = !reduced;
    controls.dampingFactor = 0.08;
    controls.minDistance = 12;
    controls.maxDistance = 150;
    controls.maxPolarAngle = 1.36;
    controls.minPolarAngle = 0.25;
    controls.screenSpacePanning = false;
    controls.panSpeed = 0.9;
    controls.rotateSpeed = 0.7;
    controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };

    // Lights.
    const sun = new THREE.DirectionalLight("#fff4e2", 3);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 260;
    Object.assign(sun.shadow.camera, { left: -48, right: 48, top: 48, bottom: -48 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.04;
    scene.add(sun, sun.target);
    const hemi = new THREE.HemisphereLight("#b9c6ff", "#2a2a30", 0.4);
    scene.add(hemi);
    const fill = new THREE.DirectionalLight(planet === "moon" ? "#8fb2ff" : "#ffb18a", 0.25);
    fill.position.set(-40, 30, 30);
    scene.add(fill);

    const skyColor = new THREE.Color("#000000");
    scene.background = skyColor;

    // World.
    const terrain = buildTerrain(planet);
    scene.add(terrain);
    const rocks = buildRocks(planet);
    scene.add(rocks);
    const sky = buildSky(planet);
    scene.add(sky.group);
    if (planet === "moon") scene.fog = new THREE.Fog("#000000", 150, 330);
    else scene.fog = new THREE.FogExp2("#c99a74", 0.0065);
    const sparkles = iceSparkles(planet);
    scene.add(sparkles);
    const dust = dustSystem(PALETTE[planet].light);
    scene.add(dust.points);
    const streaks = stormStreaks();
    scene.add(streaks.lines);
    const dock = buildDock(planet);
    dock.position.set(DOCK.x, terrainHeight(DOCK.x, DOCK.z, planet), DOCK.z);
    scene.add(dock);

    const pads = PADS.map((p) => {
      const g = buildPad(planet, p.kind);
      g.position.set(p.x, terrainHeight(p.x, p.z, planet), p.z);
      g.traverse((o) => (o.userData.padId = p.id));
      scene.add(g);
      return g;
    });
    const markers = SITES.map((s) => {
      const m = buildSiteMarker(s, planet);
      m.group.traverse((o) => (o.userData.siteId = s.id));
      scene.add(m.group);
      const flag = buildFlag();
      flag.position.set(1.4, 0, -1.2);
      flag.visible = false;
      m.group.add(flag);
      return { ...m, flag, site: s };
    });

    const rover = buildRover();
    rover.group.traverse((o) => (o.userData.rover = true));
    scene.add(rover.group);
    const headlight = new THREE.SpotLight("#fff1d6", 0, 34, 0.55, 0.5, 1.2);
    headlight.position.set(0, 1.4, -1.9);
    headlight.target.position.set(0, 0, -12);
    rover.group.add(headlight, headlight.target);
    const walkers = [buildAstronaut(), buildAstronaut("#9fd8ff")];
    for (const w of walkers) {
      w.visible = false;
      scene.add(w);
    }

    const entries = new Map<number, Entry>();
    const shieldPct = { v: 0 };

    const size = () => {
      const w = el.clientWidth,
        h = el.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(1, h);
      // Keep the same width of world in view on tall phone screens.
      const half = THREE.MathUtils.degToRad(21);
      camera.fov = camera.aspect >= 1.2 ? 42 : Math.min(78, THREE.MathUtils.radToDeg(2 * Math.atan((Math.tan(half) * 1.2) / camera.aspect)));
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(size);
    ro.observe(el);
    size();

    // Picking.
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const pickables: THREE.Object3D[] = [];
    const hitAt = (cx: number, cy: number) => {
      const r = renderer.domElement.getBoundingClientRect();
      ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      pickables.length = 0;
      for (const e of entries.values()) pickables.push(e.view.group);
      pickables.push(rover.group, ...markers.map((m) => m.group), ...pads, terrain);
      return ray.intersectObjects(pickables, true)[0] ?? null;
    };
    scene3d.pick = (cx, cy) => {
      const hit = hitAt(cx, cy);
      return hit ? { x: hit.point.x, z: hit.point.z } : null;
    };
    let down: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => {
      down = { x: e.clientX, y: e.clientY };
    };
    const onUp = (e: PointerEvent) => {
      if (!down || e.button !== 0) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (moved > 7) return;
      const hit = hitAt(e.clientX, e.clientY);
      const ui = useUI.getState(),
        st = useGame.getState();
      if (!hit) return;
      let o: THREE.Object3D | null = hit.object;
      while (o && o.userData.moduleId === undefined && o.userData.siteId === undefined && o.userData.padId === undefined && !o.userData.rover && o.name !== "terrain") o = o.parent;
      if (!o) return;
      if (ui.placing && o.userData.padId !== undefined) {
        if (st.act({ type: "build", module: ui.placing, pad: o.userData.padId })) {
          ui.place(null);
          ui.select(null);
        }
        return;
      }
      if (o.userData.moduleId !== undefined) {
        ui.select({ kind: "module", id: o.userData.moduleId });
        if (ui.panel === "rover" || ui.panel === "crew") ui.openPanel(null);
      } else if (o.userData.siteId !== undefined) {
        ui.select({ kind: "site", id: o.userData.siteId });
        ui.openPanel("rover");
      } else if (o.userData.rover) {
        ui.select(null);
        ui.openPanel("rover");
      } else if (o.userData.padId !== undefined) {
        const pad = PADS[o.userData.padId];
        const taken = st.game.modules.some((m) => m.pad === pad.id);
        if (!taken) {
          ui.select({ kind: "pad", id: pad.id });
          ui.openPanel("build");
        }
      } else if (o.name === "terrain") {
        if (ui.panel === "rover" && !st.game.rover.task) st.driveTo({ x: hit.point.x, z: hit.point.z });
        else ui.select(null);
      }
    };
    let hoverAt = 0;
    const onMove = (e: PointerEvent) => {
      const now = performance.now();
      if (now - hoverAt < 60 || e.buttons) return;
      hoverAt = now;
      const hit = hitAt(e.clientX, e.clientY);
      let o: THREE.Object3D | null = hit?.object ?? null;
      while (o && o.userData.moduleId === undefined && o.userData.siteId === undefined && o.userData.padId === undefined && !o.userData.rover) o = o.parent;
      const ui = useUI.getState();
      const clickable = !!o && (o.userData.padId === undefined || !!ui.placing || !useGame.getState().game.modules.some((m) => m.pad === o!.userData.padId));
      renderer.domElement.style.cursor = clickable ? "pointer" : ui.panel === "rover" && hit?.object.name === "terrain" ? "crosshair" : "";
    };
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointerup", onUp);
    renderer.domElement.addEventListener("pointermove", onMove);

    // Camera rig: follow the rover while it is out, smooth moves on command.
    const goal = HOME.clone();
    let follow = false,
      lastCam = useUI.getState().camera.n,
      wasDocked = useGame.getState().game.rover.docked;
    controls.addEventListener("start", () => {
      if (!follow) goal.copy(controls.target);
      useUI.getState().noteLook();
    });
    const runCamera = (g: GameState) => {
      const c = useUI.getState().camera;
      if (c.n !== lastCam) {
        lastCam = c.n;
        const off = camera.position.clone().sub(controls.target);
        if (c.cmd === "base" || c.cmd === "reset") {
          follow = false;
          goal.copy(HOME);
          if (c.cmd === "reset") camera.position.copy(controls.target).add(OFFSET);
        } else if (c.cmd === "rover") follow = true;
        else if (c.cmd === "in" || c.cmd === "out") {
          off.multiplyScalar(c.cmd === "in" ? 0.75 : 1.33);
          const len = THREE.MathUtils.clamp(off.length(), controls.minDistance, controls.maxDistance);
          camera.position.copy(controls.target).add(off.setLength(len));
        } else if (c.cmd === "left" || c.cmd === "right") {
          off.applyAxisAngle(new THREE.Vector3(0, 1, 0), c.cmd === "left" ? -Math.PI / 5 : Math.PI / 5);
          camera.position.copy(controls.target).add(off);
        } else if (c.cmd === "focus") {
          const sel = useUI.getState().selected;
          const m = sel?.kind === "module" ? g.modules.find((x) => x.id === sel.id) : null;
          if (m) {
            follow = false;
            const p = modulePos(m);
            goal.set(p.x, 0, p.z);
          }
        }
      }
      if (g.rover.docked !== wasDocked) {
        wasDocked = g.rover.docked;
        follow = !g.rover.docked;
        if (g.rover.docked) goal.copy(HOME);
      }
      if (follow) goal.set(g.rover.x, 0, g.rover.z);
      const before = controls.target.clone();
      const k = reduced ? 1 : 0.08;
      controls.target.lerp(goal, k);
      controls.target.y = 0;
      camera.position.add(controls.target.clone().sub(before));
      // Keep the camera above the ground.
      const floor = terrainHeight(camera.position.x, camera.position.z, planet) + 2.5;
      if (camera.position.y < floor) camera.position.y = floor;
    };

    const v = new THREE.Vector3();
    const project = (key: string, x: number, y: number, z: number) => {
      const depth = camera.position.distanceTo(v.set(x, y, z));
      v.project(camera);
      const w = el.clientWidth,
        h = el.clientHeight;
      const a = anchors.get(key) ?? { x: 0, y: 0, visible: false, depth: 0 };
      a.x = (v.x * 0.5 + 0.5) * w;
      a.y = (-v.y * 0.5 + 0.5) * h;
      a.visible = v.z < 1 && a.x > -40 && a.x < w + 40 && a.y > -40 && a.y < h + 40;
      a.depth = depth;
      anchors.set(key, a);
      const f = followers.get(key);
      if (f) {
        f.style.transform = `translate3d(${a.x.toFixed(1)}px, ${a.y.toFixed(1)}px, 0)`;
        // Labels hide under the top bar and the dock rather than overlapping them.
        f.dataset.visible = a.visible && a.y > 96 && a.y < h - 70 ? "1" : "0";
        f.dataset.far = a.depth > 120 ? "1" : "0";
      }
    };

    let raf = 0,
      last = performance.now(),
      clock = 0,
      slow = 0,
      quality = 2,
      geigerAt = 0;
    const roverPos = new THREE.Vector3(DOCK.x, 0, DOCK.z);
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      clock += dt;
      // Adaptive quality: drop resolution, then shadows, on slow machines.
      slow = dt > 0.045 ? slow + dt : Math.max(0, slow - dt * 0.5);
      if (slow > 2.5 && quality > 0) {
        quality--;
        slow = 0;
        if (quality === 1) {
          ratio = 1;
          renderer.setPixelRatio(1);
          size();
        } else {
          renderer.shadowMap.enabled = false;
          sun.castShadow = false;
        }
      }
      const st = useGame.getState();
      const ui = useUI.getState();
      const g = st.game;
      const f = flows(g);
      const day = daylight(planet, g.t);
      const dustStorm = activeHazard(g, "dust");
      const storm = activeHazard(g, "storm");

      // Sun, sky and light.
      const dir = sunDirection(planet, g.t);
      sun.position.copy(controls.target).addScaledVector(dir, 120);
      sun.target.position.copy(controls.target);
      const dim = dustStorm ? 0.35 : 1;
      sun.intensity = (planet === "moon" ? 3.4 : 2.7) * Math.max(0, Math.min(1, dir.y * 8)) * dim;
      sun.color.set(planet === "mars" && dir.y < 0.25 ? "#ffd2a8" : "#fff4e2");
      if (planet === "moon") {
        // Earthshine keeps the lunar night readable: a cool blue fill.
        hemi.color.set(day > 0.5 ? "#d8e0ff" : "#9fb4ff");
        hemi.groundColor.set("#3a3a44");
        hemi.intensity = 0.75 + day * 0.35;
        fill.intensity = 0.55 - day * 0.25;
      } else {
        // Butterscotch by day, blue around the setting Sun (Mars sunsets really are blue).
        skyColor.copy(MARS_NIGHT).lerp(dustStorm ? MARS_DUST : MARS_NOON, day);
        if (day > 0.02 && dir.y < 0.3 && !dustStorm) skyColor.lerp(MARS_DUSK, (1 - dir.y / 0.3) * 0.45 * day);
        (scene.fog as THREE.FogExp2).color.copy(skyColor);
        (scene.fog as THREE.FogExp2).density += ((dustStorm ? 0.03 : 0.0065) - (scene.fog as THREE.FogExp2).density) * Math.min(1, dt * 0.8);
        hemi.color.copy(skyColor).lerp(MARS_LIGHT, 0.3);
        hemi.groundColor.set("#4a2a1e");
        hemi.intensity = 0.5 + day * 0.6 * dim;
        fill.intensity = 0.35 - day * 0.1;
      }
      (sky.stars.material as THREE.PointsMaterial).opacity = planet === "moon" ? 0.75 + (1 - day) * 0.25 : Math.max(0, 1 - day * 1.4);
      sky.sun.position.copy(camera.position).addScaledVector(dir, 600);
      sky.sun.visible = dir.y > -0.05 && !dustStorm;
      if (sky.earth) sky.earth.rotation.y += dt * 0.02;

      // Modules.
      const live = new Set<number>();
      for (const m of g.modules) {
        live.add(m.id);
        let e = entries.get(m.id);
        if (!e || e.type !== m.type || e.pad !== m.pad) {
          if (e) {
            scene.remove(e.view.group);
            dispose(e.view.group);
            if (e.cable) {
              scene.remove(e.cable.group);
              dispose(e.cable.group);
            }
          }
          const view = buildModule(m.type, planet);
          const p = modulePos(m);
          view.group.position.set(p.x, terrainHeight(p.x, p.z, planet) + (m.pad >= 0 ? 0.18 : 0), p.z);
          if (m.pad >= 0) view.group.rotation.y = Math.atan2(p.x, p.z) + Math.PI;
          view.group.traverse((o) => (o.userData.moduleId = m.id));
          scene.add(view.group);
          const cable = m.type === "habitat" ? null : buildCable(m, planet);
          if (cable) scene.add(cable.group);
          e = { id: m.id, type: m.type, pad: m.pad, view, scaffold: null, cable };
          entries.set(m.id, e);
          if (m.type === "habitat") e.view.shield!.visible = false;
        }
        const time = MODULES[m.type].time;
        const done = isBuilt(m);
        const progress = time ? Math.min(1, m.built / time) : 1;
        const grp = e.view.group;
        grp.scale.set(1, done ? 1 : 0.08 + 0.92 * progress, 1);
        if (!done && !e.scaffold) {
          e.scaffold = scaffold(e.view.top + 0.4);
          e.scaffold.position.copy(grp.position);
          e.scaffold.rotation.y = grp.rotation.y;
          scene.add(e.scaffold);
        } else if (done && e.scaffold) {
          scene.remove(e.scaffold);
          dispose(e.scaffold);
          e.scaffold = null;
          if (!reduced) grp.scale.set(1.12, 1.12, 1.12);
        }
        if (done && grp.scale.x > 1) grp.scale.multiplyScalar(Math.max(1 / grp.scale.x, 1 - dt * 1.6));
        const working = isWorking(m);
        const r = working ? (f.ratio[m.id] ?? 1) : 0;
        const damaged = done && m.health < 50;
        const lamp = !done ? "#ffb020" : damaged ? "#ff4d5e" : !m.on ? "#5b6375" : r < 0.5 ? "#ffb020" : "#3ee39a";
        e.view.status.color.set(lamp);
        e.view.status.emissive.set(lamp);
        e.view.status.emissiveIntensity = damaged ? (Math.sin(clock * 8) > 0 ? 3 : 0.4) : 2.2;
        const power = m.type === "greenhouse" ? (m.light / 2) * r : r;
        for (const gm of e.view.glow) gm.emissiveIntensity = 0.08 + power * (m.type === "reactor" ? 2.6 : 1.9) * (m.type === "oxygen" ? 0.7 + Math.sin(clock * 3) * 0.3 : 1);
        if (working && r > 0.2 && !reduced) for (const sp of e.view.spin) sp.rotation.y += dt * (m.type === "icedrill" ? 6 : m.type === "lab" ? 0.4 : 3) * r;
        if (e.view.yaw && e.view.tilt) {
          const local = Math.atan2(dir.x, dir.z) - grp.rotation.y;
          e.view.yaw.rotation.y += (local + Math.PI - e.view.yaw.rotation.y) * Math.min(1, dt * 1.5);
          const el = Math.max(0.05, Math.asin(Math.max(-1, Math.min(1, dir.y))));
          e.view.tilt.rotation.x = planet === "moon" ? -el * 0.9 : -(Math.PI / 2 - Math.max(0.35, Math.PI / 2 - el)) - 0.25;
        }
        if (e.view.bars) {
          const level = g.res.power / capacity(g).power;
          e.view.bars.forEach((b, i) => (b.emissiveIntensity = level > i / 5 + 0.02 ? 1.8 : 0.08));
        }
        if (e.view.windows) e.view.windows.emissiveIntensity = (0.5 + (1 - day) * 1.8) * (f.ratio[m.id] ?? 1);
        if (e.view.shield) {
          const target = g.shieldStarted ? 0.25 + 0.75 * Math.min(1, g.shield / SHIELD_TIME) : 0;
          shieldPct.v += (target - shieldPct.v) * Math.min(1, dt * 2);
          e.view.shield.visible = shieldPct.v > 0.02;
          e.view.shield.scale.set(1, Math.max(0.01, shieldPct.v), 1);
          e.view.shield.position.y = shieldDone(g) ? 0 : -0.2;
        }
        if (e.cable) {
          const flowing = m.type === "solar" || m.type === "reactor" ? working && f.gen > 0.05 : working && r > 0.05 && (f.ratio[m.id] !== undefined);
          e.cable.flow.emissiveIntensity = flowing ? 1.8 : 0.05;
          e.cable.flow.opacity = flowing ? 0.95 : 0.25;
          if (!reduced) e.cable.tex.offset.x -= dt * 1.2 * e.cable.dir;
        }
      }
      for (const [id, e] of entries)
        if (!live.has(id)) {
          scene.remove(e.view.group);
          dispose(e.view.group);
          if (e.scaffold) {
            scene.remove(e.scaffold);
            dispose(e.scaffold);
          }
          if (e.cable) {
            scene.remove(e.cable.group);
            dispose(e.cable.group);
          }
          entries.delete(id);
        }

      // Pads light up while you choose where to build.
      const placing = ui.placing;
      const selPad = ui.selected?.kind === "pad" ? ui.selected.id : -1;
      PADS.forEach((p, i) => {
        const ring = pads[i].userData.ring as THREE.Mesh;
        const mat = ring.material as THREE.MeshStandardMaterial;
        const free = !g.modules.some((m) => m.pad === p.id);
        const ok = free && (placing ? padFits(placing, p.kind) : true);
        const pulse = 0.55 + Math.sin(clock * 4) * 0.3;
        mat.opacity = !free ? 0 : placing ? (ok ? pulse : 0.05) : i === selPad ? 0.9 : ui.panel === "build" ? 0.3 : 0.12;
        mat.emissiveIntensity = placing && ok ? 2.4 : 1.2;
      });
      ((dock.userData.plug as THREE.MeshStandardMaterial).emissiveIntensity = g.rover.docked && f.roverKw > 0 ? 1.5 + Math.sin(clock * 5) : 1);

      // Rover.
      const rv = g.rover;
      const ground = terrainHeight(rv.x, rv.z, planet);
      const prev = roverPos.clone();
      roverPos.set(rv.x, ground, rv.z);
      rover.group.position.copy(roverPos);
      const fx = -Math.sin(rv.heading),
        fz = -Math.cos(rv.heading);
      const pitch = Math.atan2(terrainHeight(rv.x + fx * 1.5, rv.z + fz * 1.5, planet) - terrainHeight(rv.x - fx * 1.5, rv.z - fz * 1.5, planet), 3);
      const roll = Math.atan2(terrainHeight(rv.x - fz * 1.1, rv.z + fx * 1.1, planet) - terrainHeight(rv.x + fz * 1.1, rv.z - fx * 1.1, planet), 2.2);
      rover.group.rotation.set(0, 0, 0);
      rover.group.rotateY(rv.heading);
      rover.group.rotateX(pitch);
      rover.group.rotateZ(roll);
      const moved = prev.distanceTo(roverPos);
      if (moved < 3) for (const w of rover.wheels) w.rotation.x -= (moved / 0.46) * Math.sign(rv.speed || 1);
      const dark = 1 - day > 0.5 || inShadow(rv.x, rv.z) || !!dustStorm;
      rover.heads.emissiveIntensity = dark ? 3 : 0.6;
      headlight.intensity = dark ? 60 : 0;
      rover.tail.emissiveIntensity = rv.speed < -0.5 ? 3 : 1.2;
      if (Math.abs(rv.speed) > 2 && !reduced && moved < 3)
        for (let i = 0; i < 2; i++)
          dust.emit(rv.x - fx * 1.9 + (Math.random() - 0.5) * 1.6, ground + 0.3, rv.z - fz * 1.9, -fx * 0.8, 1.2, -fz * 0.8, 1.4);
      if (dustStorm && !reduced)
        for (let i = 0; i < 3; i++)
          dust.emit(controls.target.x - 36 + Math.random() * 12, 0.5 + Math.random() * 6, controls.target.z - 30 + Math.random() * 40, 18, 0.2, 2, 2);
      dust.update(dt, planet === "moon" ? 1.6 : 3.7);

      // Crew outside while collecting.
      const task = rv.task;
      walkers.forEach((w, i) => {
        w.visible = !!task;
        if (!task) return;
        const s = SITES.find((x) => x.id === task.site)!;
        const k = 1 - Math.max(0, Math.min(1, task.left)); // 0 → 1 over the hour
        const out = Math.min(1, k * 3),
          back = Math.max(0, (k - 0.75) * 4);
        const t = out - back;
        const side = i ? 1 : -1;
        const sx = rv.x + Math.cos(rv.heading) * side * 1.8,
          sz = rv.z - Math.sin(rv.heading) * side * 1.8;
        const tx = s.x + side * 0.9,
          tz = s.z + 0.6;
        const x = sx + (tx - sx) * t,
          z = sz + (tz - sz) * t;
        w.position.set(x, terrainHeight(x, z, planet), z);
        w.rotation.y = Math.atan2(-(tx - sx), -(tz - sz)) + (back > 0 ? Math.PI : 0);
        const walking = (k < 0.34 || k > 0.75) && !reduced;
        const swing = walking ? Math.sin(clock * 7 + i) * 0.6 : 0;
        const legs = w.userData.legs as THREE.Object3D[],
          arms = w.userData.arms as THREE.Object3D[];
        legs[0].rotation.x = swing;
        legs[1].rotation.x = -swing;
        arms[0].rotation.x = -swing * 0.8;
        arms[1].rotation.x = walking ? swing * 0.8 : -1.1 + Math.sin(clock * 4) * 0.2;
        w.position.y += walking ? Math.abs(Math.sin(clock * 7 + i)) * (planet === "moon" ? 0.22 : 0.1) : 0;
      });

      // Sites.
      const selSite = ui.selected?.kind === "site" ? ui.selected.id : null;
      const targetSite = st.target;
      for (const mk of markers) {
        const done = mk.site.kind === "science" && (g.stats.sites.includes(mk.site.id) || rv.cargo.samples.includes(mk.site.id));
        mk.flag.visible = g.stats.sites.includes(mk.site.id);
        mk.beam.visible = !done;
        const hot = selSite === mk.site.id || targetSite === mk.site.id;
        mk.ringMat.opacity = done ? 0.25 : hot ? 0.8 + Math.sin(clock * 5) * 0.2 : 0.6;
        mk.ringMat.emissiveIntensity = hot ? 2.6 : 1.4;
        (mk.beam.material as THREE.MeshBasicMaterial).opacity = hot ? 0.95 : 0.55;
        mk.ring.rotation.z += dt * 0.3;
      }
      (sparkles.material as THREE.PointsMaterial).opacity = 0.55 + Math.sin(clock * 3) * 0.3;

      // Storm effects and Geiger clicks.
      streaks.update(clock, controls.target.x, controls.target.z, storm ? 1 : 0);
      if (storm && ui.settings.sound && !st.paused) {
        const exposed = !g.sheltering || !rv.docked;
        geigerAt -= dt;
        if (geigerAt <= 0) {
          tick();
          geigerAt = (exposed ? 0.05 : 0.35) + Math.random() * (exposed ? 0.15 : 0.6);
        }
      }

      runCamera(g);
      controls.update();

      // Anchors for HTML overlays.
      for (const s of SITES) project(`site:${s.id}`, s.x, terrainHeight(s.x, s.z, planet) + 4.2, s.z);
      for (const e of entries.values()) {
        const p = e.view.group.position;
        project(`module:${e.id}`, p.x, p.y + e.view.top + 0.9, p.z);
      }
      for (const p of PADS) project(`pad:${p.id}`, p.x, terrainHeight(p.x, p.z, planet) + 0.6, p.z);
      project("rover", rv.x, ground + 3.4, rv.z);
      project("rover-body", rv.x, ground + 1.4, rv.z);
      project("dock", DOCK.x, terrainHeight(DOCK.x, DOCK.z, planet) + 0.5, DOCK.z);
      project("habitat", 0, 2.4, 0);
      project("crater", CRATER.x, terrainHeight(CRATER.x, CRATER.z, planet) + 2, CRATER.z);

      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerup", onUp);
      renderer.domElement.removeEventListener("pointermove", onMove);
      controls.dispose();
      scene3d.pick = null;
      anchors.clear();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry && !m.geometry.userData.shared) m.geometry.dispose();
      });
      for (const e of entries.values()) dispose(e.view.group);
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [planet, key, reduce]);

  return (
    <div ref={host} className="world">
      {failed && (
        <div className="world-fallback">
          <b>3D view unavailable</b>
          <span>Your browser couldn't start WebGL. You can still run the outpost with the panels below.</span>
        </div>
      )}
    </div>
  );
}
