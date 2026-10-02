import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { api, getToken } from '../lib/api';
import type { Fixture, Market, Selection, Sport, TickMessage } from '../lib/types';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';

const HISTORY_LIMIT = 40;

type LiveValue = {
  fixtures: Fixture[];
  sports: Sport[];
  connected: boolean;
  lastTick: number | null;
  loading: boolean;
  error: string | null;
  betsVersion: number;
  refresh: () => Promise<void>;
  getFixture: (id: number) => Fixture | undefined;
};

const LiveContext = createContext<LiveValue | null>(null);

function patchSelection(fixture: Fixture, selectionId: number, odds: number): Fixture | null {
  let changed = false;
  const markets = fixture.markets.map((market) => {
    if (!market.selections.some((selection) => selection.id === selectionId)) return market;
    changed = true;
    return {
      ...market,
      selections: market.selections.map((selection) => {
        if (selection.id !== selectionId) return selection;
        const history = [...(selection.history ?? []), odds].slice(-HISTORY_LIMIT);
        return { ...selection, odds, history };
      }),
    };
  });
  return changed ? { ...fixture, markets } : null;
}

export function LiveProvider({ children }: { children: ReactNode }) {
  const { user, setBalance } = useAuth();
  const { push } = useToast();

  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [sports, setSports] = useState<Sport[]>([]);
  const [connected, setConnected] = useState(false);
  const [lastTick, setLastTick] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [betsVersion, setBetsVersion] = useState(0);

  const socketRef = useRef<WebSocket | null>(null);
  const retryRef = useRef(0);
  const closedRef = useRef(false);
  const userIdRef = useRef<number | null>(null);
  userIdRef.current = user?.id ?? null;

  const refresh = useCallback(async () => {
    try {
      const payload = await api.board();
      setFixtures(payload.events);
      setSports(payload.sports);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the board.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // -------------------------------------------------------------------------
  // Live feed
  // -------------------------------------------------------------------------
  useEffect(() => {
    closedRef.current = false;
    let pingTimer: number | undefined;

    const connect = () => {
      if (closedRef.current) return;
      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const token = getToken();
      const url = `${protocol}://${window.location.host}/ws${token ? `?token=${encodeURIComponent(token)}` : ''}`;

      const socket = new WebSocket(url);
      socketRef.current = socket;

      socket.onopen = () => {
        retryRef.current = 0;
        setConnected(true);
        pingTimer = window.setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'ping' }));
        }, 25_000);
      };

      socket.onmessage = (event) => {
        let message: any;
        try {
          message = JSON.parse(event.data);
        } catch {
          return;
        }

        switch (message.type) {
          case 'hello': {
            if (typeof message.payload?.balance === 'number') setBalance(message.payload.balance);
            break;
          }
          case 'tick': {
            const tick = message as TickMessage;
            setLastTick(Date.now());
            setFixtures((current) => {
              const byId = new Map(current.map((fixture) => [fixture.id, fixture]));

              for (const patch of tick.prices ?? []) {
                for (const [id, fixture] of byId) {
                  const next = patchSelection(fixture, patch.id, patch.odds);
                  if (next) {
                    byId.set(id, next);
                    break;
                  }
                }
              }

              for (const patch of tick.events ?? []) {
                const fixture = byId.get(patch.id);
                if (!fixture) continue;
                byId.set(patch.id, {
                  ...fixture,
                  clock: patch.clock,
                  period: patch.period,
                  clockLabel: `${patch.clock}'`,
                  home: { ...fixture.home, score: patch.homeScore },
                  away: { ...fixture.away, score: patch.awayScore },
                });
              }

              for (const id of tick.finished ?? []) {
                const fixture = byId.get(id);
                if (fixture) {
                  byId.set(id, { ...fixture, status: 'finished', period: 'FT', clockLabel: 'FT' });
                }
              }

              for (const fixture of [...(tick.added ?? []), ...(tick.promoted ?? [])]) {
                byId.set(fixture.id, fixture);
              }

              return [...byId.values()];
            });
            break;
          }
          case 'wallet': {
            if (typeof message.payload?.balance === 'number') setBalance(message.payload.balance);
            break;
          }
          case 'bet.settled': {
            const bet = message.payload?.bet;
            if (bet) {
              const label = bet.status === 'won' ? 'Slip landed' : bet.status === 'void' ? 'Slip voided' : 'Slip lost';
              const body =
                bet.status === 'won'
                  ? `${bet.ref} returned ${bet.payout} beans`
                  : bet.status === 'void'
                    ? `${bet.ref} stake of ${bet.stake} returned`
                    : `${bet.ref} staked ${bet.stake} beans`;
              push({ title: label, body, tone: bet.status === 'won' ? 'win' : bet.status === 'void' ? 'info' : 'loss' });
            }
            setBetsVersion((version) => version + 1);
            break;
          }
          case 'bets': {
            setBetsVersion((version) => version + 1);
            break;
          }
          default:
            break;
        }
      };

      socket.onclose = () => {
        setConnected(false);
        if (pingTimer) window.clearInterval(pingTimer);
        if (closedRef.current) return;
        retryRef.current = Math.min(retryRef.current + 1, 6);
        window.setTimeout(connect, 500 * 2 ** (retryRef.current - 1));
      };

      socket.onerror = () => socket.close();
    };

    connect();

    return () => {
      closedRef.current = true;
      if (pingTimer) window.clearInterval(pingTimer);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [push, setBalance]);

  const getFixture = useCallback((id: number) => fixtures.find((fixture) => fixture.id === id), [fixtures]);

  const value = useMemo(
    () => ({
      fixtures,
      sports,
      connected,
      lastTick,
      loading,
      error,
      betsVersion,
      refresh,
      getFixture,
    }),
    [fixtures, sports, connected, lastTick, loading, error, betsVersion, refresh, getFixture],
  );

  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}

export function useLive() {
  const context = useContext(LiveContext);
  if (!context) throw new Error('useLive must be used inside LiveProvider');
  return context;
}

export type { Market, Selection };
