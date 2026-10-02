const beanFormatter = new Intl.NumberFormat('en-US');

/** 1250 -> "1,250" */
export function beans(value: number | null | undefined): string {
  return beanFormatter.format(Math.round(Number(value ?? 0)));
}

/** Signed delta: 250 -> "+250", -80 -> "-80" */
export function signedBeans(value: number): string {
  const rounded = Math.round(value);
  return `${rounded > 0 ? '+' : rounded < 0 ? '−' : ''}${beanFormatter.format(Math.abs(rounded))}`;
}

export function odds(value: number): string {
  return Number(value).toFixed(2);
}

/** Decimal odds -> implied probability, as a percentage string. */
export function implied(value: number): string {
  return `${Math.round((1 / Number(value)) * 100)}%`;
}

export function clockTime(iso: string): string {
  const date = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
  if (Number.isNaN(date.getTime())) return '--:--';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function relativeFromNow(iso: string): string {
  const date = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
  if (Number.isNaN(date.getTime())) return '';
  const diff = date.getTime() - Date.now();
  const minutes = Math.round(diff / 60000);
  if (Math.abs(minutes) < 1) return 'now';
  if (minutes > 0) {
    if (minutes < 60) return `in ${minutes}m`;
    return `in ${Math.round(minutes / 60)}h ${minutes % 60}m`;
  }
  const ago = Math.abs(minutes);
  if (ago < 60) return `${ago}m ago`;
  if (ago < 60 * 24) return `${Math.round(ago / 60)}h ago`;
  return `${Math.round(ago / 1440)}d ago`;
}

export function shortDateTime(iso: string): string {
  const date = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function countdown(msRemaining: number): string {
  const total = Math.max(0, Math.ceil(msRemaining / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function statusLabel(fixture: { status: string; period: string; clockLabel: string }): string {
  if (fixture.status === 'live') return fixture.clockLabel;
  if (fixture.status === 'finished') return fixture.period === 'Abandoned' ? 'ABD' : 'FT';
  return 'PRE';
}
