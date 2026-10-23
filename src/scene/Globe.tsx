import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { Planet } from "../sim/types";

function hash(x: number, y: number) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function surface(planet: Planet) {
  const W = 1024,
    H = 512;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const n =
        Math.sin(x * 0.012) * Math.cos(y * 0.019) * 0.5 +
        Math.sin(x * 0.031 + y * 0.013) * 0.3 +
        Math.sin(x * 0.09 + Math.cos(y * 0.07) * 2) * Math.cos(y * 0.11 - x * 0.02) * 0.12 +
        (hash(x, y) - 0.5) * 0.08;
      const i = (y * W + x) * 4;
      if (planet === "moon") {
        const mare = Math.sin(x * 0.006 + 1.3) * Math.cos(y * 0.011 - 0.4) > 0.45 ? -26 : 0;
        const v = 150 + n * 26 + mare;
        img.data[i] = v;
        img.data[i + 1] = v + 2;
        img.data[i + 2] = v + 6;
      } else {
        const dark = Math.sin(x * 0.008 - 0.6) * Math.cos(y * 0.014 + 0.8) > 0.4 ? -38 : 0;
        img.data[i] = 186 + n * 30 + dark;
        img.data[i + 1] = 104 + n * 18 + dark * 0.6;
        img.data[i + 2] = 70 + n * 12 + dark * 0.4;
      }
      img.data[i + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
  const craters = planet === "moon" ? 260 : 110;
  for (let i = 0; i < craters; i++) {
    const x = hash(i, 1) * W,
      y = 20 + hash(i, 2) * (H - 40),
      r = 2 + hash(i, 3) ** 4 * 34;
    const g = ctx.createRadialGradient(x - r * 0.2, y - r * 0.2, r * 0.1, x, y, r);
    g.addColorStop(0, planet === "moon" ? "rgba(70,70,75,0.35)" : "rgba(90,40,25,0.3)");
    g.addColorStop(0.8, "rgba(0,0,0,0.1)");
    g.addColorStop(0.92, "rgba(255,255,255,0.32)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  if (planet === "mars") {
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillRect(0, 0, W, 14);
    ctx.fillRect(0, H - 10, W, 10);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A slowly turning planet for the title screen. */
export function Globe({ planet = "moon", reduceMotion = false }: { planet?: Planet; reduceMotion?: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      return;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    camera.position.set(0, 0, 12);
    const sun = new THREE.DirectionalLight("#fff4e6", 3.2);
    sun.position.set(-6, 2.5, 4);
    scene.add(sun, new THREE.AmbientLight("#334466", 0.25));
    const tex = surface(planet);
    const globe = new THREE.Mesh(
      new THREE.SphereGeometry(3.2, 96, 64),
      new THREE.MeshStandardMaterial({ map: tex, bumpMap: tex, bumpScale: 0.05, roughness: 1 }),
    );
    globe.rotation.z = 0.25;
    scene.add(globe);
    let glow: THREE.Mesh | null = null;
    if (planet === "mars") {
      glow = new THREE.Mesh(
        new THREE.SphereGeometry(3.32, 64, 48),
        new THREE.MeshBasicMaterial({ color: "#ff9a6a", transparent: true, opacity: 0.12, side: THREE.BackSide }),
      );
      scene.add(glow);
    }
    const resize = new ResizeObserver(() => {
      renderer.setSize(el.clientWidth, el.clientHeight, false);
      camera.aspect = el.clientWidth / Math.max(1, el.clientHeight);
      camera.updateProjectionMatrix();
    });
    resize.observe(el);
    const reduced = reduceMotion || matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (!reduced) globe.rotation.y += 0.0012;
      renderer.render(scene, camera);
    };
    loop();
    return () => {
      cancelAnimationFrame(raf);
      resize.disconnect();
      globe.geometry.dispose();
      (globe.material as THREE.Material).dispose();
      glow?.geometry.dispose();
      tex.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [planet, reduceMotion]);
  return <div ref={host} className="globe" aria-hidden="true" />;
}
