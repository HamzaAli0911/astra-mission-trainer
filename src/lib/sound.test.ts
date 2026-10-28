import { describe, expect, it } from "vitest";
import { updateAmbience, type Ambience, type AmbienceState } from "./sound";

/** A background mix whose levels are just recorded (no audio needed): each layer's level after one update. */
function mix(s: Partial<AmbienceState>) {
  const param = () => {
    const p = { value: 0, setTargetAtTime: (v: number) => ((p.value = v), p) };
    return p;
  };
  const layer = () => ({ gain: param() });
  const tone = () => ({ frequency: param() });
  const amb = { room: layer(), pump: layer(), wind: layer(), windTone: tone(), whistle: layer(), whistleTone: tone(), whine: layer(), whineOsc: tone(), whineOsc2: tone(), roll: layer(), fan: layer(), breath: layer(), breathTone: tone(), gust: 0.6, gustTo: 0.6, gustAt: 1e9 };
  updateAmbience(amb as unknown as Ambience, 0, { planet: "moon", dust: 0, drive: 0, time: 1.2, view: "orbit", ...s });
  const level = (k: keyof typeof amb) => (amb[k] as { gain: { value: number } }).gain.value;
  return { room: level("room"), pump: level("pump"), wind: level("wind"), whine: level("whine"), roll: level("roll"), fan: level("fan"), breath: level("breath") };
}

describe("the background sound", () => {
  it("is silent outdoors on the Moon: no wind, and no motor through a vacuum", () => {
    for (const view of ["orbit", "chase"] as const) {
      const m = mix({ view, drive: 1 });
      expect(m.wind + m.whine + m.roll + m.room).toBe(0);
    }
    // Driving, you hear the motors through the cab's own frame.
    const cab = mix({ view: "cockpit", drive: 1 });
    expect(cab.whine).toBeGreaterThan(0);
    expect(cab.roll).toBeGreaterThan(0);
    expect(cab.wind).toBe(0);
  });

  it("in a suit on the Moon, only the suit's fan and your breathing", () => {
    const m = mix({ view: "walk", suit: true, inside: false });
    expect(m.fan).toBeGreaterThan(0);
    expect(m.breath).toBeGreaterThan(0);
    expect(m.wind + m.room + m.whine).toBe(0);
  });

  it("on Mars the wind is soft, rises in a dust storm, and is muffled indoors", () => {
    const calm = mix({ planet: "mars", view: "walk", suit: true, inside: false });
    const storm = mix({ planet: "mars", view: "walk", suit: true, inside: false, dust: 1 });
    const indoors = mix({ planet: "mars", view: "walk", inside: true, dust: 1 });
    expect(calm.wind).toBeGreaterThan(0);
    expect(storm.wind).toBeGreaterThan(calm.wind * 2);
    expect(indoors.wind).toBeLessThan(storm.wind / 3);
  });

  it("inside, the air handling is always there and louder by the machinery", () => {
    const quiet = mix({ view: "walk", inside: true });
    const plant = mix({ view: "walk", inside: true, machines: 1.5 });
    expect(quiet.room).toBeGreaterThan(0);
    expect(quiet.pump).toBe(0);
    expect(plant.room).toBeGreaterThan(quiet.room);
    expect(plant.pump).toBeGreaterThan(0);
  });
});
