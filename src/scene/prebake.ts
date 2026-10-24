import type { Planet } from "../sim/types";
import { bakePlanet, type Baked } from "./bake";

/**
 * Planets are baked once per visit, in a web worker, starting as soon as the
 * title screen is up, so starting a mission doesn't freeze the page. If workers
 * aren't available the bake runs on the main thread instead.
 */
const done = new Map<Planet, Baked>();
const pending = new Map<Planet, Promise<Baked>>();
let worker: Worker | null | undefined;

function getWorker() {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(new URL("./bake.worker.ts", import.meta.url), { type: "module" });
  } catch {
    worker = null;
  }
  return worker;
}

export const bakedNow = (planet: Planet) => done.get(planet) ?? null;

export function prebake(planet: Planet): Promise<Baked> {
  const ready = done.get(planet);
  if (ready) return Promise.resolve(ready);
  const waiting = pending.get(planet);
  if (waiting) return waiting;
  const p = new Promise<Baked>((resolve) => {
    // Let the page paint first, then bake here.
    const onMain = () => window.setTimeout(() => resolve(bakePlanet(planet)), 30);
    const w = getWorker();
    if (!w) return onMain();
    const onMessage = (e: MessageEvent<Baked>) => {
      if (e.data?.planet !== planet) return;
      cleanup();
      resolve(e.data);
    };
    const onError = () => {
      cleanup();
      worker = null;
      onMain();
    };
    const cleanup = () => {
      w.removeEventListener("message", onMessage);
      w.removeEventListener("error", onError);
    };
    w.addEventListener("message", onMessage);
    w.addEventListener("error", onError);
    w.postMessage({ planet });
  }).then((b) => {
    done.set(planet, b);
    pending.delete(planet);
    return b;
  });
  pending.set(planet, p);
  return p;
}

/** Start baking both planets while the browser is otherwise idle. */
export function warmUp() {
  const go = () => {
    void prebake("moon").then(() => prebake("mars"));
  };
  const idle = (window as unknown as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
  if (idle) idle(go, { timeout: 1200 });
  else window.setTimeout(go, 400);
}
