import React, { useEffect, useState } from 'react';

/** Displays remaining time until `endsAt` (server epoch ms). Never invents time — only reads it. */
export default function Timer({ endsAt, className = '', warnBelowMs = 5000 }) {
  const [remaining, setRemaining] = useState(Math.max(0, (endsAt || 0) - Date.now()));

  useEffect(() => {
    if (!endsAt) return;
    const tick = () => setRemaining(Math.max(0, endsAt - Date.now()));
    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [endsAt]);

  const totalSec = Math.ceil(remaining / 1000);
  const mm = String(Math.floor(totalSec / 60)).padStart(2, '0');
  const ss = String(totalSec % 60).padStart(2, '0');
  const warning = remaining <= warnBelowMs && remaining > 0;

  return (
    <span className={`${className} ${warning ? 'text-red-400 animate-pulse' : ''}`}>
      {mm}:{ss}
    </span>
  );
}
