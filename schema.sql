CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS players (
  id SERIAL PRIMARY KEY,
  sr_no INT UNIQUE NOT NULL,
  set_no INT NOT NULL,
  set_name TEXT NOT NULL,
  first_name TEXT NOT NULL,
  surname TEXT NOT NULL,
  full_name TEXT NOT NULL,
  country TEXT NOT NULL,
  specialism TEXT NOT NULL,
  status TEXT NOT NULL,
  reserve_price_lakh INT NOT NULL,
  points INT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'LOBBY',
  strategy_ends_at TIMESTAMPTZ,
  auction_ends_at TIMESTAMPTZ,
  current_index INT NOT NULL DEFAULT 0,
  current_player_id INT,
  current_bid_lakh INT,
  current_bidder_id UUID,
  auction_order INT[] NOT NULL DEFAULT '{}',
  pool_player_ids INT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS game_participants (
  game_id UUID REFERENCES games(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  slot INT NOT NULL CHECK (slot IN (1,2)),
  ready BOOLEAN NOT NULL DEFAULT FALSE,
  budget_lakh INT NOT NULL DEFAULT 1000,
  connected BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (game_id,user_id),
  UNIQUE (game_id,slot)
);

CREATE TABLE IF NOT EXISTS game_players (
  id SERIAL PRIMARY KEY,
  game_id UUID REFERENCES games(id) ON DELETE CASCADE,
  player_id INT REFERENCES players(id),
  winner_user_id UUID REFERENCES users(id),
  points_snapshot INT NOT NULL,
  reserve_price_snapshot_lakh INT NOT NULL,
  purchase_price_lakh INT,
  result TEXT NOT NULL DEFAULT 'PENDING',
  UNIQUE(game_id,player_id)
);

CREATE TABLE IF NOT EXISTS auction_events (
  id BIGSERIAL PRIMARY KEY,
  game_id UUID REFERENCES games(id) ON DELETE CASCADE,
  player_id INT,
  user_id UUID,
  event_type TEXT NOT NULL,
  bid_amount_lakh INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_games_room ON games(room_code);
CREATE INDEX IF NOT EXISTS idx_events_game ON auction_events(game_id);
