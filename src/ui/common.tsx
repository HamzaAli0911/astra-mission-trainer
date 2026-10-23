import { useEffect, useRef, type ReactNode } from "react";
import { Star, X } from "lucide-react";
import { play } from "../lib/sound";

export function Stars({ n, of = 3, size = 18, label = true }: { n: number; of?: number; size?: number; label?: boolean }) {
  return (
    <span className="stars" aria-label={label ? `${n} of ${of} stars` : undefined} role={label ? "img" : undefined}>
      {Array.from({ length: of }, (_, i) => (
        <Star key={i} size={size} className={i < n ? "on" : ""} aria-hidden="true" />
      ))}
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}

/** Accessible dialog: focus moves in, Escape closes, focus returns afterwards. */
export function Modal({
  title,
  onClose,
  children,
  wide,
  className = "",
  icon,
}: {
  title: string;
  onClose?: () => void;
  children: ReactNode;
  wide?: boolean;
  className?: string;
  icon?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>("[data-autofocus]") ?? ref.current?.querySelector<HTMLElement>("button, a, input, select");
    first?.focus({ preventScroll: true });
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && onClose) {
        e.stopPropagation();
        onClose();
      }
      if (e.key === "Tab" && ref.current) {
        const items = [...ref.current.querySelectorAll<HTMLElement>("button:not(:disabled), a, input, select, [tabindex='0']")];
        if (!items.length) return;
        const i = items.indexOf(document.activeElement as HTMLElement);
        if (e.shiftKey && i <= 0) {
          e.preventDefault();
          items[items.length - 1].focus();
        } else if (!e.shiftKey && i === items.length - 1) {
          e.preventDefault();
          items[0].focus();
        }
      }
    };
    window.addEventListener("keydown", key, true);
    return () => {
      window.removeEventListener("keydown", key, true);
      before?.focus?.({ preventScroll: true });
    };
  }, [onClose]);
  return (
    <div className="scrim" onPointerDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div ref={ref} className={`modal ${wide ? "wide" : ""} ${className}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-head">
          {icon && <span className="modal-icon">{icon}</span>}
          <h2>{title}</h2>
          {onClose && (
            <button
              className="icon-btn"
              aria-label="Close"
              onClick={() => {
                play("close");
                onClose();
              }}
            >
              <X size={20} />
            </button>
          )}
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

/** A tiny line chart for the debrief: one or more series over training hours. */
export function LineChart({
  series,
  height = 120,
  bands = [],
  xLabel,
}: {
  series: { name: string; color: string; values: number[]; max: number }[];
  height?: number;
  /** Shaded spans (index ranges) such as nights or storms. */
  bands?: { from: number; to: number; color: string }[];
  xLabel?: string;
}) {
  const w = 600,
    h = height;
  const n = Math.max(2, ...series.map((s) => s.values.length));
  const x = (i: number) => (i / (n - 1)) * w;
  return (
    <svg className="chart" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label={`Chart of ${series.map((s) => s.name).join(", ")}${xLabel ? ` over ${xLabel}` : ""}`}>
      {bands.map((b, i) => (
        <rect key={i} x={x(b.from)} width={Math.max(1, x(b.to) - x(b.from))} y={0} height={h} fill={b.color} />
      ))}
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} x1={0} x2={w} y1={h * f} y2={h * f} className="grid" />
      ))}
      {series.map((s) => (
        <polyline
          key={s.name}
          fill="none"
          stroke={s.color}
          strokeWidth={2.5}
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
          points={s.values.map((v, i) => `${x(i).toFixed(1)},${(h - 3 - (Math.max(0, Math.min(s.max, v)) / s.max) * (h - 6)).toFixed(1)}`).join(" ")}
        />
      ))}
    </svg>
  );
}

export function Meter({ value, max, color, label }: { value: number; max: number; color: string; label?: string }) {
  const pct = Math.max(0, Math.min(100, (value / Math.max(1e-9, max)) * 100));
  return (
    <span className="meter" style={{ "--c": color } as React.CSSProperties} role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.round(value)} aria-label={label}>
      <i style={{ width: `${pct}%` }} />
    </span>
  );
}

export const fmt = (n: number, digits = 0) => (Number.isFinite(n) ? n.toFixed(digits) : "–");
export function duration(hours: number) {
  if (!Number.isFinite(hours)) return "∞";
  if (hours >= 48) return `${(hours / 24).toFixed(1)} days`;
  if (hours >= 1) return `${Math.floor(hours)} h`;
  return `${Math.max(1, Math.round(hours * 60))} min`;
}
