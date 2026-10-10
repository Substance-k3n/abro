'use client';

// New ekub (ADR-024): name, the amount per turn, weekly or monthly, and
// the turns in payout order. You start in turn 1 (move yourself if you
// like); each friend added gets a turn of their own or shares one, with
// parts that add up to the amount per turn. Friends are invited and the
// ekub starts once everyone has joined (from its own screen).

import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { AddToTurn, EkubTurns, type TurnShare, amountInput } from '~/components/EkubTurns';
import { ErrorState, LoadingState } from '~/components/LoadStates';
import { ApiError } from '~/lib/api-client';
import { me } from '~/lib/auth-api';
import { ekubMoney } from '~/lib/ekub-view';
import { type EkubCadence, createEkub } from '~/lib/ekubs-api';
import { parseAmount } from '~/lib/expense-split';
import { listFriends } from '~/lib/friends-api';

const IN_ETB = { currency: 'ETB' };

export default function NewEkubPage() {
  const router = useRouter();
  const [friends, setFriends] = useState<{ id: string; name: string }[] | null>(null);
  const [myId, setMyId] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [cadence, setCadence] = useState<EkubCadence>('MONTHLY');
  const [turns, setTurns] = useState<TurnShare[][]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoadError(null);
    Promise.all([me(), listFriends()])
      .then(([profile, list]) => {
        setMyId(profile.id);
        setTurns((t) =>
          t.length ? t : [[{ id: profile.id, name: profile.displayName, amount: '' }]],
        );
        setFriends(list.map((f) => ({ id: f.friend.id, name: f.friend.displayName })));
      })
      .catch((err) =>
        setLoadError(err instanceof ApiError ? err.message : 'Could not load your friends.'),
      );
  };
  useEffect(load, []);

  const slotAmount = parseAmount(amount);
  // Someone alone in a turn always puts in the whole amount.
  const shown = useMemo(
    () => turns.map((t) => (t.length === 1 ? [{ ...t[0]!, amount: amountInput(slotAmount) }] : t)),
    [turns, slotAmount],
  );
  const available = useMemo(() => {
    const used = new Set(turns.flat().map((s) => s.id));
    return (friends ?? []).filter((f) => !used.has(f.id));
  }, [turns, friends]);

  if (loadError) {
    return <ErrorState message={loadError} onRetry={load} />;
  }
  if (!friends) {
    return <LoadingState />;
  }

  const allAddUp = shown.every(
    (t) => t.reduce((sum, s) => sum + parseAmount(s.amount), 0n) === slotAmount,
  );
  const ready = name.trim() !== '' && slotAmount > 0n && shown.length >= 2 && allAddUp;

  const add = (personId: string, turn: number | null, part: string) => {
    const person = friends.find((f) => f.id === personId)!;
    const share = { id: person.id, name: person.name, amount: part };
    setTurns((list) =>
      turn === null
        ? [...list, [share]]
        : list.map((t, i) =>
            i === turn
              ? // The person already there keeps the rest of the turn.
                [
                  ...t.map((s) =>
                    t.length === 1
                      ? { ...s, amount: amountInput(slotAmount - parseAmount(part)) }
                      : s,
                  ),
                  share,
                ]
              : t,
          ),
    );
  };

  const remove = (share: TurnShare, turn: number) => {
    setTurns((list) =>
      list
        .map((t, i) => (i === turn ? t.filter((s) => s.id !== share.id) : t))
        .filter((t) => t.length > 0),
    );
  };

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const created = await createEkub({
        name: name.trim(),
        slotAmount,
        cadence,
        slots: shown.map((t, i) =>
          t.map((s) => ({
            id: s.id,
            amount: parseAmount(s.amount),
            // Taking a turn out can leave someone's joining round past
            // their (now earlier) turn.
            joinedRound: s.joinedRound && Math.min(s.joinedRound, i + 1),
          })),
        ),
      });
      router.replace(`/ekub/${created.id}`);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Could not create the ekub. Please try again.',
      );
      setSaving(false);
    }
  };

  return (
    <div className="fade-in px-5 py-6 md:mx-auto md:max-w-2xl md:px-8 md:py-8">
      <button
        onClick={() => router.back()}
        className="mb-4 flex items-center gap-1 text-[0.85rem] font-medium"
        style={{ color: 'var(--accent)' }}
      >
        <ArrowLeft size={16} strokeWidth={2} /> Back
      </button>
      <h2
        className="font-display mb-6 text-[1.5rem] font-extrabold tracking-tighter"
        style={{ color: 'var(--t-primary)' }}
      >
        New Ekub
      </h2>

      <div className="flex flex-col gap-5">
        <label className="flex flex-col gap-1.5">
          <span className="text-[0.8rem] font-semibold" style={{ color: 'var(--t-muted)' }}>
            Name
          </span>
          <input
            className="neo-input"
            placeholder="e.g. Office ekub"
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-[0.8rem] font-semibold" style={{ color: 'var(--t-muted)' }}>
              Amount per turn (ETB)
            </span>
            <input
              className="neo-input font-mono"
              inputMode="decimal"
              placeholder="40000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <span className="text-[0.72rem]" style={{ color: 'var(--t-dim)' }}>
              What one turn puts in each round. Two people can share a turn at half each.
            </span>
          </label>
          <div className="flex flex-col gap-1.5">
            <span className="text-[0.8rem] font-semibold" style={{ color: 'var(--t-muted)' }}>
              Rounds
            </span>
            <div className="neo-inset-sm flex gap-1 rounded-[14px] p-1">
              {(['WEEKLY', 'MONTHLY'] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCadence(c)}
                  className={`flex-1 rounded-xl py-2 text-[0.82rem] font-semibold ${cadence === c ? 'neo-raised-sm' : ''}`}
                  style={{ color: cadence === c ? 'var(--accent)' : 'var(--t-muted)' }}
                >
                  {c === 'WEEKLY' ? 'Weekly' : 'Monthly'}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2.5">
          <span className="text-[0.8rem] font-semibold" style={{ color: 'var(--t-muted)' }}>
            Turns, in the order they take the pot
          </span>
          <span className="text-[0.72rem]" style={{ color: 'var(--t-dim)' }}>
            Entering an ekub that&apos;s already running? Put the turns in the order they went, and
            for anyone who joined later set the round they joined in. You pick the real start day
            when you start it.
          </span>
          <EkubTurns
            turns={shown}
            onChange={setTurns}
            slotAmount={slotAmount}
            format={(a) => ekubMoney(a, IN_ETB)}
            editAmounts
            onRemove={remove}
            canRemove={(share) => share.id !== myId}
            highlightId={myId}
            editJoined
          />
          <AddToTurn
            people={available}
            turnCount={turns.length}
            slotAmount={slotAmount}
            allowShare
            onAdd={add}
          />
        </div>

        {error && (
          <p className="text-[0.85rem]" role="alert" style={{ color: 'var(--c-red)' }}>
            {error}
          </p>
        )}
        <button
          onClick={submit}
          disabled={!ready || saving}
          className="neo-btn-accent font-display rounded-2xl px-5 py-3.5 text-[0.95rem] font-semibold disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? 'Creating…' : 'Create and invite'}
        </button>
        {!ready && (
          <p className="text-center text-[0.75rem]" style={{ color: 'var(--t-dim)' }}>
            Needs a name, an amount, at least two turns, and every turn adding up.
          </p>
        )}
      </div>
    </div>
  );
}
