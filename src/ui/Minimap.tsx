import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Map as MapIcon } from "lucide-react";
import { MODULES } from "../sim/modules";
import { modulePos } from "../sim/rover";
import type { Planet } from "../sim/types";
import { DOCK, LANDER, SITES } from "../sim/world";
import { MAP_SPAN, RELIEF_SIZE } from "../scene/bake";
import { anyBaked } from "../scene/prebake";
import { scene3d } from "../scene/anchors";
import { SITE_COLOR } from "../scene/effects";
import { useGame } from "../state/game";
import { useUI } from "../state/ui";
import { play } from "../lib/sound";

const SPAN = MAP_SPAN;
const CSS = 196; // map size on screen, CSS pixels

/** The shaded relief of the area (baked with the planet), as a canvas. */
const reliefs = new Map<Planet, HTMLCanvasElement>();
function relief(planet: Planet) {
  const cached = reliefs.get(planet);
  if (cached) return cached;
  const baked = anyBaked(planet);
  if (!baked) return null;
  const c = document.createElement("canvas");
  c.width = c.height = RELIEF_SIZE;
  const img = new ImageData(new Uint8ClampedArray(baked.relief), RELIEF_SIZE, RELIEF_SIZE);
  c.getContext("2d")!.putImageData(img, 0, 0);
  reliefs.set(planet, c);
  return c;
}

const toMap = (v: number) => ((v + SPAN) / (SPAN * 2)) * CSS;
const toWorld = (p: number) => (p / CSS) * SPAN * 2 - SPAN;

/** The map in the corner: the whole area, the rover, sites and where the camera is looking. */
export function Minimap() {
  const show = useUI((s) => s.settings.minimap);
  const [open, setOpen] = useState(() => matchMedia("(min-height: 640px)").matches);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = canvas.current;
    if (!cv || !open || !show) return;
    const dpr = Math.min(2, devicePixelRatio || 1);
    cv.width = cv.height = CSS * dpr;
    const ctx = cv.getContext("2d")!;
    let raf = 0,
      last = 0;
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (now - last < 66) return;
      last = now;
      const st = useGame.getState(),
        g = st.game,
        ui = useUI.getState();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = true;
      const map = relief(g.planet);
      if (map) ctx.drawImage(map, 0, 0, CSS, CSS);
      else {
        ctx.fillStyle = "#0b1226";
        ctx.fillRect(0, 0, CSS, CSS);
      }
      // Range rings every 50 m around the outpost.
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.lineWidth = 1;
      for (const r of [50, 100]) {
        ctx.beginPath();
        ctx.arc(toMap(0), toMap(0), (r / (SPAN * 2)) * CSS, 0, Math.PI * 2);
        ctx.stroke();
      }
      // What the camera sees.
      const v = scene3d.view;
      ctx.save();
      ctx.translate(toMap(v.x), toMap(v.z));
      ctx.rotate(v.heading);
      const w = (Math.min(260, v.distance) * 1.1 * CSS) / (SPAN * 2),
        d = (Math.min(260, v.distance) * 0.8 * CSS) / (SPAN * 2);
      ctx.fillStyle = "rgba(160,190,255,0.14)";
      ctx.strokeStyle = "rgba(190,210,255,0.7)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-w * 0.35, d * 0.6);
      ctx.lineTo(w * 0.35, d * 0.6);
      ctx.lineTo(w * 0.6, -d * 0.6);
      ctx.lineTo(-w * 0.6, -d * 0.6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      // The lander and the dock.
      ctx.fillStyle = "#c9ced8";
      ctx.beginPath();
      ctx.moveTo(toMap(LANDER.x), toMap(LANDER.z) - 4);
      ctx.lineTo(toMap(LANDER.x) + 4, toMap(LANDER.z) + 3);
      ctx.lineTo(toMap(LANDER.x) - 4, toMap(LANDER.z) + 3);
      ctx.fill();
      ctx.fillStyle = "#ffc94a";
      ctx.fillRect(toMap(DOCK.x) - 2.5, toMap(DOCK.z) - 2.5, 5, 5);
      // Modules.
      for (const m of g.modules) {
        const p = modulePos(m);
        const s = m.type === "habitat" ? 7 : 4.5;
        ctx.fillStyle = m.type === "habitat" ? "#ffffff" : MODULES[m.type].color;
        ctx.strokeStyle = "rgba(0,0,0,0.6)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        if (m.type === "habitat") ctx.arc(toMap(p.x), toMap(p.z), s / 2, 0, Math.PI * 2);
        else ctx.rect(toMap(p.x) - s / 2, toMap(p.z) - s / 2, s, s);
        ctx.fill();
        ctx.stroke();
      }
      // Sites.
      const sel = ui.selected?.kind === "site" ? ui.selected.id : st.target;
      for (const s of SITES) {
        const done = s.kind === "science" && (g.stats.sites.includes(s.id) || g.rover.cargo.samples.includes(s.id));
        const x = toMap(s.x),
          y = toMap(s.z);
        ctx.beginPath();
        ctx.arc(x, y, sel === s.id ? 6 : 4.5, 0, Math.PI * 2);
        ctx.fillStyle = done ? "rgba(0,0,0,0.35)" : SITE_COLOR[s.kind];
        ctx.fill();
        ctx.lineWidth = sel === s.id ? 2 : 1.2;
        ctx.strokeStyle = done ? SITE_COLOR[s.kind] : "rgba(0,0,0,0.65)";
        ctx.stroke();
        if (done) {
          ctx.strokeStyle = SITE_COLOR[s.kind];
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(x - 2.2, y);
          ctx.lineTo(x - 0.5, y + 1.8);
          ctx.lineTo(x + 2.5, y - 1.8);
          ctx.stroke();
        }
      }
      // The planned route and the rover.
      const rv = g.rover;
      if (st.route.length) {
        ctx.strokeStyle = "rgba(255,201,74,0.9)";
        ctx.setLineDash([3, 3]);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(toMap(rv.x), toMap(rv.z));
        for (const p of st.route) ctx.lineTo(toMap(p.x), toMap(p.z));
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.save();
      ctx.translate(toMap(rv.x), toMap(rv.z));
      ctx.rotate(-rv.heading);
      ctx.fillStyle = "#ff8a3d";
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(0, -7);
      ctx.lineTo(5, 5);
      ctx.lineTo(0, 2.5);
      ctx.lineTo(-5, 5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      // The science rover: a smaller pale arrow, with its own planned route.
      const sc = g.scout;
      if (sc) {
        if (st.scoutRoute.length) {
          ctx.strokeStyle = "rgba(170,225,255,0.9)";
          ctx.setLineDash([2, 3]);
          ctx.lineWidth = 1.3;
          ctx.beginPath();
          ctx.moveTo(toMap(sc.x), toMap(sc.z));
          for (const p of st.scoutRoute) ctx.lineTo(toMap(p.x), toMap(p.z));
          ctx.stroke();
          ctx.setLineDash([]);
        }
        ctx.save();
        ctx.translate(toMap(sc.x), toMap(sc.z));
        ctx.rotate(-sc.heading);
        ctx.fillStyle = "#e6f4ff";
        ctx.strokeStyle = "#2b5f86";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(0, -5.5);
        ctx.lineTo(4, 4);
        ctx.lineTo(0, 2);
        ctx.lineTo(-4, 4);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
      // North.
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.font = "700 10px Lexend Variable, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("N", CSS / 2, 11);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [open, show]);

  if (!show) return null;

  const onClick = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * CSS,
      py = ((e.clientY - r.top) / r.height) * CSS;
    const x = toWorld(px),
      z = toWorld(py);
    const near = SITES.map((s) => ({ s, d: Math.hypot(toMap(s.x) - px, toMap(s.z) - py) })).sort((a, b) => a.d - b.d)[0];
    const ui = useUI.getState();
    if (near && near.d < 10) {
      ui.select({ kind: "site", id: near.s.id });
      ui.openPanel("rover");
      scene3d.lookAt?.(near.s.x, near.s.z);
      play("open");
    } else scene3d.lookAt?.(x, z);
    useUI.getState().noteLook();
  };

  return (
    <section className={`minimap card ${open ? "open" : ""}`} aria-label="Map" data-tut="minimap">
      <button className="minimap-head" onClick={() => setOpen(!open)} aria-expanded={open} title={open ? "Hide the map" : "Show the map"}>
        <MapIcon size={16} />
        <b>Map</b>
        <small>300 m × 300 m</small>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {open && (
        <>
          <canvas
            ref={canvas}
            style={{ width: CSS, height: CSS }}
            role="img"
            aria-label="Map of the area. Click a site to plan a rover trip, or anywhere else to look there."
            onPointerUp={onClick}
          />
          <ul className="minimap-key" aria-hidden="true">
            <li>
              <i style={{ background: SITE_COLOR.ice }} />
              Ice
            </li>
            <li>
              <i style={{ background: SITE_COLOR.regolith }} />
              Regolith
            </li>
            <li>
              <i style={{ background: SITE_COLOR.science }} />
              Science
            </li>
            <li>
              <i className="rover" />
              Rover
            </li>
          </ul>
        </>
      )}
    </section>
  );
}
