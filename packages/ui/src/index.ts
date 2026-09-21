// ABRO design system. Source: the Figma Make prototype at
// `~/Downloads/Design Ultra Modern UI (1)/src/App.tsx` -- a reference for
// visual/interaction design, not something imported wholesale. Pulled out
// one screen's reusable pieces at a time as apps/web builds them for real
// (docs/WIRING_PLAN.md); started in Phase 3 with the dashboard screens'
// shared financial/list primitives.

export { Avatar, type AvatarProps } from './Avatar';
export {
  MoneyDisplay,
  type MoneyDisplayProps,
  AmountBadge,
  type AmountBadgeProps,
  type AmountDirection,
} from './MoneyDisplay';
export { BalanceCard, type BalanceCardProps } from './BalanceCard';
export { ActivityItem, type ActivityItemProps } from './ActivityItem';
export { EmptyState, type EmptyStateProps } from './EmptyState';
export { CategoryIcon, GroupIcon } from './icons';
export { PersonRow, type PersonRowProps } from './PersonRow';
export { SectionLabel } from './SectionLabel';
export { BackButton } from './BackButton';
