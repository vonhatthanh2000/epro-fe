import { normalizeAccentColorForApi } from './profileDisplay';

export const ACCENT_PRESETS = [
  { hex: '#6366F1', accentFrom: 'from-indigo-500', accentTo: 'to-purple-600', ringClass: 'ring-2 ring-indigo-500' },
  { hex: '#EC4899', accentFrom: 'from-pink-400', accentTo: 'to-orange-400', ringClass: 'ring-2 ring-pink-500' },
  { hex: '#10B981', accentFrom: 'from-emerald-400', accentTo: 'to-cyan-500', ringClass: 'ring-2 ring-emerald-500' },
  { hex: '#A855F7', accentFrom: 'from-violet-400', accentTo: 'to-fuchsia-500', ringClass: 'ring-2 ring-violet-500' },
  { hex: '#F59E0B', accentFrom: 'from-amber-400', accentTo: 'to-rose-500', ringClass: 'ring-2 ring-amber-500' },
  { hex: '#0EA5E9', accentFrom: 'from-sky-400', accentTo: 'to-indigo-500', ringClass: 'ring-2 ring-sky-500' },
] as const;

export function presetForAccentColor(accentColor: string): (typeof ACCENT_PRESETS)[number] {
  const n = normalizeAccentColorForApi(accentColor).toLowerCase();
  return (
    ACCENT_PRESETS.find(
      (p) => normalizeAccentColorForApi(p.hex).toLowerCase() === n
    ) ?? ACCENT_PRESETS[0]
  );
}
