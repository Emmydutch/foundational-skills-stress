// scripts/ingest.mjs — builds compact JSON snapshots for the US layer from
// official EDFacts achievement exports (mirrored on GCS by eddatacenter.org).
//
// Strategy: the large district/LEA CSVs (120-145 MB each) are streamed and
// filtered — raw files are never written to disk. Only the compact,
// presentation-ready JSON snapshots under data/snapshots/ are kept.
//
// Resilience: each file is streamed with byte-level resume — a network reset
// mid-file reconnects with an HTTP Range request from the last completed CSV
// line, so a flaky connection never forces a full re-download or double-counts
// rows. All collection is idempotent besides.
//
// Run: npm run ingest   (long-running; streams ~2.2 GB total)

import { mkdirSync, writeFileSync } from "node:fs";
import { Readable, Transform } from "node:stream";
import { createInterface } from "node:readline";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { STATE_REF, titleCase } from "./state-ref.mjs";

const GCS = "https://storage.googleapis.com/edc-education-exports/edfacts/";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "data", "snapshots");

const LICENSE = "Public domain (U.S. Department of Education EDFacts)";
const SOURCE_URL = "https://www.eddatacenter.org/edfacts";

// Latest release: the "wide" 2021-22 family (separate State/District files).
const LATEST_YEAR = "2021-22";
const LATEST_FILES = {
  stateReading: "EDFacts_2022_State_ela.csv",
  stateMath: "EDFacts_2022_State_math.csv",
  districtReading: "EDFacts_2022_District_ela.csv",
  districtMath: "EDFacts_2022_District_math.csv",
};

// Earlier years: two families —
//   tidy (long): one row per LEA x category x grade (CATEGORY/GRADE/PCTPROF...)
//   wide:        one row per LEA, all-students columns ALL_<RLA|MTH>00<PCTPROF|NUMVALID>_<yy>
const HISTORY_FILES = [
  {
    year: "2020-21",
    format: "tidy",
    math: "math-achievement-lea-sy2020-21.csv",
    reading: "rla-achievement-lea-sy2020-21.csv",
  },
  {
    year: "2018-19",
    format: "tidy",
    math: "math-achievement-lea-sy2018-19-long.csv",
    reading: "rla-achievement-lea-sy2018-19-long.csv",
  },
  {
    year: "2017-18",
    format: "wide",
    math: "math-achievement-lea-sy2017-18.csv",
    reading: "rla-achievement-lea-sy2017-18.csv",
  },
  {
    year: "2016-17",
    format: "wide",
    math: "math-achievement-lea-sy2016-17.csv",
    reading: "rla-achievement-lea-sy2016-17.csv",
  },
  {
    year: "2015-16",
    format: "wide",
    math: "math-achievement-lea-sy2015-16.csv",
    reading: "rla-achievement-lea-sy2015-16.csv",
  },
  {
    year: "2014-15",
    format: "wide",
    math: "math-achievement-lea-sy2014-15.csv",
    reading: "rla-achievement-lea-sy2014-15.csv",
  },
  {
    year: "2013-14",
    format: "wide",
    math: "math-achievement-lea-sy2013-14.csv",
    reading: "rla-achievement-lea-sy2013-14.csv",
  },
];

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

/** Full CSV line parser with quote + escaped-quote support. */
function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

/**
 * Parses privacy-censored percent values:
 * "27.2%" -> 27.2, "20-24%" -> 22, "<=5%" -> 2.5, ">=95%" -> 97.5, "17" -> 17.
 * Midpoints are an approximation for censored cells (documented in /methodology).
 */
function parsePercent(raw) {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s || s === "-" || s === "–" || s === "N/A" || s.toUpperCase() === "NA") return null;
  s = s.replace(/≥/g, ">=").replace(/≤/g, "<=").replaceAll("%", "").replaceAll(",", "").trim();
  if (s.startsWith("<=")) {
    const n = Number(s.slice(2));
    return Number.isFinite(n) ? n / 2 : null;
  }
  if (s.startsWith(">=")) {
    const n = Number(s.slice(2));
    return Number.isFinite(n) ? 100 - (100 - n) / 2 : null;
  }
  if (s.includes("-")) {
    const [a, b] = s.split("-").map((x) => Number(x.trim()));
    return Number.isFinite(a) && Number.isFinite(b) ? (a + b) / 2 : null;
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const round1 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10) / 10);

/** Builds a field-name -> column-index map from a header row. */
function headerIndex(header) {
  const map = new Map();
  header.forEach((name, i) => map.set(name.trim(), i));
  return map;
}

const FILE_TIMEOUT_MS = 15 * 60 * 1000;

/** Transform that counts bytes and remembers the offset just past the last '\n'. */
function makeLineTracker(startOffset) {
  const tracker = new Transform({
    transform(chunk, _enc, cb) {
      for (let i = 0; i < chunk.length; i++) {
        if (chunk[i] === 10) tracker.lastNewline = tracker.absOffset + i + 1;
      }
      tracker.absOffset += chunk.length;
      cb(null, chunk);
    },
  });
  tracker.absOffset = startOffset;
  tracker.lastNewline = startOffset;
  return tracker;
}

/**
 * Streams a remote CSV line by line, transparently resuming after network
 * resets: retries send `Range: bytes=<lastLineEnd>-`, so the next attempt
 * picks up exactly where the previous one stopped. `onLine` is invoked once
 * per complete line (header included) across all attempts.
 */
async function forEachRemoteLine(url, onLine, tries = 12) {
  let resumeAt = 0;
  for (let attempt = 1; ; attempt++) {
    let tracker = null;
    try {
      const headers = { "Accept-Encoding": "identity" };
      if (resumeAt > 0) headers.Range = `bytes=${resumeAt}-`;
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(FILE_TIMEOUT_MS) });
      if (res.status === 416 && resumeAt > 0) return; // already consumed to EOF
      if (!res.ok && res.status !== 206) throw new Error(`HTTP ${res.status}`);
      if (!res.body) throw new Error("empty response body");
      const expected = Number(res.headers.get("content-length")) || null;
      const startAt = resumeAt;
      tracker = makeLineTracker(startAt);
      const source = Readable.fromWeb(res.body);
      // Forward explicitly so a mid-stream reset surfaces as a tracker error
      // (pipe() would silently swallow source errors).
      source.on("data", (chunk) => tracker.write(chunk));
      source.on("end", () => tracker.end());
      source.on("error", (err) => tracker.destroy(err));
      const rl = createInterface({ input: tracker, crlfDelay: Infinity });
      for await (const line of rl) onLine(line);
      const got = tracker.absOffset - startAt;
      if (expected != null && got < expected) {
        throw new Error(`stream ended early (${got}/${expected} bytes)`);
      }
      return;
    } catch (err) {
      if (tracker && tracker.lastNewline > resumeAt) resumeAt = tracker.lastNewline;
      if (attempt >= tries) throw new Error(`${url.split("/").pop()}: ${err?.cause?.code ?? err?.message ?? err}`);
      const waitMs = Math.min(attempt, 12) * 5000; // up to 60s between tries
      console.warn(
        `  ! ${url.split("/").pop()} interrupted (${err?.cause?.code ?? err?.message}); resuming at byte ${resumeAt} in ${waitMs / 1000}s`,
      );
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
}

// ---------------------------------------------------------------------------
// Pass 1 — latest year (2021-22)
// ---------------------------------------------------------------------------

async function scanLatestStatesFile(file, subject, states) {
  let header = null;
  let kept = 0;
  await forEachRemoteLine(GCS + file, (line) => {
    if (!header) {
      header = headerIndex(parseCsvLine(line));
      return;
    }
    if (!line.includes("All Students in SEA")) return;
    const cols = parseCsvLine(line);
    const get = (f) => cols[header.get(f)]?.trim() ?? "";
    if (get("Population") !== "All Students" || get("AgeGrade") !== "All Grades") return;
    if (get("Subgroup") !== "All Students in SEA") return;
    const ref = STATE_REF[get("State").toUpperCase()];
    if (!ref) {
      console.warn(`  ! unknown state name: ${get("State")}`);
      return;
    }
    const [abbr, fips] = ref;
    const row = states.get(fips) ?? {
      fips: Number(fips), abbr, name: titleCase(get("State")),
      reading: null, math: null, tested: null, participation: null, history: [],
    };
    row[subject] = round1(parsePercent(get("ProficientOrAbove_percent")));
    row.tested = Number(get("Denominator")) || row.tested;
    row.participation = round1(parsePercent(get("ParticipationRate")));
    states.set(fips, row);
    kept++;
  });
  console.log(`  ${file}: kept ${kept} state rows (${subject})`);
}

async function readLatestStates() {
  const states = new Map(); // fips -> row
  for (const [subject, file] of [
    ["reading", LATEST_FILES.stateReading],
    ["math", LATEST_FILES.stateMath],
  ]) {
    await scanLatestStatesFile(file, subject, states);
  }
  return states;
}

async function scanLatestDistrictsFile(file, subject, districts, dupes) {
  let header = null;
  let kept = 0;
  await forEachRemoteLine(GCS + file, (line) => {
    if (!header) {
      header = headerIndex(parseCsvLine(line));
      return;
    }
    if (!line.includes("All Students in LEA")) return;
    const cols = parseCsvLine(line);
    const get = (f) => cols[header.get(f)]?.trim() ?? "";
    if (get("Population") !== "All Students" || get("AgeGrade") !== "All Grades") return;
    if (get("Subgroup") !== "All Students in LEA") return;
    const id = get("NCESLEAID").padStart(7, "0");
    const ref = STATE_REF[get("State").toUpperCase()];
    const stateFips = ref ? Number(ref[1]) : Number(id.slice(0, 2));
    const existing = districts.get(id);
    if (existing && existing[subject] != null) dupes.add(`${id}:${subject}`);
    const row = existing ?? {
      id,
      name: get("LEA"),
      state: stateFips,
      reading: null,
      math: null,
      tested: null,
      participation: null,
      history: [],
    };
    row[subject] = round1(parsePercent(get("ProficientOrAbove_percent")));
    row.tested = Number(get("Denominator")) || row.tested;
    row.participation = round1(parsePercent(get("ParticipationRate")));
    districts.set(id, row);
    kept++;
  });
  console.log(`  ${file}: kept ${kept} district rows (${subject})`);
}

async function readLatestDistricts() {
  const districts = new Map(); // leaid -> row
  const dupes = new Set();
  for (const [subject, file] of [
    ["reading", LATEST_FILES.districtReading],
    ["math", LATEST_FILES.districtMath],
  ]) {
    await scanLatestDistrictsFile(file, subject, districts, dupes);
  }
  if (dupes.size > 0) console.warn(`  ! ${dupes.size} duplicate district-subject rows (last kept)`);
  return districts;
}

// ---------------------------------------------------------------------------
// Pass 2 — history years (LEA family; returns local rows + state aggregation)
// ---------------------------------------------------------------------------

async function readHistoryFile(year, file, subject) {
  const rows = []; // { id, pct, tested }
  const agg = new Map(); // fips -> { num, den }
  let header = null;
  let kept = 0;
  await forEachRemoteLine(GCS + file, (line) => {
    if (!header) {
      header = headerIndex(parseCsvLine(line));
      return;
    }
    // Cheap prefilter before full CSV parsing: ALL-students, all-grades rows.
    if (!line.includes(",ALL,")) return;
    const cols = parseCsvLine(line);
    const get = (f) => cols[header.get(f)]?.trim() ?? "";
    if (get("CATEGORY") !== "ALL" || get("GRADE") !== "00") return;
    const pct = parsePercent(get("PCTPROF"));
    const tested = Number(get("NUMVALID")) || null;
    const id = get("LEAID").padStart(7, "0");
    kept++;
    rows.push({ id, pct, tested });
    const fips = Number(get("FIPST"));
    if (Number.isFinite(fips) && pct != null && tested) {
      const a = agg.get(fips) ?? { num: 0, den: 0 };
      a.num += pct * tested;
      a.den += tested;
      agg.set(fips, a);
    }
  });
  console.log(`  ${file}: kept ${kept} LEA rows (${year} ${subject})`);
  return { rows, agg };
}

/**
 * Wide-schema history files (SY 2013-14 … 2017-18): one row per LEA with
 * all-students columns `ALL_<RLA|MTH>00<PCTPROF|NUMVALID>_<yy>`. Missing
 * columns are detected after the header line; the stream completes but no
 * rows are kept and an error is raised, so schema drift is loud, not silent.
 */
async function readHistoryFileWide(year, file, subject) {
  const yy = year.slice(2).replace("-", ""); // "2013-14" -> "1314"
  const token = subject === "math" ? "MTH" : "RLA";
  const pctCol = `ALL_${token}00PCTPROF_${yy}`;
  const numCol = `ALL_${token}00NUMVALID_${yy}`;
  const rows = []; // { id, pct, tested }
  const agg = new Map(); // fips -> { num, den }
  let header = null;
  let iPct = null;
  let iNum = null;
  let iId = null;
  let iFips = null;
  let kept = 0;
  await forEachRemoteLine(GCS + file, (line) => {
    if (!header) {
      header = headerIndex(parseCsvLine(line));
      iPct = header.get(pctCol) ?? null;
      iNum = header.get(numCol) ?? null;
      iId = header.get("LEAID") ?? null;
      iFips = header.get("FIPST") ?? null;
      return;
    }
    if (iPct == null || iNum == null || iId == null || iFips == null) return;
    const cols = parseCsvLine(line);
    const pct = parsePercent(cols[iPct]);
    const tested = Number(cols[iNum]) || null;
    const id = (cols[iId] ?? "").trim().padStart(7, "0");
    kept++;
    rows.push({ id, pct, tested });
    const fips = Number(cols[iFips]);
    if (Number.isFinite(fips) && pct != null && tested) {
      const a = agg.get(fips) ?? { num: 0, den: 0 };
      a.num += pct * tested;
      a.den += tested;
      agg.set(fips, a);
    }
  });
  if (iPct == null || iNum == null) {
    throw new Error(`${file}: wide columns ${pctCol}/${numCol} not found — schema drift`);
  }
  console.log(`  ${file}: kept ${kept} LEA rows (${year} ${subject}, wide)`);
  return { rows, agg };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("EDFacts ingestion — streaming official achievement exports");
  console.log(`  target: ${OUT_DIR}\n`);

  console.log(`Pass 1: latest release (SY ${LATEST_YEAR})`);
  const states = await readLatestStates();
  const districts = await readLatestDistricts();
  console.log(`  state rows: ${states.size} | district rows: ${districts.size}\n`);

  console.log("Pass 2: history years (LEA files)");
  const yearAgg = new Map(); // `${year}|${subject}|${fips}` -> {num,den}
  for (const h of HISTORY_FILES) {
    for (const [subject, file] of [
      ["reading", h.reading],
      ["math", h.math],
    ]) {
      const { rows, agg } =
        h.format === "wide"
          ? await readHistoryFileWide(h.year, file, subject)
          : await readHistoryFile(h.year, file, subject);
      for (const r of rows) {
        const d = districts.get(r.id);
        if (d) d.history.push({ year: h.year, subject, pct: r.pct, tested: r.tested });
      }
      for (const [fips, v] of agg) yearAgg.set(`${h.year}|${subject}|${fips}`, v);
    }
  }

  // Fold per-year history into each district row (ordered oldest -> newest).
  const yearsAsc = [...HISTORY_FILES].reverse().map((h) => h.year).concat([LATEST_YEAR]);
  for (const d of districts.values()) {
    const bySubject = { reading: [], math: [] };
    for (const entry of d.history) bySubject[entry.subject].push(entry);
    d.history = yearsAsc.map((year) => ({
      year,
      reading:
        year === LATEST_YEAR
          ? d.reading
          : round1(bySubject.reading.find((e) => e.year === year)?.pct ?? null),
      math:
        year === LATEST_YEAR
          ? d.math
          : round1(bySubject.math.find((e) => e.year === year)?.pct ?? null),
    }));
  }

  // Fold history into state rows (LEA-aggregated for older years).
  for (const s of states.values()) {
    s.history = yearsAsc.map((year) => {
      if (year === LATEST_YEAR) return { year, reading: s.reading, math: s.math };
      const r = yearAgg.get(`${year}|reading|${s.fips}`);
      const m = yearAgg.get(`${year}|math|${s.fips}`);
      return {
        year,
        reading: r && r.den ? round1(r.num / r.den) : null,
        math: m && m.den ? round1(m.num / m.den) : null,
      };
    });
  }

  const snapshot = {
    meta: {
      source: "EDFacts Achievement Results for State Assessments (district-level, all students, all grades)",
      sourceUrl: SOURCE_URL,
      schoolYear: LATEST_YEAR,
      schoolYears: yearsAsc,
      generatedAt: new Date().toISOString(),
      license: LICENSE,
    },
    states: [...states.values()].sort((a, b) => a.fips - b.fips),
    districts: [...districts.values()].sort((a, b) => a.id.localeCompare(b.id)),
  };

  mkdirSync(OUT_DIR, { recursive: true });
  const outFile = join(OUT_DIR, "us-achievement.json");
  const json = JSON.stringify(snapshot);
  writeFileSync(outFile, json);
  const mb = (json.length / 1024 / 1024).toFixed(2);
  console.log(`\nWrote ${outFile} (${mb} MB)`);
  console.log(`  states: ${snapshot.states.length}, districts: ${snapshot.districts.length}`);
  console.log("Done.");
}

main().catch((err) => {
  console.error("\nIngest failed:", err);
  process.exit(1);
});
