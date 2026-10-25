import { beforeEach, describe, expect, it } from "vitest";
import { SPAWN } from "../sim/home";
import { useGame } from "./game";
import { useUI } from "./ui";
import { enterWalk, leaveWalk, useWalk, walker, walkInput } from "./walk";

describe("walking inside the home", () => {
  beforeEach(() => {
    useUI.setState({ screen: "game", briefing: false, debrief: false, view: "orbit" });
    useGame.getState().start("red-planet", 7);
    useGame.setState({ paused: false, reason: null });
  });

  it("won't start during the briefing, the debrief, or after the mission ends", () => {
    useUI.setState({ briefing: true });
    expect(enterWalk()).toBe(false);
    expect(useUI.getState().view).toBe("orbit");
    useUI.setState({ briefing: false, debrief: true });
    expect(enterWalk()).toBe(false);
    useUI.setState({ debrief: false });
    useGame.setState({ game: { ...useGame.getState().game, status: "lost" } });
    expect(enterWalk()).toBe(false);
    // Even switching the view directly is turned back.
    useUI.getState().setView("walk");
    expect(useUI.getState().view).toBe("orbit");
  });

  it("starts at the airlock with time at 1×, and gives back the view and speed you had", () => {
    useUI.getState().setView("chase");
    useGame.getState().setSpeed(4);
    walker.x += 2;
    walkInput.keys.add("KeyW");
    expect(enterWalk()).toBe(true);
    expect(useUI.getState().view).toBe("walk");
    expect(useGame.getState().speed).toBe(1);
    expect(walker.x).toBeCloseTo(SPAWN.x);
    expect(walkInput.keys.size).toBe(0);
    leaveWalk();
    expect(useUI.getState().view).toBe("chase");
    expect(useGame.getState().speed).toBe(4);
    expect(useWalk.getState().back).toBeNull();
  });

  it("keeps a speed you chose while walking, and doesn't resume a paused mission", () => {
    useGame.getState().setSpeed(4);
    enterWalk();
    useGame.getState().pause("manual");
    useGame.getState().setSpeed(2);
    useGame.getState().pause("manual");
    useUI.getState().setView("orbit");
    expect(useGame.getState().speed).toBe(2);
    expect(useGame.getState().paused).toBe(true);
  });

  it("stops walking when you go back to the title screen", () => {
    enterWalk();
    useUI.getState().setScreen("title");
    expect(useUI.getState().view).toBe("orbit");
    expect(useWalk.getState().back).toBeNull();
  });
});
