import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from 'react';
import {
  API_ROUTES,
  apiFetch,
  apiFetchPublic,
  getStoredToken,
  setStoredToken,
  unwrapApiPayload,
} from '../../config/api';

interface User {
  username: string;
  email: string;
  /** Display name from registration or profile. */
  name?: string;
}

interface AuthContextType {
  user: User | null;
  /** True while loading `/users/me` on startup (when a token exists). */
  isSessionLoading: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  register: (name: string, username: string, email: string, password: string) => Promise<boolean>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function readAccessToken(json: unknown): string | null {
  const payload = unwrapApiPayload(json) ?? (json as Record<string, unknown> | null);
  if (!payload) return null;
  const raw = payload.access_token ?? payload.token;
  if (raw == null || String(raw).trim() === '') return null;
  return String(raw);
}

function mapMePayload(data: Record<string, unknown>): User {
  const nameRaw = data.name ?? data.full_name;
  const name =
    nameRaw != null && String(nameRaw).trim() !== ''
      ? String(nameRaw).trim()
      : undefined;
  return {
    username: String(data.username ?? ''),
    email: String(data.email ?? ''),
    ...(name ? { name } : {}),
  };
}

async function fetchCurrentUser(): Promise<User | null> {
  const res = await apiFetch(API_ROUTES.me, { method: 'GET' });
  if (!res.ok) return null;
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return null;
  }
  const payload = unwrapApiPayload(json) ?? (json as Record<string, unknown> | null);
  if (!payload || typeof payload !== 'object') return null;
  return mapMePayload(payload as Record<string, unknown>);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isSessionLoading, setIsSessionLoading] = useState(() => Boolean(getStoredToken()));

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      setIsSessionLoading(false);
      return;
    }
    let cancelled = false;
    setIsSessionLoading(true);
    fetchCurrentUser()
      .then((me) => {
        if (cancelled) return;
        if (me) {
          setUser(me);
        } else {
          setStoredToken(null);
          setUser(null);
        }
      })
      .finally(() => {
        if (!cancelled) setIsSessionLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = async (usernameOrEmail: string, password: string) => {
    const res = await apiFetchPublic(API_ROUTES.login, {
      method: 'POST',
      body: JSON.stringify({
        username: usernameOrEmail,
        password,
      }),
    });
    if (!res.ok) {
      setStoredToken(null);
      return false;
    }
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      setStoredToken(null);
      return false;
    }
    const token = readAccessToken(json);
    if (!token) {
      setStoredToken(null);
      return false;
    }
    setStoredToken(token);

    const me = await fetchCurrentUser();
    if (me) {
      setUser(me);
      return true;
    }

    setUser({
      username: usernameOrEmail,
      email: usernameOrEmail.includes('@') ? usernameOrEmail : `${usernameOrEmail}@example.com`,
    });
    return true;
  };

  const register = async (name: string, username: string, email: string, password: string) => {
    const res = await apiFetchPublic(API_ROUTES.register, {
      method: 'POST',
      body: JSON.stringify({
        username,
        email,
        password,
        name,
      }),
    });
    if (!res.ok) {
      setStoredToken(null);
      return false;
    }
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      setStoredToken(null);
      return false;
    }
    const token = readAccessToken(json);
    if (!token) {
      setStoredToken(null);
      return false;
    }
    setStoredToken(token);

    const me = await fetchCurrentUser();
    if (me) {
      setUser(me);
      return true;
    }

    setUser({
      username,
      email,
      ...(name.trim() ? { name: name.trim() } : {}),
    });
    return true;
  };

  const logout = () => {
    setUser(null);
    setStoredToken(null);
  };

  return (
    <AuthContext.Provider
      value={{ user, isSessionLoading, login, register, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
