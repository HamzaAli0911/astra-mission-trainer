import { MARS_BACKGROUND, MAY_2024, SEP_EVENTS } from "../data/space";

/**
 * Real space weather behind the game's solar storms. Every storm is modelled on a real solar energetic particle
 * (SEP) event from NASA's DONKI database (the snapshot in src/data/space.ts): random storms pick one, scripted ones
 * name theirs, and its flare sets how strong the storm is within the game's range. The May 2024 storms, as measured
 * by real instruments at the Moon, on Mars and on the ISS (NASA RadLab), give the numbers CAPCOM and the stations
 * quote. Pure: no network (the Science library's live "Check the Sun now" is separate, in the UI).
 */
export type RealStorm = (typeof SEP_EVENTS)[number];

/** Real particle storms with a flare behind them: the kind a forecaster can warn about. */
export const FLARE_STORMS: RealStorm[] = SEP_EVENTS.filter((e) => !!e.flare);
export const realStorm = (id: string | undefined) => (id ? (SEP_EVENTS.find((e) => e.id === id) ?? null) : null);

/** How big a flare's class is, 0–1: C1 about 0.1, M1 0.2, X1 0.6, X10 or more 1. */
export function flareScore(cls: string | null | undefined) {
  if (!cls) return 0.25;
  const n = parseFloat(cls.slice(1)) || 1;
  if (cls[0] === "X") return Math.min(1, 0.55 + 0.045 * n);
  if (cls[0] === "M") return Math.min(0.5, 0.17 + 0.03 * n);
  return 0.1;
}
/** A storm's strength in the game (extra dose rate outdoors, mSv an hour) from its real flare: 12 to 16. */
export const stormStrength = (e: RealStorm | null) => Math.round((12 + 4 * flareScore(e?.flare?.cls)) * 2) / 2;

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** "11 May 2024" from an ISO date. */
export function dateOf(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}
/** CAPCOM's line about the real event a storm is modelled on. */
export function realStormLine(e: RealStorm) {
  const f = e.flare;
  const speed = e.cmeSpeed ? ` and a cloud of plasma left the Sun at ${e.cmeSpeed.toLocaleString("en-US")} km/s` : "";
  return f
    ? `This storm is modelled on a real one: on ${dateOf(e.time)} ${/^[MX]/.test(f.cls) ? "an" : "a"} ${f.cls} flare erupted${speed}, and fast particles reached Earth and the Moon. (NASA DONKI)`
    : `This storm is modelled on a real particle storm that reached Earth and the Moon on ${dateOf(e.time)}. (NASA DONKI)`;
}

/** How far each place's dose rate rose in the May 2024 storms (peak over the quiet level), from real instruments. */
export const MAY_2024_RISE = (() => {
  const top = (k: "moon" | "mars" | "iss") => Math.max(...(MAY_2024[k].points as readonly (number | null)[]).map((x) => x ?? 0));
  return {
    // (The Moon and Mars at their highest single reading; the ISS from 6-hour averages, which smooth out its regular
    // passes through the South Atlantic Anomaly.)
    moon: Math.round(MAY_2024.moon.peak / MAY_2024.moon.quiet),
    mars: Math.round(MAY_2024.mars.peak / MAY_2024.mars.quiet),
    iss: +(top("iss") / MAY_2024.iss.quiet).toFixed(1),
  };
})();
/** Curiosity's quiet background on Mars, near solar minimum and maximum (micrograys an hour). */
export const MARS_CYCLE = { min: MARS_BACKGROUND.solarMin.mean, max: MARS_BACKGROUND.solarMax.mean };
/** The most recent real particle storm in the snapshot. */
export const LATEST_STORM: RealStorm | null = FLARE_STORMS.at(-1) ?? null;
