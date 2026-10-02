import { useCallback, useEffect, useState } from 'react';
import { Avatar, Badge, BeanIcon, EmptyState, Icon, Panel, SectionHeader, SkeletonRows, StatTile } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { beans, relativeFromNow } from '../lib/format';
import type { PlatformStats } from '../lib/types';
import { useLive } from '../state/LiveContext';
import { useToast } from '../state/ToastContext';

type Overview = Awaited<ReturnType<typeof api.adminOverview>>;

export function Admin() {
  const { fixtures } = useLive();
  const { push } = useToast();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [grantUser, setGrantUser] = useState('');
  const [grantAmount, setGrantAmount] = useState('1000');
  const [grantMemo, setGrantMemo] = useState('Admin bean grant');
  const [granting, setGranting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [overviewPayload, statsPayload] = await Promise.all([api.adminOverview(), api.stats()]);
      setOverview(overviewPayload);
      setStats(statsPayload);
    } catch {
      /* guard handles redirects */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createFixture(sportKey: string, live: boolean) {
    try {
      await api.adminCreateEvent({ sportKey, live, startsInMinutes: live ? 0 : 12 });
      push({ title: 'Fixture created', body: `A new ${sportKey} fixture is on the board.`, tone: 'win' });
      await load();
    } catch (error) {
      push({ title: 'Could not create fixture', body: error instanceof ApiError ? error.message : '', tone: 'loss' });
    }
  }

  async function act(id: number, kind: 'finish' | 'void') {
    setBusyId(id);
    try {
      const payload = kind === 'finish' ? await api.adminFinishEvent(id) : await api.adminVoidEvent(id);
      push({
        title: kind === 'finish' ? 'Fixture settled' : 'Fixture voided',
        body: `${payload.settled} slip${payload.settled === 1 ? '' : 's'} settled.`,
        tone: 'info',
      });
      await load();
    } catch (error) {
      push({ title: 'Action failed', body: error instanceof ApiError ? error.message : '', tone: 'loss' });
    } finally {
      setBusyId(null);
    }
  }

  async function grant() {
    setGranting(true);
    try {
      const payload = await api.adminGrantBeans({ username: grantUser, amount: Number(grantAmount), memo: grantMemo });
      push({ title: 'Beans granted', body: `${beans(payload.granted)} beans added to ${payload.username}. New balance: ${beans(payload.balance)}.`, tone: 'win' });
      setGrantUser('');
      await load();
    } catch (error) {
      push({ title: 'Grant failed', body: error instanceof ApiError ? error.message : 'Check the account and amount.', tone: 'loss' });
    } finally {
      setGranting(false);
    }
  }

  const liveFixtures = fixtures.filter((fixture) => fixture.status === 'live');
  const upcoming = fixtures.filter((fixture) => fixture.status === 'upcoming');

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Admin console"
        subtitle="Operate the simulation: inspect accounts, read the house ledger, and settle fixtures by hand."
        action={
          <button type="button" onClick={() => void load()} className="btn btn-ghost">
            <Icon name="refresh" className="h-3.5 w-3.5" />
            Refresh
          </button>
        }
      />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile label="Accounts" value={overview?.users.length ?? '—'} hint="registered" />
        <StatTile label="Beans in wallets" value={beans(stats?.beansInPlay ?? 0)} tone="gold" />
        <StatTile label="Slips placed" value={beans(stats?.bets ?? 0)} hint={`${beans(stats?.beansStaked ?? 0)} staked`} />
        <StatTile label="Live now" value={liveFixtures.length} hint={`${upcoming.length} pre-match`} tone="down" />
      </div>

      {loading ? (
        <SkeletonRows rows={4} />
      ) : !overview ? (
        <Panel>
          <EmptyState title="Could not load the console" body="Refresh the page to try again." />
        </Panel>
      ) : (
        <>
          <section className="space-y-3">
            <SectionHeader
              title="House ledger"
              subtitle="System accounts, derived from the entries table on every read"
              action={
                stats ? (
                  <span className="flex items-center gap-2">
                    <Badge tone={stats.ledgerBalanced ? 'up' : 'down'}>
                      {stats.ledgerBalanced ? 'reconciled' : 'out of balance'}
                    </Badge>
                    <span className="text-[11px] text-mist-500">
                      {beans(stats.beansIssued)} issued = {beans(stats.beansInPlay)} in wallets +{' '}
                      {beans(stats.beansInEscrow)} in escrow + {beans(stats.beansRaked)} raked
                    </span>
                  </span>
                ) : null
              }
            />
            <div className="grid gap-3 sm:grid-cols-3">
              {overview.house.accounts.map((account) => (
                <Panel key={account.code} className="p-4">
                  <p className="label">{account.kind}</p>
                  <p className="mt-1.5 flex items-center gap-1.5">
                    <BeanIcon className="h-4 w-4" />
                    <span className="display tnum text-[24px] leading-none font-bold text-gold-400">
                      {beans(account.net)}
                    </span>
                  </p>
                  <p className="mt-1.5 text-[11px] text-mist-500">{account.label}</p>
                </Panel>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <SectionHeader
              title="Generate fixtures"
              subtitle="Each button builds a full market set with opening prices from the pricing model"
            />
            <Panel className="flex flex-wrap gap-2 p-3">
              {overview.sports.map((sport) => (
                <div key={sport.key} className="flex items-center gap-1.5 rounded-lg border border-ink-700 bg-ink-850/60 p-1.5">
                  <span className="px-2 text-[12px] font-semibold text-mist-200">{sport.name}</span>
                  <button type="button" onClick={() => createFixture(sport.key, false)} className="btn btn-quiet px-2 py-1 text-[11px]">
                    Pre-match
                  </button>
                  <button type="button" onClick={() => createFixture(sport.key, true)} className="btn btn-quiet px-2 py-1 text-[11px]">
                    Kick off
                  </button>
                </div>
              ))}
            </Panel>
          </section>

          <section className="space-y-3">
            <SectionHeader title="Give Gold Beans" subtitle="Admin-only faucet: grant fictional beans to any registered account." />
            <Panel className="grid gap-3 p-4 sm:grid-cols-[1fr_1fr_1.4fr_auto] sm:items-end">
              <div><label className="label">Username or email</label><input value={grantUser} onChange={(event) => setGrantUser(event.target.value)} className="input mt-2 w-full" placeholder="player name" /></div>
              <div><label className="label">Amount</label><input type="number" min={1} step={1} value={grantAmount} onChange={(event) => setGrantAmount(event.target.value)} className="input mt-2 w-full" /></div>
              <div><label className="label">Ledger memo</label><input value={grantMemo} onChange={(event) => setGrantMemo(event.target.value)} className="input mt-2 w-full" /></div>
              <button type="button" disabled={granting || !grantUser || Number(grantAmount) <= 0} onClick={() => void grant()} className="btn btn-primary"><BeanIcon className="h-3.5 w-3.5" />{granting ? 'Giving…' : 'Give beans'}</button>
            </Panel>
          </section>

          <section className="space-y-3">
            <SectionHeader title="Fixtures in play" subtitle="Settle early to watch the ledger post a payout" />
            <Panel className="overflow-hidden">
              {liveFixtures.length === 0 ? (
                <EmptyState title="Nothing in play" body="Kick off a fixture above, or wait for the simulator to start one." />
              ) : (
                <div className="divide-y divide-ink-800">
                  {liveFixtures.map((fixture) => (
                    <div key={fixture.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] font-semibold text-mist-100">
                          {fixture.home.name} {fixture.home.score} : {fixture.away.score} {fixture.away.name}
                        </span>
                        <span className="text-[11px] text-mist-500">
                          {fixture.league} · {fixture.clockLabel} · {fixture.period}
                        </span>
                      </span>
                      <Badge tone="down">live</Badge>
                      <button
                        type="button"
                        disabled={busyId === fixture.id}
                        onClick={() => act(fixture.id, 'finish')}
                        className="btn btn-ghost px-2.5 py-1.5 text-[11px]"
                      >
                        <Icon name="check" className="h-3.5 w-3.5" />
                        Settle
                      </button>
                      <button
                        type="button"
                        disabled={busyId === fixture.id}
                        onClick={() => act(fixture.id, 'void')}
                        className="btn btn-quiet px-2.5 py-1.5 text-[11px]"
                      >
                        Void & refund
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </section>

          <section className="space-y-3">
            <SectionHeader title="Accounts" subtitle="Balances read live from each wallet account" />
            <Panel className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] text-left">
                  <thead>
                    <tr className="border-b border-ink-700">
                      <th className="label px-3 py-2.5 font-semibold">Player</th>
                      <th className="label px-3 py-2.5 font-semibold">Email</th>
                      <th className="label px-3 py-2.5 font-semibold">Role</th>
                      <th className="label px-3 py-2.5 text-right font-semibold">Balance</th>
                      <th className="label px-3 py-2.5 text-right font-semibold">Last seen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.users.map((user) => (
                      <tr key={user.id} className="border-b border-ink-800/70 last:border-0 hover:bg-ink-800/30">
                        <td className="px-3 py-2.5">
                          <span className="flex items-center gap-2.5">
                            <Avatar name={user.username} hue={user.avatarHue} size={26} />
                            <span className="text-[12.5px] font-semibold text-mist-100">{user.username}</span>
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-[11.5px] text-mist-400">{user.email}</td>
                        <td className="px-3 py-2.5">
                          <Badge tone={user.role === 'admin' ? 'gold' : 'info'}>{user.role}</Badge>
                        </td>
                        <td className="tnum px-3 py-2.5 text-right text-[12.5px] font-semibold text-gold-400">
                          {beans(user.balance)}
                        </td>
                        <td className="px-3 py-2.5 text-right text-[11px] text-mist-500">
                          {user.last_login_at ? relativeFromNow(user.last_login_at) : 'never'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          </section>
        </>
      )}
    </div>
  );
}
