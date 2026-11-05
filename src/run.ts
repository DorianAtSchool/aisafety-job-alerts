// The daily run: sync jobs from the API, then email each confirmed subscriber their new matches.
import { activeJobs, loadRecipients, markSentStatement, newJobsSince, syncJobs, type Search } from "./db";
import { renderDigest, type DigestGroup, type DigestLinks } from "./email";
import type { Env } from "./env";
import { fetchJobs, type ApiJob } from "./jobs";
import { createMailer } from "./mailer";
import { matches } from "./match";

const DAY = 24 * 60 * 60 * 1000;
/**
 * New jobs stay eligible for this long, so a failed send (or a filter edit) is picked up by the
 * next run instead of being lost. The `sent` table prevents duplicates.
 */
const PENDING_WINDOW = 3 * DAY;

/** Groups jobs under the first search they match; each job appears at most once. */
export function buildDigestGroups(searches: Search[], jobs: ApiJob[]): DigestGroup[] {
  const used = new Set<string>();
  return searches.map((s) => {
    const matched = jobs.filter((j) => !used.has(j.id) && matches(s.filters, j));
    for (const j of matched) used.add(j.id);
    return { name: s.name, filters: s.filters, jobs: matched };
  });
}

export function manageLinks(env: Env, token: string): DigestLinks {
  const base = env.BASE_URL.replace(/\/$/, "");
  return {
    manage: `${base}/manage/${token}`,
    unsubscribe: `${base}/unsubscribe/${token}`,
    shortlist: `${base}/manage/${token}/shortlist`,
    save: (jobId) => `${base}/manage/${token}/save/${encodeURIComponent(jobId)}`,
  };
}

export interface RunReport {
  fetched: number;
  added: number;
  seeded: boolean;
  emailsSent: number;
  jobsSent: number;
  skippedByCap: number;
  errors: string[];
}

export async function dailyRun(env: Env, now = Date.now()): Promise<RunReport> {
  const jobs = await fetchJobs();
  const { added, seeded } = await syncJobs(env.DB, jobs, now);
  const report: RunReport = { fetched: jobs.length, added, seeded, emailsSent: 0, jobsSent: 0, skippedByCap: 0, errors: [] };

  const since = now - PENDING_WINDOW;
  const candidates = await newJobsSince(env.DB, since);
  if (candidates.length === 0) return report;

  const recipients = await loadRecipients(env.DB, since - DAY);
  const mailer = createMailer(env);
  const cap = Number(env.MAX_EMAILS_PER_RUN) || 400;
  const sentStatements: D1PreparedStatement[] = [];

  try {
    for (const { subscriber, searches, sentIds } of recipients) {
      const eligible = candidates
        .filter((c) => c.firstSeenAt > subscriber.confirmed_at! && !sentIds.has(c.job.id))
        .map((c) => c.job);
      const groups = buildDigestGroups(searches, eligible);
      const jobIds = groups.flatMap((g) => g.jobs.map((j) => j.id));
      if (jobIds.length === 0) continue;
      if (report.emailsSent >= cap) {
        report.skippedByCap++;
        continue;
      }
      try {
        await mailer.send({ to: subscriber.email, ...renderDigest(groups, manageLinks(env, subscriber.token)) });
        sentStatements.push(markSentStatement(env.DB, subscriber.id, jobIds, now));
        report.emailsSent++;
        report.jobsSent += jobIds.length;
      } catch (err) {
        report.errors.push(`subscriber ${subscriber.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } finally {
    await mailer.close();
    if (sentStatements.length) await env.DB.batch(sentStatements);
  }
  return report;
}

/** Makes sure the jobs table is populated (first visit before any cron run). */
export async function ensureJobs(env: Env): Promise<ApiJob[]> {
  let jobs = await activeJobs(env.DB);
  if (jobs.length === 0) {
    await syncJobs(env.DB, await fetchJobs(), Date.now());
    jobs = await activeJobs(env.DB);
  }
  return jobs;
}
