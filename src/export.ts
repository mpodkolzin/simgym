import type { Sample } from "./types";

const fmt = (v: number | null) => (v === null ? "" : String(Number(v.toFixed(6))));

export function toCSV(samples: Sample[]): string {
  const rows = ["timestamp,value"];
  for (const s of samples) rows.push(`${s.iso},${fmt(s.value)}`);
  return rows.join("\n");
}

export function toJSON(samples: Sample[]): string {
  return JSON.stringify(
    samples.map((s) => ({ timestamp: s.iso, value: s.value })),
    null,
    2,
  );
}

export function download(filename: string, text: string, mime: string) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
