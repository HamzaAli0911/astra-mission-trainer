#!/usr/bin/env node
/**
 * Fetch the real NASA data ASTRA ships with and write src/data/space.ts (run with Node 20+: no packages needed).
 *
 *   node tools/data/fetch-space-data.mjs
 *
 * - DONKI (NASA CCMC's Space Weather Database Of Notifications, Knowledge, Information): every solar energetic
 *   particle (SEP) event since 2021, with the flare and coronal mass ejection linked to it. Keyless web service,
 *   at most 60 days per request.
 * - RadLab (NASA OSDR radiation dosimetry database): dose rates measured during the May 2024 solar storms by CRaTER
 *   (orbiting the Moon), Curiosity's RAD (on Mars) and DosTel2 (on the ISS), in 6-hour averages; and Curiosity's
 *   quiet-time background at solar minimum (December 2019) and maximum (May 2024).
 * - OSDR (NASA Open Science Data Repository): titles and summaries of the studies the game cites.
 *
 * The game never needs the network to play: it ships this snapshot. Only the Science library's "Check the Sun
 * now" button asks DONKI live, when a player presses it.
 */
import { writeFileSync } from "node:fs";

const DONKI = "https://ccmc.gsfc.nasa.gov/DONKI/WS/get";
const RADLAB = "https://visualization.osdr.nasa.gov/radlab/api/";
const OSDR = "https://osdr.nasa.gov/osdr/data/search";
const FROM = "2021-01-01";
const today = new Date().toISOString().slice(0, 10);

async function get(url, kind = "json", tries = 3) {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": "ASTRA-data-snapshot" } });
      if (!r.ok) throw new Error(`${r.status} ${url}`);
      return kind === "json" ? await r.json() : await r.text();
    } catch (e) {
      if (i >= tries) throw e;
      await new Promise((r) => setTimeout(r, 1500 * i));
    }
  }
}
const day = (d) => d.toISOString().slice(0, 10);
function windows(from, to, days = 59) {
  const out = [];
  for (let a = new Date(from); a <= new Date(to); a = new Date(a.getTime() + (days + 1) * 864e5)) {
    const b = new Date(Math.min(a.getTime() + days * 864e5, new Date(to).getTime()));
    out.push([day(a), day(b)]);
  }
  return out;
}

/* ---------- DONKI ---------- */
async function donki(type) {
  const all = [];
  for (const [a, b] of windows(FROM, today)) {
    const list = await get(`${DONKI}/${type}?startDate=${a}&endDate=${b}`);
    if (Array.isArray(list)) all.push(...list);
  }
  return all;
}
const [seps, flares, cmes] = [await donki("SEP"), await donki("FLR"), await donki("CME")];
const flareById = new Map(flares.map((f) => [f.flrID, f]));
const cmeById = new Map(cmes.map((c) => [c.activityID, c]));
const speedOf = (c) => {
  const a = (c?.cmeAnalyses ?? []).find((x) => x.isMostAccurate) ?? c?.cmeAnalyses?.[0];
  return a?.speed ? Math.round(a.speed) : null;
};
const rank = (cls) => (cls ? "ABCMX".indexOf(cls[0]) * 100 + parseFloat(cls.slice(1) || "0") : -1);
const sepOut = seps
  .map((s) => {
    const linked = (s.linkedEvents ?? []).map((e) => e.activityID);
    const fl = linked.map((id) => flareById.get(id)).filter(Boolean).sort((a, b) => rank(b.classType) - rank(a.classType))[0];
    const cme = linked.map((id) => cmeById.get(id)).filter(Boolean)[0];
    return {
      id: s.sepID,
      time: s.eventTime,
      flare: fl ? { cls: fl.classType, peak: fl.peakTime, region: fl.activeRegionNum ?? null } : null,
      cmeSpeed: speedOf(cme),
      instrument: s.instruments?.[0]?.displayName ?? "",
      link: s.link,
    };
  })
  .sort((a, b) => a.time.localeCompare(b.time));
// Several instruments often report the same event within hours: keep the first report of each.
const sepEvents = [];
for (const s of sepOut) {
  const last = sepEvents[sepEvents.length - 1];
  if (last && Date.parse(s.time) - Date.parse(last.time) < 12 * 3600e3) {
    if (!last.flare && s.flare) last.flare = s.flare;
    if (!last.cmeSpeed && s.cmeSpeed) last.cmeSpeed = s.cmeSpeed;
    continue;
  }
  sepEvents.push(s);
}
const bigFlares = flares
  .filter((f) => f.classType?.startsWith("X"))
  .map((f) => ({ cls: f.classType, peak: f.peakTime, region: f.activeRegionNum ?? null, link: f.link }))
  .sort((a, b) => a.peak.localeCompare(b.peak));
console.log(`DONKI: ${seps.length} SEP reports -> ${sepEvents.length} events, ${flares.length} flares (${bigFlares.length} X-class), ${cmes.length} CMEs`);

/* ---------- RadLab ---------- */
async function radlab(instrument, from, to) {
  const csv = await get(`${RADLAB}?instrument=${instrument}&timestamp%3E=${from}&timestamp%3C${to}&absorbed_dose_rate&format=csv`, "text");
  const [head, ...rows] = csv.trim().split("\n");
  const cols = head.split(",");
  const ti = cols.indexOf("timestamp"),
    di = cols.indexOf("absorbed_dose_rate");
  return rows
    .map((r) => r.split(","))
    .map((c) => ({ t: c[ti].replaceAll('"', ""), v: parseFloat(c[di]) }))
    .filter((p) => Number.isFinite(p.v));
}
/** 6-hour averages (micrograys an hour), labelled by the bin's start. */
function bins(points, from, to, hours = 6) {
  const out = [];
  for (let t = Date.parse(from + "T00:00Z"); t < Date.parse(to + "T00:00Z"); t += hours * 3600e3) {
    const inBin = points.filter((p) => {
      const x = Date.parse(p.t.endsWith("Z") ? p.t : p.t + "Z");
      return x >= t && x < t + hours * 3600e3;
    });
    out.push(inBin.length ? +(inBin.reduce((a, p) => a + p.v, 0) / inBin.length).toFixed(2) : null);
  }
  return out;
}
const STORM = { from: "2024-05-08", to: "2024-05-25" };
const series = {};
for (const [key, instrument] of [
  ["moon", "CRaTER"],
  ["mars", "MSL-RAD"],
  ["iss", "DosTel2"],
]) {
  const pts = await radlab(instrument, STORM.from, STORM.to);
  const quiet = pts.filter((p) => p.t < "2024-05-09").map((p) => p.v);
  series[key] = {
    instrument,
    points: bins(pts, STORM.from, STORM.to),
    quiet: +(quiet.reduce((a, v) => a + v, 0) / Math.max(1, quiet.length)).toFixed(2),
    peak: +Math.max(...pts.map((p) => p.v)).toFixed(1),
    peakAt: pts.reduce((a, p) => (p.v > a.v ? p : a), pts[0]).t,
  };
  console.log(`RadLab ${instrument}: ${pts.length} readings, quiet ${series[key].quiet} uGy/h, peak ${series[key].peak} at ${series[key].peakAt}`);
}
// Curiosity's background at solar minimum and maximum (galactic cosmic rays are swept away by an active Sun).
const avg = (pts) => +(pts.reduce((a, p) => a + p.v, 0) / pts.length).toFixed(2);
const minPts = await radlab("MSL-RAD", "2019-12-01", "2019-12-15");
const maxPts = (await radlab("MSL-RAD", "2024-04-15", "2024-05-15")).filter((p) => p.v < 15);
const cycle = { solarMin: { month: "2019-12", mean: avg(minPts), n: minPts.length }, solarMax: { month: "2024-04/05", mean: avg(maxPts), n: maxPts.length } };
console.log("Curiosity background:", cycle);

/* ---------- OSDR ---------- */
const STUDIES = ["OSD-268", "OSD-772", "OSD-342", "OSD-21", "OSD-417", "OSD-992"];
const studies = [];
for (const acc of STUDIES) {
  const d = await get(`${OSDR}?term=${acc}&type=cgene&size=5`);
  const s = d.hits.hits.map((h) => h._source).find((x) => x.Accession === acc);
  if (!s) throw new Error(`OSDR: ${acc} not found`);
  const m = s.Mission ?? s["Mission Name"];
  studies.push({
    id: acc,
    title: s["Study Title"],
    mission: typeof m === "object" ? m?.Name ?? "" : (m ?? ""),
    start: typeof m === "object" ? m?.["Start Date"] ?? "" : "",
    flight: s["Flight Program"] ?? "",
    link: `https://osdr.nasa.gov/bio/repo/data/studies/${acc}`,
  });
}
console.log("OSDR:", studies.map((s) => `${s.id} ${s.mission}`).join(", "));

/* ---------- Write ---------- */
const ts = `// Generated by tools/data/fetch-space-data.mjs on ${today}. Do not edit by hand: run the script again.
// Sources: NASA CCMC DONKI (https://ccmc.gsfc.nasa.gov/tools/DONKI/), NASA OSDR RadLab
// (https://visualization.osdr.nasa.gov/radlab/gui/) and NASA OSDR (https://osdr.nasa.gov/bio/repo/).

/** When this snapshot was taken. */
export const SNAPSHOT_DATE = ${JSON.stringify(today)};

/** Solar energetic particle (SEP) events from DONKI since ${FROM}, oldest first, with the strongest linked flare. */
export const SEP_EVENTS: { id: string; time: string; flare: { cls: string; peak: string; region: number | null } | null; cmeSpeed: number | null; instrument: string; link: string }[] = ${JSON.stringify(sepEvents)};

/** X-class solar flares from DONKI since ${FROM}. */
export const X_FLARES: { cls: string; peak: string; region: number | null; link: string }[] = ${JSON.stringify(bigFlares)};

/**
 * The May 2024 solar storms as measured by real instruments (RadLab): absorbed dose rate in micrograys an hour,
 * 6-hour averages from ${STORM.from} (00:00 UTC) to ${STORM.to}.
 */
export const MAY_2024 = ${JSON.stringify({ from: STORM.from, hours: 6, ...series })} as const;

/** Curiosity's quiet-time background on Mars (micrograys an hour) near solar minimum and maximum. */
export const MARS_BACKGROUND = ${JSON.stringify(cycle)} as const;

/** NASA OSDR studies the game cites. */
export const OSDR_STUDIES: { id: string; title: string; mission: string; start: string; flight: string; link: string }[] = ${JSON.stringify(studies)};
`;
writeFileSync(new URL("../../src/data/space.ts", import.meta.url), ts);
console.log("Wrote src/data/space.ts");
