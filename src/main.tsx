import React from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/lexend";
import "./styles/app.css";
import App from "./ui/App";
import { useGame } from "./state/game";
import { useUI } from "./state/ui";
import { useWalk } from "./state/walk";
import { warmUp } from "./scene/prebake";
import { startAutosave } from "./state/save";

// Test hook for automated browser checks: add ?debug to the URL.
const debug = new URLSearchParams(location.search).has("debug");
if (import.meta.env.DEV || debug) Object.assign(window, { __astra: { useGame, useUI, useWalk } });
// The quality-control harness (review shots, timing, overlap and memory checks) loads only with ?debug.
if (debug) void import("./dev/qc");

class Boundary extends React.Component<{ children: React.ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <main className="error-screen">
        <h1>Houston, we have a problem.</h1>
        <p>Something went wrong in the trainer. Your stars are saved in this browser.</p>
        <button className="btn primary" onClick={() => location.reload()}>
          Restart ASTRA
        </button>
      </main>
    ) : (
      this.props.children
    );
  }
}

createRoot(document.getElementById("root")!).render(
  <Boundary>
    <App />
  </Boundary>,
);

// Bake the Moon and Mars in the background while the title screen is up.
warmUp(useUI.getState().settings.graphics === "ultra");
startAutosave();
