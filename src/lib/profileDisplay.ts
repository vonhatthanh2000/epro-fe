/** 1–2 character initials for fallbacks when the avatar image fails to load. */
export function initialsFromDisplayName(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Normalizes accent to `#RRGGBB` for API payloads and comparisons.
 */
export function normalizeAccentColorForApi(accent: string): string {
  let h = accent.trim();
  if (!h.startsWith('#')) {
    h = `#${h}`;
  }
  if (h.length === 4) {
    const r = h[1];
    const g = h[2];
    const b = h[3];
    h = `#${r}${r}${g}${g}${b}${b}`;
  }
  if (h.length !== 7) {
    return '#6366F1';
  }
  return h.toUpperCase();
}

/**
 * Builds a stable avatar image URL (PNG) from the display name and accent color.
 * Uses [UI Avatars](https://ui-avatars.com/) — no server upload; safe to send as `avatar_url` to your API.
 */
export function generateAvatarUrl(displayName: string, accentColor: string): string {
  const name = displayName.trim() || 'User';
  const bg = normalizeAccentColorForApi(accentColor).replace('#', '');
  const params = new URLSearchParams({
    name,
    size: '256',
    background: bg,
    color: 'ffffff',
    bold: 'true',
    format: 'png',
    rounded: 'true',
  });
  return `https://ui-avatars.com/api/?${params.toString()}`;
}
