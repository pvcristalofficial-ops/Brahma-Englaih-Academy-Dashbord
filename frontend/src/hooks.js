import { useCallback, useEffect, useRef, useState } from 'react';

/** Load data; re-runs when deps change. Stale responses are ignored. */
export function useAsync(fn, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const seq = useRef(0);
  const run = useCallback(async () => {
    const my = ++seq.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await fn();
      if (my === seq.current) setState({ data, error: null, loading: false });
    } catch (error) {
      if (my === seq.current) setState({ data: null, error, loading: false });
    }
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { run(); }, [run]);
  return { ...state, reload: run, setData: (data) => setState((s) => ({ ...s, data })) };
}

export function useDebounced(value, ms = 350) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Persist a form draft so a browser crash / accidental refresh never loses typed data. */
export function useDraft(key, enabled = true) {
  const read = () => {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
  };
  const write = (v) => { if (enabled) try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage full/blocked */ } };
  const clear = () => { try { localStorage.removeItem(key); } catch { /* ignore */ } };
  return { read, write, clear };
}
