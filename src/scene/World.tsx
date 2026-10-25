import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { SMAAPass } from "three/addons/postprocessing/SMAAPass.js";
import { gradePass } from "./grade";
import { activeHazard, capacity, flows, isBuilt, isWorking, shieldDone } from "../sim/core";
import { MODULES, SHIELD_TIME } from "../sim/modules";
import { clockOf, dayOf, daylight, isDaytime, PLANETS } from "../sim/planets";
import { modulePos, ROVER } from "../sim/rover";
import type { GameState, Module, Planet } from "../sim/types";
import { CRATER, DOCK, FOOTPRINT, HABITAT_RADIUS, inShadow, LANDER, PADS, padFits, SITES, terrainHeight } from "../sim/world";
import { useGame } from "../state/game";
import { useUI, type View } from "../state/ui";
import { ambience, tick } from "../lib/sound";
import { anchors, followers, scene3d } from "./anchors";
import { buildCockpit, EYE, type CockpitData } from "./cockpit";
import { buildSiteMarker, dustSystem, impactSystem, SITE_COLOR, sparkSystem, stormStreaks } from "./effects";
import { dispose, light, rubber } from "./kit";
import { buildAstronaut, buildDock, buildFlag, buildLander, buildModule, buildPad, buildRover, poseAstronaut, scaffold, type ModuleView } from "./models";
import type { Baked } from "./bake";
import { bakedNow, prebake } from "./prebake";
import { buildSky, environmentMap } from "./sky";
import { buildHorizon, buildIce, buildRocks, buildTerrain, PALETTE, trackSystem } from "./terrain";
import { buildInterior, INSIDE_LAYER, placeInterior, scaleFigure, screenData } from "./interior";
import { HOME as HOME_PLAN } from "../sim/home";
import { insideEnvironment } from "./interior/lighting";
import { walkController } from "./walk";
import { walker } from "../state/walk";
import { interiorState } from "../sim/interior";

const HOME = new THREE.Vector3(0, 0, 3);
const OFFSET = new THREE.Vector3(25.5, 31.5, 38);
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
  ctx.fillRect(0, 0, 7, 4);
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
  const start = new THREE.Vector3(ux * (HABITAT_RADIUS - 0.3), 0, uz * (HABITAT_RADIUS - 0.3)),
    end = new THREE.Vector3(p.x - ux * 2.3, 0, p.z - uz * 2.3);
  const pts: THREE.Vector3[] = [];
  const n = Math.max(4, Math.ceil(start.distanceTo(end) / 2));
  for (let i = 0; i <= n; i++) {
    const v = start.clone().lerp(end, i / n);
    const bend = Math.sin((i / n) * Math.PI) * 0.6;
    v.x += -uz * bend;
    v.z += ux * bend;
    v.y = terrainHeight(v.x, v.z, planet) + 0.06;
    pts.push(v);
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const group = new THREE.Group();
  const cord = new THREE.Mesh(new THREE.TubeGeometry(curve, n * 6, 0.055, 7), rubber("#24282f"));
  cord.receiveShadow = cord.castShadow = true;
  group.add(cord);
  const tex = flowTexture().clone();
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.set(Math.max(1, Math.round(curve.getLength() / 2.6)), 1);
  tex.needsUpdate = true;
  const flow = light("#ffe2b0", 0.7);
  flow.alphaMap = tex;
  flow.transparent = true;
  flow.depthWrite = false;
  const strip = new THREE.Mesh(new THREE.TubeGeometry(curve, n * 6, 0.06, 7), flow);
  group.add(strip);
  const gen = m.type === "solar" || m.type === "reactor";
  return { group, flow, tex, dir: gen ? -1 : 1 };
}

/** Render quality: 0 low (no glow, no shadows), 1 medium, 2 high, 3 ultra (ambient occlusion, SMAA, sharper shadows). */
type Level = 0 | 1 | 2 | 3;

export function World() {
  const host = useRef<HTMLDivElement>(null);
  const planet = useGame((s) => s.game.planet);
  const key = useGame((s) => `${s.game.missionId}:${s.game.seed}`);
  const reduce = useUI((s) => s.settings.motion);
  const graphics = useUI((s) => s.settings.graphics);
  const [failed, setFailed] = useState(false);
  // If the graphics chip resets (laptop sleep, a driver update, switching GPUs), the browser takes the
  // 3D context away; when it gives it back, the whole scene is rebuilt from scratch.
  const [lost, setLost] = useState(false);
  const [rebuild, setRebuild] = useState(0);
  // The planet's ground and textures are baked in a worker; wait for them (usually they are ready).
  const fine = graphics === "ultra";
  const [baked, setBaked] = useState<Baked | null>(() => bakedNow(planet, fine));
  const [warming, setWarming] = useState(true);
  useEffect(() => {
    const now = bakedNow(planet, fine);
    if (now) {
      setBaked(now);
      return;
    }
    setBaked(null);
    let alive = true;
    void prebake(planet, fine).then((b) => alive && setBaked(b));
    return () => {
      alive = false;
    };
  }, [planet, fine]);

  useEffect(() => {
    const el = host.current;
    if (!el || !baked || baked.planet !== planet || baked.fine !== fine) return;
    // The scene is built in slices with short pauses between them, so the page never locks up for long.
    let alive = true;
    let teardown: (() => void) | null = null;
    setWarming(true);
    void (async () => {
      let renderer: THREE.WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
      } catch {
        setFailed(true);
        return;
      }
      const reduced = reduce || matchMedia("(prefers-reduced-motion: reduce)").matches;
      const touch = matchMedia("(pointer: coarse)").matches;
      let level: Level = graphics === "low" ? 0 : graphics === "ultra" ? 3 : graphics === "high" ? 2 : touch ? 1 : 2;
      let ratio = 1,
        ratioCap = Infinity,
        // Auto stepped up to Ultra's effects on a fast machine (it keeps High's resolution and ground).
        autoUp = false;
      // Sharp screens get extra resolution only up to a pixel budget, so a Retina laptop doesn't render 4 million pixels with glow.
      const pickRatio = () => {
        const area = Math.max(1, el.clientWidth * el.clientHeight);
        const lv = autoUp ? 2 : level;
        const fit = Math.sqrt((lv === 3 ? 4.2e6 : lv === 2 ? 3.2e6 : 1.8e6) / area);
        // On an ordinary (1x) screen Ultra renders at 1.5x and lets SMAA smooth the edges: 2x would cost four times the pixels.
        const top = lv === 3 ? (devicePixelRatio >= 1.5 ? 2 : 1.5) : lv === 2 ? 1.5 : lv === 1 ? 1.25 : 1;
        return Math.max(1, Math.min(devicePixelRatio, top, ratioCap, fit));
      };
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = planet === "mars" ? 1.12 : 1.32;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.domElement.className = "world-canvas";
      const debug = (window as unknown as { __astra?: Record<string, unknown> }).__astra;
      if (debug) debug.renderer = renderer;
      el.appendChild(renderer.domElement);
      renderer.domElement.addEventListener("webglcontextlost", (e) => {
        e.preventDefault();
        setLost(true);
      });
      renderer.domElement.addEventListener("webglcontextrestored", () => {
        setLost(false);
        setRebuild((n) => n + 1);
      });

      const scene = new THREE.Scene();
      scene.background = new THREE.Color("#000000");
      const camera = new THREE.PerspectiveCamera(42, 1, 0.5, 6000);
      camera.position.copy(HOME).add(OFFSET);
      // The inside of the home lives on its own layer: drawn, but never tested by clicks on the outpost.
      camera.layers.enable(INSIDE_LAYER);
      // Camera view: free look over the outpost, chase behind the rover, or the driver's seat.
      let view: View = "orbit";
      useUI.getState().setView("orbit");
      const fovFor = (v: View) => {
        // Keep the same width of world in view on tall phone screens.
        const half = THREE.MathUtils.degToRad(21);
        const base = camera.aspect >= 1.2 ? 42 : Math.min(78, THREE.MathUtils.radToDeg(2 * Math.atan((Math.tan(half) * 1.2) / camera.aspect)));
        if (v === "walk") {
          // The walking field of view is a setting; on a tall phone screen it widens to show as much side to side.
          const want = useUI.getState().settings.fov;
          return camera.aspect >= 1.2 ? want : Math.min(100, THREE.MathUtils.radToDeg(2 * Math.atan((Math.tan(THREE.MathUtils.degToRad(want / 2)) * 1.2) / camera.aspect)));
        }
        return v === "cockpit" ? Math.max(base, 62) : v === "chase" ? Math.max(base, 50) : base;
      };
      const firstPerson = (v: View) => v === "cockpit" || v === "walk";
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
      scene.environmentIntensity = planet === "moon" ? 0.42 : 0.6;
      const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: level === 3 || devicePixelRatio < 1.5 ? 4 : 2 });
      const composer = new EffectComposer(renderer, target);
      composer.addPass(new RenderPass(scene, camera));
      // Ultra: ground-truth ambient occlusion darkens creases, joints and where things meet the ground.
      const canUp = graphics === "auto" && !touch;
      let gtao: GTAOPass | null = null,
        smaa: SMAAPass | null = null;
      if (level === 3 || canUp) {
        gtao = new GTAOPass(scene, camera, 512, 512);
        gtao.updateGtaoMaterial({ radius: 0.9, distanceExponent: 1.4, thickness: 1.2, scale: 1.1, samples: 12, distanceFallOff: 1 });
        gtao.blendIntensity = 0.85;
        // Occlusion is soft and low-frequency: compute it at half resolution (about a quarter of the cost) and upsample.
        const fullSize = gtao.setSize.bind(gtao);
        gtao.setSize = (w: number, h: number) => fullSize(Math.ceil(w / 2), Math.ceil(h / 2));
        gtao.enabled = level === 3;
        composer.addPass(gtao);
      }
      // Bloom only on genuinely bright things (lamps, the Sun, screens), not on sunlit surfaces.
      const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.32, 0.38, 1.25);
      composer.addPass(bloom);
      composer.addPass(new OutputPass());
      composer.addPass(gradePass(planet));
      if (level === 3 || canUp) {
        smaa = new SMAAPass();
        smaa.enabled = level === 3;
        composer.addPass(smaa);
      }

      // Lights.
      const sun = new THREE.DirectionalLight("#fff4e2", 3);
      const shadowSize = level === 3 ? 4096 : 2048;
      sun.shadow.mapSize.set(shadowSize, shadowSize);
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
        if (gtao) gtao.enabled = level === 3;
        if (smaa) smaa.enabled = level === 3;
        renderer.shadowMap.enabled = level > 0;
        sun.castShadow = level > 0;
        renderer.shadowMap.type = level === 2 ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
        size();
      };

      // Between slices of building, let the page breathe; stop cleanly if the mission changed meanwhile.
      const slice = async () => {
        await new Promise((r) => window.setTimeout(r, 0));
        if (alive) return true;
        dispose(scene);
        env.dispose();
        composer.dispose();
        target.dispose();
        controls.dispose();
        renderer.dispose();
        renderer.domElement.remove();
        return false;
      };
      if (!(await slice())) return;

      // The world.
      const terrain = buildTerrain(baked);
      scene.add(terrain);
      scene.add(buildHorizon(baked));
      scene.add(buildRocks(baked, level > 0, level === 3));
      if (!(await slice())) return;
      const ice = buildIce(planet);
      scene.add(ice);
      const sky = buildSky(baked);
      scene.add(sky.group);
      // No air on the Moon, so no haze: distant hills stay as sharp as near ones.
      const marsFog = new THREE.FogExp2("#c99a74", 0.0024);
      scene.fog = planet === "moon" ? null : marsFog;
      const tracks = trackSystem(planet);
      scene.add(tracks.mesh);
      const dust = dustSystem(PALETTE[planet].light, planet);
      scene.add(dust.points);
      const sparks = sparkSystem();
      scene.add(sparks.points);
      const impact = impactSystem(planet);
      scene.add(impact.group);
      const streaks = stormStreaks();
      scene.add(streaks.lines);
      if (!(await slice())) return;
      const lander = buildLander(planet);
      lander.position.set(LANDER.x, terrainHeight(LANDER.x, LANDER.z, planet), LANDER.z);
      lander.rotation.y = 0.6;
      scene.add(lander);
      const dock = buildDock(planet);
      dock.position.set(DOCK.x, terrainHeight(DOCK.x, DOCK.z, planet), DOCK.z);
      scene.add(dock);

      if (!(await slice())) return;
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

      if (!(await slice())) return;
      const rover = buildRover();
      rover.group.traverse((o) => (o.userData.rover = true));
      scene.add(rover.group);
      const headlight = new THREE.SpotLight("#fff1d6", 0, 45, 0.6, 0.55, 1.2);
      headlight.position.set(0, 1.4, -2.0);
      headlight.target.position.set(0, 0, -14);
      rover.group.add(headlight, headlight.target);
      if (!(await slice())) return;
      const cockpit = buildCockpit();
      rover.body.add(cockpit.group);
      const walkers = [buildAstronaut("#ff4d5e"), buildAstronaut("#5ee0ff")];
      for (const w of walkers) {
        w.visible = false;
        scene.add(w);
      }

      // The inside of the Mars home (shown only while you walk in it, or look in from close by).
      if (!(await slice())) return;
      const insideEnv = insideEnvironment(renderer);
      const interior = buildInterior(planet);
      interior.group.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
        if (m?.isMeshStandardMaterial) m.envMap = insideEnv.texture;
      });
      const homeAt = modulePos({ pad: -1 });
      const homeOrigin = new THREE.Vector3(homeAt.x, terrainHeight(homeAt.x, homeAt.z, planet), homeAt.z);
      placeInterior(interior, homeOrigin.x, homeOrigin.y, homeOrigin.z);
      interior.group.visible = false;
      scene.add(interior.group);
      const walkCtl = walkController(renderer.domElement, planet, interior);
      const baseExposure = renderer.toneMappingExposure;
      let exposure = baseExposure,
        screensAt = -1;

      if (!(await slice())) return;
      const entries = new Map<number, Entry>();
      /** The 3D model for a module, built (or rebuilt after it moves or changes type) on demand. */
      const entryFor = (m: Module) => {
        let e = entries.get(m.id);
        if (e && e.type === m.type && e.pad === m.pad) return e;
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
        return e;
      };
      const shieldPct = { v: 0 };

      function size() {
        const w = el!.clientWidth,
          h = el!.clientHeight;
        ratio = pickRatio();
        renderer.setPixelRatio(ratio);
        composer.setPixelRatio(ratio);
        renderer.setSize(w, h, false);
        composer.setSize(w, h);
        camera.aspect = w / Math.max(1, h);
        camera.fov = fovFor(view);
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
        if (!down || e.button !== 0 || view === "walk") return;
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
        if (now - hoverAt < 60 || e.buttons || view === "walk") return;
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

      // Camera rig. "orbit" is free look over the outpost; "chase" rides behind the rover and turns
      // with it (drag to look from any side, it keeps that angle); "cockpit" is the driver's seat.
      // Switching views glides between them.
      const goal = HOME.clone();
      let follow = false,
        lastCam = useUI.getState().camera.n,
        wasDocked = useGame.getState().game.rover.docked,
        blend = 1,
        fromFov = camera.fov,
        interacting = false,
        touchedAt = -10,
        lookAt = -10;
      const orbitOffset = OFFSET.clone();
      const chase = { yaw: 0, polar: 1.2, dist: 13 };
      const look = { yaw: 0, pitch: -0.06 };
      const fromPos = new THREE.Vector3(),
        fromQuat = new THREE.Quaternion(),
        toPos = new THREE.Vector3(),
        toTarget = new THREE.Vector3(),
        toQuat = new THREE.Quaternion(),
        roverTarget = new THREE.Vector3(),
        offset = new THREE.Vector3(),
        sph = new THREE.Spherical(),
        lookMatrix = new THREE.Matrix4(),
        lookQuat = new THREE.Quaternion(),
        lookEuler = new THREE.Euler(0, 0, 0, "YXZ");
      const UP = new THREE.Vector3(0, 1, 0);
      const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
      controls.addEventListener("start", () => {
        interacting = true;
        if (view === "orbit" && !follow) goal.copy(controls.target);
        useUI.getState().noteLook();
      });
      controls.addEventListener("end", () => {
        interacting = false;
        touchedAt = clock;
      });
      scene3d.lookAt = (x, z) => {
        setView("orbit");
        follow = false;
        goal.set(x, 0, z);
      };
      function setView(next: View) {
        if (useUI.getState().view !== next) useUI.getState().setView(next);
        if (next === view) return;
        const prev = view;
        if (view === "orbit" && blend >= 1) orbitOffset.copy(camera.position).sub(controls.target);
        fromPos.copy(camera.position);
        fromQuat.copy(camera.quaternion);
        fromFov = camera.fov;
        blend = 0;
        view = next;
        controls.enabled = false;
        if (next === "chase") Object.assign(chase, { yaw: 0, polar: 1.2, dist: 13 });
        if (next === "cockpit") Object.assign(look, { yaw: 0, pitch: -0.06 });
        if (next === "orbit") follow = reduced && !useGame.getState().game.rover.docked;
        controls.minDistance = next === "chase" ? 5 : 10;
        controls.maxDistance = next === "chase" ? 70 : 260;
        camera.near = next === "cockpit" ? 0.04 : next === "walk" ? 0.05 : 0.5;
        camera.far = next === "cockpit" ? 3400 : 6000;
        camera.updateProjectionMatrix();
        // Stepping inside cuts straight to the walker's eyes (the screen fades through black); stepping back out
        // starts the glide from just outside the airlock rather than through the walls.
        if (next === "walk") blend = 1;
        else if (prev === "walk") {
          fromPos.copy(homeOrigin).add(offset.set(0, 3.2, 9.5));
          fromQuat.setFromRotationMatrix(lookMatrix.lookAt(fromPos, homeOrigin, UP));
        }
      }
      // Looking around from the driver's seat.
      let lookFrom: { x: number; y: number } | null = null;
      const onLookDown = (e: PointerEvent) => {
        if (view === "cockpit") lookFrom = { x: e.clientX, y: e.clientY };
      };
      const onLookMove = (e: PointerEvent) => {
        if (view !== "cockpit" || !lookFrom || !e.buttons) return;
        look.yaw = THREE.MathUtils.clamp(look.yaw - (e.clientX - lookFrom.x) * 0.005, -2.6, 2.6);
        look.pitch = THREE.MathUtils.clamp(look.pitch - (e.clientY - lookFrom.y) * 0.005, -0.9, 0.7);
        lookFrom = { x: e.clientX, y: e.clientY };
        lookAt = clock;
        useUI.getState().noteLook();
      };
      const onLookUp = () => {
        lookFrom = null;
      };
      renderer.domElement.addEventListener("pointerdown", onLookDown);
      window.addEventListener("pointermove", onLookMove);
      window.addEventListener("pointerup", onLookUp);

      const runCamera = (g: GameState, dt: number) => {
        const ui = useUI.getState();
        if (ui.view !== view) setView(ui.view);
        const rv = g.rover;
        const c = ui.camera;
        if (c.n !== lastCam) {
          lastCam = c.n;
          const off = camera.position.clone().sub(controls.target);
          if (c.cmd === "base" || c.cmd === "reset") {
            setView("orbit");
            follow = false;
            goal.copy(HOME);
            if (c.cmd === "reset") {
              orbitOffset.copy(OFFSET);
              if (blend >= 1) camera.position.copy(controls.target).add(OFFSET);
            }
          } else if (c.cmd === "rover") setView("chase");
          else if (c.cmd === "in" || c.cmd === "out") {
            if (view === "chase") chase.dist = THREE.MathUtils.clamp(chase.dist * (c.cmd === "in" ? 0.75 : 1.33), 5, 70);
            else if (view === "orbit") {
              off.multiplyScalar(c.cmd === "in" ? 0.75 : 1.33);
              const len = THREE.MathUtils.clamp(off.length(), controls.minDistance, controls.maxDistance);
              camera.position.copy(controls.target).add(off.setLength(len));
            }
          } else if (c.cmd === "left" || c.cmd === "right") {
            const turn = c.cmd === "left" ? -Math.PI / 5 : Math.PI / 5;
            if (view === "chase") chase.yaw = wrap(chase.yaw + turn);
            else if (view === "cockpit") look.yaw = THREE.MathUtils.clamp(look.yaw - turn, -2.6, 2.6);
            else if (view === "walk") walker.yaw += turn;
            else {
              off.applyAxisAngle(UP, turn);
              camera.position.copy(controls.target).add(off);
            }
          } else if (c.cmd === "focus") {
            const sel = ui.selected;
            const m = sel?.kind === "module" ? g.modules.find((x) => x.id === sel.id) : null;
            if (m) {
              setView("orbit");
              follow = false;
              const p = modulePos(m);
              goal.set(p.x, 0, p.z);
            }
          }
        }
        // Leaving the dock: ride behind the rover. Back home: look over the outpost again.
        if (rv.docked !== wasDocked) {
          wasDocked = rv.docked;
          if (!rv.docked && view === "orbit") {
            if (reduced) follow = true;
            else setView("chase");
          } else if (rv.docked && !firstPerson(view)) {
            setView("orbit");
            follow = false;
            goal.copy(HOME);
          }
        }
        roverTarget.copy(rover.group.position);
        roverTarget.y += 1.8;
        const moving = Math.abs(rv.speed) > 3;

        // Where the current view wants the camera.
        if (view === "orbit") {
          if (follow) goal.set(rv.x, 0, rv.z);
          toTarget.copy(goal);
          toPos.copy(goal).add(orbitOffset);
        } else if (view === "chase") {
          toTarget.copy(roverTarget);
          sph.set(chase.dist, chase.polar, rv.heading + chase.yaw);
          toPos.copy(roverTarget).add(offset.setFromSpherical(sph));
        } else if (view === "walk") {
          walkCtl.eye(homeOrigin, toPos, toQuat, reduced);
          toTarget.copy(toPos);
          // (The field of view is a setting, so it can change while you walk.)
          const fov = fovFor("walk");
          if (Math.abs(camera.fov - fov) > 0.01) {
            camera.fov = fov;
            camera.updateProjectionMatrix();
          }
        } else {
          // The driver's view turns back to the road while driving, unless you are looking around.
          if (moving && !lookFrom && clock - lookAt > 2.5 && !reduced) {
            const k = 1 - Math.exp(-dt * 1.2);
            look.yaw += (0 - look.yaw) * k;
            look.pitch += (-0.06 - look.pitch) * k;
          }
          rover.group.updateMatrixWorld(true);
          toPos.copy(EYE).applyMatrix4(rover.body.matrixWorld);
          rover.body.getWorldQuaternion(toQuat);
          lookEuler.set(look.pitch, look.yaw, 0);
          toQuat.multiply(lookQuat.setFromEuler(lookEuler));
          toTarget.copy(roverTarget);
        }

        // Gliding from the last view to this one.
        if (blend < 1) {
          blend = Math.min(1, blend + dt / (reduced ? 0.05 : 0.9));
          const e = blend * blend * (3 - 2 * blend);
          if (!firstPerson(view)) toQuat.setFromRotationMatrix(lookMatrix.lookAt(toPos, toTarget, UP));
          camera.position.lerpVectors(fromPos, toPos, e);
          camera.quaternion.slerpQuaternions(fromQuat, toQuat, e);
          camera.fov = fromFov + (fovFor(view) - fromFov) * e;
          camera.updateProjectionMatrix();
          if (blend >= 1) {
            controls.target.copy(toTarget);
            if (!firstPerson(view)) {
              camera.position.copy(toPos);
              controls.enabled = true;
              controls.update();
            }
          }
          return;
        }

        if (view === "orbit") {
          const before = controls.target.clone();
          controls.target.lerp(goal, reduced ? 1 : 1 - Math.exp(-dt * 5));
          controls.target.y = 0;
          camera.position.add(controls.target.clone().sub(before));
          controls.update();
        } else if (view === "chase") {
          camera.position.add(offset.copy(roverTarget).sub(controls.target));
          controls.target.copy(roverTarget);
          const busy = interacting || clock - touchedAt < 0.8;
          if (!busy) {
            // Swing round behind the rover as it turns (and drift back behind it after a while).
            if (moving && clock - touchedAt > 3) chase.yaw *= Math.max(0, 1 - dt * 0.7);
            sph.setFromVector3(offset.copy(camera.position).sub(roverTarget));
            const k = reduced ? 1 : 1 - Math.exp(-dt * 4);
            sph.theta += wrap(rv.heading + chase.yaw - sph.theta) * k;
            sph.phi += (chase.polar - sph.phi) * k;
            sph.radius += (chase.dist - sph.radius) * k;
            camera.position.copy(roverTarget).add(offset.setFromSpherical(sph));
          }
          controls.update();
          if (busy) {
            sph.setFromVector3(offset.copy(camera.position).sub(roverTarget));
            chase.yaw = wrap(sph.theta - rv.heading);
            chase.polar = sph.phi;
            chase.dist = sph.radius;
          }
        } else {
          camera.position.copy(toPos);
          camera.quaternion.copy(toQuat);
          // (The shadows centre on the target: on the walker, inside.)
          controls.target.copy(view === "walk" ? toPos : roverTarget);
        }
        // Keep the camera above the ground, and lift it over buildings instead of passing through them.
        if (!firstPerson(view)) {
          let floor = terrainHeight(camera.position.x, camera.position.z, planet) + (view === "chase" ? 1.2 : 2.5);
          if (view === "chase")
            for (const e of entries.values()) {
              const p = e.view.group.position;
              const d = Math.hypot(camera.position.x - p.x, camera.position.z - p.z);
              const r = FOOTPRINT[e.type] + 1.2;
              if (d < r) floor = Math.max(floor, p.y + e.view.top + 1.2 * (1 - d / r) + 0.6);
            }
          if (camera.position.y < floor) {
            camera.position.y += (floor - camera.position.y) * (blend < 1 ? 1 : Math.min(1, dt * 10));
            camera.lookAt(controls.target);
          }
        }
      };

      /** What the dashboard screens show. */
      const cockpitData = (st: ReturnType<typeof useGame.getState>, storm: boolean, dust: boolean, dark: boolean): CockpitData => {
        const g = st.game,
          rv = g.rover;
        const end = st.route[st.route.length - 1];
        const site = st.target && st.target !== "dock" && st.target !== "point" ? SITES.find((s) => s.id === st.target) : null;
        const dest = st.target === "dock" ? { name: "Home dock", x: DOCK.x, z: DOCK.z } : site ? { name: site.name[planet], x: site.x, z: site.z } : end ? { name: "Marked spot", x: end.x, z: end.z } : null;
        return {
          planet,
          battery: rv.battery,
          speed: rv.speed / ROVER.maxSpeed,
          heading: rv.heading,
          mode: rv.task ? "working" : rv.docked ? "parked" : st.route.length ? "auto" : Math.abs(rv.speed) > 0.5 ? "manual" : "parked",
          target: dest ? { name: dest.name, dx: dest.x - rv.x, dz: dest.z - rv.z } : null,
          sites: SITES.map((s) => ({
            dx: s.x - rv.x,
            dz: s.z - rv.z,
            color: SITE_COLOR[s.kind],
            done: s.kind === "science" && (g.stats.sites.includes(s.id) || rv.cargo.samples.includes(s.id)),
          })),
          dock: { dx: DOCK.x - rv.x, dz: DOCK.z - rv.z },
          cargo: { water: rv.cargo.water, materials: rv.cargo.materials, samples: rv.cargo.samples.length },
          clock: `${planet === "mars" ? "Sol" : "Day"} ${dayOf(g.t)} · ${clockOf(g.t)}`,
          day: isDaytime(planet, g.t),
          storm,
          dust,
          crater: inShadow(rv.x, rv.z),
          lights: dark,
        };
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
        ambienceAt = 0,
        smooth = 1 / 60,
        steady = 0,
        triedUp = false,
        warm = 0,
        geigerAt = 0,
        dustLevel = 0,
        stormLevel = 0,
        sparkAt = 0;
      let drawnAt = 0,
        panelAt = 0;
      const shift = new THREE.Vector2(),
        shiftWant = new THREE.Vector2();
      const roverPos = new THREE.Vector3(DOCK.x, 0, DOCK.z);
      const wheelAt = new THREE.Vector3();
      const trackFrom = new THREE.Vector3(DOCK.x, 0, DOCK.z);
      const fogDay = new THREE.Color();
      const lightBasis = new THREE.Matrix4(),
        lightInverse = new THREE.Matrix4(),
        snapped = new THREE.Vector3(),
        ORIGIN = new THREE.Vector3(),
        UP_AXIS = new THREE.Vector3(0, 1, 0);
      /** Warm-up stage while the landing screen is up: 0 no shadows or glow, 1 shadows, 2 glow, 3 running. */
      let warmStage = 3;
      const frame = (now: number) => {
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;
        clock += dt;
        warm += dt;
        // Adaptive quality on "auto": drop resolution, then the glow, then shadows on slow machines.
        if (graphics === "auto" && warm > 4 && !document.hidden) {
          slow = dt > 0.045 ? slow + dt : Math.max(0, slow - dt * 0.5);
          // Smooth and steady on a desktop (every frame on time, nothing dropped for 8 s): try Ultra's
          // ambient occlusion and edge smoothing, once. If that makes frames late, step straight back.
          const shown = !(useUI.getState().briefing || useUI.getState().modal);
          smooth += (dt - smooth) * 0.05;
          steady = shown && dt < 0.0185 ? steady + dt : 0;
          if (canUp && !triedUp && level === 2 && ratioCap === Infinity && steady > 8) {
            triedUp = true;
            autoUp = true;
            level = 3;
            applyLevel();
          }
          if (autoUp && level === 3 && shown && smooth > 0.021) {
            autoUp = false;
            level = 2;
            applyLevel();
          }
          if (slow > 2.5 && level > 0) {
            slow = 0;
            if (level === 3 && autoUp) {
              autoUp = false;
              level = 2;
              applyLevel();
            } else if (level === 2 && ratio > 1.01) {
              ratioCap = 1;
              size();
            } else {
              level = (level - 1) as Level;
              applyLevel();
            }
          }
        }
        const st = useGame.getState();
        const ui = useUI.getState();
        // Behind a full-screen card (briefing, debrief, menus) a few frames a second is plenty.
        if (warmStage === 3 && (ui.briefing || ui.debrief || ui.modal) && now - drawnAt < 90) return;
        drawnAt = now;
        // An open side panel covers part of the view: shift the picture so the outpost stays in the clear part.
        if (now - panelAt > 200) {
          panelAt = now;
          shiftWant.set(0, 0);
          const drawer = firstPerson(view) ? null : el.querySelector<HTMLElement>(".drawer") ?? document.querySelector<HTMLElement>(".game.drawer-open .drawer");
          if (drawer) {
            const r = drawer.getBoundingClientRect(),
              box = el.getBoundingClientRect();
            if (r.width < box.width * 0.75 && r.left > box.width * 0.3) shiftWant.x = (box.right - r.left) / 2;
            else if (r.top > box.height * 0.25) shiftWant.y = (box.bottom - r.top) / 2;
          }
        }
        shift.lerp(shiftWant, reduced ? 1 : Math.min(1, dt * 6));
        const vw = el.clientWidth,
          vh = el.clientHeight;
        if (Math.abs(shift.x) > 0.5 || Math.abs(shift.y) > 0.5) camera.setViewOffset(vw, vh, shift.x, shift.y, vw, vh);
        else if (camera.view?.enabled) camera.clearViewOffset();
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
        // Shadows cover what the camera can see.
        const half = THREE.MathUtils.clamp(reach * 0.8, 30, 130);
        if (Math.abs(half - shadowHalf) > 4) {
          shadowHalf = half;
          Object.assign(sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half });
          sun.shadow.camera.updateProjectionMatrix();
        }
        // Snap the shadow camera to whole shadow-map texels, so shadow edges don't shimmer as the view moves.
        const texel = (2 * shadowHalf) / shadowSize;
        lightBasis.lookAt(dir, ORIGIN, UP_AXIS);
        snapped.copy(controls.target).applyMatrix4(lightInverse.copy(lightBasis).invert());
        snapped.set(Math.round(snapped.x / texel) * texel, Math.round(snapped.y / texel) * texel, snapped.z).applyMatrix4(lightBasis);
        sun.target.position.copy(snapped);
        sun.position.copy(snapped).addScaledVector(dir, 260);
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
        // Radiation is invisible: storms are shown by the interface, not painted on the sky.
        sky.update(camera, dir, { day, dust: dustLevel, storm: 0, time: clock, pixelRatio: ratio });
        scene.environmentIntensity = (planet === "moon" ? 0.42 : 0.6) * (0.35 + 0.65 * day);


        // Modules.
        const live = new Set<number>();
        const meteor = g.feed.slice(-3).some((x) => x.text.startsWith("Meteorite"));
        for (const m of g.modules) {
          live.add(m.id);
          const e = entryFor(m);
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
          // Calm when all is well; amber breathes, red blinks (so the state shows by more than colour).
          e.view.status.emissiveIntensity = damaged
            ? Math.sin(clock * 8) > 0 ? 3.5 : 0.4
            : lamp === "#3ee39a" ? 0.9 : lamp === "#5b6375" ? 0.2 : 1.4 + (reduced ? 0 : Math.sin(clock * 2.5) * 0.6);
          const power = m.type === "greenhouse" ? (m.light / 2) * r : r;
          for (const gm of e.view.glow) gm.emissiveIntensity = 0.08 + power * 1.9 * (gm.userData.glow ?? 1) * (m.type === "oxygen" ? 0.7 + Math.sin(clock * 3) * 0.3 : 1);
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
            e.view.shieldProgress?.(shieldDone(g) ? 1 : shieldPct.v);
          }
          if (e.cable) {
            const flowing = m.type === "solar" || m.type === "reactor" ? working && f.gen > 0.05 : working && r > 0.05 && f.ratio[m.id] !== undefined;
            e.cable.flow.emissiveIntensity = flowing ? 0.7 : 0.02;
            e.cable.flow.opacity = flowing ? 0.6 : 0.08;
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
        if (moved < 12) for (const w of rover.wheels) w.rotation.x -= (moved / 0.478) * Math.sign(rv.speed || 1);
        // Each wheel follows the ground under it: the suspension soaks up what the body's tilt doesn't.
        rover.group.updateMatrixWorld();
        for (const w of rover.wheels) {
          wheelAt.set(w.position.x, rover.wheelY, w.position.z).applyMatrix4(rover.group.matrixWorld);
          const lift = THREE.MathUtils.clamp(terrainHeight(wheelAt.x, wheelAt.z, planet) - (wheelAt.y - rover.wheelY), -0.16, 0.16);
          w.position.y += (rover.wheelY + lift - w.position.y) * Math.min(1, dt * 12);
        }
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
          for (const side of [-1, 1]) {
            // A spray from each rear wheel: on the Moon a ballistic "rooster tail", on Mars a puff that hangs.
            const wx = rv.x - fx * 1.5 + Math.cos(rv.heading) * side * 1.2,
              wz = rv.z - fz * 1.5 - Math.sin(rv.heading) * side * 1.2;
            const kick = Math.min(1, Math.abs(rv.speed) / ROVER.maxSpeed);
            for (let i = 0; i < (planet === "moon" ? 3 : 1); i++)
              dust.emit(wx, ground + 0.15, wz, -fx * kick * 2.2, planet === "moon" ? 1.2 + kick * 1.6 : 0.8, -fz * kick * 2.2, planet === "moon" ? 0.9 : 1.4, 1, planet === "moon" ? 1.1 : 0.8);
          }
        if (dustLevel > 0.3 && !reduced)
          for (let i = 0; i < 3; i++) dust.emit(controls.target.x - 45 + Math.random() * 14, 0.5 + Math.random() * 8, controls.target.z - 40 + Math.random() * 60, 20, 0.2, 2, 2, 3, 0.45);
        dust.update(dt, planet === "mars" ? 1.5 + dustLevel * 9 : 0);
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
          w.position.y += poseAstronaut(w, reduced ? 0 : clock, walking || (reduced && (k < 0.34 || k > 0.75)), planet, i * 1.7);
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
          // Beams fade as you drive up to them, so they never block the view.
          const near = THREE.MathUtils.smoothstep(camera.position.distanceTo(mk.group.position), 10, 45);
          mk.beamMat.opacity = (hot ? 0.95 : 0.5) * near;
          mk.pool.opacity = done ? 0.1 : hot ? 0.55 : 0.3;
          mk.lamp.emissiveIntensity = done ? 0.5 : (clock * 0.7 + mk.site.x) % 1 < 0.15 ? 6 : 1.5;
          mk.ring.rotation.z += dt * (hot ? 0.8 : 0.25);
        }
        const glints = ice.userData.glints as THREE.Points;
        (glints.material as THREE.PointsMaterial).opacity = 0.55 + Math.sin(clock * 3) * 0.3;

        // Storm effects and Geiger clicks.
        streaks.update(clock, controls.target.x, controls.target.z, 0);
        if (storm && ui.settings.sound && !st.paused) {
          const exposed = !g.sheltering || !rv.docked;
          geigerAt -= dt;
          if (geigerAt <= 0) {
            tick();
            geigerAt = (exposed ? 0.05 : 0.35) + Math.random() * (exposed ? 0.15 : 0.6);
          }
        }

        // Background sound: life support, Martian wind, the rover's motors.
        if (clock - ambienceAt > 0.2) {
          ambienceAt = clock;
          const walking = view === "walk";
          ambience({ on: true, planet, dust: dustLevel, drive: st.paused ? 0 : Math.min(1, Math.abs(rv.speed) / ROVER.maxSpeed), time: clock, inside: walking && !walker.outside, suit: walking && !!g.eva });
        }
        // The rover's body rocks a little over the ground as it drives.
        const bump = reduced ? 0 : Math.min(1, Math.abs(rv.speed) / ROVER.maxSpeed);
        rover.body.position.y = (Math.sin(clock * 11) * 0.018 + Math.sin(clock * 4.3 + 1) * 0.012) * bump;
        rover.body.rotation.z = Math.sin(clock * 6.1) * 0.008 * bump;
        rover.body.rotation.x = Math.sin(clock * 3.7) * 0.006 * bump;

        // What the inside shows (lights, alarms, shelves) follows the mission, while you're in or near it.
        const homeState = view === "walk" || interior.group.visible ? interiorState(g) : null;
        walkCtl.update(dt, view === "walk", !!(ui.modal || ui.briefing || ui.debrief || st.alert || g.choice), homeState);
        runCamera(g, dt);
        // The inside is drawn while you walk in it or look in from close by; the windows' night glow stands in for it from further off.
        const near = view === "walk" || camera.position.distanceTo(homeOrigin) < 24;
        interior.group.visible = near;
        if (near && homeState) {
          interior.apply(homeState, dt, clock, reduced);
          // Screens inside redraw a few times a second (in a blackout only life support's stay on).
          if (clock - screensAt > 0.33) {
            screensAt = clock;
            interior.redraw({ ...screenData(g), essentialOnly: homeState.screens === "essential" });
          }
        }
        const home = g.modules.find((m) => m.type === "habitat");
        for (const w of (home && entries.get(home.id)?.view.windowGlow) || []) w.visible = !near;
        // Eyes adjust between the sunlit outdoors and the lit rooms inside (about half a second).
        const wantExposure = baseExposure * (view === "walk" ? 1.0 : 1);
        exposure += (wantExposure - exposure) * (1 - Math.exp(-dt / 0.5));
        renderer.toneMappingExposure = exposure;
        const inside = view === "cockpit" && blend > 0.55;
        cockpit.group.visible = view === "cockpit" && blend > 0.3;
        for (const pane of rover.glass) pane.visible = !inside;
        if (cockpit.group.visible) cockpit.update(cockpitData(st, !!storm, !!dustStorm, dark), clock);
        const facing = camera.getWorldDirection(v);
        scene3d.view.x = controls.target.x;
        scene3d.view.z = controls.target.z;
        scene3d.view.heading = Math.atan2(facing.x, -facing.z);
        scene3d.view.distance = reach;
        scene3d.view.fov = THREE.MathUtils.degToRad(camera.fov) * camera.aspect;

        // Anchors for HTML overlays.
        for (const s of SITES) project(`site:${s.id}`, s.x, terrainHeight(s.x, s.z, planet) + 4.6, s.z);
        for (const e of entries.values()) {
          const p = e.view.group.position;
          project(`module:${e.id}`, p.x, p.y + e.view.top + 0.9, p.z);
        }
        for (const p of PADS) project(`pad:${p.id}`, p.x, terrainHeight(p.x, p.z, planet) + 0.6, p.z);
        if (inside) {
          for (const k of ["rover", "rover-body"]) {
            const a = anchors.get(k);
            if (a) a.visible = false;
            const f = followers.get(k);
            if (f) f.dataset.visible = "0";
          }
        } else {
          project("rover", rv.x, ground + 3.6, rv.z);
          project("rover-body", rv.x, ground + 1.4, rv.z);
        }
        project("dock", DOCK.x, terrainHeight(DOCK.x, DOCK.z, planet) + 0.5, DOCK.z);
        project("habitat", 0, 4.2, 0);
        project("crater", CRATER.x, terrainHeight(CRATER.x, CRATER.z, planet) + 2, CRATER.z);

        if (warmStage < 2) {
          // Warm-up frames draw where real frames will (into the composer's buffer on High and Ultra), so the shaders they compile are the ones used.
          renderer.setRenderTarget(level > 0 ? target : null);
          if (warmStage === 0) renderer.shadowMap.autoUpdate = false;
          renderer.render(scene, camera);
          renderer.shadowMap.autoUpdate = true;
          renderer.setRenderTarget(null);
        } else if (level === 0) renderer.render(scene, camera);
        else composer.render(dt);
      };
      const loop = (now: number) => {
        raf = requestAnimationFrame(loop);
        frame(now);
      };
      if (debug) {
        // Test hooks (?debug only): place the overview camera exactly, and grab a frame as an image.
        debug.place = (pos: [number, number, number], at: [number, number, number]) => {
          setView("orbit");
          blend = 1;
          follow = false;
          goal.set(at[0], 0, at[2]);
          controls.target.set(...at);
          camera.position.set(...pos);
          controls.enabled = true;
          controls.update();
        };
        debug.view = (v: View) => {
          setView(v);
          blend = 0.999;
        };
        // Stand somewhere inside the home (habitat-local metres, a floor, a facing and a tilt in degrees).
        debug.walk = (x: number, z: number, level: 0 | 1, yaw = 0, pitch = 0) => {
          if (useUI.getState().view !== "walk") useUI.getState().setView("walk");
          setView("walk");
          Object.assign(walker, { x, z, where: level, yaw: THREE.MathUtils.degToRad(yaw), pitch: THREE.MathUtils.degToRad(pitch), vx: 0, vz: 0 });
        };
        debug.interior = interior;
        debug.camera = camera;
        debug.walker = walker;
        // A 1.75 m figure for judging scale in review shots (habitat-local, a floor, facing a bearing); null hides it.
        let figure: THREE.Object3D | null = null;
        debug.figure = (x: number | null, z = 0, level: 0 | 1 = 0, yaw = 0) => {
          if (!figure) {
            figure = scaleFigure();
            interior.group.add(figure);
          }
          figure.visible = x !== null;
          if (x !== null) {
            figure.position.set(x, HOME_PLAN.floor[level], z);
            figure.rotation.y = -THREE.MathUtils.degToRad(yaw);
          }
        };
        // What the middle of the view is looking at, inside the home (habitat-local point and the surface's colour).
        debug.probe = (sx = 0, sy = 0) => {
          const r = new THREE.Raycaster();
          r.layers.enableAll();
          r.setFromCamera(new THREE.Vector2(sx, sy), camera);
          const hit = r.intersectObjects([interior.group], true)[0];
          if (!hit) return null;
          const p = hit.point.clone().sub(homeOrigin);
          const m = hit.object as THREE.Mesh;
          return { d: +hit.distance.toFixed(2), x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2), r: +Math.hypot(p.x, p.z).toFixed(2), b: +((Math.atan2(p.x, -p.z) * 180) / Math.PI + 360).toFixed(1) % 360, color: (m.material as THREE.MeshStandardMaterial).color?.getHexString(), name: m.name || m.parent?.name };
        };
        debug.snap = (frames = 1) => {
          for (let i = 0; i < frames; i++) frame(performance.now());
          return renderer.domElement.toDataURL("image/jpeg", 0.9);
        };
        debug.scene = scene;
        debug.composer = composer;
      }
      // The buildings already standing at the start, one slice at a time.
      for (const m of useGame.getState().game.modules) {
        if (!(await slice())) return;
        entryFor(m);
      }
      // The glow pass's own shaders, so they can compile alongside the scene's.
      const glowShaders = new THREE.Scene();
      const quad = new THREE.PlaneGeometry(2, 2);
      for (const mat of [bloom.materialHighPassFilter, ...bloom.separableBlurMaterials, bloom.compositeMaterial, bloom.blendMaterial]) {
        const mesh = new THREE.Mesh(quad, mat);
        mesh.frustumCulled = false;
        glowShaders.add(mesh);
      }
      // Compile the shaders (in parallel where the browser can), then draw three warm-up frames, one
      // pause apart, that compile the rest (shadows, glow) while the landing screen is up.
      // Compile for the buffer the scene is really drawn into: a shader drawn off-screen (no tone mapping, linear colour)
      // is a different program from one drawn straight to the screen, and compiling the wrong one costs a freeze later.
      renderer.setRenderTarget(level > 0 ? target : null);
      const compiling = Promise.all([renderer.compileAsync(scene, camera), level > 0 ? renderer.compileAsync(glowShaders, camera) : null]);
      renderer.setRenderTarget(null);
      compiling
        .catch(() => undefined)
        .finally(async () => {
          for (const stage of [0, 1, 2]) {
            if (!alive) return;
            warmStage = stage;
            // Auto may switch on Ultra's effects later: compile them now, on the glow frame, so that switch never stalls.
            const preview = stage === 2 && canUp && level === 2 && gtao && smaa;
            if (preview) gtao!.enabled = smaa!.enabled = true;
            frame(performance.now());
            if (preview) gtao!.enabled = smaa!.enabled = false;
            await new Promise((r) => window.setTimeout(r, 0));
          }
          quad.dispose();
          if (!alive) return;
          warmStage = 3;
          raf = requestAnimationFrame(loop);
          setWarming(false);
        });

      teardown = () => {
        ambience({ on: false, planet, dust: 0, drive: 0, time: 0 });
        cancelAnimationFrame(raf);
        ro.disconnect();
        renderer.domElement.removeEventListener("pointerdown", onDown);
        renderer.domElement.removeEventListener("pointerup", onUp);
        renderer.domElement.removeEventListener("pointermove", onMove);
        renderer.domElement.removeEventListener("pointerdown", onLookDown);
        window.removeEventListener("pointermove", onLookMove);
        window.removeEventListener("pointerup", onLookUp);
        controls.dispose();
        walkCtl.dispose();
        interior.dispose();
        insideEnv.dispose();
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
    })();
    return () => {
      alive = false;
      teardown?.();
    };
  }, [planet, key, reduce, graphics, baked, rebuild]);

  return (
    <div ref={host} className="world">
      {(!baked || warming || lost) && !failed && (
        <div className="world-loading" role="status">
          <span className="world-loading-dot" aria-hidden="true" />
          {lost ? "Restarting the 3D view…" : `Landing on ${planet === "mars" ? "Mars" : "the Moon"}…`}
        </div>
      )}
      {failed && (
        <div className="world-fallback">
          <b>3D view unavailable</b>
          <span>Your browser couldn't start WebGL. You can still run the outpost with the panels below.</span>
        </div>
      )}
    </div>
  );
}
