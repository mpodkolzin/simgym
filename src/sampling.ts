import type { AxisConfig, Sample } from "./types";
import type { PlotCanvas } from "./plot";

/** Read fixed-interval samples from the stroke, in real wall-clock time. */
export function sample(plot: PlotCanvas, cfg: AxisConfig): Sample[] {
  const out: Sample[] = [];
  const span = cfg.yMax - cfg.yMin;
  const n = Math.floor(cfg.durationSec / cfg.intervalSec + 1e-9);
  for (let i = 0; i <= n; i++) {
    const offsetSec = i * cfg.intervalSec;
    const xFrac = cfg.durationSec > 0 ? offsetSec / cfg.durationSec : 0;
    const yFrac = plot.yFracAtXFrac(xFrac);
    const t = cfg.startMs + offsetSec * 1000;
    out.push({
      t,
      iso: new Date(t).toISOString(),
      value: yFrac === null ? null : cfg.yMax - yFrac * span,
    });
  }
  return out;
}

/** Map a value to its plot Y-fraction (0 = top), for overlay markers. */
export function valueToYFrac(value: number, cfg: AxisConfig): number {
  const span = cfg.yMax - cfg.yMin;
  return span === 0 ? 0.5 : (cfg.yMax - value) / span;
}
