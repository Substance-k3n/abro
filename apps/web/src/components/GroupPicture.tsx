// A group's picture (roadmap Phase 4c): its photo when it has one
// (ADR-017), otherwise its type icon. Put it inside the existing tinted
// box, which needs `relative overflow-hidden` so the photo fills it; the
// icon stays underneath while the photo loads and if it fails (the photo
// removes itself).

import { GroupIcon } from '@abro/ui';

export function GroupPicture({
  photo,
  icon,
  size,
}: {
  photo: string | null;
  icon: string;
  size: number;
}) {
  return (
    <>
      <GroupIcon icon={icon} size={size} />
      {photo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={photo}
          src={photo}
          alt=""
          loading="lazy"
          decoding="async"
          onError={(e) => e.currentTarget.remove()}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
    </>
  );
}
