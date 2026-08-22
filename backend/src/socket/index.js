const { getUserByToken } = require('../auth/auth');

// simple in-memory rate limiter per socket for bid spam protection
const BID_WINDOW_MS = 1000;
const BID_MAX_PER_WINDOW = 5;

function attachSocket(io, gameManager) {
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      const user = await getUserByToken(token);
      if (!user) return next(new Error('UNAUTHORIZED'));
      socket.user = user;
      next();
    } catch (err) {
      next(new Error('UNAUTHORIZED'));
    }
  });

  io.on('connection', (socket) => {
    socket.bidTimestamps = [];

    socket.on('JOIN_GAME_ROOM', async ({ roomCode }, ack) => {
      try {
        const state = gameManager.getStateByRoomCode(String(roomCode).toUpperCase());
        if (!state) return ack?.({ ok: false, error: 'ROOM_NOT_FOUND' });
        const slot = gameManager.slotOf(state, socket.user.id);
        if (!slot) return ack?.({ ok: false, error: 'FORBIDDEN' });

        socket.join(`game:${state.gameId}`);
        socket.gameId = state.gameId;
        await gameManager.setConnected(state.gameId, socket.user.id, true);

        io.to(`game:${state.gameId}`).emit('PLAYER_CONNECTED', { userId: socket.user.id, slot });
        ack?.({ ok: true, state: gameManager.publicStateFor(state.gameId), yourSlot: slot });
      } catch (err) {
        ack?.({ ok: false, error: 'SERVER_ERROR', message: err.message });
      }
    });

    socket.on('PLAYER_READY', async (_payload, ack) => {
      try {
        if (!socket.gameId) return ack?.({ ok: false, error: 'NOT_ELIGIBLE' });
        const state = await gameManager.setReady(socket.gameId, socket.user.id);
        io.to(`game:${socket.gameId}`).emit('GAME_STATE_SYNC', gameManager.publicStateFor(socket.gameId));
        ack?.({ ok: true });
      } catch (err) {
        ack?.({ ok: false, error: err.code || 'SERVER_ERROR', message: err.message });
      }
    });

    socket.on('PLACE_BID', async ({ bidLakh }, ack) => {
      try {
        if (!socket.gameId) return ack?.({ ok: false, error: 'NOT_ELIGIBLE' });

        // rate limit
        const now = Date.now();
        socket.bidTimestamps = socket.bidTimestamps.filter((t) => now - t < BID_WINDOW_MS);
        if (socket.bidTimestamps.length >= BID_MAX_PER_WINDOW) {
          return ack?.({ ok: false, error: 'RATE_LIMITED', message: 'Slow down — too many bid attempts.' });
        }
        socket.bidTimestamps.push(now);

        const result = await gameManager.placeBid(socket.gameId, socket.user.id, Number(bidLakh));
        if (!result.ok) {
          return ack?.({ ok: false, error: result.code, message: result.message });
        }
        ack?.({ ok: true });
      } catch (err) {
        ack?.({ ok: false, error: 'SERVER_ERROR', message: err.message });
      }
    });

    socket.on('WITHDRAW_BID', async (_payload, ack) => {
      try {
        if (!socket.gameId) return ack?.({ ok: false, error: 'NOT_ELIGIBLE' });
        const result = await gameManager.withdraw(socket.gameId, socket.user.id);
        if (!result.ok) {
          return ack?.({ ok: false, error: result.code, message: result.message });
        }
        ack?.({ ok: true });
      } catch (err) {
        ack?.({ ok: false, error: 'SERVER_ERROR', message: err.message });
      }
    });

    socket.on('SYNC_STATE', (_payload, ack) => {
      if (!socket.gameId) return ack?.({ ok: false, error: 'NOT_ELIGIBLE' });
      ack?.({ ok: true, state: gameManager.publicStateFor(socket.gameId) });
    });

    socket.on('FORFEIT', async (_payload, ack) => {
      try {
        if (!socket.gameId) return ack?.({ ok: false, error: 'NOT_ELIGIBLE' });
        await gameManager.markAbandoned(socket.gameId, socket.user.id);
        ack?.({ ok: true });
      } catch (err) {
        ack?.({ ok: false, error: 'SERVER_ERROR', message: err.message });
      }
    });

    socket.on('disconnect', async () => {
      if (!socket.gameId) return;
      try {
        await gameManager.setConnected(socket.gameId, socket.user.id, false);
        io.to(`game:${socket.gameId}`).emit('PLAYER_DISCONNECTED', { userId: socket.user.id });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('disconnect handling failed', err);
      }
    });
  });
}

module.exports = { attachSocket };
