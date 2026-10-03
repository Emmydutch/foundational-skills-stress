// Shared state reference for the ingest scripts: EDFacts/CRDC state names ->
// [abbreviation, FIPS]. Single source of truth for both ingest pipelines.

export const STATE_REF = {
  ALABAMA: ["AL", "01"], ALASKA: ["AK", "02"], ARIZONA: ["AZ", "04"],
  ARKANSAS: ["AR", "05"], CALIFORNIA: ["CA", "06"], COLORADO: ["CO", "08"],
  CONNECTICUT: ["CT", "09"], DELAWARE: ["DE", "10"],
  "DISTRICT OF COLUMBIA": ["DC", "11"], FLORIDA: ["FL", "12"],
  GEORGIA: ["GA", "13"], HAWAII: ["HI", "15"], IDAHO: ["ID", "16"],
  ILLINOIS: ["IL", "17"], INDIANA: ["IN", "18"], IOWA: ["IA", "19"],
  KANSAS: ["KS", "20"], KENTUCKY: ["KY", "21"], LOUISIANA: ["LA", "22"],
  MAINE: ["ME", "23"], MARYLAND: ["MD", "24"], MASSACHUSETTS: ["MA", "25"],
  MICHIGAN: ["MI", "26"], MINNESOTA: ["MN", "27"], MISSISSIPPI: ["MS", "28"],
  MISSOURI: ["MO", "29"], MONTANA: ["MT", "30"], NEBRASKA: ["NE", "31"],
  NEVADA: ["NV", "32"], "NEW HAMPSHIRE": ["NH", "33"], "NEW JERSEY": ["NJ", "34"],
  "NEW MEXICO": ["NM", "35"], "NEW YORK": ["NY", "36"], "NORTH CAROLINA": ["NC", "37"],
  "NORTH DAKOTA": ["ND", "38"], OHIO: ["OH", "39"], OKLAHOMA: ["OK", "40"],
  OREGON: ["OR", "41"], PENNSYLVANIA: ["PA", "42"], "RHODE ISLAND": ["RI", "44"],
  "SOUTH CAROLINA": ["SC", "45"], "SOUTH DAKOTA": ["SD", "46"], TENNESSEE: ["TN", "47"],
  TEXAS: ["TX", "48"], UTAH: ["UT", "49"], VERMONT: ["VT", "50"],
  VIRGINIA: ["VA", "51"], WASHINGTON: ["WA", "53"], "WEST VIRGINIA": ["WV", "54"],
  WISCONSIN: ["WI", "55"], WYOMING: ["WY", "56"], "PUERTO RICO": ["PR", "72"],
  "VIRGIN ISLANDS": ["VI", "78"], GUAM: ["GU", "66"], "AMERICAN SAMOA": ["AS", "60"],
  "NORTHERN MARIANA ISLANDS": ["MP", "69"], "MARSHALL ISLANDS": ["MH", "68"],
  MICRONESIA: ["FM", "64"], PALAU: ["PW", "70"],
  "BUREAU OF INDIAN EDUCATION": ["BIE", "84"],
  "DEPARTMENT OF DEFENSE EDUCATION ACTIVITY": ["DoDEA", "90"],
  "DEPARTMENT OF DEFENSE": ["DoD", "90"],
};

const SMALL_WORDS = new Set(["of", "the", "and", "for"]);

export function titleCase(name) {
  return name
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (SMALL_WORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}
