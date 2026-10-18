import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getToken, setToken } from '../api/client';

const AppContext = createContext(null);

const DEFAULT_SALON = {
  name: 'Salon',
  currency: 'USD',
  timezone: 'UTC',
  openHour: 9,
  closeHour: 18,
  slotIntervalMinutes: 15,
};

export function AppProvider({ children }) {
  const [user, setUser] = useState(null);
  const [salon, setSalon] = useState(DEFAULT_SALON);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      const configPromise = api.get('/config').catch(() => DEFAULT_SALON);
      const mePromise = getToken() ? api.get('/auth/me').catch(() => null) : Promise.resolve(null);
      const [cfg, me] = await Promise.all([configPromise, mePromise]);
      if (cancelled) return;
      setSalon(cfg);
      setUser(me ? me.user : null);
      setLoading(false);
    }

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    document.title = `${salon.name} · Book an appointment`;
  }, [salon.name]);

  const login = useCallback(async (email, password) => {
    const data = await api.post('/auth/login', { email, password });
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const register = useCallback(async (fields) => {
    const data = await api.post('/auth/register', fields);
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, salon, loading, login, register, logout }),
    [user, salon, loading, login, register, logout]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}
