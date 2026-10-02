import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError, type CasinoRound } from '../lib/api';
import { beans } from '../lib/format';
import { BeanIcon, Badge, EmptyState, Panel, SectionHeader, StatTile } from '../components/ui';
import { useAuth } from '../state/AuthContext';
import { useToast } from '../state/ToastContext';

type Game = 'aviator' | 'blackjack';
type FlightAudio = { context: AudioContext; engine: OscillatorNode; turbine: OscillatorNode; master: GainNode };

function GameTabs({ active }: { active: Game }) {
  return (
    <div className="flex flex-wrap gap-2">
      {(['aviator', 'blackjack'] as Game[]).map((game) => (
        <Link key={game} to={game === 'aviator' ? '/' : `/${game}`} className={`rounded-lg border px-3 py-2 text-[12px] font-semibold uppercase transition ${active === game ? 'border-gold-500/50 bg-gold-500/10 text-gold-400' : 'border-ink-700 bg-ink-850/70 text-mist-400 hover:text-mist-100'}`}>
          {game === 'aviator' ? 'Aviator' : game}
        </Link>
      ))}
    </div>
  );
}

function StakeInput({ value, setValue }: { value: number; setValue: (value: number) => void }) {
  const adjust = (direction: number) => setValue(Math.min(1_000_000, Math.max(10, value + direction * 10)));
  return <div className="aviator-stepper mt-2"><button type="button" className="aviator-step-button" aria-label="Decrease blackjack stake" onClick={() => adjust(-1)}>−</button><input aria-label="stake" type="number" min={10} max={1_000_000} step={10} value={value} onChange={(event) => { const next = Number(event.target.value); if (Number.isFinite(next)) setValue(Math.min(1_000_000, Math.max(10, next))); }} className="aviator-step-value" /><button type="button" className="aviator-step-button" aria-label="Increase blackjack stake" onClick={() => adjust(1)}>+</button></div>;
}

function NumberStepper({ label, ariaLabel, value, setValue, min, max, step, decimals = 0 }: { label: string; ariaLabel: string; value: number; setValue: (value: number) => void; min: number; max: number; step: number; decimals?: number }) {
  const adjust = (direction: number) => {
    const next = Math.min(max, Math.max(min, value + direction * step));
    setValue(Number(next.toFixed(decimals)));
  };
  return <div><label className="label">{label}</label><div className="aviator-stepper mt-2"><button type="button" className="aviator-step-button" aria-label={`Decrease ${ariaLabel}`} onClick={() => adjust(-1)}>−</button><input aria-label={ariaLabel} type="number" min={min} max={max} step={step} value={value} onChange={(event) => { const next = Number(event.target.value); if (Number.isFinite(next)) setValue(Math.min(max, Math.max(min, next))); }} className="aviator-step-value" /><button type="button" className="aviator-step-button" aria-label={`Increase ${ariaLabel}`} onClick={() => adjust(1)}>+</button></div></div>;
}

function RocketIcon() {
  return <svg viewBox="0 0 80 80" aria-hidden="true" className="h-20 w-20 drop-shadow-[0_0_18px_rgba(255,197,61,.8)]"><path d="M51 8C39 13 25 27 19 43l18 18c16-6 30-20 35-32 4-10 3-18 1-24-7-1-13 0-22 3Z" fill="#F2F5FA" stroke="#FFC53D" strokeWidth="3"/><path d="m19 43-10 4 14 14 4-10" fill="#4EA8FF" stroke="#98A5C0" strokeWidth="2"/><path d="M39 61c-1 8-7 14-14 15 0-6 2-11 6-16" fill="#FF6B6B"/><circle cx="51" cy="31" r="7" fill="#111A36" stroke="#FFC53D" strokeWidth="3"/><path d="M61 12 73 8l-4 12" fill="#FFC53D" opacity=".9"/></svg>;
}

function createAudioContext() {
  const AudioContextCtor = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return AudioContextCtor ? new AudioContextCtor() : null;
}

function serverTimestamp(value: string | null | undefined) {
  if (!value) return 0;
  const normalized = value.includes('T') ? value : `${value.replace(' ', 'T')}Z`;
  return Date.parse(normalized);
}

type BlackjackSound = 'deal' | 'hit' | 'stand' | 'double' | 'win' | 'lose' | 'push';

function playBlackjackSound(kind: BlackjackSound) {
  const context = createAudioContext();
  if (!context) return;
  const now = context.currentTime;
  const master = context.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(kind === 'lose' ? 0.075 : 0.11, now + 0.012);
  master.gain.exponentialRampToValueAtTime(0.0001, now + (kind === 'win' ? 0.9 : 0.46));
  master.connect(context.destination);
  const notes: Record<BlackjackSound, number[]> = {
    deal: [240], hit: [300, 390], stand: [210], double: [300, 470],
    win: [440, 554, 659], lose: [220, 165, 110], push: [330, 330],
  };
  notes[kind].forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const start = now + index * (kind === 'win' ? 0.13 : 0.075);
    oscillator.type = kind === 'lose' ? 'triangle' : 'sine';
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(kind === 'win' ? 0.8 : 0.55, start + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + (kind === 'win' ? 0.22 : 0.14));
    oscillator.connect(gain).connect(master);
    oscillator.start(start);
    oscillator.stop(start + (kind === 'win' ? 0.25 : 0.17));
  });
  if (kind === 'deal' || kind === 'hit' || kind === 'double') {
    const buffer = context.createBuffer(1, Math.floor(context.sampleRate * 0.055), context.sampleRate);
    const noise = buffer.getChannelData(0);
    for (let index = 0; index < noise.length; index += 1) noise[index] = (Math.random() * 2 - 1) * (1 - index / noise.length);
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = buffer;
    filter.type = 'bandpass';
    filter.frequency.value = 1_500;
    gain.gain.value = 0.18;
    source.connect(filter).connect(gain).connect(master);
    source.start(now);
  }
  void context.resume();
  window.setTimeout(() => { if (context.state !== 'closed') void context.close(); }, kind === 'win' ? 1_050 : 600);
}

function Aviator() {
  const { user, balance } = useAuth();
  const { push } = useToast();
  const [stake, setStake] = useState(50);
  const [autoCashout, setAutoCashout] = useState(0);
  const [round, setRound] = useState<CasinoRound | null>(null);
  const [shownMultiplier, setShownMultiplier] = useState(1);
  const [countdown, setCountdown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<CasinoRound[]>([]);
  const audioRef = useRef<FlightAudio | null>(null);

  const loadHistory = useCallback(() => {
    if (user) void api.casinoHistory().then((payload) => setHistory(payload.rounds.filter((item) => item.game === 'aviator'))).catch(() => undefined);
  }, [user]);

  const startFlightSound = useCallback(() => {
    if (audioRef.current) {
      void audioRef.current.context.resume();
      return;
    }
    const context = createAudioContext();
    if (!context) return;
    const master = context.createGain();
    master.gain.setValueAtTime(0.0001, context.currentTime);
    master.gain.exponentialRampToValueAtTime(0.045, context.currentTime + 0.18);
    master.connect(context.destination);
    const engine = context.createOscillator();
    engine.type = 'sawtooth';
    engine.frequency.setValueAtTime(92, context.currentTime);
    engine.frequency.linearRampToValueAtTime(148, context.currentTime + 4.5);
    const turbine = context.createOscillator();
    turbine.type = 'triangle';
    turbine.frequency.setValueAtTime(184, context.currentTime);
    turbine.frequency.linearRampToValueAtTime(296, context.currentTime + 4.5);
    const engineGain = context.createGain();
    engineGain.gain.value = 0.28;
    const turbineGain = context.createGain();
    turbineGain.gain.value = 0.12;
    engine.connect(engineGain).connect(master);
    turbine.connect(turbineGain).connect(master);
    engine.start();
    turbine.start();
    audioRef.current = { context, engine, turbine, master };
    void context.resume();
  }, []);

  const playCrashSound = useCallback((context: AudioContext) => {
    const now = context.currentTime;
    const boom = context.createOscillator();
    const boomGain = context.createGain();
    boom.type = 'sine';
    boom.frequency.setValueAtTime(130, now);
    boom.frequency.exponentialRampToValueAtTime(42, now + 0.42);
    boomGain.gain.setValueAtTime(0.0001, now);
    boomGain.gain.exponentialRampToValueAtTime(0.26, now + 0.025);
    boomGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
    boom.connect(boomGain).connect(context.destination);
    const buffer = context.createBuffer(1, context.sampleRate * 0.42, context.sampleRate);
    const noise = buffer.getChannelData(0);
    for (let index = 0; index < noise.length; index += 1) noise[index] = (Math.random() * 2 - 1) * (1 - index / noise.length);
    const debris = context.createBufferSource();
    const debrisGain = context.createGain();
    const filter = context.createBiquadFilter();
    debris.buffer = buffer;
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    debrisGain.gain.setValueAtTime(0.0001, now);
    debrisGain.gain.exponentialRampToValueAtTime(0.34, now + 0.02);
    debrisGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.44);
    debris.connect(filter).connect(debrisGain).connect(context.destination);
    boom.start(now);
    boom.stop(now + 0.52);
    debris.start(now);
    debris.stop(now + 0.46);
  }, []);

  const stopFlightSound = useCallback((crashed: boolean) => {
    const active = audioRef.current;
    if (!active) return;
    const now = active.context.currentTime;
    active.master.gain.cancelScheduledValues(now);
    active.master.gain.setTargetAtTime(0.0001, now, 0.06);
    active.engine.stop(now + 0.16);
    active.turbine.stop(now + 0.16);
    audioRef.current = null;
    if (crashed) playCrashSound(active.context);
    window.setTimeout(() => { if (active.context.state !== 'closed') void active.context.close(); }, crashed ? 900 : 260);
  }, [playCrashSound]);

  useEffect(() => { loadHistory(); }, [loadHistory]);
  useEffect(() => {
    if (!round || round.status !== 'open') { setCountdown(0); return undefined; }
    const update = () => setCountdown(Math.max(0, Math.ceil((serverTimestamp(round.startedAt) - Date.now()) / 1000)));
    update();
    const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, [round?.id, round?.startedAt, round?.status]);
  useEffect(() => {
    if (!round || round.status !== 'open') return;
    const timer = window.setInterval(async () => {
      try {
        const payload = await api.aviatorState(round.id);
        setRound(payload.round);
        setShownMultiplier(payload.round.multiplier ?? 1);
        if (payload.round.status !== 'open') {
          stopFlightSound(payload.round.status === 'lost');
          push({ title: payload.round.status === 'won' ? 'Rocket recovered' : 'Rocket crashed', body: payload.round.status === 'won' ? `${payload.round.payout.toLocaleString()} beans returned.` : 'Impact confirmed. The stake moved to the house rake.', tone: payload.round.status === 'won' ? 'win' : 'loss' });
          loadHistory();
        } else if (autoCashout > 0 && payload.round.multiplier && payload.round.multiplier >= autoCashout) {
          const cash = await api.aviatorCashout(round.id, payload.round.multiplier);
          stopFlightSound(false);
          setRound(cash.round);
          push({ title: 'Auto cash-out', body: `${cash.round.payout.toLocaleString()} beans at ${cash.round.multiplier?.toFixed(2)}x.`, tone: 'win' });
          loadHistory();
        }
      } catch { /* the next tick will reconcile it */ }
    }, 450);
    return () => window.clearInterval(timer);
  }, [round, autoCashout, push, loadHistory, stopFlightSound]);

  useEffect(() => () => { if (audioRef.current) stopFlightSound(false); }, [stopFlightSound]);

  async function start() {
    if (!user) return;
    setBusy(true);
    startFlightSound();
    try {
      const payload = await api.aviatorStart({ stake, autoCashout });
      setRound(payload.round); setShownMultiplier(1);
    } catch (error) {
      stopFlightSound(false);
      push({ title: 'Could not launch round', body: error instanceof ApiError ? error.message : 'Try again.', tone: 'loss' });
    } finally { setBusy(false); }
  }

  async function cashout() {
    if (!round || countdown > 0) return;
    setBusy(true);
    try {
      const payload = await api.aviatorCashout(round.id, shownMultiplier);
      stopFlightSound(payload.round.status === 'lost');
      setRound(payload.round); loadHistory();
      push({ title: payload.round.status === 'won' ? 'Rocket recovered' : 'Too late — impact', body: `${payload.round.payout.toLocaleString()} beans returned.`, tone: payload.round.status === 'won' ? 'win' : 'loss' });
    } catch (error) { push({ title: 'Cash-out failed', body: error instanceof ApiError ? error.message : 'Try again.', tone: 'loss' }); }
    finally { setBusy(false); }
  }

  const open = round?.status === 'open';
  const crashed = round?.status === 'lost';
  const recovered = round?.status === 'won';
  const flightProgress = Math.min(0.88, Math.max(0, (Math.log(Math.max(1, shownMultiplier)) / Math.log(20)) * 0.88));
  const rocketX = 16 + flightProgress * 68;
  const rocketY = 14 + flightProgress * 64;
  // User-requested right rotation: CSS uses a positive angle for clockwise tilt.
  const rocketAngle = 40;
  return <div className="space-y-5">
    <GameTabs active="aviator" />
    <Panel className="overflow-hidden">
      <div className="border-b border-ink-700 bg-gradient-to-br from-[#15152d] via-ink-900 to-[#0d1427] p-5 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><Badge tone="gold">Main game</Badge><h1 className="display mt-3 text-5xl font-bold tracking-tight text-mist-100 uppercase sm:text-7xl">Aviator</h1><p className="mt-2 max-w-xl text-sm text-mist-400">Launch the rocket and climb toward the upper-right gate. Cash out before impact. This is a fictional bean simulation with no cash value.</p></div>
          <div className="text-right"><p className="label">Available balance</p><p className="mt-1 flex items-center justify-end gap-1.5 text-2xl font-bold text-gold-400"><BeanIcon className="h-5 w-5" />{beans(balance)}</p></div>
        </div>
        <div className={`aviator-stage mt-8 min-h-[300px] rounded-xl border border-ink-700 ${crashed ? 'aviator-stage--crashed' : ''}`}>
          <div className="aviator-flight-grid" aria-hidden="true" />
          <div className="aviator-gate" aria-hidden="true"><span>UPPER-RIGHT GATE</span></div>
          <svg className="aviator-trajectory" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d="M4 92 C25 91 30 78 42 73 C57 67 63 47 75 35 C83 27 89 20 97 10" /></svg>
          <div className={`aviator-rocket ${open ? 'aviator-rocket--flying' : ''} ${crashed ? 'aviator-rocket--crashed' : ''} ${recovered ? 'aviator-rocket--recovered' : ''}`} style={{ left: `${rocketX}%`, bottom: `${rocketY}%`, transform: `translate(-50%, 50%) rotate(${rocketAngle}deg)` }}><RocketIcon /></div>
          {crashed ? <div className="aviator-explosion" aria-label="Rocket crash animation"><span /><span /><span /><span /><span /><b>IMPACT</b></div> : null}
          <div className="aviator-readout"><div className={`text-6xl font-bold tracking-tight ${open ? 'text-gold-400' : crashed ? 'text-down-400' : recovered ? 'text-up-400' : 'text-mist-100'}`}>{open ? countdown > 0 ? `... ${countdown}s` : `${shownMultiplier.toFixed(2)}x` : crashed ? 'CRASHED' : round ? `${round.multiplier?.toFixed(2)}x` : '1.00x'}</div><p className="mt-2 text-xs uppercase tracking-[.25em] text-mist-500">{open ? countdown > 0 ? 'game starts in' : 'rocket in flight' : crashed ? 'impact confirmed' : recovered ? 'rocket recovered' : 'ready for launch'}</p></div>
        </div>
      </div>
      <div className="grid gap-4 p-5 sm:grid-cols-[1fr_1fr_auto] sm:p-6">
        <NumberStepper label="Stake (beans)" ariaLabel="stake" value={stake} setValue={setStake} min={10} max={1_000_000} step={10} />
        <NumberStepper label="Auto cash-out (x)" ariaLabel="auto cashout" value={autoCashout} setValue={setAutoCashout} min={0} max={50} step={0.1} decimals={2} />
        <div className="flex items-end"><button type="button" disabled={!user || busy || open} onClick={() => void start()} className="btn btn-primary w-full sm:w-auto">{open ? 'Rocket flying…' : user ? 'Launch rocket' : 'Sign in to play'}</button></div>
      </div>
      {open ? <div className="border-t border-ink-700 p-5"><button type="button" disabled={busy || countdown > 0} onClick={() => void cashout()} className="btn aviator-cashout w-full bg-up-400 text-ink-950 hover:bg-up-300"><span aria-hidden="true">✦</span> {countdown > 0 ? `Wait ${countdown}s to cash out` : `Recover rocket at ${shownMultiplier.toFixed(2)}x · ${beans(Math.floor(stake * shownMultiplier))} beans`}</button></div> : null}
    </Panel>
    <div className="grid gap-3 sm:grid-cols-3"><StatTile label="Flight path" value="↗ upper-right" hint="rocket climbs while live" tone="gold" /><StatTile label="Auto cash-out" value={autoCashout > 0 ? `${autoCashout.toFixed(2)}x` : 'OFF'} hint={autoCashout > 0 ? 'hands-free demo mode' : 'manual cash-out only'} /><StatTile label="Max demo stake" value="1M" hint="beans per round" /></div>
    <History rounds={history} />
  </div>;
}

type BlackjackCard = { rank?: string; suit?: string; hidden?: boolean };
type BlackjackHand = { cards: BlackjackCard[]; bet: number; status: string; doubled?: boolean; total?: number; result?: string; payout?: number; userId?: number; username?: string };
type BlackjackDetail = { phase: 'insurance' | 'player' | 'dealer' | 'settled'; activeHand: number; hands: BlackjackHand[]; dealer: { cards: BlackjackCard[]; revealed?: boolean; total?: number }; dealerRule?: 'S17' | 'H17'; insuranceBet?: number; insuranceResult?: string; insurancePayout?: number; result?: string; totalWager?: number; splitMade?: boolean };

function PlayingCard({ card, index, label }: { card: BlackjackCard; index: number; label: string }) {
  const hidden = card.hidden || !card.rank;
  const red = card.suit === '♥' || card.suit === '♦';
  return <div className={`blackjack-card ${hidden ? 'blackjack-card--hidden' : ''} ${red ? 'blackjack-card--red' : ''}`} style={{ animationDelay: `${index * 85}ms` }} aria-label={hidden ? `${label} hidden card` : `${label} ${card.rank} of ${card.suit}`}>
    {hidden ? <span className="blackjack-card-back">GB</span> : <><span className="blackjack-card-corner">{card.rank}<small>{card.suit}</small></span><span className="blackjack-card-center">{card.rank}<em>{card.suit}</em></span><span className="blackjack-card-corner blackjack-card-corner--bottom">{card.rank}<small>{card.suit}</small></span></>}
  </div>;
}

function BlackjackRules() {
  return <Panel className="p-5 sm:p-6"><SectionHeader title="How to play Blackjack" subtitle="A fast dealer-versus-player classic. No player competes against another player." /><div className="mt-5 grid gap-4 text-[12px] leading-relaxed text-mist-300 sm:grid-cols-2"><div><h3 className="label text-gold-400">The pack & object</h3><p className="mt-2">A standard 52-card pack with no jokers. Build a hand closer to 21 than the dealer without going over. Face cards count as 10, Aces count as 1 or 11, and number cards keep their pip value.</p><h3 className="label mt-5 text-gold-400">Setup</h3><p className="mt-2">Place an initial bet before cards are dealt. You receive two face-up cards. The dealer receives one face-up card and one hidden hole card.</p><h3 className="label mt-5 text-gold-400">Your turn</h3><ul className="mt-2 list-disc space-y-1 pl-5"><li><strong className="text-mist-100">Hit:</strong> take another card.</li><li><strong className="text-mist-100">Stand / Stay:</strong> keep your total and end your turn.</li><li><strong className="text-mist-100">Double Down:</strong> double your bet, take one final card, then stand.</li><li><strong className="text-mist-100">Split:</strong> when your opening cards are a pair, place a second equal bet and play two hands.</li></ul></div><div><h3 className="label text-gold-400">Dealer bot · S17</h3><p className="mt-2">The dealer automatically reveals the hole card after every player hand ends, draws while below 17, and stands on all 17s including soft 17 (Ace-6). If the dealer busts, all remaining hands win. Set <code className="text-gold-300">GOLDBEAN_BLACKJACK_DEALER_RULE=H17</code> to use hit-on-soft-17 instead.</p><h3 className="label mt-5 text-gold-400">Payouts</h3><ul className="mt-2 list-disc space-y-1 pl-5"><li>Win pays 1:1.</li><li>Blackjack (Ace plus a 10-value card) pays 3:2.</li><li>Push returns your bet.</li><li>Lose: the dealer collects the bet.</li></ul><h3 className="label mt-5 text-gold-400">Insurance</h3><p className="mt-2">When the dealer shows an Ace, insurance is optional and costs half the original wager. It pays 2:1 only when the hole card gives the dealer Blackjack; it is settled separately from the main hand.</p><h3 className="label mt-5 text-gold-400">Strategy tips</h3><p className="mt-2">Stand on 12–16 against a dealer 2–6; hit 12–16 against 7–Ace. Split Aces and 8s, never split 10s, double on 10 or 11, and generally avoid insurance.</p></div></div></Panel>;
}

function Blackjack() {
  const { user, balance, setBalance } = useAuth();
  const { push } = useToast();
  const [stake, setStake] = useState(50);
  const [round, setRound] = useState<CasinoRound | null>(null);
  const [history, setHistory] = useState<CasinoRound[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const load = useCallback(() => { if (user) void api.casinoHistory().then((payload) => setHistory(payload.rounds.filter((item) => item.game === 'blackjack'))).catch(() => undefined); }, [user]);
  useEffect(() => { load(); }, [load]);

  const detail = round?.detail as BlackjackDetail | null;
  const open = round?.status === 'open';
  const activeHand = detail?.hands?.[detail.activeHand];
  const dealer = detail?.dealer;
  const canSplit = Boolean(activeHand && detail?.hands.length === 1 && activeHand.cards.length === 2 && activeHand.cards[0].rank === activeHand.cards[1].rank);
  const canDouble = Boolean(activeHand && activeHand.cards.length === 2);
  const myTurn = Boolean(activeHand && user && Number(activeHand.userId) === Number(user.id));
  const resultTone = round?.result === 'push' || round?.status === 'void' ? 'push' : round?.status === 'won' ? 'win' : 'lose';
  const resultLabel = round?.result === 'blackjack' ? 'BLACKJACK!' : round?.result === 'push' || round?.status === 'void' ? 'PUSH' : round?.status === 'won' ? 'YOU WIN' : 'YOU LOSE';

  async function deal() {
    setBusy('deal');
    try {
      const payload = await api.blackjackStart(stake);
      setRound(payload.round); setBalance(payload.balance); load();
      playBlackjackSound(payload.round.status === 'open' ? 'deal' : payload.round.status === 'won' ? 'win' : 'lose');
      if (payload.round.status !== 'open') push({ title: payload.round.result === 'blackjack' ? 'Blackjack' : 'Hand complete', body: `${payload.round.result} · ${beans(payload.round.payout)} beans returned.`, tone: payload.round.status === 'won' ? 'win' : 'info' });
    } catch (error) { push({ title: 'Could not deal', body: error instanceof ApiError ? error.message : 'Try again.', tone: 'loss' }); }
    finally { setBusy(null); }
  }

  async function action(name: 'hit' | 'stand' | 'double' | 'split' | 'insurance' | 'decline_insurance') {
    if (!round) return;
    setBusy(name);
    try {
      const payload = await api.blackjackAction(round.id, name);
      setRound(payload.round); setBalance(payload.balance);
      const actionSound: BlackjackSound = name === 'hit' ? 'hit' : name === 'stand' ? 'stand' : name === 'double' ? 'double' : 'deal';
      playBlackjackSound(payload.round.status === 'open' ? actionSound : payload.round.result === 'push' ? 'push' : payload.round.status === 'won' ? 'win' : 'lose');
      if (payload.round.status !== 'open') { load(); push({ title: payload.round.result === 'blackjack' ? 'Blackjack!' : payload.round.result === 'push' ? 'Push' : payload.round.status === 'won' ? 'Hand won' : 'Dealer wins', body: `${payload.round.result} · ${beans(payload.round.payout)} beans returned.`, tone: payload.round.status === 'won' ? 'win' : payload.round.status === 'void' ? 'info' : 'loss' }); }
    } catch (error) { push({ title: 'Action unavailable', body: error instanceof ApiError ? error.message : 'Try again.', tone: 'loss' }); }
    finally { setBusy(null); }
  }

  useEffect(() => {
    const roundId = round?.id;
    if (!roundId || !open) return undefined;
    const timer = window.setInterval(async () => {
      try {
        const payload = await api.blackjackState(roundId);
        setRound(payload.round); setBalance(payload.balance);
      } catch { /* next poll retries */ }
    }, 900);
    return () => window.clearInterval(timer);
  }, [round?.id, open, setBalance]);

  async function joinTable(tableId?: string) {
    setBusy(tableId ? 'join-code' : 'join-random');
    try {
      const payload = tableId ? await api.blackjackJoin(tableId, stake) : await api.blackjackJoinRandom(stake);
      setRound(payload.round); setBalance(payload.balance); setJoinCode('');
      push({ title: 'Joined Blackjack table', body: `Seat ${payload.round.detail?.hands?.findIndex((hand: BlackjackHand) => Number(hand.userId) === Number(user?.id)) + 1} of 4 is ready.`, tone: 'win' });
    } catch (error) { push({ title: 'Could not join table', body: error instanceof ApiError ? error.message : 'Try again.', tone: 'loss' }); }
    finally { setBusy(null); }
  }

  async function copyInvite() {
    if (!round) return;
    try { await navigator.clipboard.writeText(`${window.location.origin}/blackjack?table=${round.ref}`); push({ title: 'Invite link copied', body: `Share table code ${round.ref} with a friend.`, tone: 'win' }); }
    catch { push({ title: 'Table code ready', body: `Share code ${round.ref} with a friend.`, tone: 'info' }); }
  }

  return <div className="space-y-5"><GameTabs active="blackjack" /><Panel className="overflow-hidden"><div className="blackjack-table p-5 sm:p-8"><div className="flex flex-wrap items-start justify-between gap-4"><div><Badge tone="info">Interactive table</Badge><h1 className="display mt-3 text-5xl font-bold uppercase text-mist-100 sm:text-7xl">Blackjack</h1><p className="mt-2 max-w-xl text-sm text-mist-400">Beat the dealer, not the table. Every deal is a fictional bean simulation with no cash value.</p></div><div className="text-right"><p className="label">Available balance</p><p className="mt-1 flex items-center justify-end gap-1.5 text-2xl font-bold text-gold-400"><BeanIcon className="h-5 w-5" />{beans(balance)}</p></div></div>
    <div className="blackjack-felt mt-8 rounded-2xl border border-gold-500/20 p-4 sm:p-7"><div className="flex items-center justify-between"><span className="label text-gold-400">Dealer</span>{dealer?.total ? <Badge tone={dealer.total > 21 ? 'down' : 'gold'}>{dealer.total}</Badge> : <span className="text-xs text-mist-500">hole card hidden</span>}</div><div className="mt-3 flex min-h-[148px] flex-wrap gap-3">{dealer?.cards?.map((card, index) => <PlayingCard key={`${index}-${card.rank ?? 'hidden'}`} card={card} index={index} label="Dealer" />) ?? <div className="blackjack-deck-placeholder">Cards will deal here</div>}</div><div className="my-5 h-px bg-gold-500/15" /><div className="flex items-center justify-between"><span className="label text-gold-400">Player hands · {detail?.hands?.length ?? 0}/4 seats</span>{activeHand?.total ? <Badge tone={activeHand.total > 21 ? 'down' : 'up'}>{activeHand.total}</Badge> : null}</div><div className="mt-3 grid gap-4">{detail?.hands?.map((hand, handIndex) => <div key={handIndex} className={`rounded-xl border p-3 ${handIndex === detail.activeHand && open ? 'border-gold-400/70 bg-gold-500/[.08]' : 'border-ink-700 bg-ink-950/20'}`}><div className="mb-3 flex items-center justify-between"><span className="text-xs font-semibold text-mist-200">{hand.username ?? `Player ${handIndex + 1}`} · bet {beans(hand.bet)}{Number(hand.userId) === Number(user?.id) ? ' · You' : ''}</span><span className="text-[11px] uppercase tracking-wider text-mist-500">{handIndex === detail.activeHand && open ? (myTurn ? 'your turn' : `${hand.username ?? 'Player'} turn`) : hand.result ?? (hand.status === 'playing' ? 'waiting' : hand.status)}</span></div><div className="flex min-h-[120px] flex-wrap gap-2">{hand.cards.map((card, index) => <PlayingCard key={`${handIndex}-${index}-${card.rank}`} card={card} index={index} label={`${hand.username ?? `Player ${handIndex + 1}`} hand`} />)}</div></div>) ?? <div className="blackjack-deck-placeholder">Deal two cards to begin</div>}</div>{round && !open ? <div className={`blackjack-result blackjack-result--${resultTone}`} role="status" aria-live="polite"><span>{resultLabel}</span><strong>{beans(round.payout)} beans returned</strong><small>{round.result === 'blackjack' ? 'Natural blackjack' : round.result === 'push' ? 'Your wager was returned' : 'Round settled'}</small></div> : null}</div>
    {open && detail?.phase === 'insurance' ? <div className="blackjack-action-rack mt-5"><p className="text-sm font-semibold text-mist-100">Dealer shows an Ace — insurance?</p><p className="mt-1 text-xs text-mist-400">Insurance costs {beans(Math.floor(stake / 2))} beans and pays 2:1 only if the dealer has Blackjack.</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={busy !== null} onClick={() => void action('insurance')} className="btn btn-primary">{busy === 'insurance' ? 'Placing…' : 'Take insurance'}</button><button type="button" disabled={busy !== null} onClick={() => void action('decline_insurance')} className="btn btn-ghost">Decline</button></div></div> : null}
    {open && detail?.phase === 'player' && myTurn ? <div className="blackjack-action-rack mt-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-semibold text-mist-100">Your move · Hand {detail.activeHand + 1}</p><p className="mt-1 text-xs text-mist-400">The dealer bot uses {detail.dealerRule ?? 'S17'} and plays after all four seats finish.</p></div><div className="flex flex-wrap gap-2"><button type="button" disabled={busy !== null} onClick={() => void action('hit')} className="btn btn-primary">{busy === 'hit' ? 'Dealing…' : 'Hit'}</button><button type="button" disabled={busy !== null} onClick={() => void action('stand')} className="btn btn-ghost">Stand</button>{canDouble ? <button type="button" disabled={busy !== null} onClick={() => void action('double')} className="btn btn-ghost">Double Down</button> : null}{canSplit ? <button type="button" disabled={busy !== null} onClick={() => void action('split')} className="btn btn-ghost">Split</button> : null}</div></div></div> : open && detail?.phase === 'player' ? <p className="mt-5 rounded-xl border border-ink-700 bg-ink-850/70 p-4 text-center text-xs text-mist-400">Waiting for {activeHand?.username ?? 'the active player'} to finish their hand…</p> : null}
    <div className="mt-5 flex flex-wrap items-end gap-3"><div className="w-48"><label className="label">Initial bet (beans)</label><StakeInput value={stake} setValue={setStake} /></div>{!open ? <button type="button" disabled={!user || busy !== null} onClick={() => void deal()} className="btn btn-primary">{busy === 'deal' ? 'Dealing…' : user ? 'Open table' : 'Sign in to play'}</button> : null}</div>
    {open ? <div className="mt-4 rounded-xl border border-ink-700 bg-ink-950/40 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="label">Shared table · {detail?.hands?.length ?? 0}/4 seats</p><p className="mt-1 text-xs text-mist-400">Code <strong className="text-gold-300">{round?.ref}</strong> · one dealer, separate hands</p></div><button type="button" disabled={busy !== null} onClick={() => void copyInvite()} className="btn btn-ghost text-[11px]">Invite friends</button></div><div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={busy !== null} onClick={() => void joinTable()} className="btn btn-primary text-[11px]">{busy === 'join-random' ? 'Finding seat…' : 'Join random table'}</button><input aria-label="Blackjack table code" value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} className="field min-w-[150px] flex-1" placeholder="Enter table code" /><button type="button" disabled={busy !== null || !joinCode.trim()} onClick={() => void joinTable(joinCode.trim())} className="btn btn-ghost text-[11px]">Join code</button></div></div> : null}
    {round && !open ? <div className="mt-5 rounded-xl border border-gold-500/20 bg-gold-500/[.06] p-4 text-sm text-mist-200"><span className="label">Last hand</span><p className="mt-1">{round.result} · <strong className="text-gold-400">{beans(round.payout)} beans returned</strong>{detail?.insuranceBet ? ` · insurance ${detail.insuranceResult}` : ''}</p></div> : null}</div></Panel><BlackjackRules /><History rounds={history} /></div>;
}

function History({ rounds }: { rounds: CasinoRound[] }) {
  return <section className="space-y-3"><SectionHeader title="Recent rounds" subtitle="Your simulated casino history" />{rounds.length ? <Panel className="overflow-hidden"><div className="divide-y divide-ink-800">{rounds.slice(0, 8).map((round) => <div key={round.id} className="flex items-center gap-3 px-3 py-3 text-[12px]"><Badge tone={round.status === 'won' ? 'up' : round.status === 'lost' ? 'down' : 'neutral'}>{round.result ?? round.status}</Badge><span className="flex-1 text-mist-300">{round.ref}</span><span className="tnum text-mist-400">stake {beans(round.stake)}</span><span className="tnum font-semibold text-gold-400">{beans(round.payout)}</span></div>)}</div></Panel> : <Panel><EmptyState title="No rounds yet" body="Sign in and deal a hand to start your history." /></Panel>}</section>;
}

export function Casino({ game }: { game: Game }) { return game === 'aviator' ? <Aviator /> : <Blackjack />; }
