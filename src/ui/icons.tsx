import type { SVGProps } from "react";
import type { ModuleType, ResourceKey } from "../sim/types";

/** Original line icons in the same style as Lucide (24 px grid, 2 px round strokes). */
type P = SVGProps<SVGSVGElement> & { size?: number };
function Svg({ size = 22, children, ...rest }: P & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconPower = (p: P) => (
  <Svg {...p}>
    <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" />
  </Svg>
);
export const IconO2 = (p: P) => (
  <Svg {...p}>
    <circle cx="9" cy="11" r="6" />
    <path d="M16.5 15.5c0-1 2.5-1.6 2.5.2 0 1.4-2.5 2.6-2.8 3.8H19.6" strokeWidth={1.7} />
  </Svg>
);
export const IconWater = (p: P) => (
  <Svg {...p}>
    <path d="M12 2.7S5.5 9.6 5.5 14.3a6.5 6.5 0 0 0 13 0C18.5 9.6 12 2.7 12 2.7z" />
    <path d="M9 15a3 3 0 0 0 3 3" />
  </Svg>
);
export const IconFood = (p: P) => (
  <Svg {...p}>
    <path d="M7 20c-1.5-1.5-.6-5.4 2.2-8.2l4.6-4.6 3 3-4.6 4.6C9.4 17.6 8.5 21.5 7 20z" />
    <path d="M14 7.4c.6-2.2 2.2-3.8 4.4-4.4M16.6 10c2.2-.6 3.8-2.2 4.4-4.4M10.5 14.5l-1.7-1.7M12.8 12.2l-1.6-1.6" />
  </Svg>
);
export const IconDose = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="1.8" />
    <path d="M12 10.2 9 5a8 8 0 0 1 6 0zM13.6 13l5.9.2a8 8 0 0 1-3 5.2zM10.4 13l-2.9 5.4a8 8 0 0 1-3-5.2z" />
  </Svg>
);
export const IconMaterials = (p: P) => (
  <Svg {...p}>
    <path d="m3 9 4-5h10l4 5-9 11z" />
    <path d="M3 9h18M9 4l3 16 3-16" />
  </Svg>
);
export const IconScience = (p: P) => (
  <Svg {...p}>
    <path d="M9 3h6M10 3v6.2L4.6 18.4A1.8 1.8 0 0 0 6.2 21h11.6a1.8 1.8 0 0 0 1.6-2.6L14 9.2V3" />
    <path d="M7.3 15h9.4" />
  </Svg>
);
export const IconHeart = (p: P) => (
  <Svg {...p}>
    <path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z" />
  </Svg>
);

export const RESOURCE_ICON: Record<ResourceKey, (p: P) => React.ReactElement> = {
  power: IconPower,
  o2: IconO2,
  water: IconWater,
  food: IconFood,
  materials: IconMaterials,
  science: IconScience,
};

export const IconHabitat = (p: P) => (
  <Svg {...p}>
    <path d="M3 19h18M5 19v-6a7 7 0 0 1 14 0v6" />
    <path d="M10 19v-4h4v4M8.5 11.5h1.5M14 11.5h1.5" />
  </Svg>
);
export const IconSolar = (p: P) => (
  <Svg {...p}>
    <path d="M3.5 13.5 6 6h14.5L18 13.5z" />
    <path d="M13.3 6 11 13.5M4.8 9.75H19.3M11.7 13.5V19M8.5 19h6.4" />
    <circle cx="4.5" cy="3.5" r="1.4" />
  </Svg>
);
export const IconBattery = (p: P) => (
  <Svg {...p}>
    <rect x="3" y="7" width="16" height="11" rx="2.2" />
    <path d="M21 11v3M11.5 9.5l-2 3.5h3l-2 3.5" />
  </Svg>
);
export const IconOxygen = (p: P) => (
  <Svg {...p}>
    <circle cx="8.5" cy="14" r="5" />
    <circle cx="16.5" cy="7.5" r="3.5" />
    <path d="M6.5 14a2 2 0 0 1 2-2" />
  </Svg>
);
export const IconRecycler = (p: P) => (
  <Svg {...p}>
    <path d="M12 8.5S9 11.6 9 13.6a3 3 0 0 0 6 0c0-2-3-5.1-3-5.1z" />
    <path d="M20 12a8 8 0 0 1-13.7 5.6M4 12a8 8 0 0 1 13.7-5.6" />
    <path d="M17.7 3v3.4h-3.4M6.3 21v-3.4h3.4" />
  </Svg>
);
export const IconGreenhouse = (p: P) => (
  <Svg {...p}>
    <path d="M2.5 20h19M4 20v-7a8 8 0 0 1 16 0v7" />
    <path d="M12 20v-5M12 15c-2.4 0-3.4-1.5-3.4-3.4 2.4 0 3.4 1.5 3.4 3.4zM12 15c2.4 0 3.4-1.5 3.4-3.4-2.4 0-3.4 1.5-3.4 3.4z" />
  </Svg>
);
export const IconDrill = (p: P) => (
  <Svg {...p}>
    <path d="M6 3h12M8 3l2 4h4l2-4M10 7v4l2 2 2-2V7M12 13v8" />
    <path d="m4 18 2 1M20 18l-2 1M5 14l1.6.6M19 14l-1.6.6" />
  </Svg>
);
export const IconShelter = (p: P) => (
  <Svg {...p}>
    <path d="M12 2.5 4 5.5v6c0 5 3.4 8.4 8 10 4.6-1.6 8-5 8-10v-6z" />
    <path d="M8.5 13.5 12 10l3.5 3.5M10 13v3.5h4V13" />
  </Svg>
);
export const IconLab = IconScience;
export const IconReactor = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="1.6" />
    <ellipse cx="12" cy="12" rx="9" ry="3.6" />
    <ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(60 12 12)" />
    <ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(120 12 12)" />
  </Svg>
);
export const IconRover = (p: P) => (
  <Svg {...p}>
    <path d="M3 15V10.5A2.5 2.5 0 0 1 5.5 8H14l3.5 3.5H20a1 1 0 0 1 1 1V15z" />
    <path d="M14 8v3.5h3.5M8 5v3" />
    <circle cx="6.5" cy="17.5" r="2" />
    <circle cx="12" cy="17.5" r="2" />
    <circle cx="17.5" cy="17.5" r="2" />
  </Svg>
);
/** The science rover: a body on rocker-bogie legs, a camera mast and an arm. */
export const IconScout = (p: P) => (
  <Svg {...p}>
    <path d="M4.5 11.5h10v3h-10z" />
    <path d="M12.5 11.5V5.5M10.5 4h4.5v2.5h-4.5z" />
    <path d="M14.5 13l3.5 1.5 1 2.5" />
    <path d="M5.5 14.5l-1 2.2M9.5 14.5v2.2M13.5 14.5l1 2.2" />
    <circle cx="4.5" cy="18.5" r="1.7" />
    <circle cx="9.5" cy="18.5" r="1.7" />
    <circle cx="14.5" cy="18.5" r="1.7" />
  </Svg>
);
export const IconCapcom = (p: P) => (
  <Svg {...p}>
    <path d="M4 14v-2a8 8 0 0 1 16 0v2" />
    <rect x="2.5" y="13" width="4" height="6" rx="1.6" />
    <rect x="17.5" y="13" width="4" height="6" rx="1.6" />
    <path d="M19.5 19c0 1.6-2 2.5-5 2.5" />
  </Svg>
);
export const IconIce = (p: P) => (
  <Svg {...p}>
    <path d="M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7" />
    <path d="m9 3.5 3 2.5 3-2.5M9 20.5l3-2.5 3 2.5M3.7 10.5l3.6-.4.6-3.6M20.3 13.5l-3.6.4-.6 3.6M3.7 13.5l3.6.4.6 3.6M20.3 10.5l-3.6-.4-.6-3.6" />
  </Svg>
);
export const IconRock = (p: P) => (
  <Svg {...p}>
    <path d="m3 18 3.5-8 5-4 5.5 2.5L21 15l-2.5 4H5z" />
    <path d="m11.5 6 1 6 6 3M12.5 12l-6.5-2" />
  </Svg>
);
export const IconSample = (p: P) => (
  <Svg {...p}>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="m15.5 15.5 5 5M8 9.5l2-2 3 3" />
  </Svg>
);

export const MODULE_ICON: Record<ModuleType, (p: P) => React.ReactElement> = {
  habitat: IconHabitat,
  solar: IconSolar,
  battery: IconBattery,
  oxygen: IconOxygen,
  recycler: IconRecycler,
  greenhouse: IconGreenhouse,
  icedrill: IconDrill,
  shelter: IconShelter,
  lab: IconLab,
  reactor: IconReactor,
};

/** The ASTRA mark: a planet with an orbit and a rising spark. */
export function Logo({ size = 44 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <defs>
        <linearGradient id="lg-planet" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffd2a8" />
          <stop offset="1" stopColor="#ff7a3d" />
        </linearGradient>
      </defs>
      <circle cx="24" cy="26" r="12" fill="url(#lg-planet)" />
      <ellipse cx="24" cy="26" rx="21" ry="7" fill="none" stroke="#9fd8ff" strokeWidth="2.4" transform="rotate(-18 24 26)" />
      <path d="M24 26a12 12 0 0 1-11.4-8.3" fill="none" stroke="#ffffff" strokeOpacity=".35" strokeWidth="2" />
      <path d="m37 5 1.5 3.5L42 10l-3.5 1.5L37 15l-1.5-3.5L32 10l3.5-1.5z" fill="#ffffff" />
    </svg>
  );
}
