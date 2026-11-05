'use client';

// One expense or payment as a row of a Panel (UI refresh): category in a
// soft square, title and sub line, the amount in calm owed/owe colours
// with when it happened under it. Replaces @abro/ui's ActivityItem card
// on the refreshed screens.

import { CategoryIcon } from '@abro/ui';

import type { ActivityDisplay } from '~/lib/expenses-api';

import { Amount, Row, Tile } from './refresh';

export function ActivityRow({ a, onClick }: { a: ActivityDisplay; onClick: () => void }) {
  const tone = a.dir === 'receive' ? 'owed' : a.dir === 'owe' ? 'owe' : 'plain';
  return (
    <Row
      onClick={onClick}
      leading={
        <Tile>
          <CategoryIcon label={a.category} size={18} />
        </Tile>
      }
      title={a.title}
      sub={a.sub}
      trailing={<Amount value={a.amount} tone={tone} />}
      trailingSub={a.time}
    />
  );
}
