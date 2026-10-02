import { useMemo, useState } from 'react';
import { EventCard } from '../components/EventCard';
import { EmptyState, Icon, Panel, SectionHeader, SkeletonRows } from '../components/ui';
import { useLive } from '../state/LiveContext';

type StatusFilter = 'all' | 'live' | 'upcoming';

export function Sports() {
  const { fixtures, sports, loading, refresh } = useLive();
  const [sport, setSport] = useState('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return fixtures
      .filter((fixture) => fixture.status !== 'finished')
      .filter((fixture) => sport === 'all' || fixture.sport === sport)
      .filter((fixture) => status === 'all' || fixture.status === status)
      .filter(
        (fixture) =>
          !needle ||
          fixture.home.name.toLowerCase().includes(needle) ||
          fixture.away.name.toLowerCase().includes(needle) ||
          fixture.league.toLowerCase().includes(needle),
      );
  }, [fixtures, sport, status, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof rows>();
    for (const fixture of rows) {
      if (!map.has(fixture.sport)) map.set(fixture.sport, []);
      map.get(fixture.sport)!.push(fixture);
    }
    return [...map.entries()];
  }, [rows]);

  return (
    <div className="space-y-5">
      <SectionHeader
        title="All sports"
        subtitle={`${rows.length} open fixture${rows.length === 1 ? '' : 's'} across ${grouped.length} sport${grouped.length === 1 ? '' : 's'}`}
        action={
          <button type="button" onClick={() => void refresh()} className="btn btn-ghost">
            <Icon name="refresh" className="h-3.5 w-3.5" />
            Refresh
          </button>
        }
      />

      <Panel className="p-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative lg:w-64">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search team or league"
              className="field pl-8"
              aria-label="Search fixtures"
            />
            <Icon name="filter" className="absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-mist-500" />
          </div>

          <div className="flex flex-1 flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setSport('all')}
              className={`rounded-lg border px-2.5 py-1.5 text-[12px] font-semibold transition ${
                sport === 'all'
                  ? 'border-gold-500/50 bg-gold-500/10 text-gold-400'
                  : 'border-ink-700 text-mist-400 hover:text-mist-200'
              }`}
            >
              All
            </button>
            {sports.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setSport(item.key)}
                className={`rounded-lg border px-2.5 py-1.5 text-[12px] font-semibold transition ${
                  sport === item.key
                    ? 'border-gold-500/50 bg-gold-500/10 text-gold-400'
                    : 'border-ink-700 text-mist-400 hover:text-mist-200'
                }`}
              >
                {item.name}
              </button>
            ))}
          </div>

          <div className="flex gap-1.5">
            {(['all', 'live', 'upcoming'] as StatusFilter[]).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setStatus(value)}
                className={`rounded-lg border px-2.5 py-1.5 text-[12px] font-semibold capitalize transition ${
                  status === value
                    ? 'border-info-400/50 bg-info-400/10 text-info-400'
                    : 'border-ink-700 text-mist-400 hover:text-mist-200'
                }`}
              >
                {value}
              </button>
            ))}
          </div>
        </div>
      </Panel>

      {loading ? (
        <SkeletonRows rows={4} />
      ) : grouped.length === 0 ? (
        <Panel>
          <EmptyState
            icon={<Icon name="sports" className="h-7 w-7" />}
            title="No fixtures match those filters"
            body="Try a different sport, clear the search box, or switch the status filter back to all."
          />
        </Panel>
      ) : (
        grouped.map(([sportKey, group]) => (
          <section key={sportKey} className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded bg-ink-700 text-[9px] font-bold text-mist-300">
                {group[0].sportGlyph}
              </span>
              <h3 className="display text-[15px] font-bold tracking-wide text-mist-200 uppercase">
                {group[0].sportName}
              </h3>
              <span className="text-[11px] text-mist-500">{group.length}</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
              {group.map((fixture) => (
                <EventCard key={fixture.id} fixture={fixture} markets={3} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
