'use client';

// Voice commands via Tezaz (@tezaz/react 0.4.0), re-integrated after
// ADR-030 cleared the old pilot wiring. One provider at the app's root,
// one ready-made widget (orb, captions, keyboard, confirmation; its look
// comes from the Tezaz console), and the actions below.
//
// Every capability calls something the app already does -- the router and
// the groups API -- with the visitor's own session. None of them writes or
// moves money, so none needs a confirmation; anything that does (recording
// a payment, saving an expense) must be registered with `dangerous: true`.

import { TezazProvider, TezazWidget, useCapability } from '@tezaz/react';
import { useRouter } from 'next/navigation';

import { listGroups } from '~/lib/groups-api';

// Dev public key: the project allows page tokens, so there's no token route
// on our API. Swap to `token` (from our backend) before this leaves dev.
const PUBLIC_KEY = 'tz_pub_dev_BDG99s4hbimnRqrY';

// Screens a visitor can ask for by name -> their route.
const PAGES = {
  home: '/home',
  friends: '/friends',
  groups: '/groups',
  activity: '/activity',
  payments: '/payments',
  notifications: '/notifications',
  search: '/search',
  ekub: '/ekub',
  profile: '/profile',
  settings: '/settings',
} as const;

export function VoiceProvider({ children }: { children: React.ReactNode }) {
  return (
    <TezazProvider
      relayUrl="wss://tezaz.onrender.com/v1/session"
      publicKey={PUBLIC_KEY}
      language="am-ET"
    >
      {children}
      <VoiceCapabilities />
      <TezazWidget project={PUBLIC_KEY} />
    </TezazProvider>
  );
}

/** A group whose name matches what was said, ignoring case and spaces. */
async function findGroup(name: string) {
  const want = name.trim().toLowerCase();
  const groups = await listGroups();
  return (
    groups.find((g) => g.name.trim().toLowerCase() === want) ??
    groups.find((g) => g.name.toLowerCase().includes(want))
  );
}

function VoiceCapabilities() {
  const router = useRouter();

  useCapability<{ page: keyof typeof PAGES }>({
    name: 'open_page',
    description:
      'Open one of the main screens of the app: home, friends, groups, activity, payments, notifications, search, ekub, profile or settings.',
    parameters: {
      type: 'object',
      properties: { page: { type: 'string', enum: Object.keys(PAGES) } },
      required: ['page'],
    },
    handler: ({ page }) => {
      router.push(PAGES[page]);
      return { opened: PAGES[page] };
    },
  });

  useCapability<{ group: string }>({
    name: 'open_group',
    description: 'Open one of my groups by its name, to see its expenses and balances.',
    parameters: {
      type: 'object',
      properties: { group: { type: 'string', description: 'The group name' } },
      required: ['group'],
    },
    handler: async ({ group }) => {
      const found = await findGroup(group);
      if (!found) {
        throw new Error(`No group called "${group}".`);
      }
      router.push(`/groups/${found.id}`);
      return { opened: found.name };
    },
  });

  // Opens the add-expense form; the visitor still fills it in and saves it
  // themselves, so nothing is recorded by voice.
  useCapability<{ group?: string }>({
    name: 'start_expense',
    description:
      'Start adding a new expense, optionally inside one of my groups. Opens the form; it is not saved until I save it.',
    parameters: {
      type: 'object',
      properties: {
        group: { type: 'string', description: 'Group name, if the expense is for a group' },
      },
    },
    handler: async ({ group }) => {
      if (!group) {
        router.push('/expenses/new');
        return { opened: 'new expense' };
      }
      const found = await findGroup(group);
      if (!found) {
        throw new Error(`No group called "${group}".`);
      }
      router.push(`/expenses/new?groupId=${found.id}`);
      return { opened: 'new expense', group: found.name };
    },
  });

  return null;
}
