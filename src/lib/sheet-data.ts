// Client-side fetcher for the public Google Sheet via gviz JSON.
// The sheet is the source of truth for production data. Metas are managed locally.

const SHEET_ID = "1MhI23FR_C_Uf2Km2EuaRd1WyQfEMyRUSS6VUlwZd5ms";
const DATA_GID = "0";

const gvizUrl = (gid: string) =>
  `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&gid=${gid}`;

export interface RawRecord {
  timestamp: Date | null;
  date: Date | null;
  setor: string;
  procedimento: string;
  quantidade: number;
}

export interface MetaRecord {
  setor: string;
  meta: number;
}

export interface SheetData {
  records: RawRecord[];
  fetchedAt: Date;
}

interface GvizCell {
  v: unknown;
  f?: string;
}
interface GvizCol {
  id: string;
  label: string;
  type: string;
}
interface GvizTable {
  cols: GvizCol[];
  rows: { c: (GvizCell | null)[] }[];
}
interface GvizResp {
  table: GvizTable;
}

async function fetchGviz(gid: string): Promise<GvizTable> {
  const res = await fetch(gvizUrl(gid), { cache: "no-store" });
  const text = await res.text();
  // Response is wrapped: /*O_o*/\ngoogle.visualization.Query.setResponse({...});
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  const json = JSON.parse(text.slice(start, end + 1)) as GvizResp;
  return json.table;
}

function parseGvizDate(v: unknown): Date | null {
  if (typeof v !== "string") return null;
  // "Date(2026,4,26,15,38,47)" — month is 0-indexed already
  const m = v.match(/Date\(([^)]+)\)/);
  if (!m) return null;
  const parts = m[1].split(",").map((p) => Number(p.trim()));
  const [y, mo, d, h = 0, mi = 0, s = 0] = parts;
  return new Date(y, mo, d, h, mi, s);
}

export async function fetchSheetData(): Promise<SheetData> {
  const dataTable = await fetchGviz(DATA_GID);

  // Detect columns dynamically by label / type
  const cols = dataTable.cols;

  // Find the "Preenchimento Referente a:" column (setor)
  const setorIdx = cols.findIndex((c) =>
    c.label.toLowerCase().includes("preenchimento referente"),
  );

  // Find timestamp and date columns by type (first two datetime/date cols)
  const dateColIndices = cols
    .map((c, i) => (c.type === "datetime" || c.type === "date" ? i : -1))
    .filter((i) => i >= 0);
  const timestampIdx = dateColIndices[0] ?? -1;
  const dateIdx = dateColIndices[1] ?? dateColIndices[0] ?? -1;

  // All other columns with a label and not timestamp/date/setor are procedure columns
  const specialIndices = new Set([timestampIdx, dateIdx, setorIdx].filter((i) => i >= 0));
  const procIdx: { idx: number; name: string }[] = [];
  cols.forEach((c, i) => {
    if (!specialIndices.has(i) && c.label) procIdx.push({ idx: i, name: c.label });
  });

  const records: RawRecord[] = [];
  for (const row of dataTable.rows) {
    const cells = row.c;
    const timestamp = timestampIdx >= 0 ? parseGvizDate(cells[timestampIdx]?.v) : null;
    const date = dateIdx >= 0 ? parseGvizDate(cells[dateIdx]?.v) : null;
    const setor = setorIdx >= 0 ? ((cells[setorIdx]?.v as string) ?? "") : "";
    if (!setor) continue;
    for (const { idx, name } of procIdx) {
      const cell = cells[idx];
      const v = cell?.v;
      if (typeof v === "number" && v > 0) {
        records.push({
          timestamp,
          date,
          setor: setor.trim(),
          procedimento: name.trim(),
          quantidade: v,
        });
      }
    }
  }

  return { records, fetchedAt: new Date() };
}
