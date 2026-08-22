import React, { useEffect, useState, useRef } from 'react';
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

export default function Auction({ state, mySlot, myUserId, onBid, onWithdraw, lastEvent }) {
  const [bidError, setBidError] = useState('');
  const [busy, setBusy] = useState(false);
  const [soldBanner, setSoldBanner] = useState(null);
  const [unsoldBanner, setUnsoldBanner] = useState(null);
  const [withdrawNotice, setWithdrawNotice] = useState(null);
  const soldTimeoutRef = useRef(null);
  const unsoldTimeoutRef = useRef(null);
  const noticeTimeoutRef = useRef(null);

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, []);

  // Banner lifecycle is driven explicitly here (not via effect-cleanup timing) so
  // that a fast-arriving PLAYER_DRAWN for the next round can never leave a stale
  // SOLD/UNSOLD overlay stuck on screen blocking the next round's bid button.
  useEffect(() => {
    if (!lastEvent) return;
    if (lastEvent.type === 'PLAYER_SOLD') {
      if (soldTimeoutRef.current) clearTimeout(soldTimeoutRef.current);
      if (unsoldTimeoutRef.current) clearTimeout(unsoldTimeoutRef.current);
      setUnsoldBanner(null);
      setSoldBanner(lastEvent.payload);
      soldTimeoutRef.current = setTimeout(() => setSoldBanner(null), 3200);
    } else if (lastEvent.type === 'PLAYER_UNSOLD') {
      if (soldTimeoutRef.current) clearTimeout(soldTimeoutRef.current);
      if (unsoldTimeoutRef.current) clearTimeout(unsoldTimeoutRef.current);
      setSoldBanner(null);
      setUnsoldBanner(lastEvent.payload);
      unsoldTimeoutRef.current = setTimeout(() => setUnsoldBanner(null), 3200);
    } else if (lastEvent.type === 'PLAYER_WITHDREW') {
      const iWithdrew = state.participants[lastEvent.payload.slot]?.userId === myUserId;
      if (noticeTimeoutRef.current) clearTimeout(noticeTimeoutRef.current);
      setWithdrawNotice(iWithdrew ? 'You withdrew from this round.' : 'Opponent withdrew — waiting for your move.');
      noticeTimeoutRef.current = setTimeout(() => setWithdrawNotice(null), 3500);
    } else if (lastEvent.type === 'PLAYER_DRAWN') {
      // A new round starting is the authoritative signal that any leftover
      // banner from the previous round must go away right now.
      if (soldTimeoutRef.current) clearTimeout(soldTimeoutRef.current);
      if (unsoldTimeoutRef.current) clearTimeout(unsoldTimeoutRef.current);
      if (noticeTimeoutRef.current) clearTimeout(noticeTimeoutRef.current);
      setSoldBanner(null);
      setUnsoldBanner(null);
      setWithdrawNotice(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastEvent]);

  useEffect(() => () => {
    if (soldTimeoutRef.current) clearTimeout(soldTimeoutRef.current);
    if (unsoldTimeoutRef.current) clearTimeout(unsoldTimeoutRef.current);
    if (noticeTimeoutRef.current) clearTimeout(noticeTimeoutRef.current);
  }, []);

  const currentPlayer = state.pool.find((p) => p.playerId === state.currentPlayerId);
  const iAmHighBidder = state.currentBidderUserId === myUserId;
  const nextBid = state.currentBidderUserId === null
    ? state.currentBidLakh
    : state.currentBidLakh + incrementFor(state.currentBidLakh);

  const me = state.participants[mySlot];
  const oppSlot = mySlot === 1 ? 2 : 1;
  const opp = state.participants[oppSlot];

  const previewActive = !!state.biddingStartsAt && now < state.biddingStartsAt;
  const iWithdrawn = !!state.withdrawn?.[mySlot];
  const oppWithdrawn = !!state.withdrawn?.[oppSlot];

  const canBid = !previewActive && me && me.team.length < 5 && nextBid <= me.budgetLakh && !iAmHighBidder && !iWithdrawn;
  const canWithdraw = !previewActive && !iAmHighBidder && !iWithdrawn;

  async function handleBid() {
    setBidError(''); setBusy(true);
    const res = await onBid(nextBid);
    if (!res.ok) setBidError(res.message || res.error);
    setBusy(false);
  }

  async function handleWithdraw() {
    setBidError(''); setBusy(true);
    const res = await onWithdraw();
    if (!res.ok) setBidError(res.message || res.error);
    setBusy(false);
  }

  if (!currentPlayer) {
    return <div className="min-h-screen flex items-center justify-center text-white/50">Loading round…</div>;
  }

  if (previewActive) {
    return (
      <div className="px-4 sm:px-8 py-6 max-w-5xl mx-auto min-h-screen flex flex-col items-center justify-center text-center">
        <div className="text-xs tracking-[0.3em] text-white/40 mb-2">
          {state.currentRound === 1 ? 'AUCTION STARTING' : `NEXT UP · ROUND ${state.currentRound} / ${state.auctionOrder.length}`}
        </div>
        <PlayerCard player={currentPlayer} highlight />
        <div className="mt-6 font-display text-3xl gold-text">
          <Timer endsAt={state.biddingStartsAt} />
        </div>
        <div className="text-white/40 text-sm mt-2">Bidding opens in a moment — get ready.</div>
      </div>
    );
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
          {oppWithdrawn && !state.currentBidderUserId && (
            <div className="text-sm text-yellow-300/80 mt-1">Opponent withdrew — bid to win it outright.</div>
          )}
        </div>

        <div className="font-display text-4xl">
          <Timer endsAt={state.auctionEndsAt} warnBelowMs={4000} />
        </div>

        <div className="w-full max-w-xs flex flex-col gap-2">
          <button
            onClick={handleBid}
            disabled={!canBid || busy}
            className="w-full py-5 rounded-2xl bg-gold text-ink-900 font-display text-2xl tracking-wide shadow-gold disabled:opacity-40 active:scale-95 transition"
          >
            {iAmHighBidder ? 'YOU ARE HIGHEST' : iWithdrawn ? 'WITHDRAWN' : `BID ${lakhShort(nextBid)}`}
          </button>
          {canWithdraw && (
            <button
              onClick={handleWithdraw}
              disabled={busy}
              className="w-full py-2.5 rounded-xl border border-white/15 text-white/60 text-sm tracking-wide hover:bg-white/5 disabled:opacity-40 transition"
            >
              Withdraw from this bid
            </button>
          )}
        </div>

        {bidError && <div className="text-red-400 text-sm">{bidError}</div>}
        {!canBid && !iAmHighBidder && !iWithdrawn && me?.team.length >= 5 && (
          <div className="text-white/40 text-xs">You already own 5 players.</div>
        )}
        {!canBid && !iAmHighBidder && !iWithdrawn && nextBid > (me?.budgetLakh || 0) && (
          <div className="text-white/40 text-xs">Not enough budget for the next bid.</div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-8">
        <TeamPanel label="YOUR TEAM" participant={me} mine connected={me?.connected} />
        <TeamPanel label="OPPONENT" participant={opp} connected={opp?.connected} />
      </div>

      <AuctionHistory soldLog={state.soldLog} />

      <AnimatePresence>
        {withdrawNotice && (
          <motion.div
            initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="fixed top-3 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-black/80 border border-white/10 text-sm"
          >
            {withdrawNotice}
          </motion.div>
        )}
      </AnimatePresence>

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
              {soldBanner.reason === 'OPPONENT_WITHDREW' && (
                <div className="text-white/40 text-xs mt-2">Decided by withdrawal, not the clock.</div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {unsoldBanner && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
            className="fixed inset-0 flex items-center justify-center bg-black/70 z-50 px-6"
          >
            <div className="glass rounded-2xl p-8 text-center border border-white/15">
              <div className="font-display text-4xl text-white/50 mb-2">UNSOLD</div>
              <div className="text-2xl font-semibold mb-1">{unsoldBanner.player.name}</div>
              <div className="text-white/40 text-sm">
                {unsoldBanner.reason === 'BOTH_WITHDREW' ? 'Both players withdrew.' : 'Nobody placed a bid.'}
              </div>
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
