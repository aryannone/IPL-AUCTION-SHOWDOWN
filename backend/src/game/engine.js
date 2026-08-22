const { pool: db } = require('../db/pool');
const { generateRoomCode } = require('./roomCode');
const { STARTING_BUDGET_LAKH } = require('../utils/money');
const { nextValidBid } = require('../utils/increment');
const { computeScore, decideWinner } = require('./scoring');

const STRATEGY_DURATION_MS = 3 * 60 * 1000;
const AUCTION_ROUND_DURATION_MS = 10 * 1000;
const MIN_POOL_POINTS = 100; // strictly greater than this

/**
 * In-memory authoritative state for ACTIVE games, backed by PostgreSQL persistence
 * on every meaningful transition (so a server restart can recover). Bids are
 * serialized per-game via a tiny async lock to prevent race conditions.
 */
class GameManager {
  constructor(io) {
    this.io = io;
    this.games = new Map();      // gameId -> state
    this.roomIndex = new Map();  // roomCode -> gameId
    this.timers = new Map();     // gameId -> Timeout handle
    this.locks = new Map();      // gameId -> Promise chain tail
  }

  // ---------- concurrency ----------
  async withLock(gameId, fn) {
    const prev = this.locks.get(gameId) || Promise.resolve();
    let release;
    const next = new Promise((res) => { release = res; });
    this.locks.set(gameId, prev.then(() => next));
    await prev;
    try {
      return await fn();
    } finally {
      release();
    }
  }

  clearTimer(gameId) {
    const t = this.timers.get(gameId);
    if (t) clearTimeout(t);
    this.timers.delete(gameId);
  }

  // ---------- room lifecycle ----------
  async createRoom(user) {
    const roomCode = await this._uniqueRoomCode();
    const { rows } = await db.query(
      `INSERT INTO games (room_code, status, created_by) VALUES ($1,'LOBBY',$2) RETURNING id`,
      [roomCode, user.id]
    );
    const gameId = rows[0].id;
    await db.query(
      `INSERT INTO game_participants (game_id, user_id, slot, budget_lakh) VALUES ($1,$2,1,$3)`,
      [gameId, user.id, STARTING_BUDGET_LAKH]
    );

    const state = this._freshState(gameId, roomCode);
    state.participants[1] = this._freshParticipant(user);
    this.games.set(gameId, state);
    this.roomIndex.set(roomCode, gameId);
    return state;
  }

  async _uniqueRoomCode() {
    for (let i = 0; i < 20; i++) {
      const code = generateRoomCode();
      const { rows } = await db.query('SELECT 1 FROM games WHERE room_code=$1', [code]);
      if (rows.length === 0) return code;
    }
    throw new Error('Could not generate a unique room code, try again.');
  }

  _freshParticipant(user) {
    return {
      userId: user.id,
      name: user.display_name,
      budgetLakh: STARTING_BUDGET_LAKH,
      ready: false,
      connected: true,
      team: [], // { playerId, name, points, purchasePriceLakh }
    };
  }

  _freshState(gameId, roomCode) {
    return {
      gameId,
      roomCode,
      status: 'LOBBY',
      participants: { 1: null, 2: null },
      pool: [],
      auctionOrder: [],
      currentRound: 0, // 1-indexed once auction starts
      currentPlayerId: null,
      currentBidLakh: null,
      currentBidderUserId: null,
      strategyEndsAt: null,
      auctionEndsAt: null,
      soldLog: [],
      winnerUserId: undefined,
      results: null,
    };
  }

  async joinRoom(roomCode, user) {
    const gameId = this.roomIndex.get(roomCode);
    if (!gameId) throw new AppError('ROOM_NOT_FOUND', 'Room not found.');
    const state = this.games.get(gameId);
    if (!state) throw new AppError('ROOM_NOT_FOUND', 'Room not found.');

    // already in room (e.g. reconnect/rejoin)
    const existingSlot = state.participants[1]?.userId === user.id ? 1
      : state.participants[2]?.userId === user.id ? 2 : null;
    if (existingSlot) {
      state.participants[existingSlot].connected = true;
      await db.query('UPDATE game_participants SET connected=TRUE WHERE game_id=$1 AND user_id=$2', [gameId, user.id]);
      return state;
    }

    if (state.status !== 'LOBBY') throw new AppError('GAME_ALREADY_STARTED', 'Game already started.');
    if (state.participants[1] && state.participants[2]) throw new AppError('ROOM_FULL', 'Room full.');

    const slot = state.participants[1] ? 2 : 1;
    await db.query(
      `INSERT INTO game_participants (game_id, user_id, slot, budget_lakh) VALUES ($1,$2,$3,$4)`,
      [gameId, user.id, slot, STARTING_BUDGET_LAKH]
    );
    state.participants[slot] = this._freshParticipant(user);
    return state;
  }

  getStateByRoomCode(roomCode) {
    const gameId = this.roomIndex.get(roomCode);
    return gameId ? this.games.get(gameId) : null;
  }

  getState(gameId) {
    return this.games.get(gameId) || null;
  }

  slotOf(state, userId) {
    if (state.participants[1]?.userId === userId) return 1;
    if (state.participants[2]?.userId === userId) return 2;
    return null;
  }

  async setConnected(gameId, userId, connected) {
    const state = this.games.get(gameId);
    if (!state) return null;
    const slot = this.slotOf(state, userId);
    if (!slot) return null;
    state.participants[slot].connected = connected;
    await db.query('UPDATE game_participants SET connected=$1 WHERE game_id=$2 AND user_id=$3', [connected, gameId, userId]);
    return state;
  }

  // ---------- ready / pool generation ----------
  async setReady(gameId, userId) {
    return this.withLock(gameId, async () => {
      const state = this.games.get(gameId);
      if (!state) throw new AppError('ROOM_NOT_FOUND', 'Room not found.');
      if (state.status !== 'LOBBY') throw new AppError('GAME_ALREADY_STARTED', 'Game already started.');
      const slot = this.slotOf(state, userId);
      if (!slot) throw new AppError('NOT_ELIGIBLE', 'You are not part of this game.');
      state.participants[slot].ready = true;
      await db.query('UPDATE game_participants SET ready=TRUE WHERE game_id=$1 AND user_id=$2', [gameId, userId]);

      if (state.participants[1]?.ready && state.participants[2]?.ready) {
        await this._beginStrategyPhase(state);
      }
      return state;
    });
  }

  async _generateValidPool() {
    // Server-side random selection from the full active catalogue.
    for (let attempt = 0; attempt < 500; attempt++) {
      const { rows } = await db.query(
        `SELECT id, sr_no, first_name, surname, full_name, country, specialism, status,
                reserve_price_lakh, points, image_url
         FROM players WHERE is_active = TRUE
         ORDER BY random() LIMIT 5`
      );
      if (rows.length < 5) throw new Error('Not enough active players in catalogue.');
      const total = rows.reduce((s, r) => s + r.points, 0);
      if (total > MIN_POOL_POINTS) return rows;
    }
    throw new Error('Could not generate a valid pool after many attempts.');
  }

  async _beginStrategyPhase(state) {
    const players = await this._generateValidPool();
    const snapshot = players.map((p) => ({
      playerId: p.id,
      srNo: p.sr_no,
      name: p.full_name,
      country: p.country,
      specialism: p.specialism,
      status: p.status,
      reservePriceLakh: p.reserve_price_lakh,
      points: p.points,
      imageUrl: p.image_url,
    }));

    // Lock snapshots into game_players (unsold, no owner yet)
    for (const p of snapshot) {
      await db.query(
        `INSERT INTO game_players (game_id, player_id, player_name_snapshot, points_snapshot, reserve_price_snapshot_lakh)
         VALUES ($1,$2,$3,$4,$5) ON CONFLICT (game_id, player_id) DO NOTHING`,
        [state.gameId, p.playerId, p.name, p.points, p.reservePriceLakh]
      );
    }

    // Randomize auction order (Fisher-Yates using crypto-adequate Math.random for this scope)
    const order = [...snapshot];
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }

    state.pool = snapshot;
    state.auctionOrder = order.map((p) => p.playerId);
    state.status = 'STRATEGY';
    state.strategyEndsAt = Date.now() + STRATEGY_DURATION_MS;
    state.startedAt = Date.now();

    await db.query(
      `UPDATE games SET status='STRATEGY', pool_snapshot=$1, auction_order=$2,
        strategy_ends_at=to_timestamp($3/1000.0), started_at=now() WHERE id=$4`,
      [JSON.stringify(state.pool), JSON.stringify(state.auctionOrder), state.strategyEndsAt, state.gameId]
    );
    await this._logEvent(state.gameId, null, null, 'STRATEGY_STARTED', null, { pool: state.pool });

    this._broadcast(state, 'GAME_STARTED', this._publicState(state));

    this.clearTimer(state.gameId);
    const handle = setTimeout(() => this._endStrategyPhase(state.gameId).catch(this._logErr), STRATEGY_DURATION_MS);
    this.timers.set(state.gameId, handle);
  }

  async _endStrategyPhase(gameId) {
    return this.withLock(gameId, async () => {
      const state = this.games.get(gameId);
      if (!state || state.status !== 'STRATEGY') return;
      state.status = 'AUCTION';
      state.currentRound = 0;
      await db.query(`UPDATE games SET status='AUCTION' WHERE id=$1`, [gameId]);
      await this._logEvent(gameId, null, null, 'STRATEGY_ENDED', null, null);
      this._broadcast(state, 'AUCTION_STARTED', this._publicState(state));
      await this._startNextRound(state);
    });
  }

  // ---------- auction rounds ----------
  async _startNextRound(state) {
    state.currentRound += 1;
    if (state.currentRound > state.auctionOrder.length) {
      return this._finishGame(state);
    }
    const playerId = state.auctionOrder[state.currentRound - 1];
    const playerInfo = state.pool.find((p) => p.playerId === playerId);

    state.currentPlayerId = playerId;
    state.currentBidLakh = playerInfo.reservePriceLakh;
    state.currentBidderUserId = null;
    state.auctionEndsAt = Date.now() + AUCTION_ROUND_DURATION_MS;

    await db.query(
      `UPDATE games SET current_round=$1, current_player_id=$2, current_bid_lakh=$3,
        current_bidder_user_id=NULL, auction_ends_at=to_timestamp($4/1000.0) WHERE id=$5`,
      [state.currentRound, playerId, state.currentBidLakh, state.auctionEndsAt, state.gameId]
    );
    await this._logEvent(state.gameId, playerId, null, 'PLAYER_DRAWN', null, { round: state.currentRound });

    this._broadcast(state, 'PLAYER_DRAWN', {
      round: state.currentRound,
      totalRounds: state.auctionOrder.length,
      player: playerInfo,
      currentBidLakh: state.currentBidLakh,
      auctionEndsAt: state.auctionEndsAt,
    });

    this.clearTimer(state.gameId);
    const handle = setTimeout(() => this._endRound(state.gameId).catch(this._logErr), AUCTION_ROUND_DURATION_MS);
    this.timers.set(state.gameId, handle);
  }

  async placeBid(gameId, userId, bidLakh) {
    return this.withLock(gameId, async () => {
      const state = this.games.get(gameId);
      if (!state) return this._rejectResult('ROOM_NOT_FOUND', 'Game not found.');
      if (state.status !== 'AUCTION') return this._rejectResult('AUCTION_ENDED', 'Auction is not active.');

      const slot = this.slotOf(state, userId);
      if (!slot) return this._rejectResult('NOT_ELIGIBLE', 'You are not part of this game.');
      if (Date.now() > state.auctionEndsAt) return this._rejectResult('AUCTION_ENDED', 'This round has already ended.');

      if (!Number.isInteger(bidLakh) || bidLakh <= 0) {
        return this._rejectResult('INVALID_BID', 'Bid must be a positive whole lakh amount.');
      }

      const participant = state.participants[slot];
      if (participant.team.length >= 5) {
        return this._rejectResult('NOT_ELIGIBLE', 'You already own 5 players.');
      }

      const minValid = state.currentBidderUserId === null
        ? state.currentBidLakh
        : nextValidBid(state.currentBidLakh);

      if (bidLakh < minValid) {
        return this._rejectResult('INVALID_BID', `Minimum valid bid is ${minValid} lakh.`);
      }
      // Enforce exact increment steps rather than "any higher number" to keep it fair/deterministic.
      if (state.currentBidderUserId !== null && bidLakh !== minValid) {
        return this._rejectResult('INVALID_BID', `Next valid bid must be exactly ${minValid} lakh.`);
      }
      if (state.currentBidderUserId === null && bidLakh !== state.currentBidLakh) {
        // first bid must equal the reserve price exactly (the displayed starting bid)
        return this._rejectResult('INVALID_BID', `Opening bid must be exactly ${state.currentBidLakh} lakh.`);
      }
      if (bidLakh > participant.budgetLakh) {
        return this._rejectResult('INSUFFICIENT_BUDGET', 'Insufficient budget for this bid.');
      }
      if (userId === state.currentBidderUserId) {
        return this._rejectResult('INVALID_BID', 'You are already the highest bidder.');
      }

      state.currentBidLakh = bidLakh;
      state.currentBidderUserId = userId;
      state.auctionEndsAt = Date.now() + AUCTION_ROUND_DURATION_MS;

      await db.query(
        `UPDATE games SET current_bid_lakh=$1, current_bidder_user_id=$2, auction_ends_at=to_timestamp($3/1000.0) WHERE id=$4`,
        [bidLakh, userId, state.auctionEndsAt, gameId]
      );
      await this._logEvent(gameId, state.currentPlayerId, userId, 'BID_PLACED', bidLakh, { slot });

      this.clearTimer(gameId);
      const handle = setTimeout(() => this._endRound(gameId).catch(this._logErr), AUCTION_ROUND_DURATION_MS);
      this.timers.set(gameId, handle);

      this._broadcast(state, 'BID_UPDATED', {
        currentBidLakh: state.currentBidLakh,
        currentBidderUserId: state.currentBidderUserId,
        bidderSlot: slot,
        auctionEndsAt: state.auctionEndsAt,
      });

      return { ok: true, state };
    });
  }

  _rejectResult(code, message) {
    return { ok: false, code, message };
  }

  async _endRound(gameId) {
    return this.withLock(gameId, async () => {
      const state = this.games.get(gameId);
      if (!state || state.status !== 'AUCTION') return;
      if (Date.now() < state.auctionEndsAt - 50) return; // guard against stray early fire

      const playerInfo = state.pool.find((p) => p.playerId === state.currentPlayerId);
      const winnerUserId = state.currentBidderUserId;

      if (winnerUserId) {
        const slot = this.slotOf(state, winnerUserId);
        const participant = state.participants[slot];
        participant.budgetLakh -= state.currentBidLakh;
        participant.team.push({
          playerId: playerInfo.playerId,
          name: playerInfo.name,
          points: playerInfo.points,
          purchasePriceLakh: state.currentBidLakh,
        });

        await db.query(
          `UPDATE game_players SET user_id=$1, purchase_price_lakh=$2, purchased_at=now()
           WHERE game_id=$3 AND player_id=$4`,
          [winnerUserId, state.currentBidLakh, gameId, playerInfo.playerId]
        );
        await db.query('UPDATE game_participants SET budget_lakh=$1 WHERE game_id=$2 AND user_id=$3',
          [participant.budgetLakh, gameId, winnerUserId]);
        await this._logEvent(gameId, playerInfo.playerId, winnerUserId, 'PLAYER_SOLD', state.currentBidLakh, { slot });

        state.soldLog.push({
          playerId: playerInfo.playerId,
          name: playerInfo.name,
          winnerUserId,
          winnerSlot: slot,
          priceLakh: state.currentBidLakh,
        });

        this._broadcast(state, 'PLAYER_SOLD', {
          player: playerInfo,
          winnerUserId,
          winnerSlot: slot,
          priceLakh: state.currentBidLakh,
          participants: this._publicParticipants(state),
        });
      } else {
        await this._logEvent(gameId, playerInfo.playerId, null, 'PLAYER_UNSOLD', null, null);
        state.soldLog.push({ playerId: playerInfo.playerId, name: playerInfo.name, winnerUserId: null, priceLakh: null });
        this._broadcast(state, 'PLAYER_UNSOLD', { player: playerInfo });
      }

      await this._startNextRound(state);
    });
  }

  async _finishGame(state) {
    state.status = 'FINISHED';
    this.clearTimer(state.gameId);

    const results = [1, 2].map((slot) => {
      const p = state.participants[slot];
      const playerPoints = p.team.reduce((s, t) => s + t.points, 0);
      const { budgetBonus, finalScore } = computeScore(playerPoints, p.budgetLakh);
      return {
        slot,
        userId: p.userId,
        name: p.name,
        team: p.team,
        playerPoints,
        remainingBudgetLakh: p.budgetLakh,
        budgetBonus,
        finalScore,
      };
    });

    const winnerUserId = decideWinner(
      { userId: results[0].userId, finalScore: results[0].finalScore, playerPoints: results[0].playerPoints, remainingBudgetLakh: results[0].remainingBudgetLakh },
      { userId: results[1].userId, finalScore: results[1].finalScore, playerPoints: results[1].playerPoints, remainingBudgetLakh: results[1].remainingBudgetLakh }
    );

    results.forEach((r) => {
      r.rank = winnerUserId === null ? 1 : (r.userId === winnerUserId ? 1 : 2);
    });

    for (const r of results) {
      await db.query(
        `INSERT INTO game_results (game_id, user_id, player_points, remaining_budget_lakh, budget_bonus, final_score, rank)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (game_id, user_id) DO UPDATE SET
           player_points=EXCLUDED.player_points, remaining_budget_lakh=EXCLUDED.remaining_budget_lakh,
           budget_bonus=EXCLUDED.budget_bonus, final_score=EXCLUDED.final_score, rank=EXCLUDED.rank`,
        [state.gameId, r.userId, r.playerPoints, r.remainingBudgetLakh, r.budgetBonus, r.finalScore, r.rank]
      );
    }

    state.results = results;
    state.winnerUserId = winnerUserId;

    await db.query(`UPDATE games SET status='FINISHED', finished_at=now() WHERE id=$1`, [state.gameId]);
    await this._logEvent(state.gameId, null, null, 'GAME_FINISHED', null, { winnerUserId });

    this._broadcast(state, 'GAME_FINISHED', { results, winnerUserId });
  }

  // ---------- disconnect / abandonment ----------
  async markAbandoned(gameId, byUserId) {
    return this.withLock(gameId, async () => {
      const state = this.games.get(gameId);
      if (!state) return;
      if (state.status === 'FINISHED' || state.status === 'ABANDONED') return;
      this.clearTimer(gameId);
      state.status = 'ABANDONED';
      await db.query(`UPDATE games SET status='ABANDONED', finished_at=now() WHERE id=$1`, [gameId]);
      await this._logEvent(gameId, null, byUserId, 'GAME_ABANDONED', null, null);
      this._broadcast(state, 'GAME_ABANDONED', { byUserId });
    });
  }

  // ---------- helpers ----------
  async _logEvent(gameId, playerId, userId, eventType, bidAmountLakh, meta) {
    await db.query(
      `INSERT INTO auction_events (game_id, player_id, user_id, event_type, bid_amount_lakh, meta)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [gameId, playerId || null, userId || null, eventType, bidAmountLakh ?? null, meta ? JSON.stringify(meta) : null]
    );
  }

  _publicParticipants(state) {
    return {
      1: state.participants[1] && {
        userId: state.participants[1].userId,
        name: state.participants[1].name,
        budgetLakh: state.participants[1].budgetLakh,
        team: state.participants[1].team,
        ready: state.participants[1].ready,
        connected: state.participants[1].connected,
      },
      2: state.participants[2] && {
        userId: state.participants[2].userId,
        name: state.participants[2].name,
        budgetLakh: state.participants[2].budgetLakh,
        team: state.participants[2].team,
        ready: state.participants[2].ready,
        connected: state.participants[2].connected,
      },
    };
  }

  _publicState(state) {
    return {
      gameId: state.gameId,
      roomCode: state.roomCode,
      status: state.status,
      participants: this._publicParticipants(state),
      pool: state.pool,
      auctionOrder: state.auctionOrder,
      currentRound: state.currentRound,
      currentPlayerId: state.currentPlayerId,
      currentBidLakh: state.currentBidLakh,
      currentBidderUserId: state.currentBidderUserId,
      strategyEndsAt: state.strategyEndsAt,
      auctionEndsAt: state.auctionEndsAt,
      soldLog: state.soldLog,
      results: state.results || null,
      winnerUserId: state.winnerUserId,
    };
  }

  publicStateFor(gameId) {
    const state = this.games.get(gameId);
    return state ? this._publicState(state) : null;
  }

  _broadcast(state, event, payload) {
    this.io.to(`game:${state.gameId}`).emit(event, payload);
  }

  _logErr(err) {
    // eslint-disable-next-line no-console
    console.error('[GameManager]', err);
  }

  // ---------- recovery on boot ----------
  async recoverActiveGames() {
    const { rows: games } = await db.query(
      `SELECT * FROM games WHERE status IN ('LOBBY','STRATEGY','AUCTION')`
    );
    for (const g of games) {
      const state = this._freshState(g.id, g.room_code);
      state.status = g.status;
      state.pool = g.pool_snapshot || [];
      state.auctionOrder = g.auction_order || [];
      state.currentRound = g.current_round || 0;
      state.currentPlayerId = g.current_player_id;
      state.currentBidLakh = g.current_bid_lakh;
      state.currentBidderUserId = g.current_bidder_user_id;
      state.strategyEndsAt = g.strategy_ends_at ? new Date(g.strategy_ends_at).getTime() : null;
      state.auctionEndsAt = g.auction_ends_at ? new Date(g.auction_ends_at).getTime() : null;

      const { rows: parts } = await db.query('SELECT * FROM game_participants WHERE game_id=$1', [g.id]);
      const { rows: users } = await db.query('SELECT * FROM users WHERE id = ANY($1)', [parts.map((p) => p.user_id)]);
      const { rows: gp } = await db.query('SELECT * FROM game_players WHERE game_id=$1', [g.id]);

      for (const p of parts) {
        const u = users.find((x) => x.id === p.user_id);
        const team = gp.filter((r) => r.user_id === p.user_id).map((r) => ({
          playerId: r.player_id,
          name: r.player_name_snapshot,
          points: r.points_snapshot,
          purchasePriceLakh: r.purchase_price_lakh,
        }));
        state.participants[p.slot] = {
          userId: p.user_id,
          name: u ? u.display_name : 'Player',
          budgetLakh: p.budget_lakh,
          ready: p.ready,
          connected: false, // require fresh socket connection after restart
          team,
        };
      }

      state.soldLog = gp.filter((r) => r.purchased_at).map((r) => ({
        playerId: r.player_id, name: r.player_name_snapshot, priceLakh: r.purchase_price_lakh,
      }));

      this.games.set(g.id, state);
      this.roomIndex.set(g.room_code, g.id);

      // reschedule timers based on remaining time
      if (state.status === 'STRATEGY') {
        const remaining = Math.max(0, (state.strategyEndsAt || 0) - Date.now());
        this.timers.set(g.id, setTimeout(() => this._endStrategyPhase(g.id).catch(this._logErr), remaining));
      } else if (state.status === 'AUCTION' && state.auctionEndsAt) {
        const remaining = Math.max(0, state.auctionEndsAt - Date.now());
        this.timers.set(g.id, setTimeout(() => this._endRound(g.id).catch(this._logErr), remaining));
      }
    }
    if (games.length) console.log(`Recovered ${games.length} active game(s) from database.`);
  }
}

class AppError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

module.exports = { GameManager, AppError };
