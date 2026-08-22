const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

async function request(path, { method = 'GET', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let data;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const err = new Error(data?.message || 'Request failed');
    err.code = data?.error || 'ERROR';
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  BASE_URL,
  register: (displayName) => request('/api/auth/register', { method: 'POST', body: { displayName } }),
  me: (token) => request('/api/auth/me', { token }),
  adminLogin: (token, password) => request('/api/auth/admin-login', { method: 'POST', token, body: { password } }),

  players: (token, params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/api/players${qs ? `?${qs}` : ''}`, { token });
  },

  createGame: (token) => request('/api/games', { method: 'POST', token }),
  joinGame: (token, roomCode) => request(`/api/games/${roomCode}/join`, { method: 'POST', token }),
  getGame: (token, roomCode) => request(`/api/games/${roomCode}`, { token }),
  getHistory: (token, roomCode) => request(`/api/games/${roomCode}/history`, { token }),

  adminPlayers: (token) => request('/api/admin/players', { token }),
  adminUpdatePlayer: (token, id, patch) => request(`/api/admin/players/${id}`, { method: 'PATCH', token, body: patch }),
  adminAddPlayer: (token, body) => request('/api/admin/players', { method: 'POST', token, body }),
  adminDeletePlayer: (token, id) => request(`/api/admin/players/${id}`, { method: 'DELETE', token }),
  adminMatches: (token) => request('/api/admin/matches', { token }),
};
