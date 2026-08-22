import React from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { lakhShort } from '../lib/format.js';

export default function Results({ state, myUserId }) {
  const navigate = useNavigate();
  const results = state.results || [];
  const mine = results.find((r) => r.userId === myUserId);
  const opp = results.find((r) => r.userId !== myUserId);
  const winnerName = state.winnerUserId
    ? results.find((r) => r.userId === state.winnerUserId)?.name
    : null;

  return (
    <div className="px-4 sm:px-8 py-10 max-w-4xl mx-auto text-center">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="text-xs tracking-[0.3em] text-white/40">FINAL RESULTS</div>
        {winnerName ? (
          <div className="mt-2">
            <div className="text-4xl">🏆</div>
            <div className="font-display text-5xl gold-text mt-1">{winnerName}</div>
            <div className="text-white/50 text-sm mt-1">WINS THE SHOWDOWN</div>
          </div>
        ) : (
          <div className="font-display text-4xl mt-2 text-white/70">DRAW</div>
        )}
      </motion.div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-10">
        {[mine, opp].filter(Boolean).map((r) => (
          <ResultCard key={r.userId} r={r} isWinner={state.winnerUserId === r.userId} mine={r.userId === myUserId} />
        ))}
      </div>

      <button
        onClick={() => navigate('/')}
        className="mt-10 px-8 py-3 rounded-xl bg-gold text-ink-900 font-bold tracking-wide"
      >
        BACK TO HOME
      </button>
    </div>
  );
}

function ResultCard({ r, isWinner, mine }) {
  return (
    <div className={`glass rounded-2xl p-6 ${isWinner ? 'ring-2 ring-gold shadow-gold' : ''}`}>
      <div className="text-lg font-bold">{r.name} {mine && <span className="text-gold text-xs">(You)</span>}</div>
      <div className="text-xs text-white/40 mb-3">{r.team.length} players</div>

      <div className="space-y-2 text-sm text-left mb-4">
        {r.team.map((t) => (
          <div key={t.playerId} className="flex justify-between text-white/70">
            <span>{t.name}</span>
            <span>{lakhShort(t.purchasePriceLakh)}</span>
          </div>
        ))}
      </div>

      <div className="border-t border-white/10 pt-3 space-y-1 text-sm">
        <Row label="Total Player Points" value={r.playerPoints} />
        <Row label="Remaining Budget" value={lakhShort(r.remainingBudgetLakh)} />
        <Row label="Budget Bonus" value={`+${r.budgetBonus}`} />
        <div className="flex justify-between font-display text-2xl gold-text pt-2">
          <span>FINAL SCORE</span>
          <span>{r.finalScore}</span>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between text-white/60">
      <span>{label}</span>
      <span className="text-white">{value}</span>
    </div>
  );
}
