import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('p26_token'));
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (token) {
        try {
          const { user } = await api.me(token);
          setUser(user);
        } catch {
          localStorage.removeItem('p26_token');
          setToken(null);
        }
      }
      setLoading(false);
    })();
  }, [token]);

  const register = useCallback(async (displayName) => {
    const { token, user } = await api.register(displayName);
    localStorage.setItem('p26_token', token);
    setToken(token);
    setUser(user);
    return user;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('p26_token');
    setToken(null);
    setUser(null);
  }, []);

  const setAdminUser = useCallback((u) => setUser(u), []);

  return (
    <AuthContext.Provider value={{ token, user, loading, register, logout, setAdminUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
