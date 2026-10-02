import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { beans } from '../lib/format';
import type { RewardsState } from '../lib/types';
import { Badge, BeanIcon, EmptyState, Panel, SectionHeader, Spinner, StatTile } from '../components/ui';
import { useAuth } from '../state/AuthContext';
import { useToast } from '../state/ToastContext';

export function Rewards() {
  const { balance, setBalance } = useAuth();
  const { push } = useToast();
  const [state, setState] = useState<RewardsState | null>(null);
  const [phase, setPhase] = useState<'loading' | 'idle' | 'checking' | 'unavailable'>('loading');
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    void api.rewards().then((payload) => {
      setState(payload);
      setBalance(payload.balance);
      setPhase(payload.redemption ? 'unavailable' : 'idle');
    }).catch(() => setPhase('idle'));
  }, [setBalance]);

  async function redeem(rewardKey: string) {
    if (phase !== 'idle' || !state) return;
    setSelected(rewardKey);
    setPhase('checking');
    try {
      const [payload] = await Promise.all([
        api.redeemReward(rewardKey),
        new Promise((resolve) => window.setTimeout(resolve, 900)),
      ]);
      setBalance(payload.balance);
      setState((current) => current ? { ...current, balance: payload.balance, redemption: payload.redemption } : current);
      setPhase('unavailable');
    } catch (error) {
      setPhase('idle');
      push({ title: 'Reward unavailable', body: error instanceof ApiError ? error.message : 'Choose a reward within your bean balance.', tone: 'loss' });
    } finally {
      setSelected(null);
    }
  }

  if (phase === 'loading' || phase === 'checking') {
    return <Panel className="flex min-h-[430px] flex-col items-center justify-center p-8 text-center"><div className="reward-loader"><BeanIcon className="h-8 w-8" /></div><p className="label mt-6 text-gold-400">{phase === 'checking' ? 'Checking reward inventory' : 'Loading rewards'}</p><h1 className="display mt-2 text-3xl font-bold uppercase text-mist-100">Please wait…</h1><p className="mt-2 max-w-sm text-sm text-mist-500">We are checking the fictional reward catalogue. Gold Beans are play money and no real payment or cash-out is connected.</p><Spinner className="mt-6 h-5 w-5" /></Panel>;
  }

  if (phase === 'unavailable' || state?.redemption) {
    const redemption = state?.redemption;
    return <div className="space-y-5"><SectionHeader title="Rewards" subtitle="One redemption attempt per player." /><Panel className="flex min-h-[430px] flex-col items-center justify-center p-8 text-center"><Badge tone="down">Product unavailable</Badge><h1 className="display mt-5 text-4xl font-bold uppercase text-mist-100">Reward unavailable</h1><p className="mt-3 max-w-md text-sm leading-relaxed text-mist-400">{redemption?.message ?? 'The selected reward product is currently unavailable.'} Your one redemption attempt has been recorded. No beans were deducted.</p>{redemption ? <div className="mt-6 grid grid-cols-2 gap-2"><StatTile label="Selected reward" value={`RM${redemption.rmAmount}`} hint="unavailable" tone="down" /><StatTile label="Bean cost" value={beans(redemption.beanCost)} hint="not deducted" tone="gold" /></div> : null}<p className="mt-6 text-xs text-mist-600">Each player can redeem only one reward.</p></Panel></div>;
  }

  if (!state) return <Panel><EmptyState title="Rewards unavailable" body="We could not load the rewards catalogue. Refresh and try again." /></Panel>;

  return <div className="space-y-5"><SectionHeader title="Rewards" subtitle="Exchange fictional Gold Beans for a reward attempt. One attempt per player." action={<Badge tone="gold"><BeanIcon className="mr-1 h-3 w-3" />{beans(balance)} beans</Badge>} /><Panel className="p-5 sm:p-6"><div className="rounded-xl border border-gold-500/20 bg-gold-500/[.06] p-4 text-sm leading-relaxed text-mist-300"><strong className="text-mist-100">Reward terms:</strong> Each player may redeem only one reward. Products are currently unavailable, and submitting an attempt never deducts beans or creates a cash-out.</div><div className="mt-5 grid gap-3 sm:grid-cols-2">{state.rewards.map((reward) => { const enough = balance >= reward.beanCost; return <div key={reward.key} className="rounded-xl border border-ink-700 bg-ink-950/40 p-4"><div className="flex items-start justify-between gap-3"><div><p className="label">Bean reward</p><h2 className="display mt-1 text-2xl font-bold text-mist-100">RM{reward.rmAmount.toLocaleString()}</h2></div><Badge tone={enough ? 'up' : 'neutral'}>{enough ? 'Eligible' : 'Need more beans'}</Badge></div><p className="mt-4 flex items-center gap-1.5 text-sm font-semibold text-gold-400"><BeanIcon className="h-4 w-4" />{beans(reward.beanCost)} beans</p><button type="button" disabled={!enough || phase !== 'idle'} onClick={() => void redeem(reward.key)} className="btn btn-primary mt-4 w-full">{selected === reward.key ? 'Checking…' : 'Redeem reward'}</button></div>; })}</div></Panel></div>;
}
