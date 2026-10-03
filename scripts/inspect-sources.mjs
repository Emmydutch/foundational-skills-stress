// One-time source inspection: prints column headers + representative rows for
// each raw feed so the ingest mapping in scripts/ingest.mjs can be written
// against real schemas. Safe to re-run; downloads only small byte ranges.

import { readFileSync } from "node:fs";
import XLSX from "xlsx";

const GCS = "https://storage.googleapis.com/edc-education-exports/edfacts/";

async function rangedHead(file, bytes) {
  const res = await fetch(GCS + file, {
    headers: { Range: `bytes=0-${bytes}` },
  });
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
  const text = await res.text();
  return text.split(/\r?\n/);
}

function print(label, lines, n = 3) {
  console.log(`\n=== ${label} ===`);
  for (const line of lines.slice(0, n)) console.log(line);
}

// 1. Headers of each yearly achievement CSV family
print("2021-22 District math (header + 1 row)", await rangedHead("EDFacts_2022_District_math.csv", 3000), 2);
print("2021-22 District ela (header + 1 row)", await rangedHead("EDFacts_2022_District_ela.csv", 3000), 2);
print("2020-21 LEA math (header + 2 rows)", await rangedHead("math-achievement-lea-sy2020-21.csv", 3000), 3);
print("2018-19 LEA math long (header + 2 rows)", await rangedHead("math-achievement-lea-sy2018-19-long.csv", 3000), 3);

// 2. Distinct Population/AgeGrade/Subgroup values in the 2021-22 district file
const chunk = await rangedHead("EDFacts_2022_District_math.csv", 20_000_000);
const pop = new Set();
const age = new Set();
const sub = new Set();
for (const line of chunk.slice(1, -1)) {
  const cols = line.split(",");
  if (cols.length < 10) continue;
  pop.add(cols[4]);
  age.add(cols[5]);
  sub.add(cols[6]);
}
console.log("\n=== 2021-22 district Population values ===");
console.log([...pop].join(" | "));
console.log("\n=== 2021-22 district AgeGrade values ===");
console.log([...age].join(" | "));
console.log("\n=== 2021-22 district Subgroup values (first 40) ===");
console.log([...sub].slice(0, 40).join(" | "));

// 3. Chronic absenteeism workbook
const wb = XLSX.read(readFileSync("data/raw/chronic-absenteeism.xlsx"));
console.log("\n=== chronic-absenteeism.xlsx sheets ===");
console.log(wb.SheetNames.join(" | "));
for (const name of wb.SheetNames) {
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1 });
  console.log(`\n--- sheet: ${name} (${rows.length} rows) ---`);
  for (const row of rows.slice(0, 10)) console.log(JSON.stringify(row));
}
