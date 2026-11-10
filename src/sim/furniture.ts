import type { Furniture, Rect, Side } from "./base";

/**
 * Furniture and fittings that stand on the campus's floors, room by room: a box `h` tall, its front facing `face`
 * (desks: the side the operator sits at; racks, cabinets and machines: the side you use). Walking collides with
 * every one of them (sim/base.ts) and the 3D model builds each in its box (scene/campus/dress.ts), so what you bump
 * into is what you see. In the rover garage (walked in a suit) they are outdoor solids instead.
 */
const R = (x0: number, z0: number, x1: number, z1: number): Rect => ({ x0, z0, x1, z1 });
const F = (id: string, cell: string, kind: string, x0: number, z0: number, x1: number, z1: number, h: number, face: Side): Furniture => ({ id, cell, kind, rect: R(x0, z0, x1, z1), h, face });
/** A row of seats, each `size` across, centred on the given points. */
const seats = (prefix: string, cell: string, kind: string, xs: number[], z: number, face: Side, size = 0.56, h = 1.0) => xs.map((x, i) => F(`${prefix}-${i + 1}`, cell, kind, x - size / 2, z - size / 2, x + size / 2, z + size / 2, h, face));

export const FURNITURE: Furniture[] = [
  /* ---- A. Command HQ ---- */
  // The operations hall: two rows of consoles facing the display wall (two banks each, an aisle down the middle).
  ...[-1, 1].flatMap((s) => [
    F(`hq-console-a${s < 0 ? "w" : "e"}`, "hq-hall", "console", s < 0 ? -7 : 1.2, 43.0, s < 0 ? -1.2 : 7, 43.9, 0.76, "s"),
    F(`hq-console-b${s < 0 ? "w" : "e"}`, "hq-hall", "console", s < 0 ? -7 : 1.2, 46.0, s < 0 ? -1.2 : 7, 46.9, 0.76, "s"),
  ]),
  ...seats("hq-chair-a", "hq-hall", "chair", [-6.0, -4.1, -2.2, 2.2, 4.1, 6.0], 44.45, "n"),
  ...seats("hq-chair-b", "hq-hall", "chair", [-6.0, -4.1, -2.2, 2.2, 4.1, 6.0], 47.45, "n"),
  // Under the mezzanine: the situation table, the crisis station and the equipment closet.
  F("hq-table", "hq-hall", "situation-table", -1.4, 52.6, 1.4, 54.0, 0.95, "n"),
  F("hq-crisis", "hq-hall", "crisis-station", 8.0, 56.05, 11.0, 56.4, 1.9, "n"),
  F("hq-closet", "hq-hall", "closet", -13.9, 55.8, -11.4, 56.4, 2.1, "n"),
  // The mezzanine: the flight director's desk and CAPCOM's, overlooking the hall; a rail at the windows behind.
  F("hq-fd-desk", "hq-mezzanine", "console", -4.5, 51.0, 4.5, 51.8, 0.76, "s"),
  F("hq-capcom-desk", "hq-mezzanine", "console", 6.5, 51.0, 11.0, 51.8, 0.76, "s"),
  ...seats("hq-fd-chair", "hq-mezzanine", "chair", [-2.6, 0, 2.6, 7.6, 9.9], 52.15, "n"),
  F("hq-window-rail", "hq-mezzanine", "window-rail", -12.0, 55.95, 12.0, 56.4, 1.05, "n"),
  // Lobby: benches under the windows, the colony map, a planter.
  F("hq-bench-w", "hq-lobby", "bench", -5.0, 34.4, -2.4, 34.85, 0.46, "s"),
  F("hq-bench-e", "hq-lobby", "bench", 2.4, 34.4, 5.0, 34.85, 0.46, "s"),
  F("hq-map", "hq-lobby", "map-kiosk", -4.6, 38.7, -2.6, 39.2, 1.7, "n"),
  F("hq-planter", "hq-lobby", "planter", 3.6, 38.9, 5.6, 39.6, 0.7, "n"),
  // Briefing room: a table for six facing the briefing screen.
  F("hq-brief-table", "hq-briefing", "table", -12.4, 36.5, -8.2, 37.9, 0.75, "n"),
  ...[-11.8, -10.3, -8.8].flatMap((x, i) => [F(`hq-brief-chair-n${i + 1}`, "hq-briefing", "chair", x - 0.25, 35.75, x + 0.25, 36.25, 0.95, "s"), F(`hq-brief-chair-s${i + 1}`, "hq-briefing", "chair", x - 0.25, 38.15, x + 0.25, 38.65, 0.95, "n")]),
  // Comms equipment room: server racks, the Earth link's comms console, a cooling unit.
  ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => F(`hq-rack-${i + 1}`, "hq-equipment", "server-rack", 8.0 + i * 0.6, 34.45, 8.6 + i * 0.6, 35.45, 2.0, "s")),
  F("hq-comms", "hq-equipment", "console", 13.15, 36.4, 13.95, 38.8, 0.76, "w"),
  F("hq-comms-chair", "hq-equipment", "chair", 12.3, 37.3, 12.86, 37.86, 1.0, "e"),
  F("hq-cooling", "hq-equipment", "cooling-unit", 9.0, 39.35, 11.0, 40.0, 1.8, "n"),

  /* ---- H. EVA complex and the yard lock ---- */
  F("eva-rack-w", "eva-suit", "suit-rack", 52.6, 49.0, 55.4, 49.7, 2.05, "s"),
  F("eva-rack-e", "eva-suit", "suit-rack", 63.1, 49.0, 65.9, 49.7, 2.05, "s"),
  F("eva-rack-spare", "eva-suit", "suit-rack", 66.4, 49.0, 69.2, 49.7, 2.05, "s"),
  F("eva-lockers", "eva-suit", "lockers", 50.0, 50.0, 50.6, 54.5, 2.0, "e"),
  F("eva-bench-1", "eva-suit", "bench", 53.0, 51.95, 55.6, 52.35, 0.46, "n"),
  F("eva-bench-2", "eva-suit", "bench", 62.4, 51.95, 65.0, 52.35, 0.46, "n"),
  F("eva-service", "eva-suit", "service-bench", 69.25, 50.9, 70.0, 53.6, 0.9, "w"),
  F("eva-brushes", "eva-dust", "brush-station", 50.0, 57.0, 50.55, 61.2, 1.3, "e"),
  F("eva-vacuum", "eva-dust", "vacuum", 50.0, 61.8, 50.7, 62.9, 1.05, "e"),
  F("eva-lock-bench", "eva-lock", "bench", 63.4, 55.65, 68.6, 56.1, 0.46, "s"),
  F("yard-rack", "yard-stage", "suit-rack", 18.0, 42.0, 18.7, 44.6, 2.05, "e"),
  F("yard-bench", "yard-stage", "bench", 23.55, 42.2, 24.0, 44.4, 0.46, "w"),
  F("yard-lock-bench", "yard-lock", "bench", 18.8, 38.6, 19.25, 40.8, 0.46, "e"),

  /* ---- C. Life support ---- */
  // Control room: two consoles against the plant room's wall, either side of its door.
  F("ls-console-w", "ls-control", "console", -58.5, 40.65, -52.5, 41.45, 0.76, "s"),
  F("ls-console-e", "ls-control", "console", -47.5, 40.65, -41.5, 41.45, 0.76, "s"),
  ...seats("ls-chair", "ls-control", "chair", [-57.0, -54.5, -46.0, -43.5], 41.85, "n"),
  // Plant room: the oxygen plant and CO2 removal to the west, water recovery and its pumps to the east, the tanks
  // beyond; an aisle down the middle from the door.
  F("ls-o2-plant", "ls-plant", "o2-plant", -58.5, 32.0, -54.5, 35.0, 2.2, "e"),
  F("ls-co2", "ls-plant", "co2-rack", -53.2, 31.0, -51.4, 31.75, 2.1, "s"),
  F("ls-water-plant", "ls-plant", "water-plant", -45.5, 32.0, -41.5, 35.0, 2.0, "w"),
  F("ls-pumps", "ls-plant", "pump-skid", -48.6, 31.0, -46.8, 31.8, 1.2, "s"),
  F("ls-o2-tank-1", "ls-plant", "o2-tank", -58.6, 36.6, -57.3, 37.9, 2.4, "e"),
  F("ls-o2-tank-2", "ls-plant", "o2-tank", -56.6, 36.6, -55.3, 37.9, 2.4, "e"),
  F("ls-water-tank-1", "ls-plant", "water-tank", -44.6, 36.4, -43.0, 38.0, 2.6, "w"),
  F("ls-water-tank-2", "ls-plant", "water-tank", -42.4, 36.4, -40.8, 38.0, 2.6, "w"),

  /* ---- E. Greenhouse ---- */
  // Eight hydroponic racks in two groups either side of the central aisle from the door.
  ...[-64.6, -62.0, -59.4, -56.8, -51.2, -48.6, -46.0, -43.4].map((x, i) => F(`gh-rack-${i + 1}`, "gh-hall", "hydro-rack", x, 50.8, x + 1.0, 61.2, 2.3, "e")),
  F("gh-nutrients", "gh-hall", "nutrient-tanks", -65.6, 61.6, -64.2, 62.8, 1.6, "e"),
  F("gh-panel", "gh-hall", "gh-panel", -52.0, 49.0, -51.2, 49.5, 1.7, "s"),
  F("gh-bench", "gh-prep", "potting-bench", -64.0, 66.3, -58.0, 67.0, 0.9, "n"),
  F("gh-germinator", "gh-prep", "germination-cabinet", -48.0, 66.3, -46.0, 67.0, 1.9, "n"),
  F("gh-sink", "gh-prep", "sink", -44.5, 66.4, -43.0, 67.0, 0.9, "n"),

  /* ---- K. Storm shelter ---- */
  // Water walls all round (the mass that stops radiation), four seats, two bunks, the dose console and supplies.
  F("sh-wall-w", "shelter", "water-wall", -34.0, 49.4, -33.6, 60.6, 2.8, "e"),
  F("sh-wall-e", "shelter", "water-wall", -20.4, 49.4, -20.0, 60.6, 2.8, "w"),
  F("sh-wall-s", "shelter", "water-wall", -33.6, 60.6, -20.4, 61.0, 2.8, "n"),
  F("sh-wall-nw", "shelter", "water-wall", -33.6, 49.0, -28.0, 49.4, 2.8, "s"),
  F("sh-wall-ne", "shelter", "water-wall", -26.0, 49.0, -20.4, 49.4, 2.8, "s"),
  ...seats("sh-seat", "shelter", "shelter-seat", [-29.4, -27.4, -25.4, -23.4], 60.2, "n", 0.6, 1.1),
  F("sh-bunk-1", "shelter", "bunk", -33.6, 51.0, -32.7, 53.1, 1.8, "e"),
  F("sh-bunk-2", "shelter", "bunk", -33.6, 54.0, -32.7, 56.1, 1.8, "e"),
  F("sh-console", "shelter", "console", -21.2, 53.0, -20.4, 55.4, 0.76, "w"),
  F("sh-lockers", "shelter", "supply-locker", -20.9, 57.0, -20.4, 59.4, 2.0, "w"),
  F("sh-table", "shelter", "table", -28.5, 53.5, -25.5, 55.0, 0.75, "n"),

  /* ---- I. Rover garage (outdoor solids: it's walked in a suit) ---- */
  F("ga-tools", "garage", "tool-rack", 21.0, 49.0, 25.0, 49.55, 2.2, "s"),
  F("ga-shelf", "garage", "parts-shelf", 29.0, 49.0, 34.0, 49.6, 2.4, "s"),
  F("ga-bench", "garage", "workbench", 40.5, 49.0, 45.5, 49.9, 0.9, "s"),
  F("ga-stand", "garage", "maintenance-stand", 20.0, 55.0, 21.4, 62.0, 1.2, "e"),

  /* ---- D. Science lab ---- */
  F("sci-island-1", "sci-lab", "lab-island", 32.0, 32.4, 40.0, 33.6, 0.92, "s"),
  F("sci-island-2", "sci-lab", "lab-island", 32.0, 35.4, 40.0, 36.6, 0.92, "s"),
  F("sci-glovebox", "sci-lab", "glovebox", 43.5, 29.0, 46.5, 29.9, 1.9, "s"),
  F("sci-microscopes", "sci-lab", "microscope-bench", 47.5, 29.0, 53.2, 29.8, 0.9, "s"),
  F("sci-hood", "sci-lab", "fume-hood", 30.0, 29.8, 30.9, 32.6, 2.2, "e"),
  F("sci-freezer", "sci-lab", "sample-freezer", 30.0, 33.4, 30.9, 34.8, 1.8, "e"),
  F("sci-spectrometer", "sci-lab", "spectrometer", 40.6, 29.0, 43.0, 30.1, 1.6, "s"),
  F("sci-cores", "sci-lab", "core-rack", 30.0, 35.4, 30.7, 38.9, 1.9, "e"),
  F("sci-rocks", "sci-lab", "sample-table", 43.5, 32.6, 47.5, 34.0, 0.9, "s"),
  F("sci-saw", "sci-lab", "rock-saw", 49.8, 32.4, 51.6, 34.0, 1.4, "w"),
  F("sci-console", "sci-lab", "console", 49.0, 36.8, 53.5, 37.6, 0.76, "s"),
  ...seats("sci-chair", "sci-lab", "chair", [50.2, 52.4], 37.95, "n"),
  F("sci-cabinet-w", "sci-store", "sample-cabinet", 30.0, 40.2, 30.6, 44.6, 2.0, "e"),
  F("sci-cabinet-s", "sci-store", "sample-cabinet", 31.0, 44.4, 41.5, 45.0, 2.0, "n"),
  F("sci-brief-table", "sci-brief", "table", 50.0, 41.2, 53.0, 42.6, 0.75, "n"),
  ...seats("sci-brief-chair", "sci-brief", "chair", [50.8, 52.2], 40.75, "s", 0.5, 0.95),

  /* ---- F. Clinic ---- */
  ...[-34.15, -29.15, -24.15].map((x, i) => F(`cl-bed-${i + 1}`, "clinic-bays", "exam-bed", x - 0.45, 33.0, x + 0.45, 35.0, 0.75, "s")),
  F("cl-cabinet-1", "clinic-bays", "med-cabinet", -32.4, 33.0, -30.4, 33.5, 1.9, "s"),
  F("cl-cabinet-2", "clinic-bays", "med-cabinet", -27.4, 33.0, -25.4, 33.5, 1.9, "s"),
  F("cl-cart", "clinic-bays", "ultrasound-cart", -31.5, 36.5, -30.9, 37.1, 1.2, "n"),
  F("cl-iso-bed", "clinic-iso", "exam-bed", -35.6, 42.5, -34.7, 44.5, 0.75, "e"),
  F("cl-shelf-w", "clinic-store", "shelving", -28.95, 41.6, -28.4, 44.6, 2.0, "e"),
  F("cl-shelf-e", "clinic-store", "shelving", -22.55, 41.6, -22.0, 44.6, 2.0, "w"),

  /* ---- G. Engineering ---- */
  ...[79, 85, 91].map((x, i) => F(`en-bench-${i + 1}`, "eng-shop", "workbench", x, 41.5, x + 4, 42.4, 0.9, "s")),
  F("en-printer-1", "eng-shop", "printer", 97.0, 39.2, 99.6, 41.0, 2.0, "w"),
  F("en-printer-2", "eng-shop", "printer", 97.0, 42.0, 99.6, 43.8, 2.0, "w"),
  F("en-shelf", "eng-shop", "parts-shelf", 79.0, 39.0, 85.0, 39.6, 2.2, "s"),
  F("en-welding", "eng-shop", "welding-bay", 77.0, 39.2, 78.5, 41.0, 1.2, "e"),
  F("en-stand", "eng-bay", "repair-stand", 82.0, 52.2, 86.0, 54.2, 1.4, "n"),
  F("en-power-desk", "eng-power", "console", 94.0, 54.2, 99.4, 55.0, 0.76, "n"),
  ...seats("en-chair", "eng-power", "chair", [95.5, 97.9], 53.85, "s"),

  /* ---- J. Logistics ---- */
  ...[39.0, 42.2, 45.4].map((z, i) => F(`lo-shelves-${i + 1}`, "log-store", "shelving", -95.5, z, -80.0, z + (i ? 1.1 : 0.9), 2.4, "s")),
  F("lo-pallet-1", "log-store", "pallet", -92.0, 48.5, -90.8, 49.7, 1.0, "n"),
  F("lo-pallet-2", "log-store", "pallet", -82.0, 48.5, -80.8, 49.7, 1.0, "n"),
  F("lo-platform", "log-bay", "loading-platform", -95.0, 53.8, -78.0, 55.0, 0.5, "n"),
];
