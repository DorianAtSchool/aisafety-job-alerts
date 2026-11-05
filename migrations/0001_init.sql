-- Latest snapshot of every job ever seen. A job is "new" when its id is first inserted.
CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,              -- raw JSON from the API
  date_published TEXT,
  first_seen_at INTEGER NOT NULL,  -- unix ms
  seeded INTEGER NOT NULL DEFAULT 0, -- 1 = present at first run, never emailed
  active INTEGER NOT NULL DEFAULT 1  -- 0 = no longer listed by the API
);
CREATE INDEX jobs_first_seen ON jobs (first_seen_at);

CREATE TABLE subscribers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  token TEXT NOT NULL UNIQUE,      -- secret for manage/unsubscribe links
  created_at INTEGER NOT NULL,
  confirmed_at INTEGER             -- NULL until the confirmation link is clicked
);

CREATE TABLE searches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subscriber_id INTEGER NOT NULL REFERENCES subscribers (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  filters TEXT NOT NULL,           -- JSON, see src/match.ts
  created_at INTEGER NOT NULL
);

CREATE TABLE sent (
  subscriber_id INTEGER NOT NULL REFERENCES subscribers (id) ON DELETE CASCADE,
  job_id TEXT NOT NULL,
  sent_at INTEGER NOT NULL,
  PRIMARY KEY (subscriber_id, job_id)
);

-- Dry-run mailer target (MAIL_MODE=outbox).
CREATE TABLE outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  html TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
