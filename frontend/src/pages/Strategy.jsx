import React from 'react';
import Timer from '../components/Timer.jsx';
import PlayerCard from '../components/PlayerCard.jsx';

export default function Strategy({ state }) {
  return (
    <div className="px-4 sm:px-8 py-8 max-w-6xl mx-auto">
      <div className="text-center mb-8">
        <div className="text-xs tracking-[0.3em] text-white/40">STRATEGY PHASE</div>
        <div className="font-display text-6xl gold-text mt-1">
          <Timer endsAt={state.strategyEndsAt} warnBelowMs={20000} />
        </div>
        <p className="text-white/50 text-sm mt-2 max-w-md mx-auto">
          Study all 5 players. Compare points, reserve prices, and roles. Plan how you'll spend your ₹10 Cr before the auction begins.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {state.pool.map((p) => (
          <PlayerCard key={p.playerId} player={p} size="sm" />
        ))}
      </div>
    </div>
  );
}
