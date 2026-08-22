import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Timer from '../components/Timer.jsx';
import PlayerCard from '../components/PlayerCard.jsx';
import TeamPanel from '../components/TeamPanel.jsx';
import { lakhShort } from '../lib/format.js';

function incrementFor(v) {
  if (v < 100) return 5;
  if (v < 200) return 10;
  if (v < 500) return 25;
  if (v < 1000) return 50;
  return 100;
}

export default function Auction({ state, mySlot, myUserId, onBid, lastEvent }) {
  const [bidError, setBidError] = useState('');
  const [busy, setBusy] = useState(false);
  const [soldBanner, setSoldBanner] = useState(null);

  useEffect(() => {
    if (lastEvent?.type === 'PLAYER_SOLD') {
      setSoldBanner(lastEvent.payload);
      const t = setTimeout(() => setSoldBanner(null), 3200);
      return () => clearTimeout(t);
    }
  }, [lastEvent]);

  const currentPlayer = state.pool.find((p) => p.playerId === state.currentPlayerId);
  const iAmHighBidder = state.currentBidderUserId === myUserId;
  const nextBid = state.currentBidderUserId === null
    ? state.currentBidLakh
    : state.currentBidLakh + incrementFor(state.currentBidLakh);

  const me = state.participants[mySlot];
  const oppSlot = mySlot === 1 ? 2 : 1;
  const opp = state.participants[oppSlot];

  const canBid = me && me.team.length < 5 && nextBid <= me.budgetLakh && !iAmHighBidder;

  async function handleBid() {
    setBidError(''); setBusy(true);
    const res = await onBid(nextBid);
    if (!res.ok) setBidError(res.message || res.error);
    setBusy(false);
  }

  if (!currentPlayer) {
    return <div className="min-h-screen flex items-center justify-center text-white/50">Loading round…</div>;
  }

  return (
    <div className="px-4 sm:px-8 py-6 max-w-5xl mx-auto">
      <div className="text-center mb-4">
        <div className="text-xs tracking-[0.3em] text-white/40">
          ROUND {state.currentRound} / {state.auctionOrder.length}
        </div>
      </div>

      <div className="flex flex-col items-center gap-4">
        <PlayerCard player={currentPlayer} highlight />

        <div className="text-center">
          <div className="text-[10px] uppercase tracking-widest text-white/40">Current Bid</div>
          <div className="font-display text-5xl gold-text">{lakhShort(state.currentBidLakh)}</div>
          {state.currentBidderUserId && (
            <div className="text-sm text-white/60 mt-1">
              Highest: {state.currentBidderUserId === myUserId ? 'You' : opp?.name || 'Opponent'}
            </div>
          )}
        </div>

        <div className="font-display text-4xl">
          <Timer endsAt={state.auctionEndsAt} warnBelowMs={4000} />
        </div>

        <button
          onClick={handleBid}
          disabled={!canBid || busy}
          className="w-full max-w-xs py-5 rounded-2xl bg-gold text-ink-900 font-display text-2xl tracking-wide shadow-gold disabled:opacity-40 active:scale-95 transition"
        >
          {iAmHighBidder ? 'YOU ARE HIGHEST' : `BID ${lakhShort(nextBid)}`}
        </button>
        {bidError && <div className="text-red-400 text-sm">{bidError}</div>}
        {!canBid && !iAmHighBidder && me?.team.length >= 5 && (
          <div className="text-white/40 text-xs">You already own 5 players.</div>
        )}
        {!canBid && !iAmHighBidder && nextBid > (me?.budgetLakh || 0) && (
          <div className="text-white/40 text-xs">Not enough budget for the next bid.</div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-8">
        <TeamPanel label="YOUR TEAM" participant={me} mine connected={me?.connected} />
        <TeamPanel label="OPPONENT" participant={opp} connected={opp?.connected} />
      </div>

      <AuctionHistory soldLog={state.soldLog} />

      <AnimatePresence>
        {soldBanner && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
            className="fixed inset-0 flex items-center justify-center bg-black/70 z-50 px-6"
          >
            <div className="glass rounded-2xl p-8 text-center border border-gold/40">
              <div className="font-display text-4xl gold-text mb-2">SOLD!</div>
              <div className="text-2xl font-semibold mb-1">{soldBanner.player.name}</div>
              <div className="text-white/60 text-sm">
                to {soldBanner.winnerUserId === myUserId ? 'You' : (soldBanner.winnerSlot === mySlot ? 'You' : (state.participants[soldBanner.winnerSlot]?.name || 'Opponent'))}
              </div>
              <div className="font-display text-3xl mt-2 text-green-400">{lakhShort(soldBanner.priceLakh)}</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function AuctionHistory({ soldLog }) {
  if (!soldLog?.length) return null;
  return (
    <div className="mt-8">
      <div className="text-xs tracking-[0.3em] text-white/40 mb-2">AUCTION HISTORY</div>
      <div className="glass rounded-xl divide-y divide-white/5">
        {soldLog.slice().reverse().map((s) => (
          <div key={s.playerId} className="flex justify-between px-4 py-2 text-sm">
            <span>{s.name}</span>
            <span className={s.priceLakh ? 'text-gold' : 'text-white/30'}>
              {s.priceLakh ? lakhShort(s.priceLakh) : 'UNSOLD'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
