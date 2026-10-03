// scripts/verify-feeds.mjs — smoke-tests every external endpoint the dashboard
// depends on (status + shape), plus the local snapshots the app serves.
//
// Run this FIRST whenever the dashboard looks stale or empty:
//   npm run verify-feeds
//
// Exit code 0 = all critical feeds healthy. Exit code 1 = at least one critical
// feed failed; the failing line tells you which layer to look at.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TIMEOUT_MS = 45_000;

const checks = [];
function check(name, kind, fn) {
  checks.push({ name, kind, fn });
}

async function getJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** Reads only the first bytes of a response body, then cancels the stream —
 *  large files are never fully downloaded by this smoke test. */
async function readPrefix(res, maxBytes) {
  const reader = res.body?.getReader();
  if (!reader) throw new Error("no response body");
  const chunks = [];
  let total = 0;
  while (total < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(Buffer.from(value));
    total += value.length;
  }
  await reader.cancel().catch(() => {});
  return Buffer.concat(chunks);
}

async function headOk(url, mustBeZip = false) {
  const res = await fetch(url, {
    headers: { Range: "bytes=0-4095", "Accept-Encoding": "identity" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok && res.status !== 206) throw new Error(`HTTP ${res.status}`);
  const buf = await readPrefix(res, 4096);
  if (buf.length < 1) throw new Error("empty body");
  if (mustBeZip && buf.subarray(0, 2).toString() !== "PK") {
    throw new Error(`expected workbook (PK), got ${buf.length} bytes starting "${buf.subarray(0, 20).toString().replace(/\n/g, " ")}"`);
  }
  return buf;
}

// --- Global layer: World Bank Open Data ------------------------------------
const WB = "https://api.worldbank.org/v2";
for (const [label, id] of [
  ["learning poverty (SE.LPV.PRIM)", "SE.LPV.PRIM"],
  ["primary completion (SE.PRM.CUAT.ZS)", "SE.PRM.CUAT.ZS"],
  ["out of school (SE.PRM.UNER.ZS)", "SE.PRM.UNER.ZS"],
]) {
  check(`World Bank ${label}`, "critical", async () => {
    const json = await getJson(`${WB}/country/all/indicator/${id}?format=json&per_page=500&date=2015:2026`);
    if (!Array.isArray(json) || !Array.isArray(json[1]) || json[1].length === 0) {
      throw new Error("unexpected response shape");
    }
    const values = json[1].filter((r) => r.value != null).length;
    return `${json[1].length} rows (2015-2026), ${values} with values`;
  });
}

// --- US layer: EDFacts mirror on Google Cloud Storage ------------------------
for (const [label, name] of [
  ["state ELA csv", "EDFacts_2022_State_ela.csv"],
  ["district math csv", "EDFacts_2022_District_math.csv"],
]) {
  check(`EDFacts mirror (2021-22 ${label})`, "critical", async () => {
    const buf = await headOk(`https://storage.googleapis.com/edc-education-exports/edfacts/${name}`);
    const head = buf.toString("utf8").trimStart();
    if (head.startsWith("<")) throw new Error("got HTML, not CSV");
    return `CSV ok (${buf.length} B prefix)`;
  });
}

// --- US layer: CRDC absenteeism + enrollment workbooks ----------------------
check("CRDC absenteeism workbook (data.ed.gov)", "critical", async () => {
  await headOk(
    "https://data.ed.gov/dataset/416f7068-ffa8-4cc0-9dcb-8a3f912c6752/resource/c9fedd7b-7c2f-48d2-ac98-6211cdbef7ea/download/chronic-absenteeism.xlsx",
    true,
  );
  return "workbook signature ok";
});

check("CRDC enrollment workbook (civilrightsdata.ed.gov)", "critical", async () => {
  await headOk(
    "https://civilrightsdata.ed.gov/assets/downloads/2015-2016/Enrollment-Overall.xlsx",
    true,
  );
  return "workbook signature ok";
});

// --- US context: Census ACS (keyless) ---------------------------------------
check("Census ACS 1-year (B17001 poverty)", "critical", async () => {
  // Mirrors the app's feed module: cascade recent ACS years, first valid wins.
  // Some networks are served a "Missing Key" HTML page (status 200) unless
  // CENSUS_API_KEY is set — report that distinctly from a network failure.
  const errors = [];
  for (const year of [2024, 2023, 2022, 2021]) {
    try {
      const res = await fetch(
        `https://api.census.gov/data/${year}/acs/acs1?get=NAME,B17001_001E,B17001_002E&for=state:*${process.env.CENSUS_API_KEY ? `&key=${process.env.CENSUS_API_KEY}` : ""}`,
        { signal: AbortSignal.timeout(TIMEOUT_MS) },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (text.trimStart().startsWith("<")) {
        throw new Error("key required (HTML Missing Key page — set CENSUS_API_KEY)");
      }
      const json = JSON.parse(text);
      if (!Array.isArray(json) || json.length < 50) throw new Error("unexpected response shape");
      return `${json.length - 1} states (ACS ${year})`;
    } catch (err) {
      errors.push(`${year}: ${err.message}`);
    }
  }
  throw new Error(`all ACS years failed — ${errors.join("; ")}`);
});

// --- data.ed.gov portal (catalog API) ---------------------------------------
check("data.ed.gov catalog API", "critical", async () => {
  const json = await getJson("https://data.ed.gov/api/action/package_search?q=absenteeism&rows=1");
  if (!json.success) throw new Error("success=false");
  return `${json.result.count} matching datasets`;
});

// --- Urban Institute (known-blocked on some networks; informational) --------
check("Urban Institute Education Data API", "optional", async () => {
  const res = await fetch("https://educationdata.urban.org/api/v1/schools/ccd/directory/2021/", {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} (adapter falls back to EDFacts snapshots)`);
  const json = await res.json();
  return `${json.count ?? "?"} schools`;
});

// --- Local snapshots the app serves -----------------------------------------
check("snapshot: us-achievement.json", "critical", () => {
  const p = join(ROOT, "data", "snapshots", "us-achievement.json");
  if (!existsSync(p)) throw new Error("missing — run `npm run ingest:achievement`");
  const s = JSON.parse(readFileSync(p, "utf-8"));
  if (!s.states?.length || !s.districts?.length) throw new Error("snapshot is empty");
  return `${s.states.length} states, ${s.districts.length} districts, SY ${s.meta.schoolYear}`;
});

check("snapshot: us-absenteeism.json", "critical", () => {
  const p = join(ROOT, "data", "snapshots", "us-absenteeism.json");
  if (!existsSync(p)) throw new Error("missing — run `npm run ingest:absenteeism`");
  const s = JSON.parse(readFileSync(p, "utf-8"));
  if (!s.states?.length) throw new Error("snapshot is empty");
  return `${s.states.length} states, SY ${s.meta.schoolYear}`;
});

// ---------------------------------------------------------------------------
async function main() {
  console.log("Feed smoke test — status + shape of every endpoint the dashboard uses\n");
  let failures = 0;

  const results = await Promise.all(
    checks.map(async ({ name, kind, fn }) => {
      const started = Date.now();
      try {
        const detail = await fn();
        return { name, kind, ok: true, detail: String(detail ?? "ok"), ms: Date.now() - started };
      } catch (err) {
        return { name, kind, ok: false, detail: err.message ?? String(err), ms: Date.now() - started };
      }
    }),
  );

  const width = Math.max(...results.map((r) => r.name.length));
  for (const r of results) {
    const mark = r.ok ? "PASS" : r.kind === "optional" ? "WARN" : "FAIL";
    console.log(`  [${mark}] ${r.name.padEnd(width)}  ${r.detail}  (${r.ms} ms)`);
    if (!r.ok && r.kind === "critical") failures++;
  }

  console.log(
    `\n${results.length - failures}/${results.length} feeds healthy` +
      (failures ? ` — ${failures} critical failure(s); see FAIL lines above.` : " — all good."),
  );
  process.exit(failures ? 1 : 0);
}

main();
