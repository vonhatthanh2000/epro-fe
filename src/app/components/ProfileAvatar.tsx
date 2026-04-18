import { useState } from 'react';
import type { LearningProfile } from '../context/ProfileContext';
import { initialsFromDisplayName } from '../../lib/profileDisplay';
import { presetForAccentColor } from '../../lib/profileAccents';
import { cn } from './ui/utils';

interface ProfileAvatarProps {
  profile: LearningProfile;
  sizeClass?: string;
  ringClassName?: string;
  fallbackTextClassName?: string;
}

export function ProfileAvatar({
  profile,
  sizeClass = 'w-24 h-24',
  ringClassName,
  fallbackTextClassName = 'text-2xl sm:text-3xl',
}: ProfileAvatarProps) {
  const [failed, setFailed] = useState(false);
  const preset = presetForAccentColor(profile.accent_color);
  const initial = initialsFromDisplayName(profile.display_name);

  if (failed || !profile.avatar_url) {
    return (
      <div
        className={cn(
          'rounded-full bg-gradient-to-br flex items-center justify-center text-white font-semibold shadow-lg shrink-0',
          sizeClass,
          preset.accentFrom,
          preset.accentTo,
          ringClassName
        )}
      >
        <span className={fallbackTextClassName}>{initial}</span>
      </div>
    );
  }

  return (
    <div className={cn('rounded-full overflow-hidden shadow-lg shrink-0 ring-offset-2 ring-offset-white/90', sizeClass, ringClassName)}>
      <img
        src={profile.avatar_url}
        alt=""
        className="h-full w-full object-cover"
        onError={() => setFailed(true)}
        loading="lazy"
        decoding="async"
      />
    </div>
  );
}
