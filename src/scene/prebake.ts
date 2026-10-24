import type { Planet } from "../sim/types";
import { bakePlanet, type Baked } from "./bake";
import { detailTexture } from "./surface";

/**
 * Planets are baked once per visit, in a web worker, starting as soon as the
 * title screen is up, so starting a mission doesn't freeze the page. If workers
 * aren't available the bake runs on the main thread instead.
 */
const done = new Map<string, Baked>();
const pending = new Map<string, Promise<Baked>>();
const keyOf = (planet: Planet, fine: boolean) => `${planet}:${fine ? "fine" : "normal"}`;
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

export const bakedNow = (planet: Planet, fine = false) => done.get(keyOf(planet, fine)) ?? null;
/** Any bake of this planet (the map relief is the same in both). */
export const anyBaked = (planet: Planet) => bakedNow(planet, false) ?? bakedNow(planet, true);

export function prebake(planet: Planet, fine = false): Promise<Baked> {
  const key = keyOf(planet, fine);
  const ready = done.get(key);
  if (ready) return Promise.resolve(ready);
  const waiting = pending.get(key);
  if (waiting) return waiting;
  const p = new Promise<Baked>((resolve) => {
    // Let the page paint first, then bake here.
    const onMain = () => window.setTimeout(() => resolve(bakePlanet(planet, fine)), 30);
    const w = getWorker();
    if (!w) return onMain();
    const onMessage = (e: MessageEvent<Baked>) => {
      if (e.data?.planet !== planet || e.data.fine !== fine) return;
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
    w.postMessage({ planet, fine });
  }).then((b) => {
    done.set(key, b);
    pending.delete(key);
    return b;
  });
  pending.set(key, p);
  return p;
}

/** Start baking both planets (and the surface-detail texture) while the browser is otherwise idle. */
export function warmUp(fine = false) {
  const go = () => {
    detailTexture();
    void prebake("moon", fine).then(() => prebake("mars", fine));
  };
  const idle = (window as unknown as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
  if (idle) idle(go, { timeout: 1200 });
  else window.setTimeout(go, 400);
}
