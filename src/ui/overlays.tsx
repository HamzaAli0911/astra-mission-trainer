import { useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  ArrowRight,
  BatteryWarning,
  Clock3,
  BookOpen,
  DoorClosed,
  Droplets,
  FlaskConical,
  Gem,
  Package,
  Sprout,
  Thermometer,
  Tornado,
  Check,
  CheckCircle2,
  CircleAlert,
  ExternalLink,
  GraduationCap,
  Home,
  Map as MapIcon,
  Play,
  RotateCcw,
  Settings,
  SkipForward,
  Sparkles,
  Star,
  SunDim,
  TriangleAlert,
  XCircle,
} from "lucide-react";
import { advise, lessonsFromFailure } from "../sim/advisor";
import { CARDS, cantAfford } from "../sim/cards";
import { goalProgress, starMet, starsFor } from "../sim/goals";
import { CAMPAIGN, mission } from "../sim/missions";
import { clockOf, dayOf, PLANETS } from "../sim/planets";
import { useGame } from "../state/game";
import { MARS_START, unlocked, useUI } from "../state/ui";
import { tutorialFor } from "../state/tutorial";
import { play } from "../lib/sound";
import { hush, speak } from "../lib/speech";
import { LineChart, Modal, Stars } from "./common";
import { runFix } from "./fixes";
import { clearSave } from "../state/save";
import { IconCapcom, IconDose, RESOURCE_ICON } from "./icons";

/* ---------- Briefing ---------- */

export function Briefing() {
  const show = useUI((s) => s.briefing);
  const id = useGame((s) => s.game.missionId);
  const best = useUI((s) => s.progress.stars[id] ?? 0);
  const m = mission(id);
  const stars = useUI((s) => s.progress.stars);
  const hasTutorial = !!tutorialFor(id, stars);
  const newcomer = m.planet === "mars" && !stars["first-light"] && !!tutorialFor(id, stars);
  useEffect(() => {
    if (show) speak(m.briefing.join(" "));
  }, [show, m]);
  if (!show) return null;
  const start = (tutorial: boolean) => {
    hush();
    useUI.setState({ briefing: false });
    const st = useGame.getState();
    if (hasTutorial && tutorial) {
      useUI.getState().setTutorial(0);
      st.resume();
    } else {
      useUI.getState().setTutorial(null);
      st.hold(false);
      st.resume();
    }
    play("good");
  };
  return (
    <div className="scrim strong">
      <section className={`briefing ${m.planet}`} role="dialog" aria-modal="true" aria-labelledby="brief-title">
        <div className="brief-hero">
          <span className={`brief-planet ${m.planet}`} aria-hidden="true" />
          <div>
            <span className="eyebrow">
              {m.number ? `Mission ${m.number} of ${CAMPAIGN.length}` : "Free play"} · {PLANETS[m.planet].name}
            </span>
            <h2 id="brief-title">{m.title}</h2>
            <p className="tagline">{m.tagline}</p>
          </div>
        </div>
        <div className="brief-capcom">
          <span className="capcom-avatar" aria-hidden="true">
            <IconCapcom size={24} />
          </span>
          <div>
            <b>Jo · CAPCOM</b>
            {m.briefing.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        </div>
        <div className="brief-grid">
          <div>
            <h3>Goals</h3>
            <ul className="check-list">
              {m.goals.map((g) => (
                <li key={g.id}>
                  <CheckCircle2 size={18} /> {g.text}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3>Bonus stars</h3>
            <ul className="star-list">
              <li>
                <Star size={16} className="on" /> Complete every goal
              </li>
              {m.stars.map((s) => (
                <li key={s.text}>
                  <Star size={16} className="on" /> {s.text}
                </li>
              ))}
            </ul>
            {best > 0 && (
              <p className="best">
                Your best: <Stars n={best} size={15} />
              </p>
            )}
          </div>
        </div>
        <p className="brief-time">
          <Clock3 size={16} />
          {m.planet === "moon"
            ? "Training time runs fast: a day here lasts 24 hours and plays in about a minute and a half. A real day–night cycle on the Moon takes about 29.5 Earth days, so real crews face nights two weeks long."
            : "Training time runs fast: a sol plays in about a minute and a half. A real Mars sol lasts 24 hours 39 minutes; here it is rounded to 24 hours."}
          {newcomer && " New to outposts? Start with the tutorial: it covers the Moon basics first."}
        </p>
        <footer className="brief-actions">
          <button className="btn ghost" onClick={() => goToMap()}>
            <MapIcon size={17} /> Missions
          </button>
          {m.planet === "moon" && (
            <button className="btn secondary go-mars" onClick={goToMars} title="Skip the Moon and start the first Mars mission">
              <span className="planet-dot mars" aria-hidden="true" /> Go to Mars
            </button>
          )}
          {hasTutorial ? (
            <>
              <button className="btn secondary big brief-start" onClick={() => start(false)} {...(best > 0 ? { "data-autofocus": true, autoFocus: true } : {})}>
                <SkipForward size={18} /> Skip tutorial
              </button>
              <button className="btn primary big" onClick={() => start(true)} {...(best > 0 ? {} : { "data-autofocus": true, autoFocus: true })}>
                <GraduationCap size={18} /> Start with tutorial
              </button>
            </>
          ) : (
            <button className="btn primary big brief-start" onClick={() => start(false)} data-autofocus autoFocus>
              Start mission <Play size={18} />
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}

export function goToMap() {
  hush();
  const st = useGame.getState();
  if (st.game.status === "playing") st.pause("menu");
  useUI.setState({ briefing: false, debrief: false, modal: null, tutorial: null, panel: null, selected: null, placing: null, screen: "map", focus: st.game.missionId });
  st.hold(false);
}

/* ---------- Emergency alert ---------- */

export function AlertCard() {
  const alert = useGame((s) => s.alert);
  // Suggestions are worked out once per alert, so the list stays put while you use it.
  const fixes = useMemo(() => (alert ? advise(useGame.getState().game).filter((a) => a.fix && a.level !== "tip").slice(0, 2) : []), [alert]);
  const [used, setUsed] = useState<string[]>([]);
  useEffect(() => setUsed([]), [alert]);
  if (!alert) return null;
  const heads = alert.kind === "alert";
  return (
    <div className="scrim">
      <section className={`alert-card ${heads ? "heads-up" : ""}`} role="alertdialog" aria-modal="true" aria-labelledby="alert-title">
        <span className="alert-icon">{heads ? <TriangleAlert size={30} /> : <CircleAlert size={30} />}</span>
        <span className="eyebrow">{heads ? "Heads up · time paused" : "Emergency · time paused"}</span>
        <h2 id="alert-title">{alert.text}</h2>
        {fixes.length > 0 && (
          <div className="alert-fixes">
            <small>CAPCOM suggests:</small>
            {fixes.map((a) => {
              const done = used.includes(a.id);
              return (
                <button
                  key={a.id}
                  className={`fix ${done ? "done" : ""}`}
                  disabled={done}
                  onClick={() => {
                    runFix(a.fix!);
                    const next = [...used, a.id];
                    setUsed(next);
                    if (next.length >= fixes.length) useGame.getState().dismissAlert();
                  }}
                >
                  <span>{a.text}</span>
                  <b>
                    {done ? (
                      <>
                        <Check size={15} /> Done
                      </>
                    ) : (
                      <>
                        {a.fix!.label} <ArrowRight size={15} />
                      </>
                    )}
                  </b>
                </button>
              );
            })}
          </div>
        )}
        <button className="btn secondary" data-autofocus autoFocus onClick={() => useGame.getState().dismissAlert()}>
          <Play size={16} /> {heads ? "Got it" : "I'll handle it"}
        </button>
      </section>
    </div>
  );
}

/* ---------- Decision card ---------- */

export function ChoiceCard() {
  const choice = useGame((s) => s.game.choice);
  const [picked, setPicked] = useState<number | null>(null);
  const [lesson, setLesson] = useState<{ title: string; text: string; result: string } | null>(null);
  useEffect(() => {
    if (choice) {
      setPicked(null);
      speak(`${CARDS[choice.card].title} ${CARDS[choice.card].text}`);
    }
  }, [choice]);
  if (lesson)
    return (
      <div className="scrim">
        <section className="choice-card" role="dialog" aria-modal="true" aria-label="Decision result">
          <span className="eyebrow">You chose</span>
          <h2>{lesson.result}</h2>
          <div className="lesson">
            <Sparkles size={18} />
            <p>{lesson.text}</p>
          </div>
          <button
            className="btn primary big"
            data-autofocus
            autoFocus
            onClick={() => {
              setLesson(null);
              useGame.getState().resume();
            }}
          >
            Continue <Play size={18} />
          </button>
        </section>
      </div>
    );
  if (!choice) return null;
  const card = CARDS[choice.card];
  const Icon = CARD_ICON[card.icon];
  // What the options trade: show how much of each the outpost has right now.
  const res = useGame.getState().game.res;
  const traded = [...new Set(card.options.flatMap((o) => o.effects.flatMap((e) => ("give" in e ? (Object.keys(e.give) as (keyof typeof res)[]) : []))))];
  return (
    <div className="scrim">
      <section className={`choice-card icon-${card.icon}`} role="dialog" aria-modal="true" aria-labelledby="choice-title">
        <span className="choice-icon" aria-hidden="true">
          <Icon size={30} />
        </span>
        <span className="eyebrow">Decision · time paused</span>
        <h2 id="choice-title">{card.title}</h2>
        <p>{card.text}</p>
        {traded.length > 0 && (
          <p className="choice-have">
            You have{" "}
            {traded.map((k, i) => {
              const RIcon = RESOURCE_ICON[k];
              return (
                <span key={k}>
                  {i > 0 && " · "}
                  <RIcon size={15} /> {Math.floor(res[k])} {HAVE_UNIT[k]}
                </span>
              );
            })}
          </p>
        )}
        <div className="options">
          {card.options.map((o, i) => {
            const short = cantAfford(res, o);
            return (
            <button
              key={o.label}
              className={`option ${picked === i ? "on" : ""}`}
              disabled={!!short}
              data-autofocus={(i === card.options.findIndex((x) => !cantAfford(res, x))) || undefined}
              onClick={() => {
                setPicked(i);
                play("click");
                if (useGame.getState().act({ type: "choose", option: i })) {
                  useGame.getState().pause("choice");
                  setLesson({ title: card.title, text: card.lesson, result: `${o.label}: ${o.result}` });
                }
              }}
            >
              <b>{o.label}</b>
              <span>{short ? `${short}: not enough` : o.result}</span>
            </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

const HAVE_UNIT = { power: "kWh", o2: "kg O₂", water: "L water", food: "meals", materials: "materials", science: "science" } as const;

const CARD_ICON = {
  battery: BatteryWarning,
  solar: SunDim,
  lander: Package,
  leak: Droplets,
  fever: Thermometer,
  meteor: Sparkles,
  glint: Gem,
  devil: Tornado,
  flask: FlaskConical,
  plant: Sprout,
  airlock: DoorClosed,
} as const;

/* ---------- Debrief ---------- */

export function Debrief() {
  const show = useUI((s) => s.debrief);
  const g = useGame((s) => s.game);
  const best = useUI((s) => s.progress.stars);
  const answered = useUI((s) => s.progress.quiz[g.missionId]);
  const [answer, setAnswer] = useState<number | null>(null);
  const scrim = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setAnswer(null);
    if (!show) return;
    // Open at the top (stars first) and focus the main button without scrolling to it.
    requestAnimationFrame(() => {
      scrim.current?.scrollTo({ top: 0 });
      scrim.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus({ preventScroll: true });
    });
  }, [g.missionId, g.seed, show]);
  const m = mission(g.missionId);
  const won = g.status === "won";
  const stars = starsFor(g, m);
  useEffect(() => {
    if (show) speak(won ? `Mission complete! ${stars} stars.` : `Mission failed. ${g.endReason}`);
  }, [show]);
  const chart = useMemo(() => {
    const h = g.history;
    const nights: { from: number; to: number; color: string }[] = [];
    let from = -1;
    h.forEach((p, i) => {
      if (p.sun < 0.5 && from < 0) from = i;
      if ((p.sun >= 0.5 || i === h.length - 1) && from >= 0) {
        nights.push({ from, to: i, color: "rgba(120,140,255,0.10)" });
        from = -1;
      }
    });
    for (const z of g.hazards)
      if (z.phase !== "pending") {
        const a = h.findIndex((p) => p.t >= z.startAt),
          b = h.findIndex((p) => p.t >= z.endAt);
        if (a >= 0) nights.push({ from: a, to: b < 0 ? h.length - 1 : b, color: z.kind === "storm" ? "rgba(196,139,255,0.22)" : "rgba(255,170,100,0.18)" });
      }
    return { bands: nights, h };
  }, [g.history, g.hazards]);
  if (!show) return null;
  const idx = CAMPAIGN.findIndex((x) => x.id === m.id);
  const next = idx >= 0 ? CAMPAIGN[idx + 1] : undefined;
  const nextOpen = next && unlocked(next.id);
  const cap = Math.max(20, ...chart.h.map((p) => p.power));
  const hours = Math.round(g.t - g.startT);
  const tips = !won ? lessonsFromFailure(g) : [];
  return (
    <div className="scrim strong debrief-scrim" ref={scrim}>
      <section className={`debrief ${won ? "won" : "lost"}`} role="dialog" aria-modal="true" aria-labelledby="debrief-title">
        <header className="debrief-head">
          <span className="eyebrow">
            {m.number ? `Mission ${m.number}` : "Free play"} · {m.title}
          </span>
          <h2 id="debrief-title">{won ? "Mission complete!" : "Mission failed"}</h2>
          {won ? (
            <div className="big-stars" aria-label={`${stars} of 3 stars`}>
              {[0, 1, 2].map((i) => (
                <Star key={i} size={54} className={i < stars ? "on" : ""} style={{ animationDelay: `${0.25 + i * 0.35}s` }} />
              ))}
            </div>
          ) : (
            <p className="fail-reason">
              <TriangleAlert size={20} /> {g.endReason}
            </p>
          )}
          {won && (best[m.id] ?? 0) <= stars && stars === 3 && <p className="perfect">Perfect run!</p>}
        </header>
        <div className="debrief-grid">
          <section>
            <h3>Goals</h3>
            <ul className="result-list">
              {m.goals.map((goal) => {
                const ok = g.goals.includes(goal.id) || goalProgress(g, goal, m).done;
                return (
                  <li key={goal.id} className={ok ? "ok" : "no"}>
                    {ok ? <Check size={17} /> : <XCircle size={17} />} {goal.text}
                  </li>
                );
              })}
            </ul>
            <h3>Bonus stars</h3>
            <ul className="result-list">
              {m.stars.map((r) => {
                const ok = won && starMet(g, r);
                return (
                  <li key={r.text} className={ok ? "ok" : "no"}>
                    <Star size={16} className={ok ? "on" : ""} /> {r.text}
                  </li>
                );
              })}
            </ul>
            <div className="stat-row">
              <span>
                <b>{hours}</b> hours
              </span>
              <span>
                <b>{Math.round(g.stats.minHealth)}%</b> lowest health
              </span>
              <span>
                <b>{g.stats.maxDose.toFixed(1)}</b> mSv max dose
              </span>
              <span>
                <b>{g.stats.brownout.toFixed(1)}</b> h power cuts
              </span>
            </div>
          </section>
          <section>
            <h3>What happened</h3>
            <div className="chart-legend">
              <span style={{ color: "#ffc94a" }}>{RESOURCE_ICON.power({ size: 14 })} Power</span>
              <span style={{ color: "#5ee0ff" }}>{RESOURCE_ICON.o2({ size: 14 })} Oxygen</span>
              <span style={{ color: "#4f95ff" }}>{RESOURCE_ICON.water({ size: 14 })} Water</span>
              <span style={{ color: "#63d471" }}>{RESOURCE_ICON.food({ size: 14 })} Food</span>
            </div>
            <LineChart
              height={140}
              xLabel="training hours"
              bands={chart.bands}
              series={[
                { name: "Power", color: "#ffc94a", values: chart.h.map((p) => p.power), max: cap },
                { name: "Oxygen", color: "#5ee0ff", values: chart.h.map((p) => p.o2), max: 30 },
                { name: "Water", color: "#4f95ff", values: chart.h.map((p) => p.water), max: Math.max(160, ...chart.h.map((p) => p.water)) },
                { name: "Food", color: "#63d471", values: chart.h.map((p) => p.food), max: Math.max(80, ...chart.h.map((p) => p.food)) },
              ]}
            />
            <div className="chart-axis" aria-hidden="true">
              <span>{chart.h.length ? `${PLANETS[g.planet].dayWord} ${dayOf(chart.h[0].t)} · ${clockOf(chart.h[0].t)}` : ""}</span>
              <span>{chart.h.length ? `${PLANETS[g.planet].dayWord} ${dayOf(chart.h[chart.h.length - 1].t)} · ${clockOf(chart.h[chart.h.length - 1].t)}` : ""}</span>
            </div>
            <p className="chart-note">
              <i className="swatch night" /> night {g.hazards.some((z) => z.kind === "storm" && z.phase !== "pending") && <><i className="swatch storm" /> radiation storm</>} {g.hazards.some((z) => z.kind === "dust" && z.phase !== "pending") && <><i className="swatch dust" /> dust storm</>}
            </p>
            {tips.length > 0 && (
              <div className="tips">
                <b>Try this next time</b>
                {tips.map((t) => (
                  <p key={t}>{t}</p>
                ))}
              </div>
            )}
          </section>
        </div>
        <section className="learned">
          <h3>
            <GraduationCap size={20} /> What you learned
          </h3>
          <ul>
            {m.learned.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
          <div className="fact">
            <b>Real science</b>
            <p>{m.fact.text}</p>
            <a href={m.fact.url} target="_blank" rel="noreferrer">
              {m.fact.source} <ExternalLink size={14} />
            </a>
          </div>
        </section>
        <section className="quiz">
          <h3>
            <IconDose size={18} /> Quick check {answered && <span className="badge-ok">✓ answered</span>}
          </h3>
          <p className="q">{m.quiz.q}</p>
          <div className="quiz-options">
            {m.quiz.options.map((o, i) => (
              <button
                key={o}
                disabled={answer !== null}
                className={answer === null ? "" : i === m.quiz.answer ? "right" : i === answer ? "wrong" : "muted"}
                onClick={() => {
                  setAnswer(i);
                  if (i === m.quiz.answer) {
                    play("star");
                    useUI.getState().recordQuiz(m.id);
                  } else play("warn");
                }}
              >
                {o}
              </button>
            ))}
          </div>
          {answer !== null && (
            <p className={`why ${answer === m.quiz.answer ? "right" : "wrong"}`}>
              <b>{answer === m.quiz.answer ? "Correct!" : "Not quite."}</b> {m.quiz.why}
            </p>
          )}
        </section>
        <footer className="debrief-actions">
          <button className="btn ghost" onClick={goToMap}>
            <MapIcon size={17} /> Mission map
          </button>
          <button
            className="btn secondary"
            onClick={() => {
              useUI.setState({ debrief: false, briefing: true, tutorial: null });
              useGame.getState().restart();
            }}
          >
            <RotateCcw size={17} /> {won ? "Play again" : "Try again"}
          </button>
          {won && next && nextOpen && (
            <button className="btn primary big" onClick={() => launch(next.id)} data-autofocus>
              Next: {next.title} <ArrowRight size={18} />
            </button>
          )}
          {won && !next && m.number > 0 && (
            <button className="btn primary big" onClick={goToMap}>
              <Sparkles size={18} /> You finished the campaign!
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}

export function launch(id: string, seed?: number) {
  hush();
  clearSave();
  useGame.getState().start(id, seed);
  useUI.setState({ screen: "game", briefing: true, debrief: false, modal: null, panel: null, selected: null, placing: null, tutorial: null, focus: id });
  useUI.getState().cam("reset");
  play("open");
}

/* ---------- Shortcuts: skip the tutorial, restart, go to Mars ---------- */

/** Start a mission and drop straight into play, with no briefing and no tutorial. */
export function playWithoutTutorial(id: string) {
  launch(id);
  useUI.setState({ briefing: false });
  useUI.getState().setTutorial(null);
  const st = useGame.getState();
  st.hold(false);
  st.resume();
}

/** Go to the first Mars mission (its briefing). */
export function goToMars() {
  launch(MARS_START);
}

/** Start the current mission again from the very beginning (same map and events), at its briefing. */
export function restartMission() {
  hush();
  clearSave();
  useUI.setState({ modal: null, debrief: false, briefing: true, tutorial: null, panel: null, selected: null, placing: null });
  useGame.getState().restart();
  useUI.getState().cam("reset");
  play("open");
}

/** Ask before leaving a mission in progress: to restart it, or to go to Mars. */
export function LeaveConfirm({ kind }: { kind: "restart" | "mars" }) {
  const id = useGame((s) => s.game.missionId);
  const m = mission(id);
  const keep = () => {
    useUI.getState().setModal(null);
    const st = useGame.getState();
    if (st.reason === "menu") st.resume();
  };
  const mars = kind === "mars";
  return (
    <Modal title={mars ? "Go to Mars?" : "Restart mission?"} onClose={keep} className="restart-confirm">
      <p>
        {mars ? "Leave " : "Start "}
        <b>{m.title}</b>
        {mars ? " and fly to Mars? " : " again from the beginning? "}
        Everything you have built and collected in this attempt will be lost.
      </p>
      <div className="menu-list">
        {mars ? (
          <button className="btn primary big" onClick={goToMars}>
            <span className="planet-dot mars" aria-hidden="true" /> Go to Mars
          </button>
        ) : (
          <button className="btn danger big" onClick={restartMission}>
            <RotateCcw size={18} /> Restart from the start
          </button>
        )}
        <button className="btn ghost" onClick={keep} data-autofocus>
          Keep playing
        </button>
      </div>
    </Modal>
  );
}

/* ---------- Pause menu ---------- */

export function PauseMenu({ onClose }: { onClose: () => void }) {
  const { status, id } = useGame(useShallow((s) => ({ status: s.game.status, id: s.game.missionId })));
  const m = mission(id);
  const resume = () => {
    onClose();
    const st = useGame.getState();
    if (st.reason === "menu") st.resume();
  };
  return (
    <Modal title="Paused" onClose={resume} className="pause-menu">
      <p className="muted">
        {m.number ? `Mission ${m.number}: ` : ""}
        {m.title}
      </p>
      <div className="menu-list">
        {status === "playing" && (
          <button className="btn primary big" onClick={resume} data-autofocus>
            <Play size={18} /> Resume
          </button>
        )}
        <button className="btn secondary" onClick={() => useUI.getState().setModal("restart")}>
          <RotateCcw size={17} /> Restart mission
        </button>
        <button className="btn secondary" onClick={() => useUI.getState().setModal("guide")}>
          <BookOpen size={17} /> How to play
        </button>
        <button className="btn secondary" onClick={() => useUI.getState().setModal("settings")}>
          <Settings size={17} /> Settings
        </button>
        <button className="btn ghost" onClick={goToMap}>
          <MapIcon size={17} /> Mission map
        </button>
        <button
          className="btn ghost"
          onClick={() => {
            goToMap();
            useUI.setState({ screen: "title" });
          }}
        >
          <Home size={17} /> Title screen
        </button>
      </div>
    </Modal>
  );
}

