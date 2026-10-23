import type { Fix } from "../sim/advisor";
import { MODULES } from "../sim/modules";
import { freePad } from "../sim/engine";
import { useGame } from "../state/game";
import { useUI } from "../state/ui";
import { play } from "../lib/sound";

/** Carry out an advisor suggestion: one button that actually helps. */
export function runFix(fix: Fix) {
  const st = useGame.getState(),
    ui = useUI.getState();
  play("click");
  switch (fix.kind) {
    case "act":
      st.act(fix.action);
      break;
    case "build": {
      const g = st.game;
      if (g.res.materials >= MODULES[fix.module].cost && freePad(g, fix.module)) st.act({ type: "build", module: fix.module });
      else ui.openPanel("build");
      break;
    }
    case "panel":
      ui.select(null);
      ui.openPanel(fix.panel);
      break;
    case "rover":
      ui.select(null);
      ui.openPanel("rover");
      st.sendRover(fix.target);
      break;
  }
}
