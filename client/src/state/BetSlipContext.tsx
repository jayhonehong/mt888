import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Fixture, Market, Selection, SlipLeg } from '../lib/types';

const STORAGE_KEY = 'goldbean.slip';

type BetSlipValue = {
  legs: SlipLeg[];
  stake: number;
  open: boolean;
  combinedOdds: number;
  potentialPayout: number;
  setStake: (value: number) => void;
  setOpen: (value: boolean) => void;
  toggle: (fixture: Fixture, market: Market, selection: Selection) => void;
  remove: (selectionId: number) => void;
  clear: () => void;
  isSelected: (selectionId: number) => boolean;
  hasEvent: (eventId: number) => boolean;
};

const BetSlipContext = createContext<BetSlipValue | null>(null);

function load(): SlipLeg[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function BetSlipProvider({ children }: { children: ReactNode }) {
  const [legs, setLegs] = useState<SlipLeg[]>(() => load());
  const [stake, setStake] = useState(50);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(legs));
    } catch {
      /* ignore */
    }
  }, [legs]);

  const toggle = useCallback((fixture: Fixture, market: Market, selection: Selection) => {
    setLegs((current) => {
      if (current.some((leg) => leg.selectionId === selection.id)) {
        return current.filter((leg) => leg.selectionId !== selection.id);
      }
      // One leg per fixture: picking a new market on the same fixture replaces it.
      const withoutFixture = current.filter((leg) => leg.eventId !== fixture.id);
      const next: SlipLeg = {
        selectionId: selection.id,
        eventId: fixture.id,
        eventLabel: `${fixture.home.name} v ${fixture.away.name}`,
        marketName: market.name,
        selectionName: selection.name,
        odds: selection.odds,
        sport: fixture.sport,
        status: fixture.status,
      };
      return [...withoutFixture, next].slice(-6);
    });
  }, []);

  const remove = useCallback((selectionId: number) => {
    setLegs((current) => current.filter((leg) => leg.selectionId !== selectionId));
  }, []);

  const clear = useCallback(() => setLegs([]), []);

  const isSelected = useCallback(
    (selectionId: number) => legs.some((leg) => leg.selectionId === selectionId),
    [legs],
  );

  const hasEvent = useCallback((eventId: number) => legs.some((leg) => leg.eventId === eventId), [legs]);

  const combinedOdds = useMemo(
    () => Math.round(legs.reduce((product, leg) => product * leg.odds, 1) * 100) / 100,
    [legs],
  );

  const potentialPayout = useMemo(
    () => (legs.length ? Math.floor(stake * combinedOdds) : 0),
    [legs.length, stake, combinedOdds],
  );

  const value = useMemo(
    () => ({
      legs,
      stake,
      open,
      combinedOdds,
      potentialPayout,
      setStake,
      setOpen,
      toggle,
      remove,
      clear,
      isSelected,
      hasEvent,
    }),
    [legs, stake, open, combinedOdds, potentialPayout, toggle, remove, clear, isSelected, hasEvent],
  );

  return <BetSlipContext.Provider value={value}>{children}</BetSlipContext.Provider>;
}

export function useBetSlip() {
  const context = useContext(BetSlipContext);
  if (!context) throw new Error('useBetSlip must be used inside BetSlipProvider');
  return context;
}
