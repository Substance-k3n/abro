import { Avatar } from './Avatar';

export interface PersonRowProps {
  initials: string;
  color: string;
  /** Profile photo URL, already absolute; initials are the fallback. */
  photo?: string | null;
  name: string;
  sub?: string;
  right?: React.ReactNode;
  onClick?: () => void;
}

/** A tappable person row: avatar, name, optional subtitle, optional
 * trailing content (amount badge, status pill, chevron...). Ported from
 * the prototype's PersonRow (App.tsx) — used across friends/search lists. */
export function PersonRow({ initials, color, photo, name, sub, right, onClick }: PersonRowProps) {
  return (
    <button
      onClick={onClick}
      className="neo-raised-sm flex w-full items-center gap-3 rounded-[18px] border-none px-3.5 py-[13px] text-left"
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      <Avatar initials={initials} color={color} size={44} src={photo} />
      <div className="min-w-0 flex-1">
        <p className="mb-0.5 text-[0.9rem] font-semibold" style={{ color: 'var(--t-primary)' }}>
          {name}
        </p>
        {sub && (
          <p
            className="overflow-hidden text-ellipsis whitespace-nowrap text-[0.74rem]"
            style={{ color: 'var(--t-dim)' }}
          >
            {sub}
          </p>
        )}
      </div>
      {right}
    </button>
  );
}
