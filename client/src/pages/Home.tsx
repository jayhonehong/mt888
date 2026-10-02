import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { beans } from '../lib/format';
import type { PlatformStats } from '../lib/types';
import { useAuth } from '../state/AuthContext';
import { useLive } from '../state/LiveContext';
import { EventCard } from '../components/EventCard';
import { BeanIcon, EmptyState, Icon, Panel, SectionHeader, SkeletonRows, StatTile } from '../components/ui';

function HeroStats({ stats }: { stats: PlatformStats | null }) {
  if (!stats) {
    return (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="skeleton h-[74px]" />
        ))}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <StatTile label="In play now" value={stats.liveEvents} hint="fixtures live" tone="down" />
      <StatTile label="Coming up" value={stats.upcomingEvents} hint="pre-match" />
      <StatTile label="Beans in wallets" value={beans(stats.beansInPlay)} hint="across all players" tone="gold" />
      <StatTile label="Slips placed" value={beans(stats.bets)} hint={`${beans(stats.beansStaked)} staked`} />
    </div>
  );
}

export function Home() {
  const { fixtures, loading, sports } = useLive();
  const { user } = useAuth();
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [sport, setSport] = useState<string>('all');

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      api
        .stats()
        .then((payload) => {
          if (!cancelled) setStats(payload);
        })
        .catch(() => undefined);
    void load();
    const timer = window.setInterval(load, 8000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const open = useMemo(() => fixtures.filter((fixture) => fixture.status !== 'finished'), [fixtures]);

  const filtered = useMemo(
    () => (sport === 'all' ? open : open.filter((fixture) => fixture.sport === sport)),
    [open, sport],
  );

  const live = filtered.filter((fixture) => fixture.status === 'live');
  const soon = filtered.filter((fixture) => fixture.status === 'upcoming');

  return (
    <div className="space-y-6">
      {/* ---------------------------------------------------------------- */}
      <Panel className="overflow-hidden">
        <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[1.35fr_1fr]">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-gold-500/30 bg-gold-500/[0.08] px-3 py-1">
              <BeanIcon className="h-3.5 w-3.5" />
              <span className="text-[10px] font-bold tracking-[0.18em] text-gold-400 uppercase">
                Play-money sportsbook simulator
              </span>
            </span>
            <h1 className="display mt-4 text-[40px] leading-[0.95] font-bold tracking-tight uppercase sm:text-[52px]">
              The board never
              <br />
              <span className="text-gold-500">stops moving.</span>
            </h1>
            <p className="mt-3 max-w-xl text-[13px] leading-relaxed text-mist-400">
              A live, high-density wagering terminal built for coursework. Prices drift every two seconds over a
              WebSocket feed, every stake is posted to a double-entry ledger, and every bean in your wallet is
              reconciled against its own transaction history.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              {user ? (
                <Link to="/wallet" className="btn btn-primary">
                  <BeanIcon className="h-3.5 w-3.5" />
                  Open your wallet
                </Link>
              ) : (
                <Link to="/register" className="btn btn-primary">
                  Claim 1,000 free beans
                </Link>
              )}
              <Link to="/sports" className="btn btn-ghost">
                Browse all sports
                <Icon name="chevronRight" className="h-3.5 w-3.5" />
              </Link>
            </div>
            <p className="mt-3 text-[11px] text-mist-500">
              No card, no deposit, no withdrawal — beans are seeded from the house faucet and stay in the simulation.
            </p>
          </div>

          <div className="flex flex-col justify-center gap-2">
            <HeroStats stats={stats} />
            {stats ? (
              <div className="panel-flat mt-1 px-3.5 py-3">
                <p className="label">House ledger</p>
                <ul className="mt-2 space-y-1.5">
                  {stats.ledger.map((account) => (
                    <li key={account.code} className="flex items-center justify-between text-[11px]">
                      <span className="truncate text-mist-400">{account.label}</span>
                      <span className="tnum ml-3 font-semibold text-mist-200">{beans(account.net)}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 border-t border-ink-800 pt-2 text-[10px] text-mist-500">
                  Every journal balances: total debits always equal total credits.
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </Panel>

      {/* ---------------------------------------------------------------- */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setSport('all')}
          className={`rounded-lg border px-3 py-1.5 text-[12px] font-semibold transition ${
            sport === 'all'
              ? 'border-gold-500/50 bg-gold-500/10 text-gold-400'
              : 'border-ink-700 bg-ink-850/60 text-mist-400 hover:border-ink-600 hover:text-mist-200'
          }`}
        >
          All sports
        </button>
        {sports.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setSport(item.key)}
            className={`rounded-lg border px-3 py-1.5 text-[12px] font-semibold transition ${
              sport === item.key
                ? 'border-gold-500/50 bg-gold-500/10 text-gold-400'
                : 'border-ink-700 bg-ink-850/60 text-mist-400 hover:border-ink-600 hover:text-mist-200'
            }`}
          >
            {item.name}
          </button>
        ))}
      </div>

      {/* ---------------------------------------------------------------- */}
      <section className="space-y-3">
        <SectionHeader
          title="In play"
          subtitle={`${live.length} fixture${live.length === 1 ? '' : 's'} updating live`}
          action={
            <Link to="/sports" className="btn btn-quiet text-[12px]">
              See all
              <Icon name="chevronRight" className="h-3.5 w-3.5" />
            </Link>
          }
        />
        {loading ? (
          <SkeletonRows rows={3} />
        ) : live.length === 0 ? (
          <Panel>
            <EmptyState
              icon={<Icon name="sports" className="h-7 w-7" />}
              title="Nothing in play right now"
              body="The simulator kicks off the next fixtures shortly. Pre-match markets below are already open."
            />
          </Panel>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
            {live.map((fixture) => (
              <EventCard key={fixture.id} fixture={fixture} markets={2} />
            ))}
          </div>
        )}
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="space-y-3">
        <SectionHeader title="Starting soon" subtitle={`${soon.length} pre-match fixture${soon.length === 1 ? '' : 's'} open for betting`} />
        {loading ? (
          <SkeletonRows rows={2} />
        ) : soon.length === 0 ? (
          <Panel>
            <EmptyState title="No pre-match fixtures" body="Check back in a moment — the slate is restocked automatically." />
          </Panel>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
            {soon.map((fixture) => (
              <EventCard key={fixture.id} fixture={fixture} markets={2} />
            ))}
          </div>
        )}
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="grid gap-3 lg:grid-cols-3">
        {[
          {
            icon: 'bolt',
            title: 'Live feed',
            body: 'A background engine advances every clock, drifts every price and pushes one compact patch per tick over a WebSocket. No polling, no page reloads.',
          },
          {
            icon: 'shield',
            title: 'Double-entry ledger',
            body: 'Stakes leave your wallet into an escrow account the moment a slip is accepted. Balances are derived from entries, never stored, so they cannot desync.',
          },
          {
            icon: 'lock',
            title: 'Play money by design',
            body: 'Beans come from a house faucet and stop there. There is no purchase flow, no payout rail and no third-party payment code anywhere in this project.',
          },
        ].map((item) => (
          <Panel key={item.title} className="p-4">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gold-500/10 text-gold-500">
              <Icon name={item.icon} className="h-4 w-4" />
            </span>
            <h3 className="display mt-3 text-[17px] font-bold tracking-wide uppercase">{item.title}</h3>
            <p className="mt-1.5 text-[12px] leading-relaxed text-mist-400">{item.body}</p>
          </Panel>
        ))}
      </section>
    </div>
  );
}
