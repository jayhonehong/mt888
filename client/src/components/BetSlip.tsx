import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { beans, odds as formatOdds } from '../lib/format';
import { useAuth } from '../state/AuthContext';
import { useBetSlip } from '../state/BetSlipContext';
import { useToast } from '../state/ToastContext';
import { Badge, BeanAmount, BeanIcon, EmptyState, Icon, Spinner } from './ui';

const QUICK_STAKES = [10, 50, 100, 250];
const MIN_STAKE = 10;
const MAX_STAKE = 5000;

function SlipBody({ onPlaced }: { onPlaced?: () => void }) {
  const { legs, stake, setStake, remove, clear, combinedOdds, potentialPayout } = useBetSlip();
  const { user, balance, setBalance } = useAuth();
  const { push } = useToast();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);

  const stakeError = useMemo(() => {
    if (!legs.length) return null;
    if (stake < MIN_STAKE) return `Minimum stake is ${MIN_STAKE} beans.`;
    if (stake > MAX_STAKE) return `Maximum stake is ${beans(MAX_STAKE)} beans.`;
    if (user && stake > balance) return `You only hold ${beans(balance)} beans.`;
    return null;
  }, [legs.length, stake, user, balance]);

  const canPlace = Boolean(user) && legs.length > 0 && !stakeError && !submitting;

  async function place() {
    if (!user) {
      push({ title: 'Sign in to place the slip', body: 'Your gold beans are stored against your account.', tone: 'warn' });
      navigate('/login');
      return;
    }
    if (!canPlace) return;
    setSubmitting(true);
    try {
      const payload = await api.placeBet({
        stake,
        legs: legs.map((leg) => ({ selectionId: leg.selectionId })),
      });
      setBalance(payload.balance);
      push({
        title: `Slip accepted · ${payload.bet.ref}`,
        body: `${formatOdds(payload.bet.combinedOdds)}x for a possible ${beans(payload.bet.potentialPayout)} beans`,
        tone: 'info',
      });
      clear();
      onPlaced?.();
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Could not place that slip.';
      push({ title: 'Slip rejected', body: message, tone: 'loss' });
    } finally {
      setSubmitting(false);
    }
  }

  if (!legs.length) {
    return (
      <EmptyState
        icon={<Icon name="ticket" className="h-7 w-7" />}
        title="Your slip is empty"
        body="Tap any price on the board to add a selection. Up to six picks across six different fixtures."
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 py-3">
        {legs.map((leg) => (
          <div key={leg.selectionId} className="animate-rise rounded-lg border border-ink-700 bg-ink-850/70 px-2.5 py-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-[12px] font-semibold text-mist-100">{leg.selectionName}</p>
                <p className="mt-0.5 truncate text-[11px] text-mist-500">{leg.marketName}</p>
                <p className="mt-0.5 truncate text-[11px] text-mist-400">{leg.eventLabel}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="tnum text-[13px] font-bold text-gold-400">{formatOdds(leg.odds)}</span>
                <button
                  type="button"
                  onClick={() => remove(leg.selectionId)}
                  className="text-mist-500 transition hover:text-down-400"
                  aria-label={`Remove ${leg.selectionName}`}
                >
                  <Icon name="close" className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-3 border-t border-ink-700 px-3 py-3">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-mist-500">
            {legs.length} {legs.length === 1 ? 'selection' : 'selections'} ·{' '}
            {legs.length === 1 ? 'single' : `${legs.length}-fold`}
          </span>
          <button type="button" onClick={clear} className="font-semibold text-mist-400 transition hover:text-down-400">
            Clear all
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 rounded-lg border border-ink-700 bg-ink-950/60 px-3 py-2">
          <div>
            <p className="label">Odds</p>
            <p className="tnum text-[15px] font-bold text-mist-100">{formatOdds(combinedOdds)}</p>
          </div>
          <div>
            <p className="label">Stake</p>
            <p className="tnum text-[15px] font-bold text-mist-100">{beans(stake)}</p>
          </div>
          <div className="text-right">
            <p className="label">Returns</p>
            <p className="tnum text-[15px] font-bold text-gold-400">{beans(potentialPayout)}</p>
          </div>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="label">Stake (beans)</span>
            {user ? <span className="tnum text-[11px] text-mist-500">Balance {beans(balance)}</span> : null}
          </div>
          <div className="flex items-center gap-1.5">
            <div className="relative flex-1">
              <BeanIcon className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2" />
              <input
                type="number"
                inputMode="numeric"
                min={MIN_STAKE}
                max={MAX_STAKE}
                step={10}
                value={stake}
                onChange={(event) => setStake(Math.max(0, Math.floor(Number(event.target.value) || 0)))}
                className="field tnum pl-8"
                aria-label="Stake in gold beans"
              />
            </div>
            <button type="button" onClick={() => setStake(QUICK_STAKES[1])} className="btn btn-ghost px-2.5">
              <Icon name="refresh" className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="mt-1.5 flex gap-1.5">
            {QUICK_STAKES.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setStake(value)}
                className={`flex-1 rounded-md border px-2 py-1 text-[11px] font-semibold transition ${
                  stake === value
                    ? 'border-gold-500/60 bg-gold-500/10 text-gold-400'
                    : 'border-ink-700 bg-ink-800/60 text-mist-400 hover:border-ink-600 hover:text-mist-200'
                }`}
              >
                {value}
              </button>
            ))}
            {user ? (
              <button
                type="button"
                onClick={() => setStake(Math.max(MIN_STAKE, Math.min(MAX_STAKE, balance)))}
                className="flex-1 rounded-md border border-ink-700 bg-ink-800/60 px-2 py-1 text-[11px] font-semibold text-mist-400 transition hover:border-ink-600 hover:text-mist-200"
              >
                MAX
              </button>
            ) : null}
          </div>
        </div>

        {stakeError ? <p className="text-[11px] text-down-400">{stakeError}</p> : null}

        <button type="button" onClick={place} disabled={!canPlace} className="btn btn-primary w-full">
          {submitting ? <Spinner className="h-4 w-4" /> : null}
          {user ? `Place slip · ${beans(stake)} beans` : 'Sign in to place slip'}
        </button>

        <p className="text-center text-[10px] leading-relaxed text-mist-500">
          Play money only. Beans have no cash value and cannot be withdrawn.
        </p>
      </div>
    </div>
  );
}

export function BetSlipRail() {
  const { legs, open } = useBetSlip();
  return (
    <aside className="hidden w-[320px] shrink-0 xl:block">
      <div className="panel sticky top-[76px] flex max-h-[calc(100vh-96px)] flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-ink-700 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <Icon name="ticket" className="h-4 w-4 text-gold-500" />
            <span className="display text-[15px] font-bold tracking-wide uppercase">Bet slip</span>
          </div>
          <div className="flex items-center gap-2">
            {legs.length ? <Badge tone="gold">{legs.length}</Badge> : <Badge>empty</Badge>}
            <span className="hidden text-[10px] text-mist-500">{open ? '' : ''}</span>
          </div>
        </header>
        <SlipBody />
      </div>
    </aside>
  );
}

export function BetSlipSheet() {
  const { legs, open, setOpen, combinedOdds, stake } = useBetSlip();
  const { user, balance } = useAuth();

  return (
    <>
      {/* collapsed bar */}
      {legs.length > 0 && !open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed inset-x-3 bottom-[68px] z-40 flex animate-slide-up items-center justify-between rounded-xl border border-gold-500/40 bg-ink-850/95 px-4 py-3 shadow-2xl backdrop-blur xl:hidden"
        >
          <span className="flex items-center gap-2">
            <BeanIcon className="h-4 w-4" />
            <span className="text-[13px] font-semibold text-mist-100">
              {legs.length} {legs.length === 1 ? 'pick' : 'picks'}
            </span>
            <span className="tnum text-[12px] text-gold-400">{formatOdds(combinedOdds)}x</span>
          </span>
          <span className="flex items-center gap-1 text-[12px] font-semibold text-gold-400">
            View slip <Icon name="chevronRight" className="h-3.5 w-3.5" />
          </span>
        </button>
      ) : null}

      {open ? (
        <div className="fixed inset-0 z-50 xl:hidden">
          <div
            className="absolute inset-0 bg-ink-950/80 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            role="presentation"
          />
          <div className="absolute inset-x-0 bottom-0 flex max-h-[86vh] animate-slide-up flex-col rounded-t-2xl border-t border-ink-600 bg-ink-900 pb-[env(safe-area-inset-bottom)]">
            <header className="flex items-center justify-between border-b border-ink-700 px-4 py-3">
              <div className="flex items-center gap-2">
                <Icon name="ticket" className="h-4 w-4 text-gold-500" />
                <span className="display text-[16px] font-bold tracking-wide uppercase">Bet slip</span>
                {legs.length ? <Badge tone="gold">{legs.length}</Badge> : null}
              </div>
              <div className="flex items-center gap-3">
                {user ? <BeanAmount value={balance} size="sm" /> : null}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close slip"
                  className="text-mist-400 transition hover:text-mist-100"
                >
                  <Icon name="close" className="h-5 w-5" />
                </button>
              </div>
            </header>
            <div className="flex min-h-0 flex-1 flex-col">
              <SlipBody onPlaced={() => setOpen(false)} />
            </div>
            <p className="border-t border-ink-800 px-4 py-2 text-center text-[10px] text-mist-500">
              Staking {beans(stake)} beans · play money only
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}
