import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { motion } from 'motion/react';
import { ArrowLeft, Check, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useProfile } from '../context/ProfileContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { ProfileAvatar } from '../components/ProfileAvatar';
import {
  generateAvatarUrl,
  initialsFromDisplayName,
  normalizeAccentColorForApi,
} from '../../lib/profileDisplay';
import { cn } from '../components/ui/utils';

export function EditProfilePage() {
  const { profileId } = useParams<{ profileId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { profiles, updateProfile, removeProfile, accentPresets } = useProfile();
  const [name, setName] = useState('');
  const [initial, setInitial] = useState('');
  const [accentIndex, setAccentIndex] = useState(0);

  const profile = useMemo(
    () => profiles.find((p) => p.id === profileId) ?? null,
    [profiles, profileId]
  );

  const previewProfile = useMemo(() => {
    if (!profile) return null;
    const hex = accentPresets[accentIndex % accentPresets.length].hex;
    const display_name = name.trim() || profile.display_name;
    const seed = initial.trim() || initialsFromDisplayName(display_name);
    const accent_color = normalizeAccentColorForApi(hex);
    return {
      id: 'preview',
      display_name,
      avatar_url: generateAvatarUrl(seed, accent_color),
      accent_color,
    };
  }, [profile, name, initial, accentIndex, accentPresets]);

  useEffect(() => {
    if (!user) {
      navigate('/', { replace: true });
      return;
    }
    if (!profileId) {
      navigate('/profiles', { replace: true });
      return;
    }
    if (profile) {
      setName(profile.display_name);
      setInitial(initialsFromDisplayName(profile.display_name).slice(0, 2));
      const idx = accentPresets.findIndex(
        (a) =>
          normalizeAccentColorForApi(a.hex).toLowerCase() ===
          normalizeAccentColorForApi(profile.accent_color).toLowerCase()
      );
      setAccentIndex(idx >= 0 ? idx : 0);
    }
  }, [user, profileId, profile, navigate, accentPresets]);

  const handleBackToSelection = () => {
    navigate('/profiles');
  };

  const handleSave = async () => {
    if (!profileId || !profile) return;
    const dn = name.trim();
    if (!dn) return;
    try {
      await updateProfile(profileId, {
        display_name: dn,
        accentIndex,
        ...(initial.trim()
          ? { avatarSeed: initial.trim().toUpperCase().slice(0, 2) }
          : {}),
      });
      navigate('/profiles');
    } catch {
      /* surface via toast if needed */
    }
  };

  const handleDelete = async () => {
    if (!profileId || profiles.length <= 1) return;
    if (!confirm('Remove this profile?')) return;
    try {
      await removeProfile(profileId);
      navigate('/profiles');
    } catch {
      /* ignore */
    }
  };

  if (!user || !profileId) {
    return null;
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 px-4">
        <p className="text-muted-foreground">Profile not found.</p>
        <Button className="ml-4 rounded-xl" onClick={handleBackToSelection}>
          Back to profiles
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 px-4 py-8">
      <div className="max-w-md mx-auto">
        <button
          type="button"
          onClick={handleBackToSelection}
          className="mb-6 flex items-center gap-2 text-sm text-muted-foreground hover:text-blue-600 transition-colors rounded-xl px-3 py-2 -ml-1 hover:bg-white/60"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to profile selection
        </button>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/90 backdrop-blur-md rounded-3xl shadow-xl border border-white/80 p-8"
        >
          <h1 className="text-xl font-semibold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-6">
            Edit profile
          </h1>

          <div className="flex justify-center mb-8">
            {previewProfile && (
              <ProfileAvatar profile={previewProfile} sizeClass="w-28 h-28" />
            )}
          </div>

          <div className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="profile-name">Display name</Label>
              <Input
                id="profile-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="rounded-xl border-2"
                placeholder="Profile name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-initial">Initials (optional)</Label>
              <Input
                id="profile-initial"
                value={initial}
                onChange={(e) => setInitial(e.target.value.slice(0, 2))}
                className="rounded-xl border-2 max-w-[120px]"
                placeholder="AB"
                maxLength={2}
              />
              <p className="text-xs text-muted-foreground">
                Used for the generated avatar image (UI Avatars).
              </p>
            </div>

            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex flex-wrap gap-2">
                {accentPresets.map((preset, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setAccentIndex(i)}
                    className={cn(
                      'w-11 h-11 rounded-full bg-gradient-to-br flex items-center justify-center ring-2 ring-offset-2 ring-offset-white transition-transform hover:scale-105',
                      preset.accentFrom,
                      preset.accentTo,
                      accentIndex === i ? preset.ringClass : 'ring-transparent'
                    )}
                    aria-label={`Color ${i + 1}`}
                  >
                    {accentIndex === i && <Check className="w-5 h-5 text-white drop-shadow-md" />}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-8 space-y-3">
            <Button
              type="button"
              className="w-full rounded-2xl py-6 bg-gradient-to-r from-blue-500 to-purple-600"
              onClick={() => void handleSave()}
            >
              Save changes
            </Button>
            {profiles.length > 1 && (
              <Button
                type="button"
                variant="outline"
                className="w-full rounded-2xl border-red-200 text-red-600 hover:bg-red-50"
                onClick={() => void handleDelete()}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Remove profile
              </Button>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
