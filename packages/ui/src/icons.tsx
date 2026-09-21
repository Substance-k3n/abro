import {
  ArrowUpRight,
  Briefcase,
  CheckCircle2,
  Film,
  Heart,
  Home,
  type LucideIcon,
  Package,
  Plane,
  ShoppingCart,
  Users,
  Utensils,
  Wallet,
  Zap,
} from 'lucide-react';

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  Food: Utensils,
  Coffee: Utensils,
  Transport: ArrowUpRight,
  Groceries: ShoppingCart,
  Rent: Home,
  Utilities: Zap,
  Entertainment: Film,
  Travel: Plane,
  Other: Package,
  Settlement: CheckCircle2,
};

/** Ported from the prototype's CategoryIcon lookup (App.tsx). */
export function CategoryIcon({ label, size = 14 }: { label: string; size?: number }) {
  const Icon = CATEGORY_ICONS[label] ?? Package;
  return <Icon size={size} strokeWidth={2} />;
}

const GROUP_ICONS: Record<string, LucideIcon> = {
  '👫': Users,
  '✈️': Plane,
  '🏠': Home,
  '🍽️': Utensils,
  '🛒': ShoppingCart,
  '💸': Wallet,
  '👨‍👩‍👧': Heart,
  '💼': Briefcase,
};

/** Ported from the prototype's GroupIcon lookup (App.tsx). */
export function GroupIcon({ icon, size = 22 }: { icon: string; size?: number }) {
  const Icon = GROUP_ICONS[icon] ?? Users;
  return <Icon size={size} strokeWidth={1.75} />;
}
