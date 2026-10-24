import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { activeHazard, capacity, flows, isBuilt, isWorking, shieldDone } from "../sim/core";
import { MODULES, SHIELD_TIME } from "../sim/modules";
import { daylight, PLANETS } from "../sim/planets";
import { modulePos } from "../sim/rover";
import type { GameState, Module, Planet } from "../sim/types";
import { CRATER, DOCK, inShadow, LANDER, PADS, padFits, SITES, terrainHeight } from "../sim/world";
import { useGame } from "../state/game";
import { useUI } from "../state/ui";
import { tick } from "../lib/sound";
import { anchors, followers, scene3d } from "./anchors";
import { buildSiteMarker, dustSystem, impactSystem, sparkSystem, stormStreaks } from "./effects";
import { dispose, light, paint } from "./kit";
import { buildAstronaut, buildDock, buildFlag, buildLander, buildModule, buildPad, buildRover, scaffold, type ModuleView } from "./models";
import { buildSky, environmentMap } from "./sky";
import { buildHorizon, buildIce, buildRocks, buildTerrain, PALETTE, trackSystem } from "./terrain";

const HOME = new THREE.Vector3(0, 0, 2);
const OFFSET = new THREE.Vector3(24, 30, 36);
const MARS = {
  night: new THREE.Color("#07060c"),
  day: new THREE.Color("#d9ab82"),
  dust: new THREE.Color("#8f5e40"),
  light: new THREE.Color("#ffd9b8"),
};

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
  /** Health last frame, to notice a meteor strike. */
  hp: number;
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

/** A power cable from the habitat to a module, with pulses that show which way energy flows. */
function buildCable(m: Module, planet: Planet): Entry["cable"] {
  const p = modulePos(m);
  const d = Math.hypot(p.x, p.z);
  if (d < 1) return null;
  const ux = p.x / d,
    uz = p.z / d;
  const start = new THREE.Vector3(ux * 3.4, 0, uz * 3.4),
    end = new THREE.Vector3(p.x - ux * 2.3, 0, p.z - uz * 2.3);
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

/** Render quality: 0 low (no glow, no shadows), 1 medium, 2 high. */
type Level = 0 | 1 | 2;

export function World() {
  const host = useRef<HTMLDivElement>(null);
  const planet = useGame((s) => s.game.planet);
  const key = useGame((s) => `${s.game.missionId}:${s.game.seed}`);
  const reduce = useUI((s) => s.settings.motion);
  const graphics = useUI((s) => s.settings.graphics);
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
    const touch = matchMedia("(pointer: coarse)").matches;
    let level: Level = graphics === "low" ? 0 : graphics === "high" ? 2 : touch ? 1 : 2;
    let ratio = 1;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = planet === "mars" ? 1.0 : 1.12;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.className = "world-canvas";
    const debug = (window as unknown as { __astra?: Record<string, unknown> }).__astra;
    if (debug) debug.renderer = renderer;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#000000");
    const camera = new THREE.PerspectiveCamera(42, 1, 0.5, 6000);
    camera.position.copy(HOME).add(OFFSET);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(HOME);
    controls.enableDamping = !reduced;
    controls.dampingFactor = 0.08;
    controls.minDistance = 10;
    controls.maxDistance = 260;
    controls.maxPolarAngle = 1.48;
    controls.minPolarAngle = 0.22;
    controls.screenSpacePanning = false;
    controls.panSpeed = 1;
    controls.rotateSpeed = 0.7;
    controls.zoomSpeed = 1.2;
    controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };

    // Image-based light for metal and glass, plus the post-processing chain (HDR, MSAA, bloom).
    const env = environmentMap(renderer, planet);
    scene.environment = env.texture;
    scene.environmentIntensity = planet === "moon" ? 0.32 : 0.55;
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    const composer = new EffectComposer(renderer, target);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.42, 1.05);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());

    // Lights.
    const sun = new THREE.DirectionalLight("#fff4e2", 3);
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 600;
    let shadowHalf = 50;
    Object.assign(sun.shadow.camera, { left: -shadowHalf, right: shadowHalf, top: shadowHalf, bottom: -shadowHalf });
    sun.shadow.bias = -0.0003;
    sun.shadow.normalBias = 0.05;
    scene.add(sun, sun.target);
    const hemi = new THREE.HemisphereLight("#b9c6ff", "#2a2a30", 0.4);
    scene.add(hemi);
    const fill = new THREE.DirectionalLight(planet === "moon" ? "#8fb2ff" : "#ffb18a", 0.25);
    fill.position.set(-40, 30, 30);
    scene.add(fill);

    const applyLevel = () => {
      ratio = level === 2 ? Math.min(devicePixelRatio, 2) : level === 1 ? Math.min(devicePixelRatio, 1.25) : 1;
      renderer.setPixelRatio(ratio);
      composer.setPixelRatio(ratio);
      renderer.shadowMap.enabled = level > 0;
      sun.castShadow = level > 0;
      renderer.shadowMap.type = level === 2 ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
      size();
    };

    // The world.
    const terrain = buildTerrain(planet);
    scene.add(terrain);
    scene.add(buildHorizon(planet));
    scene.add(buildRocks(planet, level > 0));
    const ice = buildIce(planet);
    scene.add(ice);
    const sky = buildSky(planet);
    scene.add(sky.group);
    // No air on the Moon, so no haze: distant hills stay as sharp as near ones.
    const marsFog = new THREE.FogExp2("#c99a74", 0.0024);
    scene.fog = planet === "moon" ? null : marsFog;
    const tracks = trackSystem(planet);
    scene.add(tracks.mesh);
    const dust = dustSystem(PALETTE[planet].light);
    scene.add(dust.points);
    const sparks = sparkSystem();
    scene.add(sparks.points);
    const impact = impactSystem();
    scene.add(impact.group);
    const streaks = stormStreaks();
    scene.add(streaks.lines);
    const lander = buildLander(planet);
    lander.position.set(LANDER.x, terrainHeight(LANDER.x, LANDER.z, planet), LANDER.z);
    lander.rotation.y = 0.6;
    scene.add(lander);
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
      flag.position.set(1.6, 0, -1.4);
      flag.visible = false;
      m.group.add(flag);
      return { ...m, flag, site: s };
    });

    const rover = buildRover();
    rover.group.traverse((o) => (o.userData.rover = true));
    scene.add(rover.group);
    const headlight = new THREE.SpotLight("#fff1d6", 0, 45, 0.6, 0.55, 1.2);
    headlight.position.set(0, 1.4, -2.0);
    headlight.target.position.set(0, 0, -14);
    rover.group.add(headlight, headlight.target);
    const walkers = [buildAstronaut("#ff4d5e"), buildAstronaut("#5ee0ff")];
    for (const w of walkers) {
      w.visible = false;
      scene.add(w);
    }

    const entries = new Map<number, Entry>();
    const shieldPct = { v: 0 };

    function size() {
      const w = el!.clientWidth,
        h = el!.clientHeight;
      renderer.setSize(w, h, false);
      composer.setSize(w, h);
      camera.aspect = w / Math.max(1, h);
      // Keep the same width of world in view on tall phone screens.
      const half = THREE.MathUtils.degToRad(21);
      camera.fov = camera.aspect >= 1.2 ? 42 : Math.min(78, THREE.MathUtils.radToDeg(2 * Math.atan((Math.tan(half) * 1.2) / camera.aspect)));
      camera.updateProjectionMatrix();
    }
    const ro = new ResizeObserver(size);
    ro.observe(el);
    applyLevel();

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
    scene3d.lookAt = (x, z) => {
      follow = false;
      goal.set(x, 0, z);
    };
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
        f.dataset.far = a.depth > 160 ? "1" : "0";
      }
    };

    let raf = 0,
      last = performance.now(),
      clock = 0,
      slow = 0,
      warm = 0,
      geigerAt = 0,
      dustLevel = 0,
      stormLevel = 0,
      sparkAt = 0;
    const roverPos = new THREE.Vector3(DOCK.x, 0, DOCK.z);
    const trackFrom = new THREE.Vector3(DOCK.x, 0, DOCK.z);
    const fogDay = new THREE.Color();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      clock += dt;
      warm += dt;
      // Adaptive quality on "auto": drop resolution, then the glow, then shadows on slow machines.
      if (graphics === "auto" && warm > 4 && !document.hidden) {
        slow = dt > 0.045 ? slow + dt : Math.max(0, slow - dt * 0.5);
        if (slow > 2.5 && level > 0) {
          slow = 0;
          if (level === 2 && ratio > 1.01) {
            ratio = 1;
            renderer.setPixelRatio(1);
            composer.setPixelRatio(1);
            size();
          } else {
            level = (level - 1) as Level;
            applyLevel();
          }
        }
      }
      const st = useGame.getState();
      const ui = useUI.getState();
      const g = st.game;
      const f = flows(g);
      const day = daylight(planet, g.t);
      const dustStorm = activeHazard(g, "dust");
      const storm = activeHazard(g, "storm");
      dustLevel += ((dustStorm ? 1 : 0) - dustLevel) * Math.min(1, dt * 0.6);
      stormLevel += ((storm ? 1 : 0) - stormLevel) * Math.min(1, dt * 1.2);

      // Sun, sky and light.
      const dir = sunDirection(planet, g.t);
      const reach = camera.position.distanceTo(controls.target);
      sun.position.copy(controls.target).addScaledVector(dir, 260);
      sun.target.position.copy(controls.target);
      // Shadows cover what the camera can see.
      const half = THREE.MathUtils.clamp(reach * 0.8, 30, 130);
      if (Math.abs(half - shadowHalf) > 4) {
        shadowHalf = half;
        Object.assign(sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half });
        sun.shadow.camera.updateProjectionMatrix();
      }
      const dim = 1 - dustLevel * 0.65;
      sun.intensity = (planet === "moon" ? 3.6 : 2.9) * THREE.MathUtils.clamp(dir.y * 8, 0, 1) * dim;
      sun.color.set(planet === "mars" && dir.y < 0.25 ? "#ffd2a8" : "#fff4e2");
      if (planet === "moon") {
        // Earthshine keeps the lunar night readable: a cool blue fill.
        hemi.color.set(day > 0.5 ? "#d8e0ff" : "#9fb4ff");
        hemi.groundColor.set("#3a3a44");
        hemi.intensity = 0.8 - day * 0.1;
        fill.intensity = 0.75 - day * 0.5;
      } else {
        fogDay.copy(MARS.night).lerp(MARS.day, day).lerp(MARS.dust, dustLevel * Math.max(0.15, day));
        marsFog.color.copy(fogDay);
        marsFog.density = 0.0024 + dustLevel * 0.011;
        hemi.color.copy(fogDay).lerp(MARS.light, 0.35);
        hemi.groundColor.set("#4a2a1e");
        hemi.intensity = 0.35 + day * 0.55 * dim;
        fill.intensity = 0.3 - day * 0.1;
      }
      sky.update(camera, dir, { day, dust: dustLevel, storm: stormLevel, time: clock, pixelRatio: ratio });
      scene.environmentIntensity = (planet === "moon" ? 0.32 : 0.55) * (0.35 + 0.65 * day);
      bloom.strength = 0.45 + stormLevel * 0.15;

      // Modules.
      const live = new Set<number>();
      const meteor = g.feed.slice(-3).some((x) => x.text.startsWith("Meteorite"));
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
          view.group.position.set(p.x, terrainHeight(p.x, p.z, planet) + (m.pad >= 0 ? 0.2 : 0), p.z);
          if (m.pad >= 0) view.group.rotation.y = Math.atan2(p.x, p.z) + Math.PI;
          view.group.traverse((o) => (o.userData.moduleId = m.id));
          scene.add(view.group);
          const cable = m.type === "habitat" ? null : buildCable(m, planet);
          if (cable) scene.add(cable.group);
          e = { id: m.id, type: m.type, pad: m.pad, view, scaffold: null, cable, hp: m.health };
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
          if (!reduced) {
            grp.scale.set(1.12, 1.12, 1.12);
            for (let i = 0; i < 4; i++) dust.emit(grp.position.x + (Math.random() - 0.5) * 3, grp.position.y + 0.3, grp.position.z + (Math.random() - 0.5) * 3, 0, 0.6, 0, 3, 2.5, 0.7);
          }
        }
        // Welding sparks while it is being built.
        if (!done && !st.paused && !reduced && clock > sparkAt) {
          const top = e.view.top * progress;
          sparks.emit(grp.position.x + (Math.random() - 0.5) * 2.6, grp.position.y + Math.max(0.4, top * Math.random()), grp.position.z + (Math.random() - 0.5) * 2.2, 5, 2.4);
        }
        if (done && grp.scale.x > 1) grp.scale.multiplyScalar(Math.max(1 / grp.scale.x, 1 - dt * 1.6));
        // A meteor strike: a streak from the sky, a flash and debris.
        if (done && m.health < e.hp - 15 && meteor && !reduced) impact.hit(grp.position.x, grp.position.y + e.view.top * 0.5, grp.position.z);
        e.hp = m.health;
        const working = isWorking(m);
        const r = working ? (f.ratio[m.id] ?? 1) : 0;
        const damaged = done && m.health < 50;
        const lamp = !done ? "#ffb020" : damaged ? "#ff4d5e" : !m.on ? "#5b6375" : r < 0.5 ? "#ffb020" : "#3ee39a";
        e.view.status.color.set(lamp);
        e.view.status.emissive.set(lamp);
        e.view.status.emissiveIntensity = damaged ? (Math.sin(clock * 8) > 0 ? 3.5 : 0.4) : 2.4;
        const power = m.type === "greenhouse" ? (m.light / 2) * r : r;
        for (const gm of e.view.glow) gm.emissiveIntensity = 0.08 + power * (m.type === "reactor" ? 2.6 : 1.9) * (m.type === "oxygen" ? 0.7 + Math.sin(clock * 3) * 0.3 : 1);
        for (const b of e.view.blink) b.emissiveIntensity = (clock * 0.8 + m.id * 0.37) % 1 < 0.12 ? 5 : 0.15;
        if (working && r > 0.2 && !reduced) for (const sp of e.view.spin) sp.rotation.y += dt * (m.type === "icedrill" ? 6 : m.type === "lab" ? 0.4 : 3) * r;
        if (e.view.yaw && e.view.tilt) {
          const local = Math.atan2(dir.x, dir.z) - grp.rotation.y;
          let delta = local + Math.PI - e.view.yaw.rotation.y;
          delta = Math.atan2(Math.sin(delta), Math.cos(delta));
          e.view.yaw.rotation.y += delta * Math.min(1, dt * 1.5);
          const elev = Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1));
          const want = planet === "moon" ? Math.max(0, elev) : THREE.MathUtils.clamp(elev, 0.3, 1.35);
          e.view.tilt.rotation.x += (want - e.view.tilt.rotation.x) * Math.min(1, dt * 1.5);
        }
        if (e.view.bars) {
          const charge = g.res.power / capacity(g).power;
          e.view.bars.forEach((b, i) => (b.emissiveIntensity = charge > i / 5 + 0.02 ? 1.8 : 0.08));
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
          const flowing = m.type === "solar" || m.type === "reactor" ? working && f.gen > 0.05 : working && r > 0.05 && f.ratio[m.id] !== undefined;
          e.cable.flow.emissiveIntensity = flowing ? 1.8 : 0.05;
          e.cable.flow.opacity = flowing ? 0.95 : 0.25;
          if (!reduced) e.cable.tex.offset.x -= dt * 1.2 * e.cable.dir;
        }
      }
      if (clock > sparkAt) sparkAt = clock + 0.12 + Math.random() * 0.25;
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
      if (impact.update(dt)) {
        const p = impact.group.children[0].position;
        sparks.emit(p.x, p.y - 1, p.z, 40, 6);
        for (let i = 0; i < 10; i++) dust.emit(p.x, p.y - 1.2, p.z, 0, 1.5, 0, 6, 3, 0.5);
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
        mat.emissiveIntensity = placing && ok ? 2.6 : 1.2;
      });
      (dock.userData.plug as THREE.MeshStandardMaterial).emissiveIntensity = g.rover.docked && f.roverKw > 0 ? 1.5 + Math.sin(clock * 5) : 1;
      (dock.userData.guide as THREE.MeshStandardMaterial).emissiveIntensity = g.rover.docked ? 0.6 : 1 + Math.max(0, Math.sin(clock * 4)) * 2;
      (lander.userData.beacon as THREE.MeshStandardMaterial).emissiveIntensity = (clock * 0.6) % 1 < 0.1 ? 5 : 0.15;

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
      if (moved < 12) for (const w of rover.wheels) w.rotation.x -= (moved / 0.47) * Math.sign(rv.speed || 1);
      if (moved > 12) {
        tracks.reset();
        trackFrom.copy(roverPos);
      } else if (trackFrom.distanceTo(roverPos) > 0.7) {
        tracks.add(rv.x, rv.z, rv.heading);
        trackFrom.copy(roverPos);
      }
      const dark = 1 - day > 0.5 || inShadow(rv.x, rv.z) || dustLevel > 0.5;
      rover.heads.emissiveIntensity = dark ? 4 : 0.6;
      headlight.intensity = dark ? 90 : 0;
      rover.tail.emissiveIntensity = rv.speed < -0.5 ? 3.5 : 1.2;
      rover.beacon.emissiveIntensity = (clock * 0.9) % 1 < 0.12 ? 5 : 0.15;
      if (Math.abs(rv.speed) > 2 && !reduced && moved < 12)
        for (let i = 0; i < 2; i++) dust.emit(rv.x - fx * 2 + (Math.random() - 0.5) * 1.8, ground + 0.3, rv.z - fz * 2, -fx * 0.8, 1.2, -fz * 0.8, 1.4, 1, 0.9);
      if (dustLevel > 0.3 && !reduced)
        for (let i = 0; i < 3; i++) dust.emit(controls.target.x - 45 + Math.random() * 14, 0.5 + Math.random() * 8, controls.target.z - 40 + Math.random() * 60, 20, 0.2, 2, 2, 3, 0.45);
      dust.update(dt, planet === "moon" ? 1.6 : 3.7);
      sparks.update(dt, planet === "moon" ? 1.6 : 3.7);
      dust.mat.uniforms.scale.value = ratio;
      sparks.mat.uniforms.scale.value = ratio;

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
        if (!walking && !reduced && Math.random() < dt * 3) dust.emit(tx, terrainHeight(tx, tz, planet) + 0.2, tz, 0, 0.5, 0, 0.8, 0.6, 1.2);
      });

      // Sites.
      const selSite = ui.selected?.kind === "site" ? ui.selected.id : null;
      const targetSite = st.target;
      for (const mk of markers) {
        const done = mk.site.kind === "science" && (g.stats.sites.includes(mk.site.id) || rv.cargo.samples.includes(mk.site.id));
        mk.flag.visible = g.stats.sites.includes(mk.site.id);
        mk.beam.visible = !done;
        const hot = selSite === mk.site.id || targetSite === mk.site.id;
        mk.ringMat.opacity = done ? 0.2 : hot ? 0.85 + Math.sin(clock * 5) * 0.15 : 0.55;
        mk.beamMat.opacity = hot ? 0.95 : 0.5;
        mk.pool.opacity = done ? 0.1 : hot ? 0.55 : 0.3;
        mk.lamp.emissiveIntensity = done ? 0.5 : (clock * 0.7 + mk.site.x) % 1 < 0.15 ? 6 : 1.5;
        mk.ring.rotation.z += dt * (hot ? 0.8 : 0.25);
      }
      const glints = ice.userData.glints as THREE.Points;
      (glints.material as THREE.PointsMaterial).opacity = 0.55 + Math.sin(clock * 3) * 0.3;

      // Storm effects and Geiger clicks.
      streaks.update(clock, controls.target.x, controls.target.z, reduced ? stormLevel * 0.4 : stormLevel * 0.8);
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
      const look = controls.target.clone().sub(camera.position);
      scene3d.view.x = controls.target.x;
      scene3d.view.z = controls.target.z;
      scene3d.view.heading = Math.atan2(look.x, -look.z);
      scene3d.view.distance = reach;
      scene3d.view.fov = THREE.MathUtils.degToRad(camera.fov) * camera.aspect;

      // Anchors for HTML overlays.
      for (const s of SITES) project(`site:${s.id}`, s.x, terrainHeight(s.x, s.z, planet) + 4.6, s.z);
      for (const e of entries.values()) {
        const p = e.view.group.position;
        project(`module:${e.id}`, p.x, p.y + e.view.top + 0.9, p.z);
      }
      for (const p of PADS) project(`pad:${p.id}`, p.x, terrainHeight(p.x, p.z, planet) + 0.6, p.z);
      project("rover", rv.x, ground + 3.6, rv.z);
      project("rover-body", rv.x, ground + 1.4, rv.z);
      project("dock", DOCK.x, terrainHeight(DOCK.x, DOCK.z, planet) + 0.5, DOCK.z);
      project("habitat", 0, 2.4, 0);
      project("crater", CRATER.x, terrainHeight(CRATER.x, CRATER.z, planet) + 2, CRATER.z);

      if (level > 0) composer.render(dt);
      else renderer.render(scene, camera);
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
      scene3d.lookAt = null;
      anchors.clear();
      dispose(scene);
      env.dispose();
      composer.dispose();
      target.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [planet, key, reduce, graphics]);

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
