-- Newsletter sign-ups from the "Email report (PDF)" box. Only addresses whose owner ticked the consent box are stored.
CREATE TABLE IF NOT EXISTS subscribers (
  email TEXT PRIMARY KEY,
  consent_text TEXT NOT NULL,    -- the exact wording the person agreed to
  source TEXT NOT NULL,          -- where they signed up, e.g. email-report
  consented_at TEXT NOT NULL,    -- ISO 8601, UTC
  unsubscribed_at TEXT           -- set when they unsubscribe; keep the row so they are not mailed again
);
