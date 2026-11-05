import { facetValues, type ApiJob } from "./jobs";

/**
 * A saved search. Empty lists mean "any".
 * Within a list values are OR-ed; across fields they are AND-ed.
 */
export interface Filters {
  skillSet: string[];
  roleType: string[];
  workLocation: string[];
  experience: string[];
  degree: string[];
  countries: string[];
  /** Jobs listed as "Remote (Global)" (no country) pass the country filter. */
  includeGlobalRemote: boolean;
  /** Case-insensitive substrings of the organization name. */
  organizations: string[];
  /** Any of these must appear in the title, summary or description. */
  keywords: string[];
  /** None of these may appear in the title, organization or summary. */
  exclude: string[];
}

export const EMPTY_FILTERS: Filters = {
  skillSet: [],
  roleType: [],
  workLocation: [],
  experience: [],
  degree: [],
  countries: [],
  includeGlobalRemote: true,
  organizations: [],
  keywords: [],
  exclude: [],
};

const EUROPEAN_COUNTRIES = new Set([
  "Austria", "Belgium", "Bulgaria", "Croatia", "Cyprus", "Czech Republic", "Czechia", "Denmark",
  "Estonia", "Finland", "France", "Germany", "Greece", "Hungary", "Iceland", "Ireland", "Italy",
  "Latvia", "Lithuania", "Luxembourg", "Malta", "Netherlands", "Norway", "Poland", "Portugal",
  "Romania", "Slovakia", "Slovenia", "Spain", "Sweden", "Switzerland", "UK",
]);

function anyOverlap(wanted: string[], have: string[]): boolean {
  return wanted.length === 0 || wanted.some((w) => have.includes(w));
}

function containsAny(haystack: string, needles: string[]): boolean {
  const h = haystack.toLowerCase();
  return needles.some((n) => h.includes(n.toLowerCase()));
}

function matchesCountry(f: Filters, job: ApiJob): boolean {
  if (f.countries.length === 0) return true;
  // e.g. "Remote (Global)" or "Remote (Global); Remote (USA)" — open to applicants anywhere.
  if (f.includeGlobalRemote && /global/i.test(job.location ?? "")) return true;
  const countries = job.countries ?? [];
  // A job tagged "Europe" is relevant to anyone who picked a European country.
  const wanted = new Set(f.countries);
  if (f.countries.some((c) => EUROPEAN_COUNTRIES.has(c))) wanted.add("Europe");
  return countries.some((c) => wanted.has(c));
}

export function matches(f: Filters, job: ApiJob): boolean {
  return (
    anyOverlap(f.skillSet, facetValues(job, "skillSet")) &&
    anyOverlap(f.roleType, facetValues(job, "roleType")) &&
    anyOverlap(f.workLocation, facetValues(job, "workLocation")) &&
    anyOverlap(f.degree, facetValues(job, "degree")) &&
    anyOverlap(f.experience, facetValues(job, "experience")) &&
    matchesCountry(f, job) &&
    (f.organizations.length === 0 || containsAny(job.organization ?? "", f.organizations)) &&
    (f.keywords.length === 0 ||
      containsAny(`${job.name}\n${job.summary}\n${job.description}`, f.keywords)) &&
    !(f.exclude.length > 0 && containsAny(`${job.name}\n${job.organization}\n${job.summary}`, f.exclude))
  );
}

const LIST_KEYS = [
  "skillSet", "roleType", "workLocation", "experience", "degree", "countries",
  "organizations", "keywords", "exclude",
] as const;

/** Builds Filters from untrusted input (stored JSON or a form), dropping anything malformed. */
export function parseFilters(input: unknown): Filters {
  const obj = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const f: Filters = { ...EMPTY_FILTERS };
  for (const key of LIST_KEYS) {
    const v = obj[key];
    f[key] = Array.isArray(v)
      ? v.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean).slice(0, 100)
      : [];
  }
  f.includeGlobalRemote = obj.includeGlobalRemote !== false;
  return f;
}

/** Builds Filters from a submitted HTML form (checkbox groups + comma-separated text fields). */
export function filtersFromForm(form: FormData): Filters {
  const text = (name: string) =>
    String(form.get(name) ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  return parseFilters({
    skillSet: form.getAll("skillSet"),
    roleType: form.getAll("roleType"),
    workLocation: form.getAll("workLocation"),
    experience: form.getAll("experience"),
    degree: form.getAll("degree"),
    countries: form.getAll("countries"),
    includeGlobalRemote: form.get("includeGlobalRemote") === "on",
    organizations: text("organizations"),
    keywords: text("keywords"),
    exclude: text("exclude"),
  });
}

/** One-line human summary, e.g. "Research or Policy · Remote · UK, Germany · “interpretability”". */
export function describeFilters(f: Filters): string {
  const parts: string[] = [];
  if (f.skillSet.length) parts.push(f.skillSet.join(" or "));
  if (f.roleType.length) parts.push(f.roleType.join(" or "));
  if (f.workLocation.length) parts.push(f.workLocation.join(" or "));
  if (f.experience.length) parts.push(f.experience.map((e) => e.replace(/ \(.*\)$/, "")).join(" or "));
  if (f.degree.length) parts.push(f.degree.join(" or "));
  if (f.countries.length) parts.push(f.countries.join(", ") + (f.includeGlobalRemote ? " + global remote" : ""));
  if (f.organizations.length) parts.push(`at ${f.organizations.join(", ")}`);
  if (f.keywords.length) parts.push(f.keywords.map((k) => `“${k}”`).join(" or "));
  if (f.exclude.length) parts.push(`not ${f.exclude.map((k) => `“${k}”`).join(", ")}`);
  return parts.length ? parts.join(" · ") : "All jobs";
}
