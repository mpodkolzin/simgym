import type { Tick } from "./types";

const MARGIN = { left: 60, right: 18, top: 18, bottom: 40 };

export interface RenderOpts {
  xTicks: Tick[];
  yTicks: Tick[];
  /** Sample markers to overlay, in plot fractions. */
  samples: { frac: number; yFrac: number }[];
}

/**
 * A time-vs-value sketch surface. The stroke is stored as one Y-fraction
 * (0 = top, 1 = bottom) per horizontal pixel column, so a drawing is always
 * a well-formed function of X: backtracking overwrites columns rather than
 * creating duplicate or out-of-order points.
 */
export class PlotCanvas {
  private ctx: CanvasRenderingContext2D;
  private dpr = Math.max(1, window.devicePixelRatio || 1);
  private w = 0;
  private h = 0;
  private plotW = 0;
  private plotH = 0;
  /** yFrac per column; NaN = no coverage. */
  private cols = new Float32Array(0);

  private drawing = false;
  private lastCol = -1;
  private lastFrac = NaN;

  private lastRender: RenderOpts = { xTicks: [], yTicks: [], samples: [] };
  onStrokeChange: () => void = () => {};

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas context unavailable");
    this.ctx = ctx;

    canvas.addEventListener("pointerdown", this.onDown);
    canvas.addEventListener("pointermove", this.onMove);
    window.addEventListener("pointerup", this.onUp);
  }

  /** (Re)size the backing store to the element's box. Clears the stroke. */
  resize(cssW: number, cssH: number) {
    this.w = Math.round(cssW);
    this.h = Math.round(cssH);
    this.plotW = Math.max(1, this.w - MARGIN.left - MARGIN.right);
    this.plotH = Math.max(1, this.h - MARGIN.top - MARGIN.bottom);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.canvas.style.width = `${this.w}px`;
    this.canvas.style.height = `${this.h}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.cols = new Float32Array(this.plotW).fill(NaN);
    this.render(this.lastRender);
  }

  clear() {
    this.cols.fill(NaN);
    this.render(this.lastRender);
    this.onStrokeChange();
  }

  hasStroke(): boolean {
    return this.cols.some((v) => !Number.isNaN(v));
  }

  /** Value fraction at a given X fraction (0..1), interpolated; null if none. */
  yFracAtXFrac(xFrac: number): number | null {
    if (this.plotW <= 0) return null;
    const c = xFrac * (this.plotW - 1);
    const lo = Math.floor(c);
    const hi = Math.ceil(c);
    if (lo < 0 || hi >= this.plotW) return null;
    const a = this.cols[lo];
    const b = this.cols[hi];
    if (Number.isNaN(a) && Number.isNaN(b)) return null;
    if (Number.isNaN(a)) return b;
    if (Number.isNaN(b)) return a;
    return a + (b - a) * (c - lo);
  }

  private eventToPlot(e: PointerEvent): { col: number; frac: number } {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left - MARGIN.left;
    const y = e.clientY - rect.top - MARGIN.top;
    const col = Math.max(0, Math.min(this.plotW - 1, Math.round(x)));
    const frac = Math.max(0, Math.min(1, y / this.plotH));
    return { col, frac };
  }

  private onDown = (e: PointerEvent) => {
    this.drawing = true;
    this.canvas.setPointerCapture(e.pointerId);
    const { col, frac } = this.eventToPlot(e);
    this.cols[col] = frac;
    this.lastCol = col;
    this.lastFrac = frac;
    this.render(this.lastRender);
    this.onStrokeChange();
  };

  private onMove = (e: PointerEvent) => {
    if (!this.drawing) return;
    const { col, frac } = this.eventToPlot(e);
    this.fillColumns(this.lastCol, this.lastFrac, col, frac);
    this.lastCol = col;
    this.lastFrac = frac;
    this.render(this.lastRender);
    this.onStrokeChange();
  };

  private onUp = () => {
    if (!this.drawing) return;
    this.drawing = false;
    this.onStrokeChange();
  };

  /** Paint every column between two events, linearly interpolating Y. */
  private fillColumns(c0: number, f0: number, c1: number, f1: number) {
    if (c0 === c1) {
      this.cols[c1] = f1;
      return;
    }
    const step = c1 > c0 ? 1 : -1;
    const span = c1 - c0;
    for (let c = c0; c !== c1 + step; c += step) {
      const t = (c - c0) / span;
      this.cols[c] = f0 + (f1 - f0) * t;
    }
  }

  render(opts: RenderOpts) {
    this.lastRender = opts;
    const { ctx } = this;
    const { left, top } = MARGIN;
    const styles = getComputedStyle(document.documentElement);
    const col = (name: string, fallback: string) =>
      styles.getPropertyValue(name).trim() || fallback;
    const cBg = col("--plot-bg", "#0f1420");
    const cGrid = col("--plot-grid", "#26304a");
    const cAxis = col("--plot-axis", "#6b7a99");
    const cInk = col("--plot-ink", "#e6ecff");
    const cStroke = col("--plot-stroke", "#5cc8ff");
    const cSample = col("--plot-sample", "#ffcf5c");

    ctx.clearRect(0, 0, this.w, this.h);
    ctx.fillStyle = cBg;
    ctx.fillRect(left, top, this.plotW, this.plotH);

    // Grid + tick labels.
    ctx.font = "11px ui-monospace, monospace";
    ctx.strokeStyle = cGrid;
    ctx.lineWidth = 1;
    ctx.fillStyle = cAxis;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (const tk of opts.xTicks) {
      const x = left + tk.frac * this.plotW;
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, top + this.plotH);
      ctx.stroke();
      ctx.fillText(tk.label, x, top + this.plotH + 6);
    }
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (const tk of opts.yTicks) {
      const y = top + tk.frac * this.plotH;
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(left + this.plotW, y);
      ctx.stroke();
      ctx.fillText(tk.label, left - 8, y);
    }

    // Plot border.
    ctx.strokeStyle = cAxis;
    ctx.strokeRect(left, top, this.plotW, this.plotH);

    // The stroke.
    ctx.strokeStyle = cStroke;
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.beginPath();
    let started = false;
    for (let c = 0; c < this.plotW; c++) {
      const f = this.cols[c];
      if (Number.isNaN(f)) {
        started = false;
        continue;
      }
      const x = left + c;
      const y = top + f * this.plotH;
      if (started) ctx.lineTo(x, y);
      else {
        ctx.moveTo(x, y);
        started = true;
      }
    }
    ctx.stroke();

    // Sample markers.
    ctx.fillStyle = cSample;
    for (const s of opts.samples) {
      const x = left + s.frac * this.plotW;
      const y = top + s.yFrac * this.plotH;
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    void cInk;
  }
}
