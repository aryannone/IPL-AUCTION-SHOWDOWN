import React, { useState } from 'react';
import { motion } from 'framer-motion';

export default function Lobby({ state, mySlot, roomCode, onReady }) {
  const [busy, setBusy] = useState(false);
  const p1 = state.participants[1];
  const p2 = state.participants[2];
  const bothReady = p1?.ready && p2?.ready;

  async function handleReady() {
    setBusy(true);
    await onReady();
    setBusy(false);
  }

  const me = state.participants[mySlot];

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="text-xs tracking-[0.3em] text-white/40 mb-2">ROOM CODE</div>
      <div className="font-display text-5xl gold-text tracking-[0.2em] mb-10">{roomCode}</div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-lg mb-8">
        <PlayerSlot label="PLAYER 1" p={p1} mine={mySlot === 1} />
        <PlayerSlot label="PLAYER 2" p={p2} mine={mySlot === 2} />
      </div>

      {!p2 && (
        <div className="text-white/50 text-sm mb-6 animate-pulse">WAITING FOR OPPONENT…</div>
      )}

      {p2 && !bothReady && (
        <motion.button
          initial={{ scale: 0.95 }} animate={{ scale: 1 }}
          onClick={handleReady}
          disabled={busy || me?.ready}
          className="px-10 py-4 rounded-xl bg-gold text-ink-900 font-bold text-lg tracking-wide shadow-gold disabled:opacity-60"
        >
          {me?.ready ? 'WAITING FOR OPPONENT…' : busy ? '…' : 'READY'}
        </motion.button>
      )}

      {bothReady && (
        <div className="text-center">
          <div className="text-green-400 font-display text-2xl">BOTH PLAYERS READY</div>
          <div className="text-white/50 mt-1 animate-pulse">GAME STARTING…</div>
        </div>
      )}
    </div>
  );
}

function PlayerSlot({ label, p, mine }) {
  return (
    <div className={`glass rounded-xl p-4 ${mine ? 'ring-1 ring-gold/50' : ''}`}>
      <div className="text-[10px] tracking-[0.2em] text-white/40 mb-1">{label}</div>
      {p ? (
        <>
          <div className="font-semibold text-lg">{p.name} {mine && <span className="text-gold text-xs">(You)</span>}</div>
          <div className="flex items-center gap-3 mt-2 text-xs">
            <span className={p.connected ? 'text-green-400' : 'text-yellow-400'}>{p.connected ? '🟢 Connected' : '🟡 Reconnecting'}</span>
            <span className={p.ready ? 'text-gold' : 'text-white/40'}>{p.ready ? '✓ Ready' : 'Not Ready'}</span>
          </div>
        </>
      ) : (
        <div className="text-white/30 text-sm py-2">Empty seat</div>
      )}
    </div>
  );
}
