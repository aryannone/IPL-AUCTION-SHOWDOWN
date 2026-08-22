require('dotenv').config();
const http = require('http');
const { Server } = require('socket.io');
const { createApp } = require('./app');
const { GameManager } = require('./game/engine');
const { attachSocket } = require('./socket/index');

const PORT = process.env.PORT || 4000;
const FRONTEND_URL = process.env.FRONTEND_URL || '*';

async function main() {
  const httpServer = http.createServer();
  const io = new Server(httpServer, {
    cors: { origin: FRONTEND_URL, methods: ['GET', 'POST'], credentials: true },
  });

  const gameManager = new GameManager(io);
  await gameManager.recoverActiveGames();

  const app = createApp(gameManager);
  httpServer.on('request', app);

  attachSocket(io, gameManager);

  httpServer.listen(PORT, () => {
    console.log(`PARADOX '26 backend listening on :${PORT}`);
  });
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
