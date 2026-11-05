-- Jobs a subscriber saved from an email ("shortlist").
CREATE TABLE shortlist (
  subscriber_id INTEGER NOT NULL REFERENCES subscribers (id) ON DELETE CASCADE,
  job_id TEXT NOT NULL,
  saved_at INTEGER NOT NULL,
  PRIMARY KEY (subscriber_id, job_id)
);

-- Public, unguessable id for "subscribe to my search" links.
ALTER TABLE searches ADD COLUMN share_code TEXT;
UPDATE searches SET share_code = lower(hex(randomblob(8)));
CREATE UNIQUE INDEX searches_share_code ON searches (share_code);
