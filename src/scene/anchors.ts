/**
 * Screen positions of things in the 3D world, updated by the scene every frame.
 * HTML overlays (site labels, module badges, tutorial spotlights) read them
 * without re-rendering React. Keys: "site:<id>", "module:<id>", "pad:<id>",
 * "rover", "dock", "habitat".
 */
export interface Anchor {
  x: number;
  y: number;
  /** In front of the camera and inside the viewport. */
  visible: boolean;
  /** Distance from the camera, metres. */
  depth: number;
}
export const anchors = new Map<string, Anchor>();

/** DOM elements that follow an anchor: the scene moves them every frame. */
export const followers = new Map<string, HTMLElement>();
export function follow(key: string, el: HTMLElement | null) {
  if (el) followers.set(key, el);
  else followers.delete(key);
}

/** A ray from the camera through a screen point, answered by the scene (null while no scene is mounted). */
export const scene3d: {
  pick: ((x: number, y: number) => { x: number; z: number } | null) | null;
  /** Glide the camera to look at a point on the ground. */
  lookAt: ((x: number, z: number) => void) | null;
  /** Where the camera looks: ground point, compass heading (radians, 0 = north) and distance. Updated every frame. */
  view: { x: number; z: number; heading: number; distance: number; fov: number };
} = { pick: null, lookAt: null, view: { x: 0, z: 0, heading: 0, distance: 50, fov: 0.7 } };
