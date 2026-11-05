// D1 access. The Workers free plan allows 50 queries per invocation (a batch() counts as one),
// so anything per-job or per-subscriber is done in bulk.
import type { ApiJob } from "./jobs";
import { parseFilters, type Filters } from "./match";

export interface Subscriber {
  id: number;
  email: string;
  token: string;
  created_at: number;
  confirmed_at: number | null;
  link_sent_at: number | null;
}

export interface Search {
  id: number;
  subscriber_id: number;
  name: string;
  filters: Filters;
  created_at: number;
  share_code: string;
}

export interface StoredJob {
  job: ApiJob;
  firstSeenAt: number;
  seeded: boolean;
}

const UPSERT_CHUNK = 200; // keeps each bound JSON parameter well under D1's 2 MB limit

/**
 * Stores the current API snapshot. New ids get first_seen_at = now; on the very first run they
 * are flagged as seeded so the existing backlog is never emailed. Returns the number of new jobs.
 */
export async function syncJobs(db: D1Database, jobs: ApiJob[], now: number): Promise<{ added: number; seeded: boolean }> {
  const before = await db.prepare("SELECT COUNT(*) AS n FROM jobs").first<{ n: number }>();
  const seeded = (before?.n ?? 0) === 0;
  const stmts: D1PreparedStatement[] = [db.prepare("UPDATE jobs SET active = 0")];
  for (let i = 0; i < jobs.length; i += UPSERT_CHUNK) {
    stmts.push(
      db
        .prepare(
          `INSERT INTO jobs (id, data, date_published, first_seen_at, seeded, active)
           SELECT value ->> '$.id', value, value ->> '$.datePublished', ?1, ?2, 1 FROM json_each(?3) WHERE true -- WHERE needed so SQLite doesn't parse ON CONFLICT as a join
           ON CONFLICT (id) DO UPDATE SET data = excluded.data, date_published = excluded.date_published, active = 1`,
        )
        .bind(now, seeded ? 1 : 0, JSON.stringify(jobs.slice(i, i + UPSERT_CHUNK))),
    );
  }
  await db.batch(stmts);
  const after = await db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE first_seen_at = ?").bind(now).first<{ n: number }>();
  return { added: after?.n ?? 0, seeded };
}

function rowToStored(r: { data: string; first_seen_at: number; seeded: number }): StoredJob {
  return { job: JSON.parse(r.data) as ApiJob, firstSeenAt: r.first_seen_at, seeded: r.seeded === 1 };
}

/** Active jobs, newest first. */
export async function activeJobs(db: D1Database): Promise<ApiJob[]> {
  const { results } = await db
    .prepare("SELECT data FROM jobs WHERE active = 1 ORDER BY date_published DESC, first_seen_at DESC")
    .all<{ data: string }>();
  return results.map((r) => JSON.parse(r.data) as ApiJob);
}

/** Non-seeded active jobs first seen after `since` — the candidates for digests. */
export async function newJobsSince(db: D1Database, since: number): Promise<StoredJob[]> {
  const { results } = await db
    .prepare(
      `SELECT data, first_seen_at, seeded FROM jobs
       WHERE active = 1 AND seeded = 0 AND first_seen_at > ? ORDER BY first_seen_at, date_published DESC`,
    )
    .bind(since)
    .all<{ data: string; first_seen_at: number; seeded: number }>();
  return results.map(rowToStored);
}

// --- subscribers & searches -------------------------------------------------

export function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Returns the existing subscriber for this email, or creates an unconfirmed one. */
export async function upsertSubscriber(db: D1Database, email: string, now: number): Promise<Subscriber> {
  await db
    .prepare("INSERT INTO subscribers (email, token, created_at) VALUES (?, ?, ?) ON CONFLICT (email) DO NOTHING")
    .bind(email, newToken(), now)
    .run();
  return (await db.prepare("SELECT * FROM subscribers WHERE email = ?").bind(email).first<Subscriber>())!;
}

export async function subscriberByToken(db: D1Database, token: string): Promise<Subscriber | null> {
  return db.prepare("SELECT * FROM subscribers WHERE token = ?").bind(token).first<Subscriber>();
}

export async function subscriberByEmail(db: D1Database, email: string): Promise<Subscriber | null> {
  return db.prepare("SELECT * FROM subscribers WHERE email = ?").bind(email).first<Subscriber>();
}

export async function markLinkSent(db: D1Database, id: number, now: number): Promise<void> {
  await db.prepare("UPDATE subscribers SET link_sent_at = ? WHERE id = ?").bind(now, id).run();
}

export async function confirmSubscriber(db: D1Database, id: number, now: number): Promise<void> {
  await db.prepare("UPDATE subscribers SET confirmed_at = COALESCE(confirmed_at, ?) WHERE id = ?").bind(now, id).run();
}

export async function deleteSubscriber(db: D1Database, id: number): Promise<void> {
  await db.batch([
    db.prepare("DELETE FROM sent WHERE subscriber_id = ?").bind(id),
    db.prepare("DELETE FROM shortlist WHERE subscriber_id = ?").bind(id),
    db.prepare("DELETE FROM searches WHERE subscriber_id = ?").bind(id),
    db.prepare("DELETE FROM subscribers WHERE id = ?").bind(id),
  ]);
}

type SearchRow = Omit<Search, "filters"> & { filters: string };

function rowToSearch(r: SearchRow): Search {
  let filters: unknown = {};
  try {
    filters = JSON.parse(r.filters);
  } catch {}
  return { ...r, filters: parseFilters(filters) };
}

export async function searchesFor(db: D1Database, subscriberId: number): Promise<Search[]> {
  const { results } = await db
    .prepare("SELECT * FROM searches WHERE subscriber_id = ? ORDER BY id")
    .bind(subscriberId)
    .all<SearchRow>();
  return results.map(rowToSearch);
}

export async function saveSearch(
  db: D1Database,
  subscriberId: number,
  searchId: number | null,
  name: string,
  filters: Filters,
  now: number,
): Promise<void> {
  if (searchId === null) {
    await db
      .prepare(
        "INSERT INTO searches (subscriber_id, name, filters, created_at, share_code) VALUES (?, ?, ?, ?, lower(hex(randomblob(8))))",
      )
      .bind(subscriberId, name, JSON.stringify(filters), now)
      .run();
  } else {
    await db
      .prepare("UPDATE searches SET name = ?, filters = ? WHERE id = ? AND subscriber_id = ?")
      .bind(name, JSON.stringify(filters), searchId, subscriberId)
      .run();
  }
}

export async function searchByShareCode(db: D1Database, code: string): Promise<Search | null> {
  const row = await db.prepare("SELECT * FROM searches WHERE share_code = ?").bind(code).first<SearchRow>();
  return row ? rowToSearch(row) : null;
}

export async function deleteSearch(db: D1Database, subscriberId: number, searchId: number): Promise<void> {
  await db.prepare("DELETE FROM searches WHERE id = ? AND subscriber_id = ?").bind(searchId, subscriberId).run();
}

/** Everything the daily run needs about recipients, in two queries. */
export async function loadRecipients(
  db: D1Database,
  since: number,
): Promise<{ subscriber: Subscriber; searches: Search[]; sentIds: Set<string> }[]> {
  const [subs, searches, sent] = await db.batch([
    db.prepare("SELECT * FROM subscribers WHERE confirmed_at IS NOT NULL ORDER BY id"),
    db.prepare(
      "SELECT s.* FROM searches s JOIN subscribers u ON u.id = s.subscriber_id WHERE u.confirmed_at IS NOT NULL ORDER BY s.id",
    ),
    db.prepare("SELECT subscriber_id, job_id FROM sent WHERE sent_at > ?").bind(since),
  ]);
  const bySub = new Map<number, { subscriber: Subscriber; searches: Search[]; sentIds: Set<string> }>();
  for (const s of subs.results as unknown as Subscriber[]) bySub.set(s.id, { subscriber: s, searches: [], sentIds: new Set() });
  for (const r of searches.results as unknown as SearchRow[]) bySub.get(r.subscriber_id)?.searches.push(rowToSearch(r));
  for (const r of sent.results as unknown as { subscriber_id: number; job_id: string }[]) {
    bySub.get(r.subscriber_id)?.sentIds.add(r.job_id);
  }
  return [...bySub.values()];
}

export function markSentStatement(db: D1Database, subscriberId: number, jobIds: string[], now: number): D1PreparedStatement {
  return db
    .prepare("INSERT OR IGNORE INTO sent (subscriber_id, job_id, sent_at) SELECT ?1, value, ?2 FROM json_each(?3)")
    .bind(subscriberId, now, JSON.stringify(jobIds));
}

// --- shortlist ---------------------------------------------------------------

export interface ShortlistEntry {
  job: ApiJob;
  active: boolean;
  savedAt: number;
}

export async function jobById(db: D1Database, id: string): Promise<{ job: ApiJob; active: boolean } | null> {
  const row = await db.prepare("SELECT data, active FROM jobs WHERE id = ?").bind(id).first<{ data: string; active: number }>();
  return row ? { job: JSON.parse(row.data) as ApiJob, active: row.active === 1 } : null;
}

export async function addToShortlist(db: D1Database, subscriberId: number, jobId: string, now: number): Promise<void> {
  await db
    .prepare("INSERT OR IGNORE INTO shortlist (subscriber_id, job_id, saved_at) VALUES (?, ?, ?)")
    .bind(subscriberId, jobId, now)
    .run();
}

export async function removeFromShortlist(db: D1Database, subscriberId: number, jobId: string): Promise<void> {
  await db.prepare("DELETE FROM shortlist WHERE subscriber_id = ? AND job_id = ?").bind(subscriberId, jobId).run();
}

export async function shortlistFor(db: D1Database, subscriberId: number): Promise<ShortlistEntry[]> {
  const { results } = await db
    .prepare(
      `SELECT j.data, j.active, s.saved_at FROM shortlist s JOIN jobs j ON j.id = s.job_id
       WHERE s.subscriber_id = ? ORDER BY s.saved_at DESC`,
    )
    .bind(subscriberId)
    .all<{ data: string; active: number; saved_at: number }>();
  return results.map((r) => ({ job: JSON.parse(r.data) as ApiJob, active: r.active === 1, savedAt: r.saved_at }));
}
