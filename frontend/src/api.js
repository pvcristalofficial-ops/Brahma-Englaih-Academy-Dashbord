// All server calls go through here: CSRF header, JSON, consistent errors.
const BASE = (import.meta.env.VITE_API_BASE || './api').replace(/\/$/, '');
let csrf = '';

export const setCsrf = (t) => { csrf = t || ''; };

export class ApiError extends Error {
  constructor(status, body) {
    const e = body?.error || {};
    super(e.message || 'Something went wrong. Please try again.');
    this.status = status;
    this.code = e.code || 'error';
    this.fields = e.fields || {};
    this.existing = e.existing || null;
  }
}

export async function api(method, path, body) {
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(method !== 'GET' && csrf ? { 'X-CSRF-Token': csrf } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, { error: { code: 'network', message: 'Cannot reach the server. Check your internet connection - your data has NOT been lost, please try again.' } });
  }
  let json = null;
  try { json = await res.json(); } catch { /* empty / non-json */ }
  if (res.status === 401 && path !== '/auth/login' && path !== '/auth/me') {
    window.dispatchEvent(new Event('bea:unauthorized'));
  }
  if (!res.ok) throw new ApiError(res.status, json);
  return json;
}

export const get = (p) => api('GET', p);
export const post = (p, b = {}) => api('POST', p, b);
export const put = (p, b = {}) => api('PUT', p, b);

export function qs(params) {
  const s = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') s.set(k, v);
  });
  const out = s.toString();
  return out ? `?${out}` : '';
}

/** Same-origin download (CSV / backup) that keeps the login cookie. */
export const downloadUrl = (path) => `${BASE}${path}`;
