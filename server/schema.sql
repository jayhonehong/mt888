-- GoldBean Arena :: schema
-- Everything in this database is fictional. "Beans" are a play-money token with
-- no monetary value, no cash-out path, and no connection to any payment provider.

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT    NOT NULL UNIQUE,
  username      TEXT    NOT NULL UNIQUE,
  password_hash TEXT    NOT NULL,
  role          TEXT    NOT NULL DEFAULT 'player' CHECK (role IN ('player','admin')),
  status        TEXT    NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  avatar_hue    INTEGER NOT NULL DEFAULT 40,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  last_login_at TEXT
);

-- ---------------------------------------------------------------------------
-- Social graph and friend requests
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS friendships (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  requester_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  addressee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined')),
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  responded_at TEXT,
  CHECK (requester_id <> addressee_id),
  UNIQUE (requester_id, addressee_id)
);
CREATE INDEX IF NOT EXISTS idx_friendships_addressee ON friendships(addressee_id, status);
CREATE INDEX IF NOT EXISTS idx_friendships_requester ON friendships(requester_id, status);

-- ---------------------------------------------------------------------------
-- Reward redemption attempts (play-money catalogue; never a cash-out)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reward_redemptions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  reward_key TEXT NOT NULL,
  rm_amount  INTEGER NOT NULL,
  bean_cost  INTEGER NOT NULL,
  status     TEXT NOT NULL DEFAULT 'unavailable' CHECK (status IN ('unavailable')),
  message    TEXT NOT NULL DEFAULT 'Product unavailable',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_reward_redemptions_user ON reward_redemptions(user_id);

-- ---------------------------------------------------------------------------
-- Double-entry ledger
--
-- Every movement of beans is a journal containing entries whose debits equal
-- its credits. A user's spendable balance is never stored as a mutable column:
-- it is always derived from the entries of that user's wallet account, which
-- makes the balance impossible to desync from its transaction history.
--
-- Account sign convention
--   user wallet   : balance = SUM(credit) - SUM(debit)
--   house issuance: beans created out of thin air (debit increases)
--   house escrow  : beans locked in open bets   (debit increases)
--   house rake    : beans kept from losing bets (credit increases)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS accounts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  code       TEXT    NOT NULL UNIQUE,
  owner_type TEXT    NOT NULL CHECK (owner_type IN ('user','house')),
  user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT    NOT NULL CHECK (kind IN ('wallet','issuance','escrow','rake')),
  label      TEXT    NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(user_id);

CREATE TABLE IF NOT EXISTS journals (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ref_type   TEXT    NOT NULL,
  ref_id     TEXT,
  memo       TEXT    NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_journals_ref ON journals(ref_type, ref_id);

CREATE TABLE IF NOT EXISTS entries (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  journal_id INTEGER NOT NULL REFERENCES journals(id) ON DELETE CASCADE,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  debit      INTEGER NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit     INTEGER NOT NULL DEFAULT 0 CHECK (credit >= 0),
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_entries_account ON entries(account_id, id);
CREATE INDEX IF NOT EXISTS idx_entries_journal ON entries(journal_id);

-- ---------------------------------------------------------------------------
-- Catalogue
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sports (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  key   TEXT    NOT NULL UNIQUE,
  name  TEXT    NOT NULL,
  glyph TEXT    NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  sport_id    INTEGER NOT NULL REFERENCES sports(id),
  league      TEXT    NOT NULL,
  home_name   TEXT    NOT NULL,
  home_abbr   TEXT    NOT NULL,
  home_color  TEXT    NOT NULL DEFAULT '#FFC53D',
  away_name   TEXT    NOT NULL,
  away_abbr   TEXT    NOT NULL,
  away_color  TEXT    NOT NULL DEFAULT '#4EA8FF',
  status      TEXT    NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming','live','finished')),
  period      TEXT    NOT NULL DEFAULT 'Pre-match',
  clock       INTEGER NOT NULL DEFAULT 0,
  home_score  INTEGER NOT NULL DEFAULT 0,
  away_score  INTEGER NOT NULL DEFAULT 0,
  starts_at   TEXT    NOT NULL,
  live_started_at TEXT,
  featured    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);

CREATE TABLE IF NOT EXISTS markets (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  key      TEXT    NOT NULL,
  name     TEXT    NOT NULL,
  line     REAL,
  sort     INTEGER NOT NULL DEFAULT 0,
  UNIQUE (event_id, key)
);

CREATE TABLE IF NOT EXISTS selections (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  market_id    INTEGER NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  key          TEXT    NOT NULL,
  name         TEXT    NOT NULL,
  odds         REAL    NOT NULL,
  opening_odds REAL    NOT NULL,
  result       TEXT    NOT NULL DEFAULT 'pending' CHECK (result IN ('pending','won','lost','void')),
  sort         INTEGER NOT NULL DEFAULT 0,
  UNIQUE (market_id, key)
);

CREATE TABLE IF NOT EXISTS price_ticks (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  selection_id INTEGER NOT NULL REFERENCES selections(id) ON DELETE CASCADE,
  odds         REAL    NOT NULL,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ticks_selection ON price_ticks(selection_id, id);

-- ---------------------------------------------------------------------------
-- Wagering
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bets (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  ref              TEXT    NOT NULL UNIQUE,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stake            INTEGER NOT NULL CHECK (stake > 0),
  combined_odds    REAL    NOT NULL,
  potential_payout INTEGER NOT NULL,
  payout           INTEGER NOT NULL DEFAULT 0,
  status           TEXT    NOT NULL DEFAULT 'open' CHECK (status IN ('open','won','lost','void')),
  placed_at        TEXT    NOT NULL DEFAULT (datetime('now')),
  settled_at       TEXT
);
CREATE INDEX IF NOT EXISTS idx_bets_user ON bets(user_id, id);

CREATE TABLE IF NOT EXISTS bet_legs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  bet_id       INTEGER NOT NULL REFERENCES bets(id) ON DELETE CASCADE,
  event_id     INTEGER NOT NULL REFERENCES events(id),
  market_id    INTEGER NOT NULL REFERENCES markets(id),
  selection_id INTEGER NOT NULL REFERENCES selections(id),
  market_name  TEXT    NOT NULL,
  selection_name TEXT    NOT NULL,
  event_label  TEXT    NOT NULL,
  odds         REAL    NOT NULL,
  result       TEXT    NOT NULL DEFAULT 'pending' CHECK (result IN ('pending','won','lost','void'))
);
CREATE INDEX IF NOT EXISTS idx_legs_bet ON bet_legs(bet_id);
CREATE INDEX IF NOT EXISTS idx_legs_event ON bet_legs(event_id);

-- ---------------------------------------------------------------------------
-- Play-money casino rounds (Aviator, blackjack and poker)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS casino_rounds (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  ref              TEXT NOT NULL UNIQUE,
  game             TEXT NOT NULL CHECK (game IN ('aviator','blackjack','poker')),
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stake            INTEGER NOT NULL CHECK (stake > 0),
  payout           INTEGER NOT NULL DEFAULT 0,
  status           TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','won','lost','void')),
  result           TEXT,
  detail           TEXT,
  crash_multiplier REAL,
  cashout_multiplier REAL,
  auto_cashout     REAL,
  started_at       TEXT NOT NULL DEFAULT (datetime('now')),
  crash_at        TEXT,
  settled_at       TEXT
);
CREATE INDEX IF NOT EXISTS idx_casino_user ON casino_rounds(user_id, id);
CREATE INDEX IF NOT EXISTS idx_casino_open ON casino_rounds(status, game);
