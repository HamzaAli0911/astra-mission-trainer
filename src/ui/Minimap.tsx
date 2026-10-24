import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Map as MapIcon } from "lucide-react";
import { MODULES } from "../sim/modules";
import { modulePos } from "../sim/rover";
import type { Planet } from "../sim/types";
import { CRATER, DOCK, LANDER, SITES, terrainHeight, WORLD } from "../sim/world";
import { scene3d } from "../scene/anchors";
import { SITE_COLOR } from "../scene/effects";
import { PALETTE } from "../scene/terrain";
import { useGame } from "../state/game";
import { useUI } from "../state/ui";
import { play } from "../lib/sound";

const SPAN = WORLD + 10; // metres from the centre to the map edge
const CSS = 196; // map size on screen, CSS pixels

/** A shaded relief map of the area, drawn once per planet. */
const reliefs = new Map<Planet, HTMLCanvasElement>();
function relief(planet: Planet) {
  const cached = reliefs.get(planet);
  if (cached) return cached;
  const N = 200;
  const c = document.createElement("canvas");
  c.width = c.height = N;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(N, N);
  const P = PALETTE[planet];
  const hex = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const base = hex(P.ground),
    dark = hex(P.crater);
  const step = (SPAN * 2) / N;
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const wx = -SPAN + (x + 0.5) * step,
        wz = -SPAN + (y + 0.5) * step;
      const h = terrainHeight(wx, wz, planet);
      // Light from the north-west, like a printed relief map.
      const shade = (terrainHeight(wx - step, wz - step, planet) - terrainHeight(wx + step, wz + step, planet)) / step;
      let k = 0.62 + shade * 0.55 + h * 0.012;
      const inCrater = Math.hypot(wx - CRATER.x, wz - CRATER.z) < CRATER.r * 0.85;
      const edge = Math.max(Math.abs(wx), Math.abs(wz)) > WORLD - 4;
      if (edge) k *= 0.55;
      k = Math.max(0.2, Math.min(1.25, k));
      const col = inCrater ? dark : base;
      const i = (y * N + x) * 4;
      img.data[i] = col[0] * k;
      img.data[i + 1] = col[1] * k;
      img.data[i + 2] = col[2] * k;
      img.data[i + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
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
      ctx.drawImage(relief(g.planet), 0, 0, CSS, CSS);
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
