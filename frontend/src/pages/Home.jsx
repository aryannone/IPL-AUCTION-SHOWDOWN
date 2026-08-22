import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../store/useAuth.jsx';
import { api } from '../lib/api.js';

export default function Home() {
  const { token, user, register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [mode, setMode] = useState(null); // 'create' | 'join'
  const [roomCode, setRoomCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function ensureUser() {
    if (user) return token;
    if (!name.trim()) throw new Error('Enter your name first.');
    await register(name.trim());
    return localStorage.getItem('p26_token');
  }

  async function handleCreate() {
    setError(''); setBusy(true);
    try {
      const tok = await ensureUser();
      const { roomCode } = await api.createGame(tok);
      navigate(`/room/${roomCode}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleJoin() {
    setError(''); setBusy(true);
    try {
      const tok = await ensureUser();
      const code = roomCode.trim().toUpperCase();
      if (!code) throw new Error('Enter a room code.');
      await api.joinGame(tok, code);
      navigate(`/room/${code}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-10">
        <div className="font-display text-6xl sm:text-7xl gold-text leading-none">PARADOX '26</div>
        <div className="font-display text-2xl sm:text-3xl mt-2 tracking-[0.3em] text-white">IPL BID WAR</div>
        <div className="text-xs tracking-[0.4em] text-white/40 mt-2">1V1 AUCTION</div>
        <p className="text-white/60 max-w-md mx-auto mt-5 text-sm">
          Build your 5-player team. Outsmart your opponent. Spend wisely. Win the Bid War.
        </p>
      </motion.div>

      {!user && (
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter your name"
          maxLength={40}
          className="w-full max-w-sm glass rounded-xl px-4 py-3 mb-4 text-center outline-none focus:ring-1 focus:ring-gold"
        />
      )}

      <div className="w-full max-w-sm space-y-3">
        {mode !== 'join' && (
          <button
            onClick={mode === 'create' ? handleCreate : () => setMode('create')}
            disabled={busy}
            className="w-full py-4 rounded-xl bg-gold text-ink-900 font-bold text-lg tracking-wide hover:bg-gold-light transition shadow-gold"
          >
            {mode === 'create' ? (busy ? 'CREATING…' : 'CONFIRM — CREATE GAME') : 'CREATE GAME'}
          </button>
        )}

        {mode !== 'create' && (
          <div className="space-y-2">
            {mode === 'join' && (
              <input
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                placeholder="ROOM CODE"
                maxLength={6}
                className="w-full glass rounded-xl px-4 py-3 text-center tracking-[0.3em] font-display text-xl outline-none focus:ring-1 focus:ring-gold"
              />
            )}
            <button
              onClick={mode === 'join' ? handleJoin : () => setMode('join')}
              disabled={busy}
              className="w-full py-4 rounded-xl glass border border-gold/40 text-gold font-bold text-lg tracking-wide hover:bg-gold/10 transition"
            >
              {mode === 'join' ? (busy ? 'JOINING…' : 'CONFIRM — JOIN GAME') : 'JOIN GAME'}
            </button>
          </div>
        )}

        {mode && (
          <button onClick={() => setMode(null)} className="w-full text-xs text-white/40 py-1">
            ← back
          </button>
        )}
      </div>

      {error && <div className="mt-4 text-red-400 text-sm text-center">{error}</div>}

      <Link to="/admin" className="mt-12 text-xs text-white/30 hover:text-white/60">Admin Panel</Link>
    </div>
  );
}
