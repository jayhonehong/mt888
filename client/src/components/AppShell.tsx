import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { beans } from '../lib/format';
import { useAuth } from '../state/AuthContext';
import { useLive } from '../state/LiveContext';
import { BetSlipRail, BetSlipSheet } from './BetSlip';
import { Avatar, Badge, BeanAmount, BeanIcon, Icon, LiveDot, Wordmark } from './ui';

type NavItem = { to: string; label: string; icon: string; adminOnly?: boolean };

const NAV: NavItem[] = [
  { to: '/', label: 'Aviator', icon: 'bolt' },
  { to: '/blackjack', label: 'Blackjack', icon: 'cards' },
  { to: '/board', label: 'Live Board', icon: 'board' },
  { to: '/sports', label: 'All Sports', icon: 'sports' },
  { to: '/my-bets', label: 'My Bets', icon: 'ticket' },
  { to: '/wallet', label: 'Wallet', icon: 'wallet' },
  { to: '/friends', label: 'Friends', icon: 'plus' },
  { to: '/rewards', label: 'Rewards', icon: 'gift' },
  { to: '/leaderboard', label: 'Leaderboard', icon: 'trophy' },
  { to: '/admin', label: 'Admin', icon: 'shield', adminOnly: true },
];

function ConnectionPill() {
  const { connected, lastTick } = useLive();
  const [ago, setAgo] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setAgo(lastTick ? Math.round((Date.now() - lastTick) / 1000) : 0);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [lastTick]);

  if (!connected) {
    return (
      <span className="flex items-center gap-1.5 rounded-md bg-down-400/10 px-2 py-1 text-[10px] font-bold tracking-[0.1em] text-down-400 uppercase">
        <span className="h-1.5 w-1.5 rounded-full bg-down-400" />
        Reconnecting
      </span>
    );
  }

  return (
    <span className="hidden items-center gap-1.5 rounded-md bg-up-400/10 px-2 py-1 text-[10px] font-bold tracking-[0.1em] text-up-400 uppercase sm:flex">
      <span className="h-1.5 w-1.5 animate-live-pulse rounded-full bg-up-400" />
      Live feed{lastTick ? <span className="tnum text-mist-500">{ago}s</span> : null}
    </span>
  );
}

function UserMenu() {
  const { user, balance, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  if (!user) {
    return (
      <div className="flex items-center gap-2">
        <Link to="/login" className="btn btn-quiet">
          Sign in
        </Link>
        <Link to="/register" className="btn btn-primary">
          <Icon name="plus" className="h-3.5 w-3.5" />
          Create account
        </Link>
      </div>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-2 rounded-lg border border-ink-700 bg-ink-850/80 px-2 py-1.5 transition hover:border-ink-600"
      >
        <Avatar name={user.username} hue={user.avatarHue} size={26} />
        <span className="hidden text-[12px] font-semibold text-mist-200 sm:block">{user.username}</span>
        <Icon name="chevronRight" className={`h-3.5 w-3.5 text-mist-500 transition ${open ? 'rotate-90' : ''}`} />
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-56 animate-rise overflow-hidden rounded-xl border border-ink-700 bg-ink-850 shadow-2xl">
          <div className="border-b border-ink-700 px-3 py-2.5">
            <p className="truncate text-[13px] font-semibold text-mist-100">{user.username}</p>
            <p className="truncate text-[11px] text-mist-500">{user.email}</p>
            <div className="mt-1.5 flex items-center gap-1.5">
              <Badge tone={user.role === 'admin' ? 'gold' : 'info'}>{user.role}</Badge>
              <span className="tnum text-[11px] text-mist-400">{beans(balance)} beans</span>
            </div>
          </div>
          <button
            type="button"
            onClick={async () => {
              setOpen(false);
              await logout();
              navigate('/');
            }}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[13px] text-mist-300 transition hover:bg-ink-800 hover:text-mist-100"
          >
            <Icon name="logout" className="h-4 w-4" />
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}

function SideNav({ collapsed }: { collapsed: boolean }) {
  const { user } = useAuth();
  return (
    <aside
      className={`sticky top-[76px] hidden h-[calc(100vh-96px)] shrink-0 lg:block ${
        collapsed ? 'w-[68px]' : 'w-[212px]'
      } transition-[width] duration-200`}
    >
      <nav className="panel flex h-full flex-col gap-1 p-2">
        {NAV.filter((item) => !item.adminOnly || user?.role === 'admin').map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `group flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition ${
                isActive
                  ? 'bg-gold-500/10 text-gold-400 shadow-[inset_2px_0_0_var(--color-gold-500)]'
                  : 'text-mist-400 hover:bg-ink-800 hover:text-mist-100'
              }`
            }
          >
            <Icon name={item.icon} className="h-4 w-4 shrink-0" />
            {!collapsed ? <span className="truncate">{item.label}</span> : null}
          </NavLink>
        ))}

        {!collapsed ? (
          <div className="mt-auto rounded-lg border border-ink-700 bg-ink-950/60 p-3">
            <p className="label">Play money</p>
            <p className="mt-1.5 text-[11px] leading-relaxed text-mist-500">
              Gold Beans are fictional. Nothing here can be bought, sold or cashed out.
            </p>
          </div>
        ) : null}
      </nav>
    </aside>
  );
}

function MobileNav() {
  const { user } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);
  const location = useLocation();
  const items = NAV.filter((item) => !item.adminOnly || user?.role === 'admin').slice(0, 5);
  const moreItems = NAV.filter((item) => !item.adminOnly || user?.role === 'admin').slice(5);
  const moreActive = moreItems.some((item) => location.pathname === item.to || location.pathname.startsWith(`${item.to}/`));
  return (
    <>
      {moreOpen ? <div className="fixed inset-0 z-50 lg:hidden" role="presentation" onClick={() => setMoreOpen(false)}><div className="mobile-more-panel absolute inset-x-3 bottom-20 rounded-2xl border border-ink-700 bg-ink-850 p-2 shadow-2xl" role="dialog" aria-label="More navigation" onClick={(event) => event.stopPropagation()}><div className="flex items-center justify-between px-3 py-2"><span className="label text-gold-400">More options</span><button type="button" className="text-xs text-mist-400" onClick={() => setMoreOpen(false)}>Close</button></div><div className="grid grid-cols-2 gap-1">{moreItems.map((item) => <NavLink key={item.to} to={item.to} onClick={() => setMoreOpen(false)} className={({ isActive }) => `flex items-center gap-2 rounded-lg px-3 py-3 text-left text-[12px] font-semibold ${isActive ? 'bg-gold-500/10 text-gold-400' : 'text-mist-300 hover:bg-ink-800'}`}><Icon name={item.icon} className="h-4 w-4 shrink-0" />{item.label}</NavLink>)}</div></div></div> : null}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-700 bg-ink-900/95 backdrop-blur lg:hidden">
        <div className="safe-bottom flex items-stretch">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-semibold transition ${
                isActive ? 'text-gold-400' : 'text-mist-500'
              }`
            }
          >
            <Icon name={item.icon} className="h-[18px] w-[18px]" />
            {item.label.split(' ')[0]}
          </NavLink>
        ))}
        <button type="button" onClick={() => setMoreOpen((value) => !value)} className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-semibold ${moreActive || moreOpen ? 'text-gold-400' : 'text-mist-500'}`} aria-label="More navigation options"><Icon name="menu" className="h-[18px] w-[18px]" />More</button>
        </div>
      </nav>
    </>
  );
}

export function AppShell() {
  const { user, balance } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  return (
    <div className="relative z-10 min-h-screen">
      {/* Play-money strip: always visible, never dismissible. */}
      <div className="border-b border-gold-500/20 bg-gold-500/[0.07]">
        <div className="mx-auto flex max-w-[1600px] items-center gap-2 px-3 py-1.5 sm:px-4">
          <Icon name="info" className="h-3.5 w-3.5 shrink-0 text-gold-500" />
          <p className="truncate text-[11px] text-gold-300/90">
            <span className="font-semibold">Coursework simulation.</span> Gold Beans are play money — no real
            wagering, no payments, no cash-out.
          </p>
        </div>
      </div>

      <header className="sticky top-0 z-40 border-b border-ink-700 bg-ink-950/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1600px] items-center gap-3 px-3 py-3 sm:px-4">
          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            className="hidden rounded-lg p-1.5 text-mist-500 transition hover:bg-ink-800 hover:text-mist-100 lg:block"
            aria-label="Toggle navigation"
          >
            <Icon name="menu" className="h-4 w-4" />
          </button>

          <Link to="/" className="shrink-0">
            <Wordmark />
          </Link>

          <div className="ml-auto flex items-center gap-2">
            <ConnectionPill />
            {user ? (
              <Link
                to="/wallet"
                className="flex items-center gap-1.5 rounded-lg border border-ink-700 bg-ink-850/80 px-2.5 py-1.5 transition hover:border-gold-500/40"
              >
                <BeanIcon className="h-3.5 w-3.5" />
                <span className="tnum text-[13px] font-bold text-gold-400">{beans(balance)}</span>
              </Link>
            ) : null}
            <UserMenu />
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1600px] gap-4 px-3 pt-4 pb-28 sm:px-4 lg:pb-8">
        <SideNav collapsed={collapsed} />
        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
        <BetSlipRail />
      </div>

      <BetSlipSheet />
      <MobileNav />

      <footer className="border-t border-ink-800 px-3 py-6 pb-28 sm:px-4 lg:pb-6">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-2 text-[11px] text-mist-500">
          <div className="flex items-center gap-2">
            <BeanIcon className="h-3.5 w-3.5" />
            <span className="font-semibold text-mist-400">GoldBean Arena</span>
            <span>· a full-stack engineering demo</span>
          </div>
          <p className="max-w-3xl leading-relaxed">
            Every club, league, fixture and price on this site is generated by the simulator in this project. Gold
            Beans are a fictional token: they cannot be purchased, transferred or exchanged for anything of value.
            This build connects to no payment processor, no real sportsbook and no live data provider. If you or
            someone you know is struggling with gambling, help is available — in the UK, GamCare on 0808 8020 133.
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <span className="flex items-center gap-1.5">
              <Icon name="lock" className="h-3 w-3" /> No payment integration
            </span>
            <span className="flex items-center gap-1.5">
              <Icon name="bolt" className="h-3 w-3" /> WebSocket live feed
            </span>
            <span className="flex items-center gap-1.5">
              <Icon name="shield" className="h-3 w-3" /> Double-entry ledger
            </span>
            <LiveDot label="simulated data" />
          </div>
        </div>
      </footer>
    </div>
  );
}

export { BeanAmount };
