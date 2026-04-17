import React, { createContext, useContext, useState, ReactNode } from 'react';
import {
  API_ROUTES,
  apiFetchPublic,
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

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

    const payload = unwrapApiPayload(json) ?? (json as Record<string, unknown>);
    const userObj = payload.user;
    if (userObj && typeof userObj === 'object') {
      const u = userObj as Record<string, unknown>;
      const displayName = u.name ?? u.full_name;
      setUser({
        username: String(u.username ?? usernameOrEmail),
        email: String(u.email ?? (usernameOrEmail.includes('@') ? usernameOrEmail : `${usernameOrEmail}@example.com`)),
        ...(displayName != null && String(displayName) !== ''
          ? { name: String(displayName) }
          : {}),
      });
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

    const payload = unwrapApiPayload(json) ?? (json as Record<string, unknown>);
    const userObj = payload.user;
    if (userObj && typeof userObj === 'object') {
      const u = userObj as Record<string, unknown>;
      const resolvedName = u.name ?? u.full_name ?? name;
      setUser({
        username: String(u.username ?? username),
        email: String(u.email ?? email),
        ...(resolvedName ? { name: String(resolvedName) } : {}),
      });
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
    <AuthContext.Provider value={{ user, login, register, logout }}>
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
