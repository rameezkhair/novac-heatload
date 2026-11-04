-- User accounts for the Pro tools. People log in with a 6-digit code emailed to them; there are no passwords.
-- Pro is granted by the admin (/admin → Users); a new account starts without it.
CREATE TABLE IF NOT EXISTS users (
  email TEXT PRIMARY KEY,         -- lower-cased
  created_at TEXT NOT NULL,       -- ISO 8601, UTC: first successful login
  last_login_at TEXT NOT NULL,
  logins INTEGER NOT NULL DEFAULT 1,
  pro INTEGER NOT NULL DEFAULT 0, -- 1 when the admin has granted Pro
  pro_since TEXT,
  blocked INTEGER NOT NULL DEFAULT 0
);

-- The login code waiting for each address: only its hash is kept, it expires after 10 minutes and allows 5 tries.
CREATE TABLE IF NOT EXISTS login_codes (
  email TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,    -- ms since epoch
  sent_at INTEGER NOT NULL,       -- ms since epoch, to space out resends
  tries INTEGER NOT NULL DEFAULT 0
);
