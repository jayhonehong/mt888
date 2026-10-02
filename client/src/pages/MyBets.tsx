import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, DeltaAmount, EmptyState, Icon, Panel, SectionHeader, SkeletonRows, StatTile } from '../components/ui';
import { api } from '../lib/api';
import { beans, odds as formatOdds, relativeFromNow } from '../lib/format';
import type { Bet, BetLeg, BetStats } from '../lib/types';
import { useLive } from '../state/LiveContext';

type Tab = 'open' | 'settled';

const LEG_TONE: Record<string, string> = {
  pending: 'text-mist-400',
  won: 'text-up-400',
  lost: 'text-down-400',
  void: 'text-mist-500',
};

function LegRow({ leg }: { leg: BetLeg }) {
  return (
    <div className="flex items-center gap-3 border-t border-ink-800 px-3 py-2 first:border-t-0">
      <span
        className={`mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full ${
          leg.result === 'won'
            ? 'bg-up-400'
            : leg.result === 'lost'
              ? 'bg-down-400'
              : leg.result === 'void'
                ? 'bg-mist-500'
                : 'bg-gold-500'
        }`}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12px] font-semibold text-mist-100">{leg.selectionName}</p>
        <p className="truncate text-[11px] text-mist-500">
          {leg.marketName} · {leg.eventLabel}
        </p>
      </div>
      <span className="tnum shrink-0 text-[12px] font-semibold text-mist-300">{formatOdds(leg.odds)}</span>
      <span className={`w-12 shrink-0 text-right text-[10px] font-bold uppercase ${LEG_TONE[leg.result]}`}>
        {leg.result === 'pending' ? 'open' : leg.result}
      </span>
    </div>
  );
}

function BetCard({ bet }: { bet: Bet }) {
  const statusTone = bet.status === 'won' ? 'up' : bet.status === 'lost' ? 'down' : bet.status === 'void' ? 'neutral' : 'gold';
  return (
    <Panel className="overflow-hidden">
      <header className="flex flex-wrap items-center gap-2 px-3 py-2.5">
        <span className="tnum text-[11px] font-semibold text-mist-400">{bet.ref}</span>
        <Badge tone={statusTone}>{bet.status}</Badge>
        <span className="text-[11px] text-mist-500">{relativeFromNow(bet.placedAt)}</span>
        <span className="ml-auto flex items-center gap-3 text-[11px]">
          <span className="text-mist-500">
            Stake <span className="tnum font-semibold text-mist-200">{beans(bet.stake)}</span>
          </span>
          <span className="text-mist-500">
            Odds <span className="tnum font-semibold text-mist-200">{formatOdds(bet.combinedOdds)}</span>
          </span>
          <span className="text-mist-500">
            {bet.status === 'open' ? 'Returns' : 'Paid'}{' '}
            <span className="tnum font-semibold text-gold-400">
              {beans(bet.status === 'open' ? bet.potentialPayout : bet.payout)}
            </span>
          </span>
        </span>
      </header>
      <div>
        {bet.legs.map((leg) => (
          <LegRow key={leg.id} leg={leg} />
        ))}
      </div>
      {bet.status !== 'open' ? (
        <footer className="flex items-center justify-between border-t border-ink-800 bg-ink-950/40 px-3 py-2">
          <span className="text-[11px] text-mist-500">
            {bet.settledAt ? `Settled ${relativeFromNow(bet.settledAt)}` : 'Settled'}
          </span>
          <DeltaAmount value={bet.status === 'lost' ? -bet.stake : bet.payout - bet.stake} className="text-[13px]" />
        </footer>
      ) : null}
    </Panel>
  );
}

export function MyBets() {
  const { betsVersion } = useLive();
  const [bets, setBets] = useState<Bet[]>([]);
  const [stats, setStats] = useState<BetStats | null>(null);
  const [tab, setTab] = useState<Tab>('open');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api
      .bets()
      .then((payload) => {
        if (cancelled) return;
        setBets(payload.bets);
        setStats(payload.stats);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [betsVersion]);

  const open = useMemo(() => bets.filter((bet) => bet.status === 'open'), [bets]);
  const settled = useMemo(() => bets.filter((bet) => bet.status !== 'open'), [bets]);
  const shown = tab === 'open' ? open : settled;

  return (
    <div className="space-y-5">
      <SectionHeader
        title="My bets"
        subtitle="Every slip you have placed, with each leg graded by the settlement engine."
        action={
          <Link to="/sports" className="btn btn-ghost">
            <Icon name="plus" className="h-3.5 w-3.5" />
            New slip
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile label="At risk" value={beans(stats?.atRisk ?? 0)} hint={`${stats?.open ?? 0} open slips`} tone="gold" />
        <StatTile label="Won" value={stats?.won ?? 0} hint={`${stats?.strikeRate ?? 0}% strike rate`} tone="up" />
        <StatTile label="Lost" value={stats?.lost ?? 0} hint={`${stats?.total ?? 0} slips total`} tone="down" />
        <StatTile
          label="Net beans"
          value={<DeltaAmount value={stats?.net ?? 0} />}
          hint="won minus lost"
          tone={(stats?.net ?? 0) >= 0 ? 'up' : 'down'}
        />
      </div>

      <div className="flex gap-1.5">
        {(['open', 'settled'] as Tab[]).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={`rounded-lg border px-3 py-1.5 text-[12px] font-semibold capitalize transition ${
              tab === value
                ? 'border-gold-500/50 bg-gold-500/10 text-gold-400'
                : 'border-ink-700 bg-ink-850/60 text-mist-400 hover:border-ink-600 hover:text-mist-200'
            }`}
          >
            {value} {value === 'open' ? `(${open.length})` : `(${settled.length})`}
          </button>
        ))}
      </div>

      {loading ? (
        <SkeletonRows rows={3} />
      ) : shown.length === 0 ? (
        <Panel>
          <EmptyState
            icon={<Icon name="ticket" className="h-7 w-7" />}
            title={tab === 'open' ? 'No slips in play' : 'No settled slips yet'}
            body={
              tab === 'open'
                ? 'Add a selection from the live board and your slip will appear here the moment it is accepted.'
                : 'Once a fixture you backed reaches full time, the result shows up here with a full leg-by-leg breakdown.'
            }
            action={
              <Link to="/" className="btn btn-primary">
                Go to the live board
              </Link>
            }
          />
        </Panel>
      ) : (
        <div className="space-y-3">
          {shown.map((bet) => (
            <BetCard key={bet.id} bet={bet} />
          ))}
        </div>
      )}
    </div>
  );
}
