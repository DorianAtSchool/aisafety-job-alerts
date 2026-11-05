// Fetching and normalising jobs from the AISafety.com Data API (CC-BY-4.0).
// Docs: https://aisafety.com/developers

export const API_URL = "https://aisafety.com/api/v1/jobs";

/** A job as returned by the API. Multi-valued fields come as ", "-joined strings. */
export interface ApiJob {
  id: string;
  name: string;
  description: string;
  summary: string;
  organization: string;
  logo: string;
  skillSet: string;
  location: string;
  locations: string[];
  countries: string[];
  minimumExperience: string;
  requiredDegree: string;
  salary: string;
  roleType: string;
  workLocation: string;
  url: string;
  datePublished: string;
}

/** Facet fields that hold comma-separated values, mapped to their API field. */
export const FACET_FIELDS = {
  skillSet: "skillSet",
  roleType: "roleType",
  workLocation: "workLocation",
  experience: "minimumExperience",
  degree: "requiredDegree",
} as const satisfies Record<string, keyof ApiJob>;

export type FacetKey = keyof typeof FACET_FIELDS | "countries";

export function splitValues(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

export function facetValues(job: ApiJob, key: FacetKey): string[] {
  if (key === "countries") return job.countries ?? [];
  return splitValues(job[FACET_FIELDS[key]]);
}

/** Fetches all jobs. Throws on anything unexpected so a bad day never marks jobs as seen. */
export async function fetchJobs(fetcher: typeof fetch = fetch): Promise<ApiJob[]> {
  const res = await fetcher(API_URL, {
    headers: { "User-Agent": "aisafety-job-alerts (daily digest; one request/day)" },
  });
  if (!res.ok) throw new Error(`Jobs API returned HTTP ${res.status}`);
  const body = (await res.json()) as { data?: unknown };
  if (!Array.isArray(body.data)) throw new Error("Jobs API response has no data array");
  const jobs = body.data as ApiJob[];
  // The board has hundreds of open roles; an almost-empty response is more likely an outage
  // than reality, and treating it as truth would mark everything inactive.
  if (jobs.length < 50) throw new Error(`Jobs API returned only ${jobs.length} jobs`);
  for (const job of jobs) {
    if (typeof job.id !== "string" || typeof job.name !== "string") {
      throw new Error("Jobs API returned a job without id/name");
    }
  }
  return jobs;
}
