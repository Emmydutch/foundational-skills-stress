// scripts/ingest-absenteeism.mjs — builds the chronic-absenteeism snapshot for
// the US layer from the CRDC 2015-16 public state tables.
//
// The rate is computed within one collection so numerator and denominator can
// never drift apart:
//   rate = students absent 15+ school days (CRDC Absenteeism table)
//        / total public school enrollment   (CRDC Enrollment table)
//
// Sources (both rehosted/mirrored official OCR publications, no key needed):
//   - Absenteeism: data.ed.gov resource mirror of the CRDC 2015-16 state table
//   - Enrollment:  civilrightsdata.ed.gov asset for CRDC 2015-16
//
// Run: npm run ingest:absenteeism

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";
import { STATE_REF, titleCase } from "./state-ref.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "data", "snapshots");

const ABSENTEEISM_URL =
  "https://data.ed.gov/dataset/416f7068-ffa8-4cc0-9dcb-8a3f912c6752/resource/c9fedd7b-7c2f-48d2-ac98-6211cdbef7ea/download/chronic-absenteeism.xlsx";
const ENROLLMENT_URL =
  "https://civilrightsdata.ed.gov/assets/downloads/2015-2016/Enrollment-Overall.xlsx";

const SCHOOL_YEAR = "2015-16";
const TIMEOUT_MS = 5 * 60 * 1000;

async function download(url, label) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) throw new Error(`${label}: HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      // Guard against SPA error shells served with HTTP 200.
      if (buf.length < 4096 || buf.subarray(0, 2).toString() !== "PK") {
        throw new Error(`${label}: response is not a workbook (${buf.length} bytes)`);
      }
      return buf;
    } catch (err) {
      if (attempt >= 4) throw err;
      const waitMs = attempt * 8000;
      console.warn(`  ! ${label} attempt ${attempt} failed (${err.message}); retrying in ${waitMs / 1000}s`);
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
}

/** Extracts [stateName, totalNumber] pairs from a CRDC state table sheet. */
function stateTotals(buffer, sheetName) {
  const wb = XLSX.read(buffer);
  const sheet = wb.Sheets[sheetName];
  if (!sheet) throw new Error(`sheet "${sheetName}" not found (have: ${wb.SheetNames.join(", ")})`);
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  const out = new Map();
  for (const row of rows) {
    const name = typeof row[1] === "string" ? row[1].trim() : "";
    const total = Number(row[2]);
    if (name && name !== "Number" && Number.isFinite(total) && total > 0) {
      out.set(name.toUpperCase(), total);
    }
  }
  return out;
}

async function main() {
  console.log("CRDC absenteeism ingestion — building rate snapshot");
  console.log(`  target: ${OUT_DIR}\n`);

  console.log("Downloading CRDC 2015-16 state tables...");
  const [absentBuf, enrollBuf] = await Promise.all([
    download(ABSENTEEISM_URL, "absenteeism workbook"),
    download(ENROLLMENT_URL, "enrollment workbook"),
  ]);

  const absent = stateTotals(absentBuf, "Total");
  const enrolled = stateTotals(enrollBuf, "Overall Enrollment");
  console.log(`  absenteeism rows: ${absent.size} | enrollment rows: ${enrolled.size}`);

  const states = [];
  for (const [name, count] of absent) {
    if (name === "UNITED STATES") continue;
    const ref = STATE_REF[name];
    const denom = enrolled.get(name);
    if (!ref || !denom) {
      if (name !== "UNITED STATES") console.warn(`  ! skipped (no ref or denominator): ${name}`);
      continue;
    }
    const [abbr, fips] = ref;
    states.push({
      fips: Number(fips),
      abbr,
      name: titleCase(name),
      rate: Math.round((count / denom) * 1000) / 10,
      enrolled: denom,
    });
  }
  states.sort((a, b) => a.fips - b.fips);

  // Sanity check against the published national figure (~15.5%).
  const usAbsent = absent.get("UNITED STATES");
  const usEnrolled = enrolled.get("UNITED STATES");
  const usRate = usAbsent && usEnrolled ? ((usAbsent / usEnrolled) * 100).toFixed(1) : "n/a";
  console.log(`  US: ${(usAbsent ?? 0).toLocaleString()} absent 15+ days / ${(usEnrolled ?? 0).toLocaleString()} enrolled = ${usRate}%`);

  const snapshot = {
    meta: {
      source:
        "CRDC 2015-16 (U.S. Dept. of Education, Office for Civil Rights) — students absent 15+ school days ÷ public school enrollment",
      sourceUrl: "https://civilrightsdata.ed.gov",
      schoolYear: SCHOOL_YEAR,
      schoolYears: [SCHOOL_YEAR],
      generatedAt: new Date().toISOString(),
      license: "Public domain (U.S. Department of Education)",
    },
    states,
    districts: [],
  };

  mkdirSync(OUT_DIR, { recursive: true });
  const outFile = join(OUT_DIR, "us-absenteeism.json");
  writeFileSync(outFile, JSON.stringify(snapshot));
  console.log(`\nWrote ${outFile}`);
  console.log(`  states: ${snapshot.states.length} (median rate ~${median(states.map((s) => s.rate))}%)`);
  console.log("Done.");
}

function median(xs) {
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)].toFixed(1) : "n/a";
}

main().catch((err) => {
  console.error("\nAbsenteeism ingest failed:", err);
  process.exit(1);
});
