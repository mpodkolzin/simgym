export interface AxisConfig {
  /** Start of the time window, epoch ms. */
  startMs: number;
  /** Total width of the time window, seconds. */
  durationSec: number;
  /** Spacing between emitted samples, seconds. */
  intervalSec: number;
  /** Value-axis bounds. */
  yMin: number;
  yMax: number;
}

export interface Sample {
  /** Epoch milliseconds. */
  t: number;
  /** ISO-8601 timestamp. */
  iso: string;
  /** Sampled value, or null where the stroke has no coverage. */
  value: number | null;
}

export interface Tick {
  /** Position along the axis, 0..1. */
  frac: number;
  label: string;
}
