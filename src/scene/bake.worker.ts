import type { Planet } from "../sim/types";
import { bakePlanet, buffersOf } from "./bake";

/** Builds a planet's ground, hills and textures off the main thread. */
self.onmessage = (e: MessageEvent<{ planet: Planet }>) => {
  const baked = bakePlanet(e.data.planet);
  (self as unknown as Worker).postMessage(baked, buffersOf(baked));
};
