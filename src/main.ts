import "./style.css";
import { PlotCanvas } from "./plot";
import { sample, valueToYFrac } from "./sampling";
import { toCSV, toJSON, download } from "./export";
import type { AxisConfig, Sample, Tick } from "./types";

const pad = (n: number) => String(n).padStart(2, "0");
const toLocalInput = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;

const now = new Date();
now.setSeconds(0, 0);

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <header>
    <h1>simgym</h1>
    <p class="sub">Sketch a trend. It's sampled into timestamp/value pairs.</p>
  </header>

  <section class="controls">
    <label>Start time<input id="start" type="datetime-local" value="${toLocalInput(now)}"></label>
    <label>Duration (s)<input id="duration" type="number" min="1" step="1" value="60"></label>
    <label>Interval (s)<input id="interval" type="number" min="0.001" step="1" value="1"></label>
    <label>Y min<input id="ymin" type="number" step="any" value="0"></label>
    <label>Y max<input id="ymax" type="number" step="any" value="100"></label>
    <div class="actions">
      <button id="clear" type="button">Clear</button>
      <button id="csv" type="button">Download CSV</button>
      <button id="json" type="button">Download JSON</button>
    </div>
  </section>

  <section class="stage">
    <canvas id="plot"></canvas>
  </section>

  <section class="output">
    <div class="output-head">
      <h2>Samples <span id="count" class="count"></span></h2>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>#</th><th>timestamp</th><th>value</th></tr></thead>
        <tbody id="rows"></tbody>
      </table>
    </div>
  </section>
`;

const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;

const canvas = $("plot") as HTMLCanvasElement;
const plot = new PlotCanvas(canvas);

function readConfig(): AxisConfig {
  const startMs = new Date(($("start") as HTMLInputElement).value).getTime();
  return {
    startMs: Number.isNaN(startMs) ? Date.now() : startMs,
    durationSec: Math.max(0.001, Number(($("duration") as HTMLInputElement).value) || 1),
    intervalSec: Math.max(0.001, Number(($("interval") as HTMLInputElement).value) || 1),
    yMin: Number(($("ymin") as HTMLInputElement).value) || 0,
    yMax: Number(($("ymax") as HTMLInputElement).value) || 0,
  };
}

function fmtTimeLabel(ms: number, durationSec: number): string {
  const d = new Date(ms);
  if (durationSec <= 90) return `${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function buildTicks(cfg: AxisConfig): { xTicks: Tick[]; yTicks: Tick[] } {
  const xTicks: Tick[] = [];
  for (let i = 0; i <= 6; i++) {
    const frac = i / 6;
    xTicks.push({
      frac,
      label: fmtTimeLabel(cfg.startMs + frac * cfg.durationSec * 1000, cfg.durationSec),
    });
  }
  const yTicks: Tick[] = [];
  for (let i = 0; i <= 5; i++) {
    const frac = i / 5;
    const value = cfg.yMax - frac * (cfg.yMax - cfg.yMin);
    yTicks.push({ frac, label: String(Number(value.toFixed(4))) });
  }
  return { xTicks, yTicks };
}

let current: Sample[] = [];

function recompute() {
  const cfg = readConfig();
  current = sample(plot, cfg);
  const { xTicks, yTicks } = buildTicks(cfg);
  const markers = current
    .filter((s) => s.value !== null)
    .map((s) => ({
      frac: cfg.durationSec > 0 ? (s.t - cfg.startMs) / (cfg.durationSec * 1000) : 0,
      yFrac: valueToYFrac(s.value as number, cfg),
    }));
  plot.render({ xTicks, yTicks, samples: markers });
  renderTable();
}

function renderTable() {
  const withValues = current.filter((s) => s.value !== null);
  $("count").textContent = `(${withValues.length} of ${current.length})`;
  const rows = current
    .map(
      (s, i) =>
        `<tr class="${s.value === null ? "empty" : ""}"><td>${i}</td><td>${s.iso}</td><td>${
          s.value === null ? "—" : Number(s.value.toFixed(6))
        }</td></tr>`,
    )
    .join("");
  $("rows").innerHTML = rows;
}

plot.onStrokeChange = recompute;

for (const id of ["start", "duration", "interval", "ymin", "ymax"]) {
  $(id).addEventListener("input", recompute);
}

$("clear").addEventListener("click", () => plot.clear());
$("csv").addEventListener("click", () =>
  download("simgym.csv", toCSV(current), "text/csv"),
);
$("json").addEventListener("click", () =>
  download("simgym.json", toJSON(current), "application/json"),
);

function fitCanvas() {
  const stage = canvas.parentElement!;
  const w = stage.clientWidth;
  const h = Math.max(320, Math.round(w * 0.5));
  plot.resize(w, h);
  recompute();
}

new ResizeObserver(fitCanvas).observe(canvas.parentElement!);
fitCanvas();
