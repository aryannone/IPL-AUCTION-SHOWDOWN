# PARADOX '26 — Build status

Core implementation completed:
- React/Vite lightweight frontend
- Node/Express + Socket.IO real-time backend
- PostgreSQL persistence
- JWT/bcrypt authentication
- 208-player catalogue imported from the supplied PDF
- Server randomly selects exactly 5 players with cumulative points >100
- 3-minute strategy phase
- Random auction order
- Base-price first bid
- Bid increments: <=1Cr +5L; >1–2Cr +10L; >2–5Cr +15L; >5–10Cr +20L
- 10-second auction timer, reset on valid bid
- SOLD and UNSOLD handling
- No minimum team size
- Budget deductions
- Final scoring: won-player points + floor(remaining lakh / 10)
- Lightweight player cards with NO photos
- Real-time reconnect support and 2-minute disconnect/forfeit watchdog
- Server-side bid locking/transaction to handle simultaneous bids
- Admin player editor for points and reserve price
- Responsive mobile-first UI

Production hardening still recommended before public launch:
- Deploy PostgreSQL/server/client
- Set production secrets and CORS
- Add rate limiting/security headers
- Add automated integration tests
- Add durable recovery of active in-memory game timers after server restart
- Perform two-device race-condition tests and load tests
