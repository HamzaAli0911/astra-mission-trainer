import * as THREE from "three";
import type { ModuleType, Planet } from "../sim/types";
import { finalize, light } from "./kit";
import type { ModuleView } from "./models/common";
import { buildHabitat } from "./models/habitat";
import { buildGreenhouse, buildOxygen, buildRecycler } from "./models/life";
import { buildBattery, buildReactor, buildSolar } from "./models/power";
import { buildIceDrill, buildLab, buildShelter } from "./models/works";

export type { ModuleView } from "./models/common";
export { buildRover, type RoverView } from "./models/rover";
export { buildAstronaut, poseAstronaut } from "./models/crew";
export { buildDock, buildFlag, buildLander, buildPad, scaffold } from "./models/site";

/** Build one outpost module. Every model is procedural and original, and faces north (−z) at rotation 0. */
export function buildModule(type: ModuleType, planet: Planet): ModuleView {
  const g = new THREE.Group();
  const view: ModuleView = { group: g, status: light("#3ee39a"), glow: [], spin: [], blink: [], top: 2.5 };
  switch (type) {
    case "habitat":
      buildHabitat(view, planet);
      break;
    case "solar":
      buildSolar(view, planet);
      break;
    case "battery":
      buildBattery(view);
      break;
    case "oxygen":
      buildOxygen(view, planet);
      break;
    case "recycler":
      buildRecycler(view);
      break;
    case "greenhouse":
      buildGreenhouse(view);
      break;
    case "icedrill":
      buildIceDrill(view, planet);
      break;
    case "shelter":
      buildShelter(view, planet);
      break;
    case "lab":
      buildLab(view);
      break;
    case "reactor":
      buildReactor(view, planet);
      break;
  }
  finalize(g);
  view.group.userData.top = view.top;
  return view;
}
