const express = require('express');
const { requireAuth } = require('../auth/auth');
const { pool: db } = require('../db/pool');

module.exports = function gamesRoutes(gameManager) {
  const router = express.Router();
  router.use(requireAuth());

  // POST /api/games -> create room
  router.post('/', async (req, res) => {
    try {
      const state = await gameManager.createRoom(req.user);
      res.status(201).json({ roomCode: state.roomCode, gameId: state.gameId });
    } catch (err) {
      res.status(400).json({ error: 'BAD_REQUEST', message: err.message });
    }
  });

  // POST /api/games/:roomCode/join
  router.post('/:roomCode/join', async (req, res) => {
    try {
      const roomCode = req.params.roomCode.toUpperCase();
      const state = await gameManager.joinRoom(roomCode, req.user);
      res.json({ roomCode: state.roomCode, gameId: state.gameId });
    } catch (err) {
      const code = err.code || 'BAD_REQUEST';
      const status = code === 'ROOM_NOT_FOUND' ? 404 : code === 'ROOM_FULL' ? 409 : 400;
      res.status(status).json({ error: code, message: err.message });
    }
  });

  // GET /api/games/:roomCode -> current public state (for reconnect / refresh)
  router.get('/:roomCode', async (req, res) => {
    const roomCode = req.params.roomCode.toUpperCase();
    const state = gameManager.getStateByRoomCode(roomCode);
    if (!state) return res.status(404).json({ error: 'ROOM_NOT_FOUND', message: 'Room not found.' });
    const slot = gameManager.slotOf(state, req.user.id);
    if (!slot) return res.status(403).json({ error: 'FORBIDDEN', message: 'You are not part of this game.' });
    res.json({ state: gameManager.publicStateFor(state.gameId), yourSlot: slot });
  });

  // GET /api/games/:roomCode/history -> auction event log
  router.get('/:roomCode/history', async (req, res) => {
    const state = gameManager.getStateByRoomCode(req.params.roomCode.toUpperCase());
    if (!state) return res.status(404).json({ error: 'ROOM_NOT_FOUND', message: 'Room not found.' });
    const { rows } = await db.query(
      `SELECT event_type, player_id, user_id, bid_amount_lakh, meta, created_at
       FROM auction_events WHERE game_id=$1 ORDER BY created_at ASC`,
      [state.gameId]
    );
    res.json({ events: rows });
  });

  return router;
};
