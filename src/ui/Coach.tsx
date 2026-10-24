import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowRight, GraduationCap, Volume2, X } from "lucide-react";
import { tutorialFor, type Ctx, type Step } from "../state/tutorial";
import { useGame } from "../state/game";
import { useUI } from "../state/ui";
import { anchors } from "../scene/anchors";
import { play } from "../lib/sound";
import { hush, speak } from "../lib/speech";
import { IconCapcom } from "./icons";

const ctx = (): Ctx => ({ game: useGame.getState().game, ui: useUI.getState(), store: useGame.getState() });
const targetOf = (s: Step) => (typeof s.target === "function" ? s.target(ctx()) : s.target);

/** The tutorial coach: CAPCOM explains one thing, a spotlight shows where, and the step ends when you do it. */
export function Coach() {
  const step = useUI((s) => s.tutorial);
  const id = useGame((s) => s.game.missionId);
  const status = useGame((s) => s.game.status);
  const stars = useUI((s) => s.progress.stars);
  const steps = tutorialFor(id, stars);
  const spec = step !== null && steps ? steps[step] : null;
  const [done, setDone] = useState(false);

  // Enter a step: hold or release the clock, set the speed, read it aloud.
  useEffect(() => {
    if (!spec) return;
    setDone(false);
    const st = useGame.getState();
    st.hold(spec.hold);
    if (spec.speed) st.setSpeed(spec.speed);
    if (!spec.hold && st.paused && (st.reason === "manual" || st.reason === "menu" || st.reason === "briefing")) st.resume();
    speak(spec.say);
  }, [spec]);

  // Watch for the step's goal.
  useEffect(() => {
    if (!spec?.done || step === null) return;
    let finished = false,
      timer = 0;
    const check = () => {
      if (finished) return;
      if (spec.done!(ctx())) {
        finished = true;
        setDone(true);
        play("good");
        timer = window.setTimeout(() => advanceTo(step + 1), 650);
      }
    };
    const a = useGame.subscribe(check),
      b = useUI.subscribe(check);
    check();
    return () => {
      a();
      b();
      window.clearTimeout(timer);
    };
  }, [spec, step]);

  useEffect(() => {
    if (status !== "playing" && step !== null) finish();
  }, [status, step]);

  if (!spec || step === null || !steps) return null;
  const last = step === steps.length - 1;
  return (
    <>
      <Spotlight step={spec} />
      <CoachBubble step={spec} index={step} total={steps.length} done={done} last={last} />
    </>
  );
}

function advanceTo(n: number) {
  const steps = tutorialFor(useGame.getState().game.missionId, useUI.getState().progress.stars);
  if (!steps || n >= steps.length) finish();
  else useUI.getState().setTutorial(n);
}
export function finish() {
  hush();
  useUI.getState().setTutorial(null);
  const st = useGame.getState();
  st.hold(false);
  if (st.game.status === "playing" && st.paused && st.reason !== "alert" && st.reason !== "choice") st.resume();
}

function CoachBubble({ step, index, total, done, last }: { step: Step; index: number; total: number; done: boolean; last: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Pos | null>(null);
  // Place the bubble next to its target, every frame (targets can move).
  useLayoutEffect(() => {
    let raf = 0,
      scrolled = "";
    const place = () => {
      raf = requestAnimationFrame(place);
      const el = ref.current;
      if (!el) return;
      const t = targetOf(step);
      // Bring a target inside a scrolling panel into view, once.
      if (t && !t.startsWith("3d:") && scrolled !== t) {
        const target = document.querySelector(t);
        if (target) {
          scrolled = t;
          target.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }
      }
      const rect = rectOf(t);
      const w = el.offsetWidth,
        h = el.offsetHeight,
        W = innerWidth,
        H = innerHeight;
      if (!rect || W < 700) {
        const next = dodge({ left: W < 700 ? 10 : 20, top: H - h - (W < 700 ? 96 : 110), arrow: "none", ax: 0 }, w, h, W - 10);
        commit(next);
        return;
      }
      const cx = rect.left + rect.width / 2;
      if (t?.startsWith("3d:")) {
        // Things in the world: sit beside them so they stay visible.
        const right = rect.right + 24 + w < W - 12;
        const left3 = right ? rect.right + 24 : Math.max(12, rect.left - w - 24);
        const top3 = Math.max(70, Math.min(H - h - 100, rect.top + rect.height / 2 - h / 2));
        commit(dodge({ left: left3, top: top3, arrow: "none", ax: 0 }, w, h, W - 12));
        return;
      }
      const inDrawer = t && !t.startsWith("3d:") ? document.querySelector(t)?.closest(".drawer") : null;
      if (inDrawer && W >= 900) {
        // Inside the side panel: sit to its left, pointing right, so the panel stays readable.
        const d = inDrawer.getBoundingClientRect();
        const top2 = Math.max(70, Math.min(H - h - 100, rect.top + rect.height / 2 - h / 2));
        const ay = Math.max(18, Math.min(h - 18, rect.top + rect.height / 2 - top2));
        commit(dodge({ left: d.left - w - 18, top: top2, arrow: "right", ax: ay }, w, h, d.left - 18));
        return;
      }
      let left = Math.min(W - w - 12, Math.max(12, cx - w / 2));
      let top: number,
        arrow: "up" | "down";
      if (rect.bottom + h + 22 < H - 8 && rect.top < H * 0.55) {
        top = rect.bottom + 16;
        arrow = "up";
      } else {
        top = rect.top - h - 16;
        arrow = "down";
      }
      top = Math.max(8, Math.min(H - h - 8, top));
      if (arrow === "down" && top + h > rect.top) {
        // Not enough room above: put it beside the target.
        left = rect.left > W / 2 ? Math.max(12, rect.left - w - 18) : Math.min(W - w - 12, rect.right + 18);
        top = Math.max(8, Math.min(H - h - 8, rect.top + rect.height / 2 - h / 2));
      }
      const placed = dodge({ left, top, arrow, ax: 0 }, w, h, W - 12);
      placed.ax = Math.max(18, Math.min((placed.w ?? w) - 18, cx - placed.left));
      commit(placed);
    };
    const commit = (n: Pos) =>
      setPos((p) =>
        p && Math.abs(p.left - n.left) < 0.5 && Math.abs(p.top - n.top) < 0.5 && p.arrow === n.arrow && Math.abs(p.ax - n.ax) < 0.5 && p.w === n.w ? p : n,
      );
    raf = requestAnimationFrame(place);
    return () => cancelAnimationFrame(raf);
  }, [step]);
  const showNext = !step.done || !!step.next;
  return (
    <section
      ref={ref}
      className={`coach ${done ? "is-done" : ""} arrow-${pos?.arrow ?? "none"}`}
      style={pos ? ({ left: pos.left, top: pos.top, width: pos.w, "--ax": `${pos.ax}px` } as React.CSSProperties) : { visibility: "hidden" }}
      role="dialog"
      aria-live="polite"
      aria-label={`Tutorial step ${index + 1} of ${total}`}
    >
      <header>
        <span className="capcom-avatar small" aria-hidden="true">
          <IconCapcom size={18} />
        </span>
        <b>Jo · CAPCOM</b>
        <span className="coach-count">
          <GraduationCap size={14} /> {index + 1}/{total}
        </span>
        <button className="icon-btn tiny" aria-label="Read aloud" onClick={() => speak(step.say, true)}>
          <Volume2 size={15} />
        </button>
        <button
          className="btn ghost tiny coach-skip"
          title="End the tutorial and play on your own"
          onClick={() => {
            play("click");
            finish();
          }}
        >
          Skip tutorial <X size={14} />
        </button>
      </header>
      <div className="coach-progress" aria-hidden="true">
        {Array.from({ length: total }, (_, i) => (
          <i key={i} className={i < index || (i === index && done) ? "done" : i === index ? "now" : ""} />
        ))}
      </div>
      <p>{done ? "Nice work!" : step.say}</p>
      {step.hint && !done && <small className="coach-hint">{step.hint}</small>}
      <footer>
        {!step.hold && !done && <span className="coach-clock">Time is running</span>}
        {showNext && !done && (
          <button
            className="btn primary small"
            autoFocus
            onClick={() => {
              play("click");
              advanceTo(index + 1);
            }}
          >
            {step.next ?? (step.done ? "Skip" : "Next")} {last ? null : <ArrowRight size={15} />}
          </button>
        )}
        {!showNext && !done && (
          <button className="btn ghost tiny" onClick={() => advanceTo(index + 1)}>
            Skip step
          </button>
        )}
      </footer>
    </section>
  );
}

type Pos = { left: number; top: number; arrow: "up" | "down" | "right" | "none"; ax: number; w?: number };

/** Panels the coach must not cover: the goals (and shortcuts), the crew and map, the view buttons and the "paused" note. */
function keepClear() {
  const out: DOMRect[] = [];
  for (const sel of [".hud-left", ".hud-right", ".view-switch", ".paused-chip"]) {
    const el = document.querySelector(sel);
    if (!el) continue;
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && getComputedStyle(el).display !== "none") out.push(r);
  }
  return out;
}
const hits = (p: { left: number; top: number }, w: number, h: number, r: DOMRect) =>
  p.left < r.right + 6 && p.left + w > r.left - 6 && p.top < r.bottom + 6 && p.top + h > r.top - 6;

/**
 * Move the coach off the panels it would cover: sideways first (keeping its arrow), then narrower to fit
 * the gap, then above or below the panel. `maxRight` is the furthest right its right edge may go.
 */
function dodge(p: Pos, w: number, h: number, maxRight: number): Pos {
  const W = innerWidth,
    H = innerHeight;
  const clear = keepClear();
  let out: Pos = { ...p };
  for (const r of clear) {
    const cw = out.w ?? w;
    if (!hits(out, cw, h, r)) continue;
    // Sideways: right of a panel on the left half, left of one on the right half.
    const side = r.left + r.width / 2 < W / 2 ? r.right + 12 : r.left - cw - 12;
    const sideways = { ...out, left: side };
    if (side >= 8 && side + cw <= maxRight && !clear.some((o) => o !== r && hits(sideways, cw, h, o))) {
      out = sideways;
      continue;
    }
    // Narrower, to fit between this panel and the right limit (only beside a panel on the left).
    if (r.left + r.width / 2 < W / 2) {
      const room = maxRight - (r.right + 12);
      if (room >= 280) {
        const narrow = { ...out, left: r.right + 12, w: Math.min(cw, room) };
        if (!clear.some((o) => o !== r && hits(narrow, narrow.w!, h, o))) {
          out = narrow;
          continue;
        }
      }
    }
    // Above or below the panel, without an arrow (the spotlight still shows the target).
    const above = { ...out, top: r.top - h - 12, arrow: "none" as const };
    const below = { ...out, top: r.bottom + 12, arrow: "none" as const };
    if (above.top >= 60 && !clear.some((o) => hits(above, cw, h, o))) out = above;
    else if (below.top + h <= H - 90 && !clear.some((o) => hits(below, cw, h, o))) out = below;
  }
  return out;
}

function rectOf(target?: string) {
  if (!target) return null;
  if (target.startsWith("3d:")) {
    const key = target.slice(3);
    const a = anchors.get(key);
    if (!a || !a.visible) return null;
    const host = document.querySelector(".world")?.getBoundingClientRect();
    const x = (host?.left ?? 0) + a.x,
      y = (host?.top ?? 0) + a.y;
    // Ring size: roughly the object's size on screen.
    const metres = key === "habitat" ? 9 : key === "crater" ? 22 : key === "rover" ? 6 : 5;
    const r = Math.max(36, Math.min(160, (metres / Math.max(8, a.depth)) * 900));
    return new DOMRect(x - r, y - r, r * 2, r * 2);
  }
  const el = document.querySelector(target);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height) return null;
  return r;
}

/** A pulsing ring over whatever the step is about. */
function Spotlight({ step }: { step: Step }) {
  const ring = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const place = () => {
      raf = requestAnimationFrame(place);
      const el = ring.current;
      if (!el) return;
      const r = rectOf(targetOf(step));
      if (!r) {
        el.style.opacity = "0";
        return;
      }
      el.style.opacity = "1";
      const pad = 6;
      el.style.transform = `translate(${r.left - pad}px, ${r.top - pad}px)`;
      el.style.width = `${r.width + pad * 2}px`;
      el.style.height = `${r.height + pad * 2}px`;
      el.classList.toggle("round", targetOf(step)?.startsWith("3d:") ?? false);
    };
    raf = requestAnimationFrame(place);
    return () => cancelAnimationFrame(raf);
  }, [step]);
  return <div ref={ring} className="spotlight" aria-hidden="true" />;
}
