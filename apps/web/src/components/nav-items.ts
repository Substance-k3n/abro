import { Clock, Home, type LucideIcon, Plus, User, UserRound, Users } from 'lucide-react';

export interface NavItem {
  id: 'home' | 'friends' | 'activity' | 'add' | 'groups' | 'profile';
  label: string;
  href: string;
  icon: LucideIcon;
}

const HOME: NavItem = { id: 'home', label: 'Home', href: '/home', icon: Home };
const FRIENDS: NavItem = { id: 'friends', label: 'Friends', href: '/friends', icon: UserRound };
const ACTIVITY: NavItem = { id: 'activity', label: 'Activity', href: '/activity', icon: Clock };
const ADD: NavItem = { id: 'add', label: 'Add', href: '/expenses/new', icon: Plus };
const GROUPS: NavItem = { id: 'groups', label: 'Groups', href: '/groups', icon: Users };
const PROFILE: NavItem = { id: 'profile', label: 'Profile', href: '/profile', icon: User };

/** Phone bottom bar: five slots with Add in the middle. Friends has a
 * slot so adding and finding friends is always one tap away; Profile is
 * reached from the avatar and settings icon in Home's header instead. */
export const BOTTOM_NAV_ITEMS: NavItem[] = [HOME, FRIENDS, ADD, GROUPS, ACTIVITY];

/** Desktop sidebar: room for everything, Profile included. */
export const SIDEBAR_NAV_ITEMS: NavItem[] = [HOME, FRIENDS, GROUPS, ACTIVITY, ADD, PROFILE];
