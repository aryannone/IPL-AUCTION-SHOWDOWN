# IPL AUCTION SHOWDOWN — IPL BID WAR

A real-time, server-authoritative 1v1 IPL-style auction game.

Two real users, on two different devices/networks, join a room, get a shared
random 5-player pool (validated so combined points > 100), study it for a
server-timed 3 minutes, then bid against each other in real time on each of
the 5 players (10-second per-round timer, resets on every valid bid). Final
score = total player points + (remaining budget in lakh ÷ 10).

---

## 1. Architecture

```
frontend/   React + Vite + Tailwind + Framer Motion  (client only — displays server state)
backend/    Node.js + Express + Socket.IO            (single source of truth)
            PostgreSQL (Supabase or any managed Postgres)
```

The **backend is authoritative** for everything that matters: budgets, bids,
timers, player ownership, and final scores. The frontend never computes a
winner or a score — it only renders whatever the server sends. All bids are
serialized per-game through an in-process async lock (`GameManager.withLock`)
so two simultaneous bid requests can never both "win" — the server processes
them one at a time and the second one is validated against the state the
first one produced.

Active game state lives in server memory for speed, but every meaningful
transition (ready-up, pool generation, each bid, each sale, game finish,
abandonment) is written to PostgreSQL immediately. If the Node process
restarts, `GameManager.recoverActiveGames()` reloads every in-flight game
from the database and re-arms its timers from the remaining time, so no
active match state lives only in one process's memory or one browser tab.

## 2. Design decision not fully specified in the brief: unsold players

The brief describes a 5-player pool auctioned one by one with "highest valid
bidder wins," but does not specify what happens if a 10-second round expires
with **zero bids placed**. This build's rule, confirmed with the product
owner: **if nobody bids at all, the player goes UNSOLD.** Nobody receives
that player, nobody receives its points, and it is not deducted from anyone's
budget. It appears in the auction history as "UNSOLD." This also means the
two team sizes are not guaranteed to be 5-and-5 — they can be uneven (e.g.
3–2, or 4–1 if a player goes unsold) — see `_endRound()` in
`backend/src/game/engine.js`.

## 3. Official player catalogue

`backend/src/db/players.json` is a verbatim transcription of all 208 rows
from the supplied PDF (`sr_no, set_no, set_name, first_name, surname,
country, specialism, status, reserve_price_lakh, points`). Nothing was
invented, re-rated, or fetched from the internet. `backend/src/db/seed.js`
validates the row count (must be exactly 208) and every field's shape before
importing, and fails loudly with the exact bad row if anything is malformed.
Re-running the seed script is idempotent (upserts by `sr_no`), so it's safe
to re-run after editing `players.json`.

All money is stored and computed as **integer lakh** — never floating point
— per `backend/src/utils/money.js` and `backend/src/utils/increment.js`.

## 4. Local development

### Prerequisites
- Node.js 18+
- A PostgreSQL database (local, or a free Supabase project — recommended
  since the brief asks for a managed/cloud Postgres)

### Backend

```bash
cd backend
cp .env.example .env
# edit .env: set DATABASE_URL to your Postgres connection string,
# set ADMIN_PASSWORD to a secret of your choice

npm install
npm run migrate   # applies schema.sql — creates all tables
npm run seed       # imports the 208 official players
npm run dev         # starts the API + Socket.IO server on :4000
```

### Frontend

```bash
cd frontend
npm install
# optionally create .env with:
#   VITE_API_URL=http://localhost:4000
#   VITE_SOCKET_URL=http://localhost:4000
npm run dev   # starts Vite dev server on :5173
```

Open two different browsers (or one normal + one incognito window, or two
devices on the same network pointed at your machine's LAN IP) at
`http://localhost:5173`, create a room in one, join with the code in the
other, and play.

### Becoming an admin

Register a name on the home page (or on `/admin`), then go to `/admin`,
enter the same `ADMIN_PASSWORD` you set in `backend/.env`, and your existing
session is promoted to admin server-side. From `/admin/dashboard` you can
search, edit, add, and deactivate players — every change is written straight
to PostgreSQL (`PATCH /api/admin/players/:id` etc.), never to browser
storage. Refresh, or open the dashboard on a different device, and the
change is still there because it was written to the cloud database.

## 5. Production deployment

### 5.1 Database — Supabase (or any managed Postgres)
1. Create a new Supabase project (or any Postgres 14+ instance).
2. Copy the connection string (use the "connection pooling" URI if
   Supabase offers one, for serverless-friendly connection limits).
3. Set it as `DATABASE_URL` in the backend's environment.

### 5.2 Backend — Render / Railway / Fly.io / any Node host
1. Deploy the `backend/` directory as a Node web service.
   - Build command: `npm install`
   - Start command: `npm start`
   - Health check path: `/health`
2. Set environment variables (see `.env.example`):
   - `DATABASE_URL` — your Postgres connection string
   - `DATABASE_SSL=true` (most managed Postgres providers require SSL)
   - `FRONTEND_URL` — the deployed frontend's exact origin (for CORS + the
     Socket.IO CORS check) — do **not** leave this as `*` in production
   - `ADMIN_PASSWORD` — a strong secret
   - `PORT` — usually provided automatically by the host
3. After first deploy, run the one-off migration + seed commands against
   the deployed database (most hosts let you run a one-off shell/job):
   ```bash
   npm run migrate
   npm run seed
   ```
4. Confirm the WebSocket upgrade path is reachable — Socket.IO needs the
   platform to support persistent WebSocket connections (Render, Railway,
   and Fly.io all do; some serverless-only platforms do not).

### 5.3 Frontend — Vercel / Netlify / any static host
1. Deploy the `frontend/` directory.
   - Build command: `npm run build`
   - Output directory: `dist`
2. Set environment variables:
   - `VITE_API_URL` — your deployed backend's public URL
   - `VITE_SOCKET_URL` — same URL (Socket.IO shares the HTTP server here)

### 5.4 CORS / WebSocket configuration
The backend's `FRONTEND_URL` env var drives both the Express CORS policy
(`app.js`) and the Socket.IO CORS policy (`server.js`). Set it to the exact
deployed frontend origin, e.g. `https://paradox26.vercel.app` — no trailing
slash.

## 6. Real-time event reference

Client → server (Socket.IO, all acknowledged with a callback):
`JOIN_GAME_ROOM`, `PLAYER_READY`, `PLACE_BID`, `SYNC_STATE`, `FORFEIT`

Server → clients (broadcast to the room `game:<id>`):
`GAME_STATE_SYNC`, `GAME_STARTED`, `AUCTION_STARTED`, `PLAYER_DRAWN`,
`BID_UPDATED`, `PLAYER_SOLD`, `PLAYER_UNSOLD`, `GAME_FINISHED`,
`GAME_ABANDONED`, `PLAYER_CONNECTED`, `PLAYER_DISCONNECTED`, `PLAYER_READY`

REST (`/api/...`) covers registration, admin login, room creation/joining,
the player catalogue, admin CRUD, and a REST fallback for game state so a
hard page refresh always has something to render immediately while the
socket reconnects.

## 7. Anti-cheat / server-authoritative guarantees

Enforced only in `backend/src/game/engine.js` (never trust the client):
- Bid must be exactly the next valid increment from the current bid (or
  exactly the reserve price if it's the first bid of the round) —
  `backend/src/utils/increment.js`.
- Bid must arrive before `auctionEndsAt` (server clock).
- Bidder must belong to the game, have enough remaining budget, and own
  fewer than 5 players.
- All state transitions (ready → pool generation → strategy timer → auction
  rounds → sale/unsold → next round → finish) happen only inside the
  server's `GameManager`, serialized per-game so concurrent bids can't race.
- Final score and winner are computed once, server-side, in `_finishGame()`
  and persisted to `game_results` — the frontend only displays them.
- Admin routes require `requireAuth()` + `requireAdmin()` server-side
  middleware; there is no client-side-only gate.
- An active game's player pool is **snapshotted** into `game_players` the
  moment it's generated. Later admin edits to the `players` table update
  future games only — an in-progress match keeps using its locked snapshot.

## 8. Manual test checklist (matches the brief's Section 64)

1. Two different browsers join the same room via room code. ✅ (Socket.IO
   room `game:<id>`, REST fallback on refresh)
2. Two different devices on different networks join the same room. ✅
   (nothing in the stack is same-origin/same-device dependent)
3. Both players ready → both receive the identical 5-player pool. ✅
   (`GAME_STARTED` broadcast to the room)
4. Pool's combined points are always > 100. ✅ (`_generateValidPool` loop)
5. 3-minute strategy timer is identical for both — it's a server timestamp
   (`strategyEndsAt`), the client only renders a countdown to it.
6. A bid from Player A appears on Player B's screen without a refresh, and
   vice versa. ✅ (`BID_UPDATED` broadcast)
7. Bid timer resets to 10s on every valid bid. ✅
8. A bid with insufficient budget is rejected server-side with
   `INSUFFICIENT_BUDGET`, regardless of what the client UI shows.
9. Round timeout with no bids → player goes UNSOLD, no one scores it.
10. Winning bid is deducted from the winner's budget and the player is added
    to their team, broadcast to both clients.
11. Final score = player points + remaining_budget_lakh / 10, computed once
    server-side.
12. Refreshing the browser mid-game restores the exact game via the REST
    fallback + `JOIN_GAME_ROOM` socket re-join.
13. Killing and restarting the backend process mid-game restores all active
    games from PostgreSQL (`recoverActiveGames`) with correct remaining
    timer durations.
14. Admin changes a player's points in the dashboard → refresh admin panel,
    open a second device → value persists (it's in PostgreSQL, not
    localStorage). A new game created afterward uses the new value; a game
    already in progress keeps its original locked snapshot.
15. A non-admin user cannot reach `/api/admin/*` — `requireAdmin()` returns
    403 regardless of frontend routing.

## 9. What's intentionally out of scope for this MVP

Per the brief's Section 59 (future extensibility, not to be over-built now):
4/8-player auctions, tournaments, global leaderboards, spectators, custom
budgets/scoring, friends. The schema and engine are structured so these can
be added later without a rewrite (e.g. `budget_lakh` and pool size aren't
hardcoded to `1000`/`5` everywhere — see `STARTING_BUDGET_LAKH` and the pool
generation loop).
