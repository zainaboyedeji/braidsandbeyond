import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getToken, setToken } from '../api/client';

const AppContext = createContext(null);

const DEFAULT_SALON = {
  name: 'Braids and Beyond',
  phone: null,
  whatsappNumber: null,
  address: null,
  email: null,
  currency: 'USD',
  timezone: 'UTC',
  slotIntervalMinutes: 15,
  hours: [],
  pickupVehicles: [],
  deposits: { enabled: false, depositPercent: 50, holdMinutes: 30, freeCancellationHours: 24, lateCancelRefundPercent: 50 },
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

  // Sets the new password from an emailed reset link and logs the user straight in
  const resetPassword = useCallback(async (token, password) => {
    const data = await api.post('/auth/reset-password', { token, password });
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }, []);

  // Re-fetch after the admin changes opening hours
  const refreshSalon = useCallback(async () => {
    setSalon(await api.get('/config'));
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, salon, loading, login, register, resetPassword, logout, refreshSalon }),
    [user, salon, loading, login, register, resetPassword, logout, refreshSalon]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}
