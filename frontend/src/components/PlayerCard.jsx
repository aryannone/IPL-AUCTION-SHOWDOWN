import React from 'react';
import { motion } from 'framer-motion';
import { lakhShort, initials } from '../lib/format.js';

const ROLE_LABEL = {
  BATTER: 'BATTER',
  BOWLER: 'BOWLER',
  'ALL-ROUNDER': 'ALL-ROUNDER',
  WICKETKEEPER: 'WICKETKEEPER',
};

export default function PlayerCard({ player, size = 'lg', highlight = false }) {
  if (!player) return null;
  const big = size === 'lg';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.35 }}
      className={`glass rounded-2xl overflow-hidden ${highlight ? 'shadow-gold ring-1 ring-gold' : ''} ${big ? 'w-full max-w-sm' : 'w-full'}`}
    >
      <div className={`relative flex items-center justify-center bg-gradient-to-br from-ink-700 to-ink-900 ${big ? 'h-40' : 'h-24'}`}>
        {player.imageUrl ? (
          <img src={player.imageUrl} alt={player.name} className="h-full w-full object-cover" />
        ) : (
          <div className={`font-display gold-text ${big ? 'text-6xl' : 'text-3xl'}`}>
            {initials(player.name)}
          </div>
        )}
        <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide bg-black/60 border border-white/10">
          {player.status?.toUpperCase()}
        </div>
      </div>

      <div className={`p-4 ${big ? '' : 'p-3'}`}>
        <div className={`font-display uppercase tracking-wide ${big ? 'text-2xl' : 'text-base'}`}>{player.name}</div>
        <div className="flex items-center gap-2 mt-1 text-xs text-white/60">
          <span className="px-2 py-0.5 rounded bg-white/10">{ROLE_LABEL[player.specialism] || player.specialism}</span>
          <span>{player.country}</span>
        </div>

        <div className="flex items-center justify-between mt-3">
          <div>
            <div className="text-[10px] uppercase text-white/40">Base Price</div>
            <div className="font-semibold text-white">{lakhShort(player.reservePriceLakh)}</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase text-white/40">Points</div>
            <div className="font-semibold gold-text text-lg">⭐ {player.points}</div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
