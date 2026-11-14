import { useMemo, useRef, useState } from "react";
import { ExternalLink, RefreshCw, Sun, Table2 } from "lucide-react";
import { MAY_2024, OSDR_STUDIES, SEP_EVENTS, SNAPSHOT_DATE, X_FLARES } from "../data/space";
import { dateOf, LATEST_STORM, MARS_CYCLE, MAY_2024_RISE } from "../sim/spaceweather";

/**
 * The Science library's "Real NASA data" tab: what the game is built on, from the resources NASA Space Apps gave
 * the challenge. The May 2024 storms as measured at the Moon, on Mars and on the ISS (RadLab), the solar cycle in
 * Curiosity's data, a live look at the Sun (DONKI, only when you press the button), the NASA studies behind the
 * crew's health and the greenhouse (OSDR), a real candidate site for a Mars base (Mars Trek), and the Canadian
 * Space Agency's work on food for the Moon and the North.
 */
const RADLAB = "https://visualization.osdr.nasa.gov/radlab/gui/";
const DONKI_UI = "https://ccmc.gsfc.nasa.gov/tools/DONKI/";
const DONKI_WS = "https://ccmc.gsfc.nasa.gov/DONKI/WS/get";

const SERIES = [
  { key: "moon", name: "Moon orbit", who: "CRaTER on NASA's Lunar Reconnaissance Orbiter", color: "#3987e5" },
  { key: "mars", name: "Mars surface", who: "RAD on NASA's Curiosity rover", color: "#d95926" },
  { key: "iss", name: "Space Station (daily average)", who: "DosTel2 on the ISS", color: "#199e70" },
] as const;
type Key = (typeof SERIES)[number]["key"];
/**
 * What's plotted: 6-hour averages, except the Space Station's, smoothed over a day (its 6-hour figures swing with
 * its regular passes through the South Atlantic Anomaly, which would hide the point: no storm reached it).
 */
const plotted = (k: Key): (number | null)[] => {
  const pts = MAY_2024[k].points as readonly (number | null)[];
  if (k !== "iss") return [...pts];
  return pts.map((_, i) => {
    const w = pts.slice(Math.max(0, i - 2), i + 2).filter((v): v is number => v !== null);
    return w.length ? w.reduce((a, v) => a + v, 0) / w.length : null;
  });
};

const STUDY_TEXT: Record<string, { topic: string; text: string }> = {
  "OSD-268": { topic: "Greenhouse", text: "Lettuce grown in the Space Station's Veggie garden in 2014 was flown back to Earth and tested for nutrients and microbes. Leafy greens grown like this have been safe for astronauts to eat." },
  "OSD-772": { topic: "Greenhouse", text: "Chile peppers grown in the Station's Advanced Plant Habitat in 2021: part of learning to grow fresh food for long missions." },
  "OSD-342": { topic: "Crew health", text: "Mice that spent 33 days on the Space Station lost a lot of muscle and bone. Astronauts exercise every day to fight the same loss." },
  "OSD-21": { topic: "Crew health", text: "Mice flown for almost 12 days on Space Shuttle mission STS-108 showed the muscle wasting spaceflight causes, gene by gene." },
  "OSD-417": { topic: "Crew health", text: "On Rodent Research 5 (2017), mice that lost bone in space also had changes in the microbes in their gut." },
  "OSD-992": { topic: "Radiation", text: "Human cells hit by space-like radiation in a lab wore out (became 'senescent') more than cells hit by ordinary gamma rays." },
};

/** Micrograys an hour, on a log axis from 1 to 10,000. */
const fmt = (v: number) => (v >= 100 ? Math.round(v).toLocaleString("en-US") : v.toFixed(1));

function StormChart() {
  const W = 640,
    H = 250,
    L = 46,
    R = 12,
    T = 14,
    B = 30;
  const n = MAY_2024.moon.points.length;
  const x = (i: number) => L + (i / (n - 1)) * (W - L - R);
  const y = (v: number) => T + (1 - Math.log10(Math.max(1, v)) / 4) * (H - T - B);
  const start = Date.parse(`${MAY_2024.from}T00:00Z`);
  const at = (i: number) => new Date(start + i * MAY_2024.hours * 3600e3);
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const svg = useRef<SVGSVGElement>(null);
  const paths = useMemo(
    () =>
      SERIES.map((s) => {
        const pts = plotted(s.key);
        let d = "";
        let pen = false;
        pts.forEach((v, i) => {
          if (v === null) return void (pen = false);
          d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
          pen = true;
        });
        return { ...s, d };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const peakIndex = (k: Key) => {
    const pts = MAY_2024[k].points as readonly (number | null)[];
    return pts.reduce<number>((best, v, i) => ((v ?? -1) > (pts[best] ?? -1) ? i : best), 0);
  };
  const days = Array.from({ length: Math.floor((n - 1) / (24 / MAY_2024.hours)) + 1 }, (_, d) => d).filter((d) => d % 2 === 0);
  const pick = (clientX: number) => {
    const r = svg.current!.getBoundingClientRect();
    const sx = ((clientX - r.left) / r.width) * W;
    setHover(Math.max(0, Math.min(n - 1, Math.round(((sx - L) / (W - L - R)) * (n - 1)))));
  };
  const daily = useMemo(() => {
    const per = 24 / MAY_2024.hours;
    return Array.from({ length: Math.ceil(n / per) }, (_, d) => {
      const row: Record<string, number | null> = {};
      for (const s of SERIES) {
        const vals = (MAY_2024[s.key].points as readonly (number | null)[]).slice(d * per, d * per + per).filter((v): v is number => v !== null);
        row[s.key] = vals.length ? vals.reduce((a, v) => a + v, 0) / vals.length : null;
      }
      return { day: at(d * per), values: row as Record<Key, number | null> };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="rd-chart">
      <div className="rd-legend" aria-hidden="true">
        {SERIES.map((s) => (
          <span key={s.key}>
            <i style={{ background: s.color }} />
            {s.name}
          </span>
        ))}
      </div>
      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        tabIndex={0}
        aria-label={`Radiation dose rate, 8 to 24 May 2024, in micrograys an hour on a logarithmic scale. Moon orbit: quiet ${MAY_2024.moon.quiet}, peak ${fmt(MAY_2024.moon.peak)} (${MAY_2024_RISE.moon} times). Mars surface: quiet ${MAY_2024.mars.quiet}, peak ${fmt(MAY_2024.mars.peak)} (${MAY_2024_RISE.mars} times). Space Station: about ${MAY_2024.iss.quiet} throughout. Use the left and right arrow keys to read values.`}
        onPointerMove={(e) => pick(e.clientX)}
        onPointerLeave={() => setHover(null)}
        onKeyDown={(e) => {
          if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
          e.preventDefault();
          setHover((h) => Math.max(0, Math.min(n - 1, (h ?? 0) + (e.key === "ArrowRight" ? 1 : -1))));
        }}
        onBlur={() => setHover(null)}
      >
        {[1, 10, 100, 1000, 10000].map((v) => (
          <g key={v} className="rd-grid">
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} />
            <text x={L - 6} y={y(v) + 3.5} textAnchor="end">
              {v.toLocaleString("en-US")}
            </text>
          </g>
        ))}
        {days.map((d) => (
          <text key={d} className="rd-tick" x={x(d * (24 / MAY_2024.hours))} y={H - 10} textAnchor="middle">
            {`${at(d * (24 / MAY_2024.hours)).getUTCDate()} May`}
          </text>
        ))}
        {paths.map((p) => (
          <path key={p.key} d={p.d} fill="none" stroke={p.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {/* The extremes, labelled: how far each place's dose rate rose. */}
        {(["moon", "mars"] as const).map((k) => {
          const i = peakIndex(k);
          const v = (MAY_2024[k].points as readonly (number | null)[])[i] ?? 0;
          const s = SERIES.find((q) => q.key === k)!;
          return (
            <g key={k}>
              <circle cx={x(i)} cy={y(v)} r={4} fill={s.color} stroke="#111a3a" strokeWidth={2} />
              <text className="rd-label" x={x(i) + (k === "mars" ? -8 : 8)} y={y(v) - 8} textAnchor={k === "mars" ? "end" : "start"}>
                {s.name}: up to {MAY_2024_RISE[k]}× normal
              </text>
            </g>
          );
        })}
        {hover !== null && (
          <g className="rd-cross">
            <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} />
            {SERIES.map((s) => {
              const v = plotted(s.key)[hover];
              return v === null ? null : <circle key={s.key} cx={x(hover)} cy={y(v)} r={4} fill={s.color} stroke="#111a3a" strokeWidth={2} />;
            })}
          </g>
        )}
        <text className="rd-unit" x={L} y={T - 3}>
          µGy/h (log scale)
        </text>
      </svg>
      {hover !== null && (
        <div className="rd-tip" role="status" style={{ left: `${(x(hover) / W) * 100}%` }}>
          <b>
            {at(hover).getUTCDate()} May, {String(at(hover).getUTCHours()).padStart(2, "0")}:00–{String(at(hover).getUTCHours() + MAY_2024.hours).padStart(2, "0")}:00 UTC
          </b>
          {SERIES.map((s) => {
            const v = plotted(s.key)[hover];
            return (
              <span key={s.key}>
                <i style={{ background: s.color }} />
                {s.name}: {v === null ? "no reading" : `${fmt(v)} µGy/h`}
              </span>
            );
          })}
        </div>
      )}
      <button className="btn ghost small rd-table-btn" onClick={() => setTable(!table)} aria-expanded={table}>
        <Table2 size={15} /> {table ? "Hide the numbers" : "Show the numbers"}
      </button>
      {table && (
        <table className="rd-table">
          <caption>Daily average dose rate, micrograys an hour (UTC days)</caption>
          <thead>
            <tr>
              <th>Day</th>
              {SERIES.map((s) => (
                <th key={s.key}>{s.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {daily.map((r) => (
              <tr key={r.day.toISOString()}>
                <td>{r.day.getUTCDate()} May</td>
                {SERIES.map((s) => {
                  const v = r.values[s.key];
                  return <td key={s.key}>{v === null ? "–" : fmt(v)}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/** A live look at the last 30 days of the real Sun, from DONKI (only when asked). */
function SunNow() {
  const [st, setSt] = useState<{ phase: "idle" | "loading" | "done" | "error"; counts?: Record<string, number>; biggest?: { cls: string; peak: string } | null; storms?: string[] }>({ phase: "idle" });
  const check = async () => {
    setSt({ phase: "loading" });
    const end = new Date(),
      from = new Date(end.getTime() - 30 * 864e5);
    const q = `startDate=${from.toISOString().slice(0, 10)}&endDate=${end.toISOString().slice(0, 10)}`;
    const get = async (type: string) => {
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), 12000);
      try {
        const r = await fetch(`${DONKI_WS}/${type}?${q}`, { signal: ac.signal });
        if (!r.ok) throw new Error(String(r.status));
        const text = await r.text();
        return text.trim() ? (JSON.parse(text) as Record<string, unknown>[]) : [];
      } finally {
        clearTimeout(t);
      }
    };
    try {
      const [flares, seps] = await Promise.all([get("FLR"), get("SEP")]);
      const counts: Record<string, number> = { X: 0, M: 0, C: 0 };
      let biggest: { cls: string; peak: string } | null = null;
      const rank = (c: string) => "ABCMX".indexOf(c[0]) * 100 + (parseFloat(c.slice(1)) || 0);
      for (const f of flares) {
        const cls = String(f.classType ?? "");
        if (cls[0] in counts) counts[cls[0]]++;
        if (cls && (!biggest || rank(cls) > rank(biggest.cls))) biggest = { cls, peak: String(f.peakTime ?? "") };
      }
      setSt({ phase: "done", counts, biggest, storms: [...new Set(seps.map((s) => dateOf(String(s.eventTime ?? ""))))] });
    } catch {
      setSt({ phase: "error" });
    }
  };
  return (
    <div className="rd-live" aria-live="polite">
      {st.phase === "idle" && (
        <button className="btn small" onClick={check}>
          <Sun size={16} /> Check the real Sun now
        </button>
      )}
      {st.phase === "loading" && (
        <p>
          <RefreshCw size={14} className="spin" /> Asking NASA's DONKI…
        </p>
      )}
      {st.phase === "done" && st.counts && (
        <>
          <p>
            <b>The last 30 days:</b> {st.counts.X} X-class, {st.counts.M} M-class and {st.counts.C} C-class flares
            {st.biggest ? `; the biggest was ${st.biggest.cls} on ${dateOf(st.biggest.peak)}` : ""}.
          </p>
          <p>
            <b>Particle storms</b> (the kind that would send a crew to the shelter): {st.storms?.length ? st.storms.join(", ") : "none. A quiet month for astronauts."}
          </p>
        </>
      )}
      {st.phase === "error" && (
        <p>
          Couldn't reach DONKI just now (are you offline?). From the game's snapshot: the latest particle storm with a flare behind it was on {LATEST_STORM ? `${dateOf(LATEST_STORM.time)} (${LATEST_STORM.flare?.cls} flare)` : "–"}.
        </p>
      )}
      <small>This asks NASA's server straight from your browser. Nothing about you is sent.</small>
    </div>
  );
}

const Source = ({ href, children }: { href: string; children: string }) => (
  <a href={href} target="_blank" rel="noreferrer">
    {children} <ExternalLink size={13} />
  </a>
);

export function RealData() {
  const since = SEP_EVENTS[0]?.time.slice(0, 4) ?? "2021";
  return (
    <div className="realdata">
      <article className="rd-wide">
        <span className="eyebrow">Radiation · real measurements</span>
        <h3>The storms of May 2024, seen from three places</h3>
        <p>
          In May 2024 the Sun fired a run of storms towards Earth and the Moon (10 to 14 May), then a big one towards Mars (20 May). Orbiting the Moon, the dose rate rose to <b>{MAY_2024_RISE.moon} times</b> its quiet level. On the surface of Mars, under its thin air, it rose to <b>{MAY_2024_RISE.mars} times</b>. The Space Station, inside Earth's magnetic field, hardly noticed either. Where a storm is aimed matters, and so does what's around you: thin air helps a little, a magnetic field a lot, and on the Moon only walls do.
        </p>
        <StormChart />
        <Source href={RADLAB}>NASA OSDR · RadLab radiation database</Source>
      </article>
      <article>
        <span className="eyebrow">Radiation · the solar cycle</span>
        <h3>A busy Sun, fewer cosmic rays</h3>
        <p>
          Curiosity's quiet-day background on Mars was about <b>{MARS_CYCLE.min.toFixed(1)} µGy an hour</b> in December 2019, when the Sun was calm, and about <b>{MARS_CYCLE.max.toFixed(1)}</b> in 2024, when it was busy. An active Sun's magnetic field sweeps away some of the cosmic rays from deep space, even while its own storms add danger.
        </p>
        <Source href={RADLAB}>NASA OSDR · RadLab (Curiosity RAD)</Source>
      </article>
      <article>
        <span className="eyebrow">Space weather · live</span>
        <h3>What is the Sun doing now?</h3>
        <p>
          Every storm in the game is modelled on a real one from NASA's DONKI database: {SEP_EVENTS.length} particle storms and {X_FLARES.length} X-class flares since {since}. CAPCOM tells you which one.
        </p>
        <SunNow />
        <Source href={DONKI_UI}>NASA CCMC · DONKI</Source>
      </article>
      <article className="rd-wide">
        <span className="eyebrow">Crew health and food · NASA research</span>
        <h3>The studies behind the game</h3>
        <ul className="rd-studies">
          {OSDR_STUDIES.map((s) => (
            <li key={s.id}>
              <b>{STUDY_TEXT[s.id]?.topic}</b> {STUDY_TEXT[s.id]?.text ?? s.title}{" "}
              <Source href={s.link}>{`OSDR ${s.id}${s.mission ? ` · ${s.mission}` : ""}`}</Source>
            </li>
          ))}
        </ul>
      </article>
      <article>
        <span className="eyebrow">Mars · a real place</span>
        <h3>Where a Mars base could stand</h3>
        <p>
          Deuteronilus Mensae is a region of flat-topped mesas on Mars. It was proposed as a landing zone for the first human explorers at a NASA workshop in 2015, because radar on the Mars Reconnaissance Orbiter found ice buried under its rocky slopes: water for a crew, and rock to shield a base. The game's Mars map, with its mesa and buried ice, is inspired by places like it.
        </p>
        <Source href="https://trek.nasa.gov/mars/">Explore it in NASA's Mars Trek (search "Deuteronilus Mensae")</Source>
        <Source href="https://archive2.news.brown.edu/2007-2015/articles/2015/10/mars.html">Brown University · the site proposal</Source>
      </article>
      <article>
        <span className="eyebrow">Food · Canadian Space Agency</span>
        <h3>Food for the Moon and for the North</h3>
        <p>
          The Canadian Space Agency and NASA ran the Deep Space Food Challenge. The winning system could grow over 700 kg of fresh food a year, for astronauts and for remote places on Earth like Canada's North, where fresh food is hard to get too.
        </p>
        <p>
          In CSA's Tomatosphere project, classes grow tomato seeds that have been in space (or space-like conditions) beside ordinary ones, without knowing which is which. Over three million students have taken part.
        </p>
        <Source href="https://www.asc-csa.gc.ca/eng/sciences/food-production/deep-space-food-challenge.asp">CSA · Deep Space Food Challenge</Source>
        <Source href="https://www.asc-csa.gc.ca/eng/youth-educators/toolkits/food-production/">CSA · Food production toolkit</Source>
        <Source href="https://www.asc-csa.gc.ca/eng/youth-educators/tomatosphere.asp">CSA · Tomatosphere</Source>
      </article>
      <p className="rd-foot">
        Snapshot of DONKI, RadLab and OSDR taken {dateOf(SNAPSHOT_DATE)}; it ships with the game, so everything here works offline except the live check. Refresh it with tools/data/fetch-space-data.mjs.
      </p>
    </div>
  );
}
