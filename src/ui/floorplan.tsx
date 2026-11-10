import { useEffect, useMemo, useRef, useState } from "react";
import { Minus, Plus, X } from "lucide-react";
import { BUILDINGS, built, CELLS, FURNITURE, HQ_STAIR, PORTALS, stageOf, type Building, type BuildingId } from "../sim/base";
import { HOME, polar, ROOMS, STAIR, stairPoint } from "../sim/home";
import { colonyTour, cardSpot } from "../sim/tour";
import { useGame } from "../state/game";
import { crewDots, useWalk, walker } from "../state/walk";

/**
 * The colony's floor plan: every building and room from the plan the walk and the 3D model are built from, the
 * doors, the furniture, Hab-1's ring of rooms, where you are and which way you face, where the crew are, and the
 * tour's next stop. One floor at a time (the ground floor, the HQ mezzanine, Hab-1's upper floor); zoom with the
 * buttons or the wheel, drag to pan, pick a building in the list to go to it.
 */
type PlanFloor = 0 | 1 | 2;
const VIEW = { x0: -102, z0: -12, x1: 106, z1: 74 };
const COLORS: Partial<Record<BuildingId, string>> = {
  hab: "#5d7fb8",
  link: "#6f7d96",
  hq: "#c9822f",
  w1: "#4f8a63",
  e1: "#9a6a3c",
  lifesupport: "#3d8fb0",
  clinic: "#3f9a6b",
  shelter: "#b49a2e",
  greenhouse: "#4f9f45",
  logistics: "#8a6fb0",
  yard: "#8a8f99",
  science: "#7a5ab0",
  garage: "#7f8691",
  eva: "#c75a3c",
  engineering: "#b0703d",
};
const short = (name: string) => (name.includes(": ") ? name.split(": ")[1] : name);
const sector = (from: number, to: number, r0: number, r1: number) => {
  const a = polar(from, r1),
    b = polar(to, r1),
    c = polar(to, r0),
    d = polar(from, r0);
  const big = to - from > 180 ? 1 : 0;
  return `M${a.x},${a.z} A${r1},${r1} 0 ${big} 1 ${b.x},${b.z} L${c.x},${c.z} A${r0},${r0} 0 ${big} 0 ${d.x},${d.z} Z`;
};

export function FloorPlan() {
  const open = useWalk((s) => s.plan);
  if (!open) return null;
  return <Plan />;
}

function Plan() {
  const missionId = useGame((s) => s.game.missionId);
  const stage = stageOf(missionId);
  const tour = useWalk((s) => s.tour);
  const [floor, setFloor] = useState<PlanFloor>(walker.where === 1 || walker.where === "stair" ? 1 : walker.where === 2 ? 2 : 0);
  // The view: a centre and a zoom (1: the whole campus).
  const [view, setView] = useState(() => ({ cx: walker.outside ? 0 : walker.x, cz: walker.outside ? 30 : walker.z, zoom: 2.4 }));
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 250);
    if (document.pointerLockElement) document.exitPointerLock();
    return () => clearInterval(t);
  }, []);
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ x: number; y: number; cx: number; cz: number } | null>(null);
  const w = (VIEW.x1 - VIEW.x0) / view.zoom,
    h = ((VIEW.z1 - VIEW.z0) / view.zoom) * 0.62;
  const box = `${view.cx - w / 2} ${view.cz - h / 2} ${w} ${h}`;
  const zoomBy = (k: number) => setView((v) => ({ ...v, zoom: Math.min(14, Math.max(1, v.zoom * k)) }));
  const stop = tour === null ? null : colonyTour(stage)[tour];
  const target = stop ? cardSpot(stop.card) : null;
  const k = 1 / view.zoom;
  const font = Math.max(0.55, 2.6 * k);
  const goTo = (b: Building) => {
    setView({ cx: (b.rect.x0 + b.rect.x1) / 2, cz: (b.rect.z0 + b.rect.z1) / 2, zoom: Math.min(10, (VIEW.x1 - VIEW.x0) / Math.max(18, (b.rect.x1 - b.rect.x0) * 2.2)) });
    if (b.id === "hab" && floor === 2) setFloor(0);
  };
  const cells = useMemo(() => CELLS.filter((c) => (floor === 2 ? c.level === 2 : floor === 0 ? c.level === 0 : false)), [floor]);
  const furniture = useMemo(() => FURNITURE.filter((f) => cells.some((c) => c.id === f.cell)), [cells]);
  const doors = PORTALS.filter((p) => (floor === 2 ? p.level === 2 : floor === 0 ? p.level === 0 : false));
  const here = !walker.outside && (floor === 1 ? walker.where === 1 || walker.where === "stair" : floor === 2 ? walker.where === 2 || walker.where === "hq-stair" : walker.where === 0 || walker.where === "hq-stair");
  const dots = crewDots.filter((d) => d.floor === floor);
  return (
    <div className="plan-backdrop" role="dialog" aria-label="Colony floor plan" onClick={(e) => e.target === e.currentTarget && useWalk.getState().set({ plan: false })}>
      <section className="plan">
        <header>
          <h3>Colony floor plan</h3>
          <div className="plan-floors" role="tablist" aria-label="Floor">
            {(
              [
                [0, "Ground floor"],
                [2, "HQ mezzanine"],
                [1, "Hab-1 upstairs"],
              ] as const
            ).map(([f, label]) => (
              <button key={f} role="tab" aria-selected={floor === f} className={`btn small ${floor === f ? "primary" : "secondary"}`} onClick={() => setFloor(f)}>
                {label}
              </button>
            ))}
          </div>
          <div className="plan-zoom">
            <button className="icon-btn" aria-label="Zoom out" onClick={() => zoomBy(1 / 1.5)}>
              <Minus size={18} />
            </button>
            <button className="icon-btn" aria-label="Zoom in" onClick={() => zoomBy(1.5)}>
              <Plus size={18} />
            </button>
            <button className="icon-btn" aria-label="Close the floor plan" onClick={() => useWalk.getState().set({ plan: false })}>
              <X size={18} />
            </button>
          </div>
        </header>
        <div className="plan-body">
          <svg
            ref={svg}
            viewBox={box}
            className="plan-map"
            role="img"
            aria-label={`Floor plan, ${floor === 0 ? "ground floor" : floor === 2 ? "HQ mezzanine" : "Hab-1 upper floor"}`}
            onWheel={(e) => zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15)}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              drag.current = { x: e.clientX, y: e.clientY, cx: view.cx, cz: view.cz };
            }}
            onPointerMove={(e) => {
              const d = drag.current;
              const el = svg.current;
              if (!d || !el || !e.buttons) return;
              const s = w / el.clientWidth;
              setView((v) => ({ ...v, cx: d.cx - (e.clientX - d.x) * s, cz: d.cz - (e.clientY - d.y) * s }));
            }}
            onPointerUp={() => (drag.current = null)}
          >
            {/* The buildings: their outlines, filled if built, dashed if this mission hasn't got them. */}
            {floor !== 1 &&
              BUILDINGS.filter((b) => b.id !== "hab" && (floor === 0 || b.id === "hq")).map((b) => {
                const on = built(b, stage);
                const r = b.rect;
                return (
                  <g key={b.id} className={`plan-building ${on ? "" : "unbuilt"} ${b.kind}`}>
                    <rect x={r.x0} y={r.z0} width={r.x1 - r.x0} height={r.z1 - r.z0} style={{ fill: on ? COLORS[b.id] : "none", stroke: COLORS[b.id] ?? "#8a8f99" }} strokeWidth={0.5 * k + 0.15} />
                    {(b.letter || b.kind === "compound") && view.zoom < 6 && (
                      <text x={(r.x0 + r.x1) / 2} y={(r.z0 + r.z1) / 2} fontSize={font * 1.4} className="plan-letter">
                        {b.letter || "L"}
                      </text>
                    )}
                  </g>
                );
              })}
            {/* Rooms and corridors (names when zoomed in), the furniture, the doors. */}
            {cells.map((c) => {
              const on = built(BUILDINGS.find((b) => b.id === c.building)!, stage);
              const r = c.rect;
              return (
                <g key={c.id} className={`plan-cell ${on ? "" : "unbuilt"}`}>
                  <rect x={r.x0} y={r.z0} width={r.x1 - r.x0} height={r.z1 - r.z0} />
                  {view.zoom >= 2.2 && short(c.name).length * font * 0.8 * 0.56 < r.x1 - r.x0 - 0.6 && (
                    <text x={(r.x0 + r.x1) / 2} y={(r.z0 + r.z1) / 2} fontSize={font * 0.8}>
                      {short(c.name)}
                    </text>
                  )}
                </g>
              );
            })}
            {view.zoom >= 3 &&
              furniture.map((f) => <rect key={f.id} className="plan-furniture" x={f.rect.x0} y={f.rect.z0} width={f.rect.x1 - f.rect.x0} height={f.rect.z1 - f.rect.z0} />)}
            {doors.map((p) => {
              const h = p.width / 2;
              return p.along === "x" ? (
                <line key={p.id} className={`plan-door ${p.kind}`} x1={p.x - h} y1={p.z} x2={p.x + h} y2={p.z} strokeWidth={0.35 + 0.3 * k} />
              ) : (
                <line key={p.id} className={`plan-door ${p.kind}`} x1={p.x} y1={p.z - h} x2={p.x} y2={p.z + h} strokeWidth={0.35 + 0.3 * k} />
              );
            })}
            {floor !== 1 && <rect className="plan-stair" x={HQ_STAIR.x0} y={HQ_STAIR.z0} width={HQ_STAIR.x1 - HQ_STAIR.x0} height={HQ_STAIR.z1 - HQ_STAIR.z0} />}
            {/* Hab-1: its ring of rooms round the core, on the ground floor and upstairs. */}
            {floor !== 2 && (
              <g className="plan-hab">
                <circle cx={0} cy={0} r={HOME.lining + 0.3} />
                {ROOMS.filter((m) => m.level === floor && !m.core).map((m) => {
                  const mid = polar((m.from + m.to) / 2, (HOME.hall + HOME.lining) / 2);
                  return (
                    <g key={m.id}>
                      <path d={sector(m.from, m.to, HOME.hall, HOME.lining)} />
                      {view.zoom >= 5 && (
                        <text x={mid.x} y={mid.z} fontSize={font * 0.55}>
                          {m.name.replace("'s quarters", "")}
                        </text>
                      )}
                    </g>
                  );
                })}
                <circle cx={0} cy={0} r={HOME.core} className="plan-core" />
                {view.zoom >= 5 && (
                  <text x={0} y={0} fontSize={font * 0.55}>
                    {floor === 0 ? "Shelter" : "Command"}
                  </text>
                )}
                {(() => {
                  const a = stairPoint(-STAIR.half, STAIR.inner),
                    b = stairPoint(STAIR.half, STAIR.inner),
                    c = stairPoint(STAIR.half, STAIR.outer),
                    d = stairPoint(-STAIR.half, STAIR.outer);
                  return <path className="plan-stair" d={`M${a.x},${a.z} L${b.x},${b.z} L${c.x},${c.z} L${d.x},${d.z} Z`} />;
                })()}
                {view.zoom < 5 && (
                  <text x={0} y={-HOME.lining - 1.6} fontSize={font} className="plan-letter small">
                    Hab-1
                  </text>
                )}
              </g>
            )}
            {/* The tour's stop, the crew and you. */}
            {target && (target.level === floor || (target.level === -1 && floor === 0)) && (
              <g className="plan-target" transform={`translate(${target.x} ${target.z})`}>
                <circle r={1.6 * Math.max(0.35, k * 2)} />
                <circle r={0.5 * Math.max(0.35, k * 2)} className="dot" />
              </g>
            )}
            {dots.map((d) => (
              <g key={d.id} className="plan-crew" transform={`translate(${d.x} ${d.z})`}>
                <circle r={0.55 * Math.max(0.5, k * 2.2)} style={{ fill: d.color }} />
                {view.zoom >= 4 && (
                  <text y={-1.1 * Math.max(0.5, k * 2.2)} fontSize={font * 0.6}>
                    {d.name}
                  </text>
                )}
              </g>
            ))}
            {(here || (walker.outside && floor === 0)) && (
              <g className="plan-you" transform={`translate(${walker.x} ${walker.z}) rotate(${(walker.yaw * 180) / Math.PI}) scale(${Math.max(0.45, k * 2.4)})`}>
                <path d="M0,-1.6 L1.1,1.1 L0,0.5 L-1.1,1.1 Z" />
              </g>
            )}
          </svg>
          <aside className="plan-legend">
            <p className="plan-key">
              <span className="you" /> You · <span className="crew" /> Crew {stop && <><span className="stop" /> Tour stop</>}
            </p>
            <ul>
              {BUILDINGS.filter((b) => b.letter || b.kind === "compound").map((b) => (
                <li key={b.id}>
                  <button className={`plan-item ${built(b, stage) ? "" : "unbuilt"}`} onClick={() => goTo(b)}>
                    <i style={{ background: COLORS[b.id] ?? "#8a8f99" }} aria-hidden="true">
                      {b.letter || "·"}
                    </i>
                    <span>
                      <b>{b.name}</b>
                      <small>{built(b, stage) ? b.role : "Not built in this mission"}</small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </section>
    </div>
  );
}
