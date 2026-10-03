// Urban Institute Education Data API adapter — opportunistic by design.
//
// The Urban Institute API republishes federal EDFacts data in a convenient
// JSON form. Its CDN blocks some networks outright (verified: 403 from
// multiple clients on this project's development network), so this adapter is
// best-effort: callers treat null as "unavailable" and fall back to the
// EDFacts snapshots, which carry the same underlying data directly from the
// source of record. If the host is reachable (e.g. from a deployment), these
// helpers can be promoted to primary without changing call sites.

const URBAN = "https://educationdata.urban.org/api/v1";
const UA = "foundational-skills-stress/0.1 (education research dashboard)";

export interface UrbanProbe {
  reachable: boolean;
  status?: number;
  error?: string;
}

export async function probeUrban(): Promise<UrbanProbe> {
  try {
    const res = await fetch(`${URBAN}/school-districts/ccd/directory/2022/?page=1`, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 3600 },
    });
    if (res.ok) return { reachable: true, status: res.status };
    return { reachable: false, status: res.status, error: `HTTP ${res.status}` };
  } catch (err) {
    return { reachable: false, error: err instanceof Error ? err.message : "network error" };
  }
}

/**
 * Fetches a district-level directory page when the API is reachable;
 * returns null otherwise (expected on blocked networks).
 */
export async function fetchUrbanDistrictDirectory(year = 2022): Promise<unknown[] | null> {
  try {
    const res = await fetch(`${URBAN}/school-districts/ccd/directory/${year}/?page=1`, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
      next: { revalidate: 86400 },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { results?: unknown[] };
    return Array.isArray(json.results) ? json.results : null;
  } catch {
    return null;
  }
}
