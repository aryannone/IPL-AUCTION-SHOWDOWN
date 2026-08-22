import React from 'react';
import { lakhShort } from '../lib/format.js';

export default function TeamPanel({ label, participant, mine = false, connected = true }) {
  if (!participant) {
    return (
      <div className="glass rounded-xl p-4 text-white/40 text-sm">Waiting for opponent…</div>
    );
  }
  const points = participant.team.reduce((s, t) => s + t.points, 0);
  const spent = participant.team.reduce((s, t) => s + (t.purchasePriceLakh || 0), 0);

  return (
    <div className={`glass rounded-xl p-4 ${mine ? 'ring-1 ring-gold/50' : ''}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold uppercase tracking-wide text-white/70">
          {label} {mine && <span className="text-gold">(You)</span>}
        </div>
        <span className={`text-xs ${connected ? 'text-green-400' : 'text-yellow-400'}`}>
          {connected ? '🟢' : '🟡'}
        </span>
      </div>
      <div className="text-lg font-bold">{participant.name}</div>

      <div className="grid grid-cols-2 gap-2 mt-3 text-sm">
        <div>
          <div className="text-[10px] uppercase text-white/40">Players</div>
          <div className="font-semibold">{participant.team.length} / 5</div>
        </div>
        <div>
          <div className="text-[10px] uppercase text-white/40">Points</div>
          <div className="font-semibold gold-text">{points}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase text-white/40">Spent</div>
          <div className="font-semibold text-red-300">{lakhShort(spent)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase text-white/40">Budget Left</div>
          <div className="font-semibold text-green-300">{lakhShort(participant.budgetLakh)}</div>
        </div>
      </div>

      {participant.team.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-white/70 max-h-28 overflow-y-auto">
          {participant.team.map((t) => (
            <li key={t.playerId} className="flex justify-between">
              <span>{t.name}</span>
              <span className="text-gold">{lakhShort(t.purchasePriceLakh)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
