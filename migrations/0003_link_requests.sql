-- Throttles "email me my link" requests so the form can't flood someone's inbox.
ALTER TABLE subscribers ADD COLUMN link_sent_at INTEGER;
