import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { OddsButton } from '../components/OddsButton';
import { Badge, ClockBar, EmptyState, Icon, LiveDot, Panel, SectionHeader, SkeletonRows, Sparkline } from '../components/ui';
import { api } from '../lib/api';
import { implied, odds as formatOdds, shortDateTime, statusLabel } from '../lib/format';
import type { Fixture } from '../lib/types';
import { useBetSlip } from '../state/BetSlipContext';
import { useLive } from '../state/LiveContext';

function ResultTag({ result }: { result: string }) {
  if (result === 'pending') return null;
  const tones: Record<string, string> = {
    won: 'text-up-400',
    lost: 'text-down-400',
    void: 'text-mist-500',
  };
  return <span className={`text-[10px] font-bold uppercase ${tones[result] ?? 'text-mist-500'}`}>{result}</span>;
}

export function EventDetail() {
  const { id } = useParams<{ id: string }>();
  const numericId = Number(id);
  const { fixtures, getFixture } = useLive();
  const { toggle, isSelected } = useBetSlip();

  const live = getFixture(numericId);
  const [fetched, setFetched] = useState<Fixture | null>(null);
  const [loading, setLoading] = useState(!live);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (live || !Number.isFinite(numericId)) return;
    let cancelled = false;
    setLoading(true);
    api
      .event(numericId)
      .then((payload) => {
        if (!cancelled) setFetched(payload.event);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load that fixture.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [numericId, live]);

  const fixture = live ?? fetched;

  useEffect(() => {
    if (!fixture) return;
    document.title = `${fixture.home.name} v ${fixture.away.name} · GoldBean Arena`;
  }, [fixture]);

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="skeleton h-32 w-full" />
        <SkeletonRows rows={3} />
      </div>
    );
  }

  if (!fixture) {
    return (
      <Panel>
        <EmptyState
          icon={<Icon name="info" className="h-7 w-7" />}
          title="Fixture not found"
          body={error ?? 'This fixture may have been settled and rotated off the board.'}
          action={
            <Link to="/sports" className="btn btn-ghost">
              Back to all sports
            </Link>
          }
        />
      </Panel>
    );
  }

  const isLive = fixture.status === 'live';
  const isFinished = fixture.status === 'finished';
  const homeLeading = fixture.home.score > fixture.away.score;
  const awayLeading = fixture.away.score > fixture.home.score;
  const related = fixtures.filter((other) => other.id !== fixture.id && other.sport === fixture.sport).slice(0, 3);

  return (
    <div className="space-y-5">
      <Link to="/sports" className="inline-flex items-center gap-1.5 text-[12px] text-mist-400 transition hover:text-gold-400">
        <Icon name="chevronLeft" className="h-3.5 w-3.5" />
        All sports
      </Link>

      <Panel className="overflow-hidden">
        <div className="flex items-center gap-2 border-b border-ink-700 px-4 py-2.5">
          <span className="flex h-5 w-5 items-center justify-center rounded bg-ink-700 text-[9px] font-bold text-mist-300">
            {fixture.sportGlyph}
          </span>
          <span className="text-[11px] text-mist-400">
            {fixture.sportName} · {fixture.league}
          </span>
          <span className="ml-auto flex items-center gap-2">
            {isLive ? <LiveDot label={fixture.clockLabel} /> : <Badge tone={isFinished ? 'neutral' : 'info'}>{statusLabel(fixture)}</Badge>}
            {!isLive && !isFinished ? <span className="text-[11px] text-mist-500">{shortDateTime(fixture.startsAt)}</span> : null}
          </span>
        </div>

        <div className="grid gap-4 p-4 sm:p-6 md:grid-cols-[1fr_auto_1fr] md:items-center">
          <div className="flex items-center gap-3 md:flex-row-reverse md:text-right">
            <span
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[13px] font-bold"
              style={{ background: `${fixture.home.color}22`, color: fixture.home.color, boxShadow: `inset 0 0 0 1px ${fixture.home.color}55` }}
            >
              {fixture.home.abbr}
            </span>
            <div className="min-w-0">
              <p className={`display truncate text-[22px] leading-tight font-bold uppercase ${homeLeading ? 'text-gold-400' : 'text-mist-100'}`}>
                {fixture.home.name}
              </p>
              <p className="label mt-0.5">Home</p>
            </div>
          </div>

          <div className="flex flex-col items-center gap-2 px-2">
            {isLive || isFinished ? (
              <p className="display tnum text-[40px] leading-none font-bold">
                <span className={homeLeading ? 'text-gold-400' : 'text-mist-100'}>{fixture.home.score}</span>
                <span className="mx-2 text-mist-600">:</span>
                <span className={awayLeading ? 'text-gold-400' : 'text-mist-100'}>{fixture.away.score}</span>
              </p>
            ) : (
              <p className="display text-[26px] leading-none font-bold text-mist-400">
                {shortDateTime(fixture.startsAt)}
              </p>
            )}
            {isLive ? (
              <div className="w-40">
                <ClockBar clock={fixture.clock} max={fixture.clockMax} />
                <p className="mt-1 text-center text-[10px] text-mist-500">{fixture.period}</p>
              </div>
            ) : (
              <p className="text-[11px] text-mist-500">{isFinished ? 'Settled' : 'Pre-match'}</p>
            )}
          </div>

          <div className="flex items-center gap-3">
            <span
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[13px] font-bold"
              style={{ background: `${fixture.away.color}22`, color: fixture.away.color, boxShadow: `inset 0 0 0 1px ${fixture.away.color}55` }}
            >
              {fixture.away.abbr}
            </span>
            <div className="min-w-0">
              <p className={`display truncate text-[22px] leading-tight font-bold uppercase ${awayLeading ? 'text-gold-400' : 'text-mist-100'}`}>
                {fixture.away.name}
              </p>
              <p className="label mt-0.5">Away</p>
            </div>
          </div>
        </div>
      </Panel>

      <section className="space-y-3">
        <SectionHeader title="Markets" subtitle={`${fixture.markets.length} markets · tap a price to add it to your slip`} />
        <div className="space-y-3">
          {fixture.markets.map((market) => (
            <Panel key={market.id} className="p-3.5">
              <div className="mb-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="text-[13px] font-semibold text-mist-100">{market.name}</h3>
                  {market.line !== null && market.line !== undefined ? (
                    <Badge tone="neutral">line {market.line}</Badge>
                  ) : null}
                </div>
                <span className="text-[10px] text-mist-500">Decimal odds</span>
              </div>
              <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                {market.selections.map((selection) => (
                  <div key={selection.id} className="flex items-center gap-2">
                    <OddsButton
                      selection={selection}
                      selected={isSelected(selection.id)}
                      disabled={isFinished || selection.result !== 'pending'}
                      onToggle={() => toggle(fixture, market, selection)}
                    />
                    <span className="hidden w-16 shrink-0 text-right sm:block">
                      {selection.result === 'pending' ? (
                        <span className="block">
                          <Sparkline points={selection.history ?? []} />
                          <span className="tnum block text-[9px] text-mist-500">{implied(selection.odds)}</span>
                        </span>
                      ) : (
                        <ResultTag result={selection.result} />
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </Panel>
          ))}
        </div>
      </section>

      <Panel className="p-4">
        <p className="label">How this settles</p>
        <p className="mt-1.5 text-[12px] leading-relaxed text-mist-400">
          When the clock runs out the simulator grades every market from the final scoreline, writes the result onto
          each selection, then settles any open slip that touched this fixture. Winning stakes come back out of the
          escrow account with the profit drawn from the house faucet; losing stakes move to the house rake account.
          Prices shown above are decimal odds — {formatOdds(2)} means a 1-bean stake returns {formatOdds(2)} beans.
        </p>
      </Panel>

      {related.length ? (
        <section className="space-y-3">
          <SectionHeader title={`More ${fixture.sportName}`} />
          <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
            {related.map((other) => (
              <Link
                key={other.id}
                to={`/event/${other.id}`}
                className="panel-flat flex items-center justify-between px-3.5 py-3 transition hover:border-ink-600"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[12px] font-semibold text-mist-100">
                    {other.home.name} v {other.away.name}
                  </span>
                  <span className="text-[11px] text-mist-500">{other.league}</span>
                </span>
                {other.status === 'live' ? <LiveDot label={other.clockLabel} /> : <Badge tone="info">pre</Badge>}
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
