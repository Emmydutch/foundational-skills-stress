// Maps World Bank country names to Natural Earth topology feature ids by
// normalized name matching, with an alias table for known mismatches.

interface TopoFeature {
  id?: string | number;
  properties?: { name?: string };
}

const ALIASES: Record<string, string[]> = {
  "united states": ["united states of america"],
  "russian federation": ["russia"],
  "korea, rep.": ["south korea"],
  "korea, dem. people's rep.": ["north korea"],
  "iran, islamic rep.": ["iran"],
  "egypt, arab rep.": ["egypt"],
  "yemen, rep.": ["yemen"],
  "venezuela, rb": ["venezuela"],
  "bolivia (plurinational state of)": ["bolivia"],
  "tanzania": ["united republic of tanzania", "tanzania"],
  "congo, dem. rep.": ["dem. rep. congo", "democratic republic of the congo"],
  "congo, rep.": ["congo"],
  "slovak republic": ["slovakia"],
  "czechia": ["czech republic", "czechia"],
  "lao pdr": ["laos"],
  "syrian arab republic": ["syria"],
  "viet nam": ["vietnam"],
  "kyrgyz republic": ["kyrgyzstan"],
  "turkiye": ["turkey"],
  "gambia, the": ["gambia"],
  "bahamas, the": ["bahamas"],
  "brunei darussalam": ["brunei"],
  "timor-leste": ["east timor", "timor-leste"],
  "cabo verde": ["cape verde"],
  "micronesia, fed. sts.": ["federated states of micronesia", "micronesia"],
  "swaziland": ["eswatini", "swaziland"],
  "eswatini": ["eswatini", "swaziland"],
  "moldova": ["moldova", "republic of moldova"],
  "serbia": ["serbia", "republic of serbia"],
  "north macedonia": ["north macedonia", "macedonia"],
  "hong kong sar, china": ["hong kong"],
  "macao sar, china": ["macao", "macau"],
  "somalia, fed. rep.": ["somalia"],
  "west bank and gaza": ["palestine", "west bank"],
};

function normalize(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\bst\.?\b/g, "saint")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Builds normalized-name -> feature id from world-atlas topology features. */
export function buildCountryIdMap(features: TopoFeature[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const f of features) {
    const name = f.properties?.name;
    if (!name || f.id == null) continue;
    map.set(normalize(name), String(f.id));
  }
  return map;
}

/** Resolves a World Bank country name to a topology feature id (or null). */
export function matchCountryId(wbName: string, map: Map<string, string>): string | null {
  const candidates = [wbName, ...(ALIASES[wbName.toLowerCase()] ?? [])];
  for (const candidate of candidates) {
    const id = map.get(normalize(candidate));
    if (id) return id;
  }
  return null;
}
