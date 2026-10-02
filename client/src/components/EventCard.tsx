import { Link } from 'react-router-dom';
import { relativeFromNow, statusLabel } from '../lib/format';
import type { Fixture } from '../lib/types';
import { useBetSlip } from '../state/BetSlipContext';
import { OddsButton } from './OddsButton';
import { Badge, ClockBar, Icon, LiveDot } from './ui';

function TeamRow({
  side,
  leading,
  showScore,
}: {
  side: Fixture['home'];
  leading: boolean;
  showScore: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[10px] font-bold"
        style={{ background: `${side.color}22`, color: side.color, boxShadow: `inset 0 0 0 1px ${side.color}44` }}
      >
        {side.abbr}
      </span>
      <span className={`min-w-0 flex-1 truncate text-[13px] ${leading ? 'font-semibold text-mist-100' : 'text-mist-300'}`}>
        {side.name}
      </span>
      {showScore ? (
        <span className={`display tnum w-6 text-right text-[19px] leading-none font-bold ${leading ? 'text-gold-400' : 'text-mist-300'}`}>
          {side.score}
        </span>
      ) : null}
    </div>
  );
}

export function EventCard({ fixture, markets = 2 }: { fixture: Fixture; markets?: number }) {
  const { toggle, isSelected, hasEvent } = useBetSlip();

  const isLive = fixture.status === 'live';
  const isFinished = fixture.status === 'finished';
  const homeLeading = fixture.home.score > fixture.away.score;
  const awayLeading = fixture.away.score > fixture.home.score;
  const shown = fixture.markets.slice(0, markets);
  const durationMinutes = Math.floor(fixture.durationSeconds / 60);
  const durationRemainder = fixture.durationSeconds % 60;
  const durationLabel = `${durationMinutes}m ${String(durationRemainder).padStart(2, '0')}s game`;

  return (
    <article
      className={`panel group flex flex-col overflow-hidden transition-colors ${
        isFinished ? 'opacity-60' : 'hover:border-ink-600'
      }`}
    >
      {/* header */}
      <header className="flex items-center gap-2 border-b border-ink-700/70 px-3 py-2">
        <span className="flex h-5 w-5 items-center justify-center rounded bg-ink-700 text-[9px] font-bold tracking-wider text-mist-300">
          {fixture.sportGlyph}
        </span>
        <span className="min-w-0 flex-1 truncate text-[11px] text-mist-500">{fixture.league}</span>
        {isLive ? (
          <span className="flex items-center gap-2">
            <LiveDot label={fixture.clockLabel} />
          </span>
        ) : isFinished ? (
          <Badge tone="neutral">{statusLabel(fixture)}</Badge>
        ) : (
          <Badge tone="info">{relativeFromNow(fixture.startsAt)}</Badge>
        )}
      </header>

      {/* scoreline */}
      <div className="space-y-2 px-3 py-3">
        <TeamRow side={fixture.home} leading={homeLeading} showScore={isLive || isFinished} />
        <TeamRow side={fixture.away} leading={awayLeading} showScore={isLive || isFinished} />
        {isLive ? <ClockBar clock={fixture.clock} max={fixture.clockMax} /> : null}
      </div>

      {/* markets */}
      <div className="mt-auto space-y-2 px-3 pb-3">
        {shown.map((market) => (
          <div key={market.id}>
            <div className="mb-1 flex items-center justify-between">
              <span className="label">{market.name}</span>
            </div>
            <div className="flex gap-1.5">
              {market.selections.map((selection) => (
                <OddsButton
                  key={selection.id}
                  selection={selection}
                  compact
                  selected={isSelected(selection.id)}
                  disabled={isFinished || selection.result !== 'pending'}
                  onToggle={() => toggle(fixture, market, selection)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <footer className="flex items-center justify-between border-t border-ink-700/70 px-3 py-1.5">
        <Link
          to={`/event/${fixture.id}`}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-mist-400 transition hover:text-gold-400"
        >
          {fixture.markets.length} markets · {durationLabel}
          <Icon name="chevronRight" className="h-3 w-3" />
        </Link>
        {hasEvent(fixture.id) ? <Badge tone="gold">On slip</Badge> : null}
      </footer>
    </article>
  );
}
