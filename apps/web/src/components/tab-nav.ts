// Moving between the bottom-bar tabs the way a phone app does, not the way
// a website does (trial feedback 2026-10-10: Back -- the Android edge swipe
// -- replayed every tab you had tapped). Tab switches don't pile up in the
// history: from Home a tab is pushed once, from one tab to another it is
// replaced, and going back to Home steps back instead of adding another
// Home. So Back from any tab lands on Home, and Back from Home leaves.
// Detail screens (a friend, a group) still push as normal.

import type { useRouter } from 'next/navigation';

import { BOTTOM_NAV_ITEMS } from './nav-items';

type Router = ReturnType<typeof useRouter>;

/** The swipeable tabs, left to right as the bottom bar shows them. Add
 * is a flow, not a tab, so swiping passes over it. */
export const SWIPE_TABS = BOTTOM_NAV_ITEMS.filter((item) => item.id !== 'add').map(
  (item) => item.href,
);

const HOME = '/home';
/** The tab whose history entry sits straight on top of Home, so going to
 * Home from it can step back instead of pushing. sessionStorage: one per
 * browser tab. Keyed by path, so a Back the app didn't see (the phone's
 * own gesture) can't make a later Home tap step back from somewhere else. */
const ABOVE_HOME_KEY = 'abro:tab-above-home';

function readAboveHome(): string | null {
  try {
    return sessionStorage.getItem(ABOVE_HOME_KEY);
  } catch {
    return null;
  }
}

function writeAboveHome(href: string | null): void {
  try {
    if (href) {
      sessionStorage.setItem(ABOVE_HOME_KEY, href);
    } else {
      sessionStorage.removeItem(ABOVE_HOME_KEY);
    }
  } catch {
    // Private mode etc.: going to Home just replaces.
  }
}

/** True when `pathname` is one of the tab screens itself (not a page
 * under it, like /friends/abc). */
export function isTabRoot(pathname: string): boolean {
  return SWIPE_TABS.includes(pathname);
}

/** Go to the tab at `href` from `pathname`. Returns false when it left
 * the navigation to the caller (a normal link push). */
export function goToTab(router: Router, pathname: string, href: string): boolean {
  if (pathname === href || !isTabRoot(pathname) || !isTabRoot(href)) {
    return false;
  }
  const aboveHome = readAboveHome();
  if (href === HOME) {
    writeAboveHome(null);
    if (aboveHome === pathname) {
      router.back();
    } else {
      router.replace(href);
    }
  } else if (pathname === HOME) {
    writeAboveHome(href);
    router.push(href);
  } else {
    if (aboveHome === pathname) {
      writeAboveHome(href);
    }
    router.replace(href);
  }
  return true;
}
