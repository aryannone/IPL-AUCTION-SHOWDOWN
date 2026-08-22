-- PARADOX '26 — IPL BID WAR
-- PostgreSQL schema. All money values are INTEGER LAKH (never floating point).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ========================= USERS =========================
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name  TEXT NOT NULL,
  session_token TEXT UNIQUE NOT NULL,
  is_admin      BOOLEAN NOT NULL DEFAULT FALSE,
  admin_password_hash TEXT,             -- only set for admin users
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ========================= PLAYERS (catalogue) =========================
CREATE TABLE IF NOT EXISTS players (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sr_no               INTEGER UNIQUE NOT NULL,
  set_no              INTEGER NOT NULL,
  set_name            TEXT NOT NULL,
  first_name          TEXT NOT NULL,
  surname             TEXT NOT NULL,
  full_name           TEXT NOT NULL,
  country             TEXT NOT NULL,
  specialism          TEXT NOT NULL CHECK (specialism IN ('BATTER','BOWLER','ALL-ROUNDER','WICKETKEEPER')),
  status              TEXT NOT NULL CHECK (status IN ('Capped','Uncapped')),
  reserve_price_lakh  INTEGER NOT NULL CHECK (reserve_price_lakh > 0),
  points              INTEGER NOT NULL CHECK (points > 0),
  image_url           TEXT,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_players_active ON players(is_active);

-- ========================= GAMES =========================
CREATE TABLE IF NOT EXISTS games (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code         TEXT UNIQUE NOT NULL,
  status            TEXT NOT NULL DEFAULT 'LOBBY'
                     CHECK (status IN ('LOBBY','STRATEGY','AUCTION','FINISHED','ABANDONED')),
  pool_snapshot     JSONB,              -- 5 locked player snapshots
  auction_order     JSONB,              -- ordered array of player_ids for this game
  strategy_ends_at  TIMESTAMPTZ,
  current_round     INTEGER NOT NULL DEFAULT 0,
  current_player_id UUID,
  current_bid_lakh  INTEGER,
  current_bidder_user_id UUID,
  auction_ends_at   TIMESTAMPTZ,
  created_by        UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at        TIMESTAMPTZ,
  finished_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_games_room_code ON games(room_code);

-- ========================= GAME PARTICIPANTS =========================
CREATE TABLE IF NOT EXISTS game_participants (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id      UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id),
  slot         INTEGER NOT NULL CHECK (slot IN (1,2)),
  budget_lakh  INTEGER NOT NULL DEFAULT 1000 CHECK (budget_lakh >= 0),
  ready        BOOLEAN NOT NULL DEFAULT FALSE,
  connected    BOOLEAN NOT NULL DEFAULT TRUE,
  joined_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(game_id, slot),
  UNIQUE(game_id, user_id)
);

-- ========================= GAME PLAYERS (purchases) =========================
CREATE TABLE IF NOT EXISTS game_players (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id                     UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id                     UUID REFERENCES users(id),         -- NULL until sold
  player_id                   UUID NOT NULL REFERENCES players(id),
  player_name_snapshot        TEXT NOT NULL,
  points_snapshot             INTEGER NOT NULL,
  reserve_price_snapshot_lakh INTEGER NOT NULL,
  purchase_price_lakh         INTEGER,
  purchased_at                TIMESTAMPTZ,
  UNIQUE(game_id, player_id)
);

-- ========================= AUCTION EVENTS (bid log) =========================
CREATE TABLE IF NOT EXISTS auction_events (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id        UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id      UUID REFERENCES players(id),
  user_id        UUID REFERENCES users(id),
  event_type     TEXT NOT NULL, -- BID_PLACED | BID_REJECTED | PLAYER_SOLD | ROUND_STARTED | STRATEGY_STARTED etc.
  bid_amount_lakh INTEGER,
  meta           JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auction_events_game ON auction_events(game_id, created_at);

-- ========================= GAME RESULTS =========================
CREATE TABLE IF NOT EXISTS game_results (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id             UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id             UUID NOT NULL REFERENCES users(id),
  player_points       INTEGER NOT NULL,
  remaining_budget_lakh INTEGER NOT NULL,
  budget_bonus        NUMERIC NOT NULL,
  final_score         NUMERIC NOT NULL,
  rank                INTEGER NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(game_id, user_id)
);
