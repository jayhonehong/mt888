import { odds as formatOdds } from '../lib/format';
import type { Selection } from '../lib/types';
import { useOddsFlash } from './ui';

type Props = {
  selection: Selection;
  selected: boolean;
  disabled?: boolean;
  onToggle: () => void;
  compact?: boolean;
};

export function OddsButton({ selection, selected, disabled = false, onToggle, compact = false }: Props) {
  const flash = useOddsFlash(selection.odds);

  const flashClass =
    flash === 'up' ? 'animate-flash-up' : flash === 'down' ? 'animate-flash-down' : '';

  const base = selected
    ? 'border-gold-500 bg-gold-500/12 text-mist-100 shadow-[0_0_0_1px_rgba(255,197,61,0.35)]'
    : 'border-ink-700 bg-ink-800/70 text-mist-200 hover:border-ink-600 hover:bg-ink-700/70';

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={selected}
      className={`group relative flex flex-1 items-center justify-between gap-2 overflow-hidden rounded-lg border px-2.5 text-left transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-40 ${base} ${flashClass} ${
        compact ? 'py-1.5' : 'py-2'
      }`}
    >
      <span className="min-w-0 truncate text-[11.5px] font-medium text-mist-300 group-hover:text-mist-200">
        {selection.name}
      </span>
      <span className="flex shrink-0 items-center gap-1.5">
        {flash ? (
          <span className={`text-[9px] font-bold ${flash === 'up' ? 'text-up-400' : 'text-down-400'}`}>
            {flash === 'up' ? '▲' : '▼'}
          </span>
        ) : null}
        <span
          className={`tnum text-[13px] font-bold ${
            selected ? 'text-gold-400' : flash === 'up' ? 'text-up-400' : flash === 'down' ? 'text-down-400' : 'text-mist-100'
          }`}
        >
          {formatOdds(selection.odds)}
        </span>
      </span>
    </button>
  );
}
