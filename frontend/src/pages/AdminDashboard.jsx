import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../store/useAuth.jsx';
import { api } from '../lib/api.js';

export default function AdminDashboard() {
  const { token, user, loading } = useAuth();
  const navigate = useNavigate();
  const [players, setPlayers] = useState([]);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null); // player being edited
  const [matches, setMatches] = useState([]);
  const [tab, setTab] = useState('players');
  const [status, setStatus] = useState('');

  useEffect(() => {
    if (loading) return;
    if (!user?.isAdmin) { navigate('/admin'); return; }
    refresh();
  }, [loading, user]);

  async function refresh() {
    const [{ players }, { games }] = await Promise.all([
      api.adminPlayers(token),
      api.adminMatches(token),
    ]);
    setPlayers(players);
    setMatches(games);
  }

  async function saveEdit() {
    setStatus('Saving to database…');
    const patch = {
      first_name: editing.first_name,
      surname: editing.surname,
      country: editing.country,
      specialism: editing.specialism,
      status: editing.status,
      reserve_price_lakh: Number(editing.reserve_price_lakh),
      points: Number(editing.points),
      is_active: editing.is_active,
    };
    const res = await api.adminUpdatePlayer(token, editing.id, patch);
    setPlayers((prev) => prev.map((p) => (p.id === editing.id ? res.player : p)));
    setEditing(null);
    setStatus('Saved to cloud database ✓');
    setTimeout(() => setStatus(''), 2000);
  }

  async function deactivate(p) {
    if (!confirm(`Deactivate ${p.full_name}?`)) return;
    const res = await api.adminDeletePlayer(token, p.id);
    setPlayers((prev) => prev.map((x) => (x.id === p.id ? res.player : x)));
  }

  const filtered = players.filter((p) =>
    p.full_name.toLowerCase().includes(search.toLowerCase())
  );

  if (loading || !user?.isAdmin) return null;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-8">
      <div className="flex items-center justify-between mb-6">
        <div className="font-display text-4xl gold-text">ADMIN DASHBOARD</div>
        {status && <div className="text-green-400 text-sm">{status}</div>}
      </div>

      <div className="flex gap-4 mb-6 text-sm">
        <TabBtn active={tab === 'players'} onClick={() => setTab('players')}>Player Management ({players.length})</TabBtn>
        <TabBtn active={tab === 'matches'} onClick={() => setTab('matches')}>Match History ({matches.length})</TabBtn>
      </div>

      {tab === 'players' && (
        <>
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search players…"
            className="w-full max-w-sm glass rounded-lg px-4 py-2 mb-4 outline-none focus:ring-1 focus:ring-gold"
          />
          <div className="glass rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-white/40 text-left">
                <tr>
                  <th className="p-3">Sr.</th><th className="p-3">Name</th><th className="p-3">Country</th>
                  <th className="p-3">Role</th><th className="p-3">C/U</th><th className="p-3">Reserve (L)</th>
                  <th className="p-3">Points</th><th className="p-3">Active</th><th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} className="border-t border-white/5 hover:bg-white/5">
                    <td className="p-3">{p.sr_no}</td>
                    <td className="p-3">{p.full_name}</td>
                    <td className="p-3">{p.country}</td>
                    <td className="p-3">{p.specialism}</td>
                    <td className="p-3">{p.status}</td>
                    <td className="p-3">{p.reserve_price_lakh}</td>
                    <td className="p-3">{p.points}</td>
                    <td className="p-3">{p.is_active ? '✓' : '✗'}</td>
                    <td className="p-3 flex gap-2">
                      <button onClick={() => setEditing({ ...p })} className="text-gold text-xs">Edit</button>
                      <button onClick={() => deactivate(p)} className="text-red-400 text-xs">Deactivate</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'matches' && (
        <div className="glass rounded-xl divide-y divide-white/5">
          {matches.map((m) => (
            <div key={m.id} className="p-3 flex justify-between text-sm">
              <span>{m.room_code}</span>
              <span className="text-white/40">{m.status}</span>
              <span className="text-white/40">{new Date(m.created_at).toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center px-4 z-50">
          <div className="glass rounded-xl p-6 w-full max-w-md space-y-3">
            <div className="font-display text-2xl gold-text mb-2">EDIT PLAYER</div>
            <Field label="First Name" value={editing.first_name} onChange={(v) => setEditing({ ...editing, first_name: v })} />
            <Field label="Surname" value={editing.surname} onChange={(v) => setEditing({ ...editing, surname: v })} />
            <Field label="Country" value={editing.country} onChange={(v) => setEditing({ ...editing, country: v })} />
            <div className="flex gap-2">
              <select value={editing.specialism} onChange={(e) => setEditing({ ...editing, specialism: e.target.value })}
                className="flex-1 bg-ink-800 rounded-lg px-3 py-2 text-sm">
                {['BATTER', 'BOWLER', 'ALL-ROUNDER', 'WICKETKEEPER'].map((s) => <option key={s}>{s}</option>)}
              </select>
              <select value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value })}
                className="flex-1 bg-ink-800 rounded-lg px-3 py-2 text-sm">
                {['Capped', 'Uncapped'].map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="flex gap-2">
              <Field label="Reserve (Lakh)" type="number" value={editing.reserve_price_lakh} onChange={(v) => setEditing({ ...editing, reserve_price_lakh: v })} />
              <Field label="Points" type="number" value={editing.points} onChange={(v) => setEditing({ ...editing, points: v })} />
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={saveEdit} className="flex-1 py-2 rounded-lg bg-gold text-ink-900 font-semibold">Save to Database</button>
              <button onClick={() => setEditing(null)} className="flex-1 py-2 rounded-lg glass">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TabBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick} className={`px-3 py-1.5 rounded-lg ${active ? 'bg-gold text-ink-900 font-semibold' : 'text-white/50'}`}>
      {children}
    </button>
  );
}

function Field({ label, value, onChange, type = 'text' }) {
  return (
    <label className="block flex-1">
      <div className="text-[10px] uppercase text-white/40 mb-1">{label}</div>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full bg-ink-800 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-gold" />
    </label>
  );
}
