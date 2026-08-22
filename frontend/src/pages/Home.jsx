import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../store/useAuth.jsx';
import { api } from '../lib/api.js';

const ROLL_NUMBER_REGEX = /^\d{2}[FN][123]\d{6}$/;

export default function Home() {
  const { token, user, register, logout } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [rollNumber, setRollNumber] = useState('');
  const [mode, setMode] = useState(null); // 'create' | 'join'
  const [roomCode, setRoomCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function ensureUser() {
    if (user) return token;
    if (!name.trim()) throw new Error('Enter your name first.');
    const roll = rollNumber.trim().toUpperCase();
    if (!ROLL_NUMBER_REGEX.test(roll)) {
      throw new Error('Roll number must be in the format YYFTxxxxxx, e.g. 26F1000123 (F = student, N = admin-approved, T = 1/2/3).');
    }
    await register(name.trim(), roll);
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
        <div className="font-display text-5xl sm:text-6xl gold-text leading-tight">IPL AUCTION SHOWDOWN</div>
        <div className="text-xs tracking-[0.4em] text-white/40 mt-2">1V1 AUCTION</div>
        <p className="text-white/60 max-w-md mx-auto mt-5 text-sm">
          Build your 5-player team. Outsmart your opponent. Spend wisely. Win the Showdown.
        </p>
      </motion.div>

      {user ? (
        <div className="w-full max-w-sm glass rounded-xl px-4 py-3 mb-4 text-center">
          <div className="text-[10px] uppercase tracking-widest text-white/40">Playing as (only visible to you)</div>
          <div className="font-semibold mt-1">{user.displayName}</div>
          <div className="text-white/50 text-sm tracking-widest mt-0.5">{user.rollNumber}</div>
          <button onClick={logout} className="mt-2 text-xs text-white/30 hover:text-white/60">Not you? Log out</button>
        </div>
      ) : (
        <div className="w-full max-w-sm space-y-3 mb-4">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter your name"
            maxLength={40}
            className="w-full glass rounded-xl px-4 py-3 text-center outline-none focus:ring-1 focus:ring-gold"
          />
          <input
            value={rollNumber}
            onChange={(e) => setRollNumber(e.target.value.toUpperCase())}
            placeholder="Roll number e.g. 26F1000123"
            maxLength={10}
            className="w-full glass rounded-xl px-4 py-3 text-center tracking-widest outline-none focus:ring-1 focus:ring-gold"
          />
          <div className="text-[11px] text-white/30 text-center px-2">
            YY = admission year · F/N = student/admin-approved · T = term (1/2/3) · then 6 digits.
            Using the same roll number again logs you back into the same profile.
          </div>
        </div>
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
