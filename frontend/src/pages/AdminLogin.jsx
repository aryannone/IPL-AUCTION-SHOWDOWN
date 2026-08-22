import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../store/useAuth.jsx';
import { api } from '../lib/api.js';

export default function AdminLogin() {
  const { token, user, register, setAdminUser } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleLogin() {
    setError(''); setBusy(true);
    try {
      let tok = token;
      if (!user) {
        if (!name.trim()) throw new Error('Enter a name first.');
        await register(name.trim());
        tok = localStorage.getItem('p26_token');
      }
      const res = await api.adminLogin(tok, password);
      setAdminUser(res.user);
      navigate('/admin/dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="font-display text-4xl gold-text mb-8">ADMIN LOGIN</div>
      <div className="w-full max-w-sm space-y-3">
        {!user && (
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name"
            className="w-full glass rounded-xl px-4 py-3 outline-none focus:ring-1 focus:ring-gold" />
        )}
        <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Admin password"
          className="w-full glass rounded-xl px-4 py-3 outline-none focus:ring-1 focus:ring-gold" />
        <button onClick={handleLogin} disabled={busy}
          className="w-full py-3 rounded-xl bg-gold text-ink-900 font-bold">
          {busy ? '…' : 'LOG IN'}
        </button>
        {error && <div className="text-red-400 text-sm text-center">{error}</div>}
      </div>
    </div>
  );
}
