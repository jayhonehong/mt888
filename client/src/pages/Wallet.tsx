import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, BeanAmount, BeanIcon, DeltaAmount, EmptyState, Icon, Panel, SectionHeader, SkeletonRows, Spinner, StatTile } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { beans, countdown, shortDateTime } from '../lib/format';
import type { WalletState } from '../lib/types';
import { useAuth } from '../state/AuthContext';
import { useLive } from '../state/LiveContext';
import { useToast } from '../state/ToastContext';

const REF_LABELS: Record<string, string> = {
  signup_bonus: 'Welcome bonus',
  daily_drop: 'Free drop',
  bet_stake: 'Stake placed',
  bet_won: 'Slip won',
  bet_lost: 'Slip lost',
  bet_refund: 'Slip voided',
};

export function Wallet() {
  const { balance, setBalance } = useAuth();
  const { betsVersion } = useLive();
  const { push } = useToast();
  const [state, setState] = useState<WalletState | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    try {
      const payload = await api.wallet();
      setState(payload);
      setBalance(payload.balance);
    } catch {
      /* handled by the guard */
    } finally {
      setLoading(false);
    }
  }, [setBalance]);

  useEffect(() => {
    void load();
  }, [load, betsVersion]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const nextAt = state?.drop.nextAt ? new Date(state.drop.nextAt).getTime() : 0;
  const readyAt = state?.drop.available ? 0 : nextAt;
  const remaining = readyAt - now;

  async function claim() {
    setClaiming(true);
    try {
      const payload = await api.claimDrop();
      setBalance(payload.balance);
      push({ title: `+${payload.granted} beans`, body: 'Free drop credited to your wallet.', tone: 'win' });
      await load();
    } catch (error) {
      push({
        title: 'Drop unavailable',
        body: error instanceof ApiError ? error.message : 'Try again shortly.',
        tone: 'warn',
      });
      await load();
    } finally {
      setClaiming(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="skeleton h-40 w-full" />
        <SkeletonRows rows={4} />
      </div>
    );
  }

  if (!state) {
    return (
      <Panel>
        <EmptyState title="Wallet unavailable" body="We could not load your ledger. Refresh the page to try again." />
      </Panel>
    );
  }

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Wallet & ledger"
        subtitle="Your balance is derived from the journal entries below — it is never stored as a number that can drift."
      />

      <div className="grid gap-3 lg:grid-cols-[1.15fr_1fr]">
        <Panel className="relative overflow-hidden p-5">
          <div
            className="pointer-events-none absolute -top-16 -right-10 h-48 w-48 rounded-full opacity-20 blur-2xl"
            style={{ background: 'radial-gradient(circle, #FFC53D 0%, transparent 70%)' }}
          />
          <p className="label">Available balance</p>
          <div className="mt-2 flex items-end gap-3">
            <BeanAmount value={balance} size="xl" />
            <span className="pb-1 text-[12px] text-mist-500">gold beans</span>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button type="button" onClick={claim} disabled={claiming || remaining > 0} className="btn btn-primary">
              {claiming ? <Spinner className="h-3.5 w-3.5" /> : <BeanIcon className="h-3.5 w-3.5" />}
              {remaining > 0 ? `Next drop in ${countdown(remaining)}` : `Claim ${beans(state.drop.amount)} free beans`}
            </button>
            <Link to="/" className="btn btn-ghost">
              Place a slip
            </Link>
            <Link to="/rewards" className="btn btn-ghost">
              View rewards
            </Link>
          </div>

          <div className="mt-4 flex items-start gap-2 rounded-lg border border-ink-700 bg-ink-950/50 px-3 py-2.5">
            <Icon name="lock" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-mist-500" />
            <p className="text-[11px] leading-relaxed text-mist-500">
              Beans are issued by the house faucet for this simulation. There is no deposit, no withdrawal and no
              route by which a bean could ever become money.
            </p>
          </div>
        </Panel>

        <div className="grid grid-cols-2 gap-2 content-start">
          <StatTile label="Open slips" value={state.stats.open} hint={`${beans(state.stats.atRisk)} beans at risk`} tone="gold" />
          <StatTile label="Strike rate" value={`${state.stats.strikeRate}%`} hint={`${state.stats.won}W / ${state.stats.lost}L`} tone="up" />
          <StatTile label="Slips placed" value={state.stats.total} hint="lifetime" />
          <StatTile
            label="Net result"
            value={<DeltaAmount value={state.stats.net} />}
            hint="won minus lost"
            tone={state.stats.net >= 0 ? 'up' : 'down'}
          />
        </div>
      </div>

      <section className="space-y-3">
        <SectionHeader
          title="Statement"
          subtitle={`${state.statement.length} entries · newest first, with the running balance after each one`}
        />
        <Panel className="overflow-hidden">
          {state.statement.length === 0 ? (
            <EmptyState title="No entries yet" body="Claim your welcome bonus or place a slip to start a ledger." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left">
                <thead>
                  <tr className="border-b border-ink-700">
                    <th className="label px-3 py-2 font-semibold">When</th>
                    <th className="label px-3 py-2 font-semibold">Type</th>
                    <th className="label px-3 py-2 font-semibold">Detail</th>
                    <th className="label px-3 py-2 text-right font-semibold">Amount</th>
                    <th className="label px-3 py-2 text-right font-semibold">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {state.statement.map((entry) => (
                    <tr key={entry.id} className="border-b border-ink-800/70 last:border-0 hover:bg-ink-800/30">
                      <td className="tnum px-3 py-2.5 text-[11px] whitespace-nowrap text-mist-500">
                        {shortDateTime(entry.at)}
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge tone={entry.delta >= 0 ? 'up' : 'down'}>{REF_LABELS[entry.refType] ?? entry.refType}</Badge>
                      </td>
                      <td className="px-3 py-2.5 text-[12px] text-mist-300">{entry.memo}</td>
                      <td className="px-3 py-2.5 text-right">
                        <DeltaAmount value={entry.delta} className="text-[12px]" />
                      </td>
                      <td className="tnum px-3 py-2.5 text-right text-[12px] font-semibold text-mist-200">
                        {beans(entry.balance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </section>
    </div>
  );
}
