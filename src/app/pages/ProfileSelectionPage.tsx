import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { motion } from 'motion/react';
import {
  BookOpen,
  Check,
  ChevronLeft,
  Loader2,
  LogOut,
  Pencil,
  Plus,
  Sparkles,
  User,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useProfile } from '../context/ProfileContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { ProfileAvatar } from '../components/ProfileAvatar';
import { presetForAccentColor } from '../../lib/profileAccents';
import { generateAvatarUrl, initialsFromDisplayName, normalizeAccentColorForApi } from '../../lib/profileDisplay';
import { cn } from '../components/ui/utils';

export function ProfileSelectionPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const {
    profiles,
    selectedProfileId,
    selectProfile,
    addProfile,
    profilesLoadError,
    profilesHydrated,
    accentPresets,
  } = useProfile();
  const [newName, setNewName] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [addAccentIndex, setAddAccentIndex] = useState(0);
  const [addError, setAddError] = useState<string | null>(null);

  const addFormPreview = useMemo(() => {
    const display_name = newName.trim() || `Profile ${profiles.length + 1}`;
    const hex = accentPresets[addAccentIndex % accentPresets.length].hex;
    const accent_color = normalizeAccentColorForApi(hex);
    return {
      id: 'add-preview',
      display_name,
      avatar_url: generateAvatarUrl(initialsFromDisplayName(display_name), accent_color),
      accent_color,
    };
  }, [newName, addAccentIndex, accentPresets, profiles.length]);

  useEffect(() => {
    if (!user) {
      navigate('/', { replace: true });
    }
  }, [user, navigate]);

  const handleSwitchAccount = () => {
    logout();
    navigate('/', { replace: true });
  };

  const handleEditProfile = () => {
    if (!selectedProfileId) return;
    navigate(`/profiles/${selectedProfileId}`);
  };

  const handleAddProfile = async () => {
    setAddError(null);
    const displayName = newName.trim() || `Profile ${profiles.length + 1}`;
    try {
      const created = await addProfile(displayName, addAccentIndex);
      selectProfile(created.id);
      setNewName('');
      setShowAdd(false);
      setAddAccentIndex((profiles.length + 1) % accentPresets.length);
    } catch (e) {
      setAddError(e instanceof Error ? e.message : 'Could not create profile');
    }
  };

  const handleContinue = () => {
    if (!selectedProfileId) return;
    navigate('/home');
  };

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 px-4 py-10">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-lg"
      >
        <button
          type="button"
          onClick={handleSwitchAccount}
          className="mb-6 flex items-center gap-2 text-sm text-muted-foreground hover:text-blue-600 transition-colors rounded-xl px-3 py-2 -ml-1 hover:bg-white/60"
        >
          <ChevronLeft className="w-4 h-4" />
          Switch account
        </button>

        <div className="bg-white/90 backdrop-blur-md rounded-3xl shadow-xl border border-white/80 p-8 sm:p-10">
          <div className="text-center mb-8">
            <motion.div
              className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-br from-blue-400 to-purple-500 rounded-2xl mb-4"
              whileHover={{ scale: 1.05 }}
            >
              <BookOpen className="w-7 h-7 text-white" />
            </motion.div>
            <h1 className="text-2xl sm:text-3xl font-semibold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-2">
              Who&apos;s learning?
            </h1>
            <p className="text-sm text-muted-foreground flex items-center justify-center gap-1">
              <Sparkles className="w-4 h-4 text-purple-400" />
              Choose a profile to continue to EPro
            </p>
            {profilesLoadError && (
              <p className="text-sm text-red-600 mt-2" role="alert">
                {profilesLoadError}
              </p>
            )}
          </div>

          <div className="flex flex-wrap justify-center gap-5 sm:gap-6 mb-8 min-h-[140px]">
            {!profilesHydrated && (
              <div className="flex w-full flex-col items-center justify-center gap-2 py-8 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin text-blue-500" aria-hidden />
                <p className="text-sm">Loading profiles…</p>
              </div>
            )}
            {profilesHydrated &&
              profiles.map((p, index) => {
              const preset = presetForAccentColor(p.accent_color);
              return (
              <motion.button
                key={p.id}
                type="button"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.06 }}
                whileHover={{ scale: 1.06 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => selectProfile(p.id)}
                className="flex flex-col items-center gap-2 group"
              >
                <div
                  className={cn(
                    'rounded-full ring-2 ring-offset-2 ring-offset-white/90 transition-all',
                    selectedProfileId === p.id ? preset.ringClass : 'ring-transparent',
                    'opacity-95 group-hover:opacity-100'
                  )}
                >
                  <ProfileAvatar
                    profile={p}
                    sizeClass="w-[88px] h-[88px] sm:w-24 sm:h-24"
                  />
                </div>
                <span
                  className={cn(
                    'text-xs sm:text-sm font-medium max-w-[100px] truncate',
                    selectedProfileId === p.id ? 'text-blue-700' : 'text-gray-600'
                  )}
                >
                  {p.display_name}
                </span>
              </motion.button>
            );
              })}

            {profilesHydrated && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: profiles.length * 0.06 }}
              className="flex flex-col items-center gap-2"
            >
              {showAdd ? (
                <div className="flex flex-col items-center gap-3 w-full max-w-[280px]">
                  <ProfileAvatar profile={addFormPreview} sizeClass="w-20 h-20" />
                  <div className="w-full space-y-1.5">
                    <Label htmlFor="add-profile-name" className="text-xs text-muted-foreground">
                      Display name
                    </Label>
                    <Input
                      id="add-profile-name"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="Display name"
                      className="h-9 rounded-xl text-sm text-center"
                      autoFocus
                      onKeyDown={(e) => e.key === 'Enter' && void handleAddProfile()}
                    />
                  </div>
                  <div className="w-full space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Color</Label>
                    <div className="flex flex-wrap justify-center gap-2">
                      {accentPresets.map((preset, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setAddAccentIndex(i)}
                          className={cn(
                            'w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br flex items-center justify-center ring-2 ring-offset-2 ring-offset-white/90 transition-transform hover:scale-105',
                            preset.accentFrom,
                            preset.accentTo,
                            addAccentIndex === i ? preset.ringClass : 'ring-transparent'
                          )}
                          aria-label={`Accent color ${i + 1}`}
                        >
                          {addAccentIndex === i && (
                            <Check className="w-4 h-4 text-white drop-shadow-md" aria-hidden />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                  {addError && (
                    <p className="text-xs text-red-600 text-center" role="alert">
                      {addError}
                    </p>
                  )}
                  <div className="flex gap-1 w-full">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="flex-1 rounded-lg text-xs"
                      onClick={() => {
                        setShowAdd(false);
                        setNewName('');
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="flex-1 rounded-lg text-xs bg-gradient-to-r from-blue-500 to-purple-600"
                      onClick={handleAddProfile}
                    >
                      Add
                    </Button>
                  </div>
                </div>
              ) : (
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.06 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    setAddAccentIndex(profiles.length % accentPresets.length);
                    setShowAdd(true);
                  }}
                  className="w-[88px] h-[88px] sm:w-24 sm:h-24 rounded-full border-2 border-dashed border-gray-300 bg-gray-50/80 flex items-center justify-center text-gray-500 hover:border-blue-300 hover:bg-blue-50/50 hover:text-blue-600 transition-colors"
                >
                  <Plus className="w-9 h-9" />
                </motion.button>
              )}
              {!showAdd && (
                <span className="text-xs sm:text-sm font-medium text-gray-500">Add profile</span>
              )}
            </motion.div>
            )}
          </div>

          <div className="space-y-3">
            <Button
              type="button"
              disabled={!selectedProfileId}
              onClick={handleContinue}
              className="w-full rounded-2xl py-6 text-base bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 shadow-lg"
            >
              <User className="w-4 h-4 mr-2" />
              Continue to EPro
            </Button>

            <Button
              type="button"
              variant="outline"
              disabled={!selectedProfileId}
              onClick={handleEditProfile}
              className="w-full rounded-2xl py-5 border-2 text-blue-700 hover:bg-blue-50"
            >
              <Pencil className="w-4 h-4 mr-2" />
              Edit profile
            </Button>

            <Button
              type="button"
              variant="ghost"
              onClick={handleSwitchAccount}
              className="w-full rounded-2xl text-muted-foreground hover:text-red-600 hover:bg-red-50"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Sign out
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
