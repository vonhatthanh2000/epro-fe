/**
 * Backend routes relative to VITE_API_BASE_URL. Adjust to match your API.
 */
export const API_ROUTES = {
  login: '/auth/login',
  register: '/auth/register',
  correctSentence: '/sentence/correct',
  gradeWriting: '/writing/grade',
} as const;

function trimTrailingSlashes(url: string): string {
  return url.replace(/\/+$/, '');
}

/**
 * Base URL from env. Empty string means same-origin (e.g. Vite proxy or static hosting).
 */
export function getApiBaseUrl(): string {
  const raw = import.meta.env.VITE_API_BASE_URL;
  if (typeof raw !== 'string') return '';
  return trimTrailingSlashes(raw.trim());
}

/**
 * Absolute URL for an API path. `path` should start with /.
 */
export function apiUrl(path: string): string {
  const base = getApiBaseUrl();
  const p = path.startsWith('/') ? path : `/${path}`;
  return base ? `${base}${p}` : p;
}

/** localStorage key for the JWT / access token from login & register. */
const TOKEN_KEY = 'access_token';

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

/** If the API wraps data in `{ data: ... }`, return the inner object. */
export function unwrapApiPayload(json: unknown): Record<string, unknown> | null {
  if (!json || typeof json !== 'object') return null;
  const o = json as Record<string, unknown>;
  if (o.data != null && typeof o.data === 'object') {
    return o.data as Record<string, unknown>;
  }
  return o;
}

function buildJsonHeaders(init: RequestInit): Headers {
  const headers = new Headers(init.headers);
  if (
    init.body != null &&
    !(init.body instanceof FormData) &&
    !headers.has('Content-Type')
  ) {
    headers.set('Content-Type', 'application/json');
  }
  return headers;
}

/** Login / register: no `Authorization` header (avoids sending a stale token). */
export async function apiFetchPublic(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = buildJsonHeaders(init);
  return fetch(apiUrl(path), { ...init, headers });
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = buildJsonHeaders(init);
  const token = getStoredToken();
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return fetch(apiUrl(path), { ...init, headers });
}
