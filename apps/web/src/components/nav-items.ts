import { Clock, Home, type LucideIcon, Plus, User, Users } from 'lucide-react';

export interface NavItem {
  id: 'home' | 'activity' | 'add' | 'groups' | 'profile';
  label: string;
  href: string;
  icon: LucideIcon;
}

// "add" and "profile" route to screens later phases build (Phase 4/7 per
// docs/WIRING_PLAN.md) -- the nav is built now as shared infrastructure,
// same phased-landing pattern as every other cross-phase link.
export const NAV_ITEMS: NavItem[] = [
  { id: 'home', label: 'Home', href: '/home', icon: Home },
  { id: 'activity', label: 'Activity', href: '/activity', icon: Clock },
  { id: 'add', label: 'Add', href: '/expenses/new', icon: Plus },
  { id: 'groups', label: 'Groups', href: '/groups', icon: Users },
  { id: 'profile', label: 'Profile', href: '/profile', icon: User },
];
