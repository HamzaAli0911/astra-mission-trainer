import { useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { DoorOpen, ExternalLink, Hand, Map as MapIcon, X } from "lucide-react";
import { HOME_TOUR } from "../state/tutorial";
import { INSPECTS } from "../sim/inspect";
import { activeHazard } from "../sim/core";
import { SUIT_HOURS, WALKER } from "../sim/engine";
import { PLANETS } from "../sim/planets";
import { AIRLOCK_SECONDS } from "../scene/walk";
import { useGame } from "../state/game";
import { useUI } from "../state/ui";
import { leaveWalk, useWalk, walker, walkInput } from "../state/walk";

const isTouch = () => typeof matchMedia !== "undefined" && matchMedia("(hover: none) and (pointer: coarse)").matches;

/** What you see while walking inside the home: where you are, what you could use, and how to get about. */
export function WalkHud() {
  const view = useUI((s) => s.view);
  if (view !== "walk") return null;
  return <WalkOverlay />;
}

function WalkOverlay() {
  const { room, prompt, locked } = useWalk(useShallow((s) => ({ room: s.room, prompt: s.prompt, locked: s.locked })));
  const touch = useMemo(isTouch, []);
  // The hints fade once you've started looking around, and come back if you let go of the mouse.
  const [hints, setHints] = useState(true);
  useEffect(() => {
    if (!locked) return setHints(true);
    const t = setTimeout(() => setHints(false), 4000);
    return () => clearTimeout(t);
  }, [locked]);
  return (
    <div className={`walk-hud ${touch ? "touch" : ""}`}>
      <div className="walk-fade" aria-hidden="true" />
      <div className="walk-bar">
        {room && (
          <div className="walk-room" role="status">
            {room}
          </div>
        )}
        <button className="btn walk-exit" onClick={leaveWalk} title="Stop walking and look over the outpost again (V switches views)">
          <DoorOpen size={17} /> Overview
        </button>
        <TourButton />
      </div>
      <Tour />
      {(locked || touch) && <div className="walk-cross" aria-hidden="true" />}
      {prompt && (
        <div className="walk-prompt">
          {touch ? <Hand size={16} /> : <kbd className="kbd">E</kbd>} {prompt}
        </div>
      )}
      <InspectCard />
      <SuitHud outside={room.startsWith("Outside")} />
      <Airlock />
      {!touch && hints && (
        <div className="walk-hints">
          {locked ? (
            <span>
              <kbd className="kbd">Esc</kbd> frees the mouse
            </span>
          ) : (
            <b>Click the view to look around</b>
          )}
          <span>
            <kbd className="kbd">W</kbd>
            <kbd className="kbd">A</kbd>
            <kbd className="kbd">S</kbd>
            <kbd className="kbd">D</kbd> walk
          </span>
          <span>
            <kbd className="kbd">←</kbd>
            <kbd className="kbd">→</kbd> turn
          </span>
          <span>
            <kbd className="kbd">Shift</kbd> faster
          </span>
          <span>
            <kbd className="kbd">E</kbd> use
          </span>
        </div>
      )}
      {touch && (
        <>
          <LookPad />
          <Stick />
          <button
            className="walk-use"
            aria-label={prompt ?? "Use"}
            disabled={!prompt}
            onPointerDown={(e) => {
              e.preventDefault();
              walkInput.use = true;
            }}
          >
            <Hand size={24} />
            <span>Use</span>
          </button>
        </>
      )}
    </div>
  );
}

function TourButton() {
  const tour = useWalk((s) => s.tour);
  if (tour !== null) return null;
  return (
    <button className="btn walk-exit" onClick={() => useWalk.getState().set({ tour: 0 })} title="Six stops: where the air, water, food and power come from, the storm shelter and the cupola">
      <MapIcon size={17} /> Take a tour
    </button>
  );
}

/** The tour: one stop at a time; looking closely at the right thing (E) moves it on. */
function Tour() {
  const tour = useWalk((s) => s.tour);
  const card = useWalk((s) => s.card);
  useEffect(() => {
    if (tour === null || card !== HOME_TOUR[tour]?.inspect) return;
    const next = tour + 1;
    useWalk.getState().set({ tour: next < HOME_TOUR.length ? next : null });
    if (next >= HOME_TOUR.length) useGame.getState().toast("Tour done! You've seen where the air, water, food and power come from.", "good");
  }, [tour, card]);
  if (tour === null) return null;
  const s = HOME_TOUR[tour];
  return (
    <aside className="tour-card" aria-live="polite">
      <span className="eyebrow">
        Tour {tour + 1} of {HOME_TOUR.length} · {s.title}
      </span>
      <p>{s.text}</p>
      <button className="btn ghost small" onClick={() => useWalk.getState().set({ tour: null })}>
        End the tour
      </button>
    </aside>
  );
}

/** Inside the helmet: the visor's edge, suit time, radiation, the suit's battery and a compass. */
function SuitHud({ outside }: { outside: boolean }) {
  const eva = useGame((s) => s.game.eva);
  const g = useGame((s) => s.game);
  const [heading, setHeading] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setHeading(((walker.yaw * 180) / Math.PI + 3600) % 360), 120);
    return () => clearInterval(t);
  }, []);
  if (!eva) return null;
  const storm = activeHazard(g, "storm");
  const rate = PLANETS[g.planet].background + (storm ? storm.strength : 0);
  const dose = g.crew.find((c) => c.id === WALKER)?.dose ?? 0;
  const h = Math.floor(eva.left),
    m = Math.floor((eva.left - h) * 60);
  const low = eva.left <= 1;
  const marks = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return (
    <>
      {outside && <div className="visor" aria-hidden="true" />}
      <div className={`suit-hud ${low ? "low" : ""}`} role="status" aria-label="Suit readings">
        <span>
          <b>SUIT</b> {h} h {String(m).padStart(2, "0")} min
        </span>
        <span>
          <b>BATTERY</b> {Math.round((eva.left / SUIT_HOURS) * 100)}%
        </span>
        <span className={storm ? "hot" : ""}>
          <b>DOSE</b> {rate.toFixed(2)} mSv/h · {dose.toFixed(1)} total
        </span>
      </div>
      {outside && (
        <div className="compass" aria-hidden="true">
          {marks.map((n, i) => {
            const d = ((i * 45 - heading + 540) % 360) - 180;
            return Math.abs(d) < 70 ? (
              <span key={n} style={{ left: `${50 + (d / 70) * 50}%` }} className={n.length === 1 ? "major" : ""}>
                {n}
              </span>
            ) : null;
          })}
          <i />
        </div>
      )}
    </>
  );
}

/** The airlock cycling: the pressure falls to vacuum (or rises back to a breathable 101 kPa); it can be skipped. */
function Airlock() {
  const lock = useWalk((s) => s.airlock);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!lock) return;
    const t = setInterval(() => tick((n) => n + 1), 100);
    return () => clearInterval(t);
  }, [lock]);
  if (!lock) return null;
  const k = Math.min(1, (performance.now() / 1000 - lock.t0) / AIRLOCK_SECONDS);
  const kpa = Math.round(lock.dir === "out" ? 101 * (1 - k) : 101 * k);
  return (
    <div className="airlock" role="dialog" aria-label="Airlock">
      <b>{lock.dir === "out" ? "Airlock: pumping the air out" : "Airlock: letting the air back in"}</b>
      <div className="gauge">
        <span style={{ width: `${(kpa / 101) * 100}%` }} />
      </div>
      <p>
        {kpa} kPa {lock.dir === "out" ? "→ 0 (the outside)" : "→ 101 (like home)"}
      </p>
      <button
        className="btn small"
        onClick={() => {
          walkInput.use = true;
        }}
      >
        Skip
      </button>
    </div>
  );
}

/** A close look at a piece of equipment: live readings from the mission and one sourced science fact. */
function InspectCard() {
  const id = useWalk((s) => s.card);
  const g = useGame((s) => s.game);
  const p = INSPECTS.find((x) => x.id === id);
  // Let go of the mouse while a card is open, so its link can be clicked.
  useEffect(() => {
    if (p && document.pointerLockElement) document.exitPointerLock();
  }, [p]);
  if (!p) return null;
  const f = p.fact(g);
  return (
    <aside className="inspect-card" role="dialog" aria-label={p.title}>
      <header>
        <h3>{p.title}</h3>
        <button className="icon-btn" aria-label="Close" onClick={() => useWalk.getState().set({ card: null })}>
          <X size={18} />
        </button>
      </header>
      <dl>
        {p.live(g).map(([label, value, warn]) => (
          <div key={label} className={warn ? "warn" : ""}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <p className="inspect-fact">
        <b>{f.title}.</b> {f.text}
      </p>
      <a href={f.url} target="_blank" rel="noreferrer">
        {f.source} <ExternalLink size={12} />
      </a>
    </aside>
  );
}

/** The left-thumb stick: push it the way you want to walk (further for faster). */
function Stick() {
  const base = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const R = 46;
  const move = (e: React.PointerEvent) => {
    const r = base.current!.getBoundingClientRect();
    let x = e.clientX - (r.left + r.width / 2),
      y = e.clientY - (r.top + r.height / 2);
    const d = Math.hypot(x, y);
    if (d > R) {
      x *= R / d;
      y *= R / d;
    }
    setKnob({ x, y });
    walkInput.stick.x = x / R;
    walkInput.stick.y = -y / R;
    walkInput.fast = d > R * 1.15;
  };
  const end = () => {
    setKnob({ x: 0, y: 0 });
    walkInput.stick.x = walkInput.stick.y = 0;
    walkInput.fast = false;
  };
  return (
    <div
      ref={base}
      className="walk-stick"
      role="slider"
      aria-label="Walk: drag the knob the way you want to go"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        move(e);
      }}
      onPointerMove={(e) => e.buttons && move(e)}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
    >
      <span className="walk-knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
    </div>
  );
}

/** Drag anywhere on the right half of the screen to look around. */
function LookPad() {
  const last = useRef<{ x: number; y: number } | null>(null);
  return (
    <div
      className="walk-look"
      aria-hidden="true"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        last.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerMove={(e) => {
        if (!last.current) return;
        walkInput.look.x += e.clientX - last.current.x;
        walkInput.look.y += e.clientY - last.current.y;
        walkInput.look.touch = true;
        last.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerUp={() => (last.current = null)}
      onPointerCancel={() => (last.current = null)}
    />
  );
}
