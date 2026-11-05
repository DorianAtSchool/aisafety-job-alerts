import { describe, expect, it } from "vitest";
import { renderDigest } from "../src/email";
import type { ApiJob } from "../src/jobs";
import { EMPTY_FILTERS, filtersFromForm, matches, parseFilters, type Filters } from "../src/match";
import { buildDigestGroups } from "../src/run";

function job(overrides: Partial<ApiJob>): ApiJob {
  return {
    id: "rec1",
    name: "Research Scientist",
    description: "Work on mechanistic interpretability.",
    summary: "Do safety research.",
    organization: "Example Lab",
    logo: "",
    skillSet: "Research, Software engineering",
    location: "London, UK",
    locations: ["London, UK"],
    countries: ["UK"],
    minimumExperience: "Junior (1–4 years experience), Mid (5–9 years experience)",
    requiredDegree: "Undergraduate degree or less",
    salary: "",
    roleType: "Full-time",
    workLocation: "On-site",
    url: "https://example.org/job",
    datePublished: "2026-11-04",
    ...overrides,
  };
}

const f = (o: Partial<Filters>): Filters => ({ ...EMPTY_FILTERS, ...o });

describe("matches", () => {
  it("empty filters match everything", () => {
    expect(matches(EMPTY_FILTERS, job({}))).toBe(true);
  });

  it("ORs within a facet and splits comma-separated values", () => {
    expect(matches(f({ skillSet: ["Policy", "Software engineering"] }), job({}))).toBe(true);
    expect(matches(f({ skillSet: ["Policy"] }), job({}))).toBe(false);
  });

  it("ANDs across facets", () => {
    expect(matches(f({ skillSet: ["Research"], workLocation: ["Remote"] }), job({}))).toBe(false);
    expect(matches(f({ skillSet: ["Research"], workLocation: ["On-site"] }), job({}))).toBe(true);
  });

  it("matches experience literally, like aisafety.com ('Multiple experience levels' is its own value)", () => {
    const j = job({ minimumExperience: "Multiple experience levels" });
    expect(matches(f({ experience: ["Entry-level"] }), j)).toBe(false);
    expect(matches(f({ experience: ["Entry-level", "Multiple experience levels"] }), j)).toBe(true);
    expect(matches(f({ experience: ["Senior (10+ years experience)"] }), job({}))).toBe(false);
  });

  it("matches global remote roles regardless of country, unless disabled", () => {
    const global = job({ countries: [], location: "Remote (Global)", workLocation: "Remote" });
    const globalAndUs = job({ countries: ["USA"], location: "Remote (Global); Remote (USA)" });
    expect(matches(f({ countries: ["Germany"] }), global)).toBe(true);
    expect(matches(f({ countries: ["Germany"] }), globalAndUs)).toBe(true);
    expect(matches(f({ countries: ["Germany"], includeGlobalRemote: false }), global)).toBe(false);
  });

  it("matches 'Europe' jobs when a European country is selected", () => {
    const eu = job({ countries: ["Europe"], location: "Remote (Europe)" });
    expect(matches(f({ countries: ["Germany"] }), eu)).toBe(true);
    expect(matches(f({ countries: ["USA"] }), eu)).toBe(false);
  });

  it("keywords search title/summary/description; excludes check title/org/summary", () => {
    expect(matches(f({ keywords: ["INTERPRETABILITY"] }), job({}))).toBe(true);
    expect(matches(f({ keywords: ["governance"] }), job({}))).toBe(false);
    expect(matches(f({ exclude: ["scientist"] }), job({}))).toBe(false);
    // "interpretability" only appears in the description, so excluding it doesn't drop the job.
    expect(matches(f({ exclude: ["interpretability"] }), job({}))).toBe(true);
  });

  it("matches organizations by substring", () => {
    expect(matches(f({ organizations: ["example"] }), job({}))).toBe(true);
    expect(matches(f({ organizations: ["Other Org"] }), job({}))).toBe(false);
  });
});

describe("parsing", () => {
  it("parseFilters drops junk and defaults includeGlobalRemote to true", () => {
    const p = parseFilters({ skillSet: ["Research", 3, " "], countries: "UK", bogus: 1 });
    expect(p.skillSet).toEqual(["Research"]);
    expect(p.countries).toEqual([]);
    expect(p.includeGlobalRemote).toBe(true);
  });

  it("filtersFromForm reads checkbox groups and comma-separated text", () => {
    const form = new FormData();
    form.append("skillSet", "Research");
    form.append("skillSet", "Policy");
    form.append("keywords", " evals, interpretability ,");
    const p = filtersFromForm(form);
    expect(p.skillSet).toEqual(["Research", "Policy"]);
    expect(p.keywords).toEqual(["evals", "interpretability"]);
    expect(p.includeGlobalRemote).toBe(false); // unchecked checkbox is absent from the form
  });
});

describe("digest", () => {
  const searches = [
    { id: 1, subscriber_id: 1, name: "Research", filters: f({ skillSet: ["Research"] }), created_at: 0, share_code: "a" },
    { id: 2, subscriber_id: 1, name: "Anything remote", filters: f({ workLocation: ["Remote"] }), created_at: 0, share_code: "b" },
  ];

  it("lists each job once, under the first matching search", () => {
    const a = job({ id: "a", workLocation: "Remote" });
    const b = job({ id: "b", skillSet: "Operations", workLocation: "Remote" });
    const groups = buildDigestGroups(searches, [a, b]);
    expect(groups.map((g) => g.jobs.map((j) => j.id))).toEqual([["a"], ["b"]]);
  });

  it("escapes HTML from job data and includes unsubscribe headers", () => {
    const groups = buildDigestGroups(searches, [job({ name: "<script>x</script>" })]);
    const msg = renderDigest(groups, { manage: "https://x/m", unsubscribe: "https://x/u", shortlist: "https://x/s", save: (id) => `https://x/save/${id}` });
    expect(msg.html).not.toContain("<script>x");
    expect(msg.headers?.["List-Unsubscribe"]).toBe("<https://x/u>");
    expect(msg.subject).toBe("AI Safety Jobs Alert: 1 new job");
  });
});
