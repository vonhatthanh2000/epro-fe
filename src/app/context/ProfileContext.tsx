import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from 'react';
import { useAuth } from './AuthContext';
import {
  API_ROUTES,
  apiFetch,
  getStoredToken,
  setStoredToken,
  profileDetailPath,
  unwrapApiPayload,
} from '../../config/api';
import {
  generateAvatarUrl,
  initialsFromDisplayName,
  normalizeAccentColorForApi,
} from '../../lib/profileDisplay';
import { ACCENT_PRESETS } from '../../lib/profileAccents';

export interface LearningProfile {
  id: string;
  display_name: string;
  avatar_url: string;
  accent_color: string;
}

function accountKeyFromUser(u: { username: string; email: string }): string {
  const k = u.username?.trim() || u.email?.trim();
  return k || 'account';
}

function storageKeySelected(accountKey: string) {
  return `epro_selected_profile_${encodeURIComponent(accountKey)}`;
}

function loadSelectedId(accountKey: string): string | null {
  try {
    return localStorage.getItem(storageKeySelected(accountKey));
  } catch {
    return null;
  }
}

function saveSelectedId(accountKey: string, id: string | null) {
  try {
    if (id) localStorage.setItem(storageKeySelected(accountKey), id);
    else localStorage.removeItem(storageKeySelected(accountKey));
  } catch {
    /* ignore */
  }
}

function mapApiProfile(o: Record<string, unknown>): LearningProfile {
  const id = String(o.id ?? o.profile_id ?? o.uuid ?? '').trim();
  const display_name =
    String(o.display_name ?? o.name ?? o.displayName ?? '').trim() || 'Profile';
  return {
    id,
    display_name,
    avatar_url: String(o.avatar_url ?? o.avatarUrl ?? ''),
    accent_color: normalizeAccentColorForApi(
      String(o.accent_color ?? o.accentColor ?? ACCENT_PRESETS[0].hex)
    ),
  };
}

/** Normalize common API shapes: top-level array, `items`, `profiles`, `results`, nested `data`. */
function extractProfileRows(json: unknown): unknown[] {
  if (Array.isArray(json)) return json;
  if (!json || typeof json !== 'object') return [];
  const root = unwrapApiPayload(json) ?? (json as Record<string, unknown>);
  if (Array.isArray(root)) return root;
  const o = root as Record<string, unknown>;
  const tryArray = (v: unknown): unknown[] | null => (Array.isArray(v) ? v : null);
  const direct =
    tryArray(o.items) ??
    tryArray(o.profiles) ??
    tryArray(o.results) ??
    tryArray(o.data);
  if (direct) return direct;
  const data = o.data;
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const inner = data as Record<string, unknown>;
    return (
      tryArray(inner.items) ??
      tryArray(inner.profiles) ??
      tryArray(inner.results) ??
      []
    );
  }
  return [];
}

async function fetchProfilesList(): Promise<LearningProfile[]> {
  const res = await apiFetch(API_ROUTES.profiles, { method: 'GET' });
  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(text || 'Invalid JSON from server');
  }
  if (!res.ok) {
    const msg =
      json && typeof json === 'object' && 'message' in json
        ? String((json as { message: unknown }).message)
        : text || res.statusText;
    throw new Error(msg);
  }
  const raw = extractProfileRows(json);
  return raw
    .filter((x): x is Record<string, unknown> => x != null && typeof x === 'object')
    .map((x) => mapApiProfile(x as Record<string, unknown>))
    .filter((p) => p.id.length > 0);
}

async function createProfileRequest(body: {
  display_name: string;
  avatar_url: string;
  accent_color: string;
}): Promise<LearningProfile> {
  const res = await apiFetch(API_ROUTES.profiles, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(text || 'Invalid JSON from server');
  }
  if (!res.ok) {
    const msg =
      json && typeof json === 'object' && 'message' in json
        ? String((json as { message: unknown }).message)
        : text || res.statusText;
    throw new Error(msg);
  }
  const payload = unwrapApiPayload(json) ?? (json as Record<string, unknown> | null);
  if (!payload) throw new Error('Empty response from server');
  return mapApiProfile(payload);
}

async function updateProfileRequest(
  id: string,
  body: { display_name: string; avatar_url: string; accent_color: string }
): Promise<LearningProfile> {
  const res = await apiFetch(profileDetailPath(id), {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(text || 'Invalid JSON from server');
  }
  if (!res.ok) {
    const msg =
      json && typeof json === 'object' && 'message' in json
        ? String((json as { message: unknown }).message)
        : text || res.statusText;
    throw new Error(msg);
  }
  const payload = unwrapApiPayload(json) ?? (json as Record<string, unknown> | null);
  if (!payload) throw new Error('Empty response from server');
  return mapApiProfile(payload);
}

async function deleteProfileRequest(id: string): Promise<void> {
  const res = await apiFetch(profileDetailPath(id), { method: 'DELETE' });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
}

async function switchProfileRequest(profileId: string): Promise<string | null> {
  const res = await apiFetch(API_ROUTES.switchProfile, {
    method: 'POST',
    body: JSON.stringify({ profile_id: profileId }),
  });
  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(text || 'Invalid JSON from server');
  }
  if (!res.ok) {
    const msg =
      json && typeof json === 'object' && 'message' in json
        ? String((json as { message: unknown }).message)
        : text || res.statusText;
    throw new Error(msg);
  }
  const payload = unwrapApiPayload(json) ?? (json as Record<string, unknown> | null);
  if (!payload) return null;
  // Return the new access token
  const token = payload.access_token ?? payload.token;
  return token ? String(token) : null;
}

interface ProfileContextType {
  profiles: LearningProfile[];
  selectedProfileId: string | null;
  selectedProfile: LearningProfile | null;
  profilesHydrated: boolean;
  profilesLoadError: string | null;
  selectProfile: (id: string) => void;
  addProfile: (
    displayName: string,
    accentIndex?: number,
    /** Optional 1–2 chars for UI Avatars; defaults from display name. */
    avatarSeed?: string
  ) => Promise<LearningProfile>;
  updateProfile: (
    id: string,
    updates: Partial<Pick<LearningProfile, 'display_name'>> & {
      accentIndex?: number;
      /** Optional 1–2 chars; used as the seed for UI Avatars when set. */
      avatarSeed?: string;
    }
  ) => Promise<void>;
  removeProfile: (id: string) => Promise<void>;
  accentPresets: typeof ACCENT_PRESETS;
  refreshProfiles: () => Promise<void>;
}

const ProfileContext = createContext<ProfileContextType | undefined>(undefined);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [profiles, setProfiles] = useState<LearningProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [profilesHydrated, setProfilesHydrated] = useState(false);
  const [profilesLoadError, setProfilesLoadError] = useState<string | null>(null);
  const profilesRef = useRef(profiles);
  profilesRef.current = profiles;

  const refreshProfiles = useCallback(async () => {
    if (!user || !getStoredToken()) return;
    const key = accountKeyFromUser(user);
    const list = await fetchProfilesList();
    setProfiles(list);
    const saved = loadSelectedId(key);
    const valid = saved && list.some((p) => p.id === saved);
    const sel = valid ? saved : list[0]?.id ?? null;
    setSelectedProfileId(sel);
    if (sel) {
      saveSelectedId(key, sel);
      // Call switch-profile to get a token scoped to this profile
      try {
        const newToken = await switchProfileRequest(sel);
        if (newToken) {
          setStoredToken(newToken);
        }
      } catch (e) {
        console.error('Failed to switch profile:', e);
      }
    }
  }, [user]);

  useEffect(() => {
    if (!user || !getStoredToken()) {
      setProfiles([]);
      setSelectedProfileId(null);
      setProfilesHydrated(false);
      setProfilesLoadError(null);
      return;
    }
    const accountKey = accountKeyFromUser(user);
    let cancelled = false;
    setProfilesHydrated(false);
    setProfilesLoadError(null);
    (async () => {
      try {
        const list = await fetchProfilesList();
        if (cancelled) return;
        setProfiles(list);
        const saved = loadSelectedId(accountKey);
        const valid = saved && list.some((p) => p.id === saved);
        const sel = valid ? saved : list[0]?.id ?? null;
        setSelectedProfileId(sel);
        if (sel) {
          saveSelectedId(accountKey, sel);
          // Call switch-profile to get a token scoped to this profile
          try {
            const newToken = await switchProfileRequest(sel);
            if (newToken) {
              setStoredToken(newToken);
            }
          } catch (e) {
            console.error('Failed to switch profile:', e);
          }
        }
      } catch (e) {
        if (!cancelled) {
          setProfiles([]);
          setProfilesLoadError(e instanceof Error ? e.message : 'Failed to load profiles');
        }
      } finally {
        if (!cancelled) setProfilesHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const selectProfile = useCallback(
    async (id: string) => {
      setSelectedProfileId(id);
      if (user) saveSelectedId(accountKeyFromUser(user), id);
      // Call switch-profile to get a new token scoped to this profile
      try {
        const newToken = await switchProfileRequest(id);
        if (newToken) {
          setStoredToken(newToken);
        }
      } catch (e) {
        console.error('Failed to switch profile:', e);
        // Still set the profile ID even if token switch fails
      }
    },
    [user]
  );

  const addProfile = useCallback(async (
    displayName: string,
    accentIndex?: number,
    avatarSeed?: string
  ) => {
    const trimmed = displayName.trim();
    if (!trimmed) {
      throw new Error('Display name is required.');
    }
    const idx =
      accentIndex != null && Number.isFinite(accentIndex)
        ? Math.floor(accentIndex) % ACCENT_PRESETS.length
        : profilesRef.current.length % ACCENT_PRESETS.length;
    const hex = ACCENT_PRESETS[idx].hex;
    const accent_color = normalizeAccentColorForApi(hex);
    const nameForAvatar =
      avatarSeed?.trim().slice(0, 2) || initialsFromDisplayName(trimmed);
    const created = await createProfileRequest({
      display_name: trimmed,
      avatar_url: generateAvatarUrl(nameForAvatar, accent_color),
      accent_color,
    });
    setProfiles((prev) => [...prev, created]);
    return created;
  }, []);

  const updateProfile = useCallback(
    async (
      id: string,
      updates: Partial<Pick<LearningProfile, 'display_name'>> & {
        accentIndex?: number;
        avatarSeed?: string;
      }
    ) => {
      const current = profilesRef.current.find((p) => p.id === id);
      if (!current) return;
      const display_name =
        updates.display_name != null ? updates.display_name.trim() : current.display_name;
      if (!display_name) {
        throw new Error('Display name is required.');
      }
      let accent_color = current.accent_color;
      if (updates.accentIndex != null) {
        accent_color = normalizeAccentColorForApi(
          ACCENT_PRESETS[updates.accentIndex % ACCENT_PRESETS.length].hex
        );
      }
      const nameForAvatar =
        updates.avatarSeed?.trim().slice(0, 2) ||
        initialsFromDisplayName(display_name);
      const avatar_url = generateAvatarUrl(nameForAvatar, accent_color);
      const updated = await updateProfileRequest(id, {
        display_name,
        avatar_url,
        accent_color,
      });
      setProfiles((prev) => prev.map((p) => (p.id === id ? updated : p)));
    },
    []
  );

  const removeProfile = useCallback(
    async (id: string) => {
      await deleteProfileRequest(id);
      const next = profilesRef.current.filter((p) => p.id !== id);
      const sel =
        selectedProfileId === id ? next[0]?.id ?? null : selectedProfileId;
      setProfiles(next);
      setSelectedProfileId(sel);
      if (user) saveSelectedId(accountKeyFromUser(user), sel);
    },
    [selectedProfileId, user]
  );

  const selectedProfile = useMemo(
    () => profiles.find((p) => p.id === selectedProfileId) ?? null,
    [profiles, selectedProfileId]
  );

  const value = useMemo(
    () => ({
      profiles,
      selectedProfileId,
      selectedProfile,
      profilesHydrated,
      profilesLoadError,
      selectProfile,
      addProfile,
      updateProfile,
      removeProfile,
      accentPresets: ACCENT_PRESETS,
      refreshProfiles,
    }),
    [
      profiles,
      selectedProfileId,
      selectedProfile,
      profilesHydrated,
      profilesLoadError,
      selectProfile,
      addProfile,
      updateProfile,
      removeProfile,
      refreshProfiles,
    ]
  );

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile() {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error('useProfile must be used within ProfileProvider');
  return ctx;
}
