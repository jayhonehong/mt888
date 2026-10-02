import { useEffect, useRef, useState, type ReactNode } from 'react';
import { beans as formatBeans, initials, signedBeans } from '../lib/format';

/* -------------------------------------------------------------------------- */
/* Brand mark                                                                  */
/* -------------------------------------------------------------------------- */

export function BeanIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="beanGold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FFE6A8" />
          <stop offset="55%" stopColor="#FFC53D" />
          <stop offset="100%" stopColor="#C98A0B" />
        </linearGradient>
      </defs>
      <ellipse cx="12" cy="12" rx="9" ry="6.6" transform="rotate(-32 12 12)" fill="url(#beanGold)" />
      <path
        d="M7.4 15.2c2.6.6 6.4-.2 9.1-2.4"
        stroke="#8A5C05"
        strokeWidth="1.2"
        strokeLinecap="round"
        opacity="0.55"
        fill="none"
      />
      <ellipse cx="9.6" cy="9.4" rx="2.4" ry="1.3" transform="rotate(-32 9.6 9.4)" fill="#FFF7DF" opacity="0.5" />
    </svg>
  );
}

export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <BeanIcon className="h-6 w-6 shrink-0" />
      {!compact ? (
        <span className="display text-[19px] leading-none font-bold tracking-wide text-mist-100">
          GOLD<span className="text-gold-500">BEAN</span>
          <span className="ml-1 text-[11px] font-semibold tracking-[0.28em] text-mist-500">ARENA</span>
        </span>
      ) : null}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Money                                                                       */
/* -------------------------------------------------------------------------- */

export function BeanAmount({
  value,
  size = 'md',
  showIcon = true,
  className = '',
}: {
  value: number;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showIcon?: boolean;
  className?: string;
}) {
  const sizes = {
    sm: 'text-[13px]',
    md: 'text-base',
    lg: 'text-2xl',
    xl: 'text-4xl',
  } as const;
  return (
    <span className={`inline-flex items-baseline gap-1.5 tnum font-semibold text-mist-100 ${sizes[size]} ${className}`}>
      {showIcon ? <BeanIcon className={size === 'xl' ? 'h-6 w-6' : 'h-3.5 w-3.5'} /> : null}
      {formatBeans(value)}
    </span>
  );
}

export function DeltaAmount({ value, className = '' }: { value: number; className?: string }) {
  const tone = value > 0 ? 'text-up-400' : value < 0 ? 'text-down-400' : 'text-mist-400';
  return <span className={`tnum font-semibold ${tone} ${className}`}>{signedBeans(value)}</span>;
}

/* -------------------------------------------------------------------------- */
/* Indicators                                                                  */
/* -------------------------------------------------------------------------- */

export function LiveDot({ label = 'LIVE', className = '' }: { label?: string; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-live-pulse rounded-full bg-down-400" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-down-400" />
      </span>
      <span className="text-[10px] font-bold tracking-[0.14em] text-down-400">{label}</span>
    </span>
  );
}

export function Badge({
  children,
  tone = 'neutral',
  className = '',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'gold' | 'up' | 'down' | 'info';
  className?: string;
}) {
  const tones = {
    neutral: 'bg-ink-700/70 text-mist-300',
    gold: 'bg-gold-500/15 text-gold-400',
    up: 'bg-up-400/15 text-up-400',
    down: 'bg-down-400/15 text-down-400',
    info: 'bg-info-400/15 text-info-400',
  } as const;
  return (
    <span
      className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold tracking-[0.1em] uppercase ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export function Sparkline({ points, className = '' }: { points: number[]; className?: string }) {
  if (!points || points.length < 2) {
    return <span className={`block h-4 w-11 ${className}`} />;
  }
  const slice = points.slice(-24);
  const min = Math.min(...slice);
  const max = Math.max(...slice);
  const span = max - min || 1;
  const step = 44 / (slice.length - 1);
  const path = slice
    .map((value, index) => `${(index * step).toFixed(1)},${(14 - ((value - min) / span) * 12).toFixed(1)}`)
    .join(' ');
  const rising = slice[slice.length - 1] >= slice[0];
  return (
    <svg viewBox="0 0 44 16" className={`h-4 w-11 shrink-0 ${className}`} aria-hidden="true">
      <polyline
        points={path}
        fill="none"
        stroke={rising ? 'var(--color-up-400)' : 'var(--color-down-400)'}
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity="0.9"
      />
    </svg>
  );
}

export function ClockBar({ clock, max }: { clock: number; max: number }) {
  const percent = Math.min(100, Math.max(0, (clock / (max || 1)) * 100));
  return (
    <span className="block h-[3px] w-full overflow-hidden rounded-full bg-ink-700">
      <span
        className="block h-full rounded-full bg-gradient-to-r from-gold-600 to-gold-400 transition-[width] duration-700 ease-out"
        style={{ width: `${percent}%` }}
      />
    </span>
  );
}

export function Avatar({ name, hue = 45, size = 32 }: { name: string; hue?: number; size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-lg font-bold"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
        background: `linear-gradient(140deg, hsl(${hue} 70% 52%) 0%, hsl(${(hue + 40) % 360} 65% 34%) 100%)`,
        color: '#0A0E18',
      }}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Layout helpers                                                              */
/* -------------------------------------------------------------------------- */

export function Panel({
  children,
  className = '',
  as: Tag = 'section',
}: {
  children: ReactNode;
  className?: string;
  as?: 'section' | 'div' | 'article';
}) {
  return <Tag className={`panel ${className}`}>{children}</Tag>;
}

export function SectionHeader({
  title,
  subtitle,
  action,
  className = '',
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-end justify-between gap-4 ${className}`}>
      <div>
        <h2 className="display text-[22px] leading-none font-bold tracking-wide text-mist-100 uppercase">{title}</h2>
        {subtitle ? <p className="mt-1.5 text-xs text-mist-400">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function StatTile({
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'neutral' | 'gold' | 'up' | 'down';
}) {
  const accents = {
    neutral: 'text-mist-100',
    gold: 'text-gold-400',
    up: 'text-up-400',
    down: 'text-down-400',
  } as const;
  return (
    <div className="panel-flat px-3.5 py-3">
      <p className="label">{label}</p>
      <p className={`display mt-1.5 text-[26px] leading-none font-bold tnum ${accents[tone]}`}>{value}</p>
      {hint ? <p className="mt-1 text-[11px] text-mist-500">{hint}</p> : null}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
  icon,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      {icon ? <div className="text-mist-500">{icon}</div> : null}
      <p className="text-sm font-semibold text-mist-200">{title}</p>
      {body ? <p className="max-w-sm text-xs text-mist-500">{body}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function Spinner({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.4" fill="none" opacity="0.2" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.4" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export function SkeletonRows({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="skeleton h-16 w-full" />
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Icons                                                                       */
/* -------------------------------------------------------------------------- */

const PATHS: Record<string, string> = {
  board: 'M4 5h16M4 12h10M4 19h13',
  sports: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 0c2.5 2 2.5 16 0 18M3.5 9h17M3.5 15h17',
  ticket: 'M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4V8Z',
  wallet: 'M3 8.5A2.5 2.5 0 0 1 5.5 6H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5.5A2.5 2.5 0 0 1 3 16.5v-8Zm0 0A2.5 2.5 0 0 0 5.5 11H20M16.5 14.5h.01',
  trophy: 'M8 4h8v5a4 4 0 0 1-8 0V4Zm0 1H5.5A1.5 1.5 0 0 0 4 6.5 4.5 4.5 0 0 0 8 11m8-6h2.5A1.5 1.5 0 0 1 20 6.5 4.5 4.5 0 0 1 16 11M12 13v4m-3 3h6',
  shield: 'M12 3.5 19 6v6c0 4.2-2.9 7.6-7 8.5-4.1-.9-7-4.3-7-8.5V6l7-2.5Z',
  logout: 'M15 12H4m0 0 3.5-3.5M4 12l3.5 3.5M11 5h6a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-6',
  menu: 'M4 7h16M4 12h16M4 17h16',
  close: 'M6 6l12 12M18 6 6 18',
  chevronRight: 'M9 6l6 6-6 6',
  chevronLeft: 'M15 6l-6 6 6 6',
  plus: 'M12 5v14M5 12h14',
  lock: 'M7 10V8a5 5 0 0 1 10 0v2M5 10h14v10H5V10Z',
  bolt: 'M13 3 5 13h6l-1 8 8-10h-6l1-8Z',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 5.5h.01M11 12h1v5h1',
  refresh: 'M20 11a8 8 0 1 0-2.3 6.3M20 5v6h-6',
  check: 'M5 13l4.5 4.5L19 7',
  filter: 'M4 6h16M7 12h10M10 18h4',
};

export function Icon({
  name,
  className = 'h-4 w-4',
  strokeWidth = 1.7,
}: {
  name: keyof typeof PATHS | string;
  className?: string;
  strokeWidth?: number;
}) {
  const path = PATHS[name] ?? PATHS.info;
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* Odds flash hook                                                             */
/* -------------------------------------------------------------------------- */

export function useOddsFlash(value: number): 'up' | 'down' | null {
  const previous = useRef(value);
  const [flash, setFlash] = useState<'up' | 'down' | null>(null);

  useEffect(() => {
    if (value === previous.current) return;
    setFlash(value > previous.current ? 'up' : 'down');
    previous.current = value;
    const timer = window.setTimeout(() => setFlash(null), 900);
    return () => window.clearTimeout(timer);
  }, [value]);

  return flash;
}
