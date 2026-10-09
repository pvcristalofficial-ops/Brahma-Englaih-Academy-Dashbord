import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { get, post, setCsrf } from './api';

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [meta, setMeta] = useState(null);
  const [booting, setBooting] = useState(true);

  const loadMeta = useCallback(async () => {
    const r = await get('/meta');
    setMeta(r.data);
    return r.data;
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const r = await get('/auth/me');
        setCsrf(r.data.csrf);
        setUser(r.data.user);
        await loadMeta();
      } catch { /* not logged in */ }
      setBooting(false);
    })();
    const onUnauth = () => { setUser(null); setCsrf(''); };
    window.addEventListener('bea:unauthorized', onUnauth);
    return () => window.removeEventListener('bea:unauthorized', onUnauth);
  }, [loadMeta]);

  const login = useCallback(async (email, password) => {
    const r = await post('/auth/login', { email, password });
    setCsrf(r.data.csrf);
    setUser(r.data.user);
    await loadMeta();
  }, [loadMeta]);

  const logout = useCallback(async () => {
    try { await post('/auth/logout'); } catch { /* ignore */ }
    setCsrf('');
    setUser(null);
    setMeta(null);
  }, []);

  const value = useMemo(
    () => ({ user, meta, booting, login, logout, reloadMeta: loadMeta, isAdmin: user?.role === 'admin' }),
    [user, meta, booting, login, logout, loadMeta]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
