# simgym — Design

A framework-free, client-only browser tool for **sketching time-series data**. You
drag a trend across an axed canvas, and it is resampled into fixed-interval
`(timestamp, value)` pairs that you can read in a table or export as CSV / JSON.
No backend, no build-time data — everything happens in the browser.

## Goals & constraints

- **A sketch is always a well-formed function of time.** For any X there is at most
  one Y, and samples come out in strictly increasing timestamp order. Backtracking
  with the pointer *overwrites* earlier X positions instead of producing duplicate
  or out-of-order points.
- **Real wall-clock output.** The X axis maps to actual epoch time (a user-set start
  plus a duration), so exported timestamps are ISO-8601 instants, not abstract units.
- **Live everything.** Editing any axis control or drawing re-derives the samples,
  the table, and the on-canvas markers immediately.
- **Zero dependencies at runtime.** Vite + TypeScript + a single HTML `<canvas>`.
  Framework-free; export is a client-side `Blob` download.

## Data model (`src/types.ts`)

| Type | Purpose |
|------|---------|
| `AxisConfig` | The full input space: `startMs` (epoch ms), `durationSec`, `intervalSec`, `yMin`, `yMax`. |
| `Sample` | One emitted point: `t` (epoch ms), `iso` (ISO-8601), `value` (`number \| null`; `null` = the stroke never covered that time). |
| `Tick` | An axis gridline: `frac` (0..1 along the axis) + `label`. |

`AxisConfig` is the single source of truth that flows from the UI controls into
both sampling and tick generation.

## Core representation: the column buffer

The key design decision lives in `PlotCanvas` (`src/plot.ts`). The stroke is **not**
stored as a list of pointer points. Instead it is a `Float32Array` with **one entry
per horizontal pixel column** of the plot area:

- Each entry is a **Y fraction** in `[0, 1]` (`0` = top of the plot, `1` = bottom).
- `NaN` means "this column has no coverage" (nothing drawn there yet).

This representation is what makes a drawing structurally a function of X:

- Painting is keyed by column index, so revisiting an X simply reassigns that
  column — there is no way to store two Y values for one X.
- As the pointer moves, `fillColumns` paints **every** intermediate column between
  the last event and the current one, linearly interpolating Y. This closes gaps
  when the pointer moves fast, and makes horizontal runs dense.

The buffer is reallocated (and cleared) on every `resize`, since its length is tied
to the pixel width of the plot region.

## Rendering pipeline

`PlotCanvas.render(opts)` redraws the whole canvas each frame from:

1. **Background + grid + tick labels** — driven by `xTicks` / `yTicks` passed in.
2. **Plot border.**
3. **The stroke** — walk columns left→right; contiguous non-`NaN` runs become
   polyline segments, `NaN` breaks the path (so gaps render as gaps).
4. **Sample markers** — dots at each emitted sample's `(frac, yFrac)`, overlaid on
   the stroke so you can see exactly where sampling lands.

Colors are read from CSS custom properties on `:root` (`--plot-bg`, `--plot-grid`,
`--plot-axis`, `--plot-stroke`, `--plot-sample`, …) with hard-coded fallbacks, so the
theme lives in `style.css`, not in the canvas code.

### Coordinate spaces

- **CSS pixels** — pointer events and layout. A fixed `MARGIN` (`left/right/top/bottom`)
  reserves room for axis labels; the interior is the *plot region* (`plotW × plotH`).
- **Device pixels** — the backing store is scaled by `devicePixelRatio` via
  `ctx.setTransform`, so rendering stays crisp on HiDPI while drawing code keeps
  working in CSS pixels.
- **Fractions** — the portable currency between modules. Columns store `yFrac`;
  ticks and sample markers are positioned in `frac` / `yFrac`. Nothing outside
  `PlotCanvas` needs to know pixel dimensions.

## Sampling (`src/sampling.ts`)

`sample(plot, cfg)` converts the pixel-space stroke into wall-clock samples:

- Emits `n + 1` points where `n = floor(durationSec / intervalSec)`, i.e. one at
  each interval boundary from the start through the end of the window.
- For sample `i`: `xFrac = (i·interval) / duration` → `plot.yFracAtXFrac(xFrac)`
  → value via `yMax − yFrac·(yMax − yMin)`.
- `yFracAtXFrac` **linearly interpolates between the two neighboring columns** and
  returns `null` when neither neighbor has coverage — that `null` propagates to the
  sample's `value`, marking "not drawn here."
- Timestamps are `startMs + i·interval·1000`, formatted to ISO.

`valueToYFrac` is the inverse map (value → `yFrac`), used only to place overlay
markers back on the canvas.

Both `durationSec` and `intervalSec` are floored at `0.001` when read, so division
is always safe.

## UI orchestration (`src/main.ts`)

`main.ts` owns the DOM and wires everything together — there is no component
framework:

- Injects the full markup (`header`, `.controls`, `.stage > canvas`, `.output`
  table) into `#app` as an HTML string, then grabs elements by id.
- `readConfig()` reads the five controls into an `AxisConfig`, defensively coercing
  bad input (`NaN` start → `Date.now()`, non-positive duration/interval → floored).
- `buildTicks(cfg)` produces 7 X ticks (`i/6`) and 6 Y ticks (`i/5`). X-tick labels
  switch format by zoom: `mm:ss` for windows ≤ 90 s, else `HH:mm`.
- **`recompute()` is the central update.** It reads config, resamples, builds ticks
  and markers, re-renders the canvas, and re-renders the table. It is the single
  callback fired from every input source.

### Event wiring

| Source | Handler |
|--------|---------|
| Any of the 5 control `input` events | `recompute` |
| `PlotCanvas.onStrokeChange` (draw / clear) | `recompute` |
| **Clear** button | `plot.clear()` (which itself fires `onStrokeChange`) |
| **Download CSV / JSON** buttons | serialize `current` + `download(...)` |
| `ResizeObserver` on the stage | `fitCanvas` → `plot.resize` (height = `max(320, width·0.5)`) → `recompute` |

`current: Sample[]` is the module-level cache of the latest samples, shared by the
table renderer and the export buttons.

> ⚠️ **Note:** `plot.resize()` reallocates and **clears** the column buffer, so a
> window/container resize wipes the current sketch. This follows from tying the
> buffer length to pixel width.

## Export (`src/export.ts`)

- `toCSV` — `timestamp,value` header + one row per sample; `null` values render as
  an empty field.
- `toJSON` — array of `{ timestamp, value }` (value stays `null` where undrawn),
  pretty-printed.
- Numeric values are rounded to 6 decimals via `Number(v.toFixed(6))`.
- `download` — builds a `Blob`, object-URL, a synthetic `<a download>` click, then
  revokes the URL. Pure client-side; nothing leaves the browser.

## Module dependency graph

```
main.ts ──▶ plot.ts        (owns canvas + column buffer)
   │  └────▶ sampling.ts ──▶ plot.ts   (reads yFracAtXFrac)
   │  └────▶ export.ts
   └───────▶ types.ts  ◀── (shared by all)
            style.css   (theme + layout; canvas reads CSS vars)
```

`plot.ts` is the only stateful module (the buffer + pointer state). `sampling.ts`
and `export.ts` are pure transforms. `main.ts` is the imperative shell holding it
together.

## Tech & build

- **Vite + TypeScript**, no runtime dependencies (`typescript` and `vite` are
  dev-only). ES modules; `index.html` loads `src/main.ts` directly.
- `npm run dev` (Vite dev server) · `npm run build` (`tsc` type-check → Vite bundle
  to `dist/`) · `npm run preview` (serve the built output).
- Output is fully static and hostable anywhere.

## Notable behaviors & edge cases

- **Undrawn regions export as gaps**, not zeros — `value` is `null` in JSON / empty
  in CSV, and the count badge reads `(drawn of total)`.
- **`yMax == yMin`** collapses the value span; `valueToYFrac` returns `0.5` to avoid
  divide-by-zero, and sampled values degenerate to `yMax`.
- **Resize clears the sketch** (see note above).
- **Interpolation everywhere** — both intra-stroke (fast pointer moves) and at
  sample time (between columns), so the emitted series is smooth rather than
  stair-stepped.
