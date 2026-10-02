import type {
  Bet,
  BetStats,
  Fixture,
  FriendsState,
  Leader,
  Meta,
  PlatformStats,
  RewardsState,
  Sport,
  User,
  WalletState,
} from './types';

const TOKEN_KEY = 'goldbean.token';

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private mode: the cookie still carries the session */
  }
}

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(`/api${path}`, { credentials: 'include', ...init, headers });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new ApiError(
      payload?.error ?? 'Request failed.',
      payload?.code ?? 'error',
      response.status,
    );
  }
  return payload as T;
}

export const api = {
  meta: () => request<Meta>('/meta'),

  register: (body: { email: string; username: string; password: string }) =>
    request<{ user: User; token: string; balance: number; welcomeBonus: number }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  login: (body: { identifier: string; password: string }) =>
    request<{ user: User; token: string; balance: number }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  logout: () => request<{ ok: boolean }>('/auth/logout', { method: 'POST' }),

  me: () => request<{ user: User | null; balance?: number }>('/auth/me'),

  board: (includeFinished = false) =>
    request<{ sports: Sport[]; events: Fixture[]; serverTime: string; tickMs: number }>(
      `/board${includeFinished ? '?finished=1' : ''}`,
    ),

  event: (id: number) => request<{ event: Fixture }>(`/events/${id}`),

  wallet: () => request<WalletState>('/wallet'),

  rewards: () => request<RewardsState>('/rewards'),

  redeemReward: (rewardKey: string) =>
    request<{ ok: boolean; redemption: RewardsState['redemption']; balance: number }>('/rewards/redeem', {
      method: 'POST', body: JSON.stringify({ rewardKey }),
    }),

  claimDrop: () =>
    request<{ granted: number; balance: number; statement: WalletState['statement']; stats: BetStats }>(
      '/wallet/drop',
      { method: 'POST' },
    ),

  bets: () => request<{ bets: Bet[]; stats: BetStats }>('/bets'),

  placeBet: (body: { stake: number; legs: { selectionId: number }[] }) =>
    request<{ bet: Bet; balance: number; stats: BetStats }>('/bets', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  leaderboard: () => request<{ leaders: Leader[] }>('/leaderboard'),

  stats: () => request<PlatformStats>('/stats'),

  adminOverview: () =>
    request<{
      users: (User & { last_login_at: string | null; balance: number })[];
      events: {
        id: number;
        status: string;
        league: string;
        home_name: string;
        away_name: string;
        home_score: number;
        away_score: number;
        clock: number;
        starts_at: string;
      }[];
      house: { accounts: { code: string; label: string; kind: string; net: number }[]; beansInPlayersHands: number };
      sports: { key: string; name: string; glyph: string }[];
    }>('/admin/overview'),

  adminCreateEvent: (body: {
    sportKey: string;
    startsInMinutes?: number;
    live?: boolean;
    featured?: boolean;
  }) => request<{ id: number }>('/admin/events', { method: 'POST', body: JSON.stringify(body) }),

  adminFinishEvent: (id: number) =>
    request<{ ok: boolean; settled: number }>(`/admin/events/${id}/finish`, { method: 'POST' }),

  adminVoidEvent: (id: number) =>
    request<{ ok: boolean; settled: number }>(`/admin/events/${id}/void`, { method: 'POST' }),

  casinoHistory: () => request<{ rounds: CasinoRound[] }>('/games/history'),

  aviatorStart: (body: { stake: number; autoCashout?: number | null }) =>
    request<{ round: CasinoRound; balance: number }>('/games/aviator/start', {
      method: 'POST', body: JSON.stringify(body),
    }),

  aviatorState: (id: number) =>
    request<{ round: CasinoRound; balance: number }>(`/games/aviator/${id}`),

  aviatorCashout: (id: number, multiplier?: number) =>
    request<{ round: CasinoRound; balance: number }>(`/games/aviator/${id}/cashout`, {
      method: 'POST', body: JSON.stringify({ multiplier }),
    }),

  blackjackStart: (stake: number) =>
    request<{ round: CasinoRound; balance: number }>('/games/blackjack/start', {
      method: 'POST', body: JSON.stringify({ stake }),
    }),

  blackjackJoin: (tableId: string, stake: number) =>
    request<{ round: CasinoRound; balance: number }>(`/games/blackjack/${encodeURIComponent(tableId)}/join`, {
      method: 'POST', body: JSON.stringify({ stake }),
    }),

  blackjackJoinRandom: (stake: number) =>
    request<{ round: CasinoRound; balance: number }>('/games/blackjack/join-random', {
      method: 'POST', body: JSON.stringify({ stake }),
    }),

  blackjackState: (id: number) =>
    request<{ round: CasinoRound; balance: number }>(`/games/blackjack/${id}`),

  blackjackAction: (id: number, action: 'hit' | 'stand' | 'double' | 'split' | 'insurance' | 'decline_insurance') =>
    request<{ round: CasinoRound; balance: number }>(`/games/blackjack/${id}/action`, {
      method: 'POST', body: JSON.stringify({ action }),
    }),

  adminGrantBeans: (body: { username: string; amount: number; memo?: string }) =>
    request<{ ok: boolean; username: string; granted: number; balance: number }>('/admin/beans/grant', {
      method: 'POST', body: JSON.stringify(body),
    }),

  friends: () => request<FriendsState>('/friends'),

  searchPlayers: (query: string) =>
    request<{ users: Array<{ id: number; username: string; avatarHue: number; role: string; relationship: 'none' | 'friend' | 'incoming' | 'outgoing' }> }>(`/friends/search?q=${encodeURIComponent(query)}`),

  sendFriendRequest: (username: string) =>
    request<{ ok: boolean; status: string; user: { id: number; username: string; avatarHue: number; role: string } }>('/friends/requests', {
      method: 'POST', body: JSON.stringify({ username }),
    }),

  answerFriendRequest: (id: number, action: 'accept' | 'decline') =>
    request<{ ok: boolean; status: string }>(`/friends/requests/${id}/${action}`, { method: 'POST' }),

  giftBeans: (username: string, amount: number) =>
    request<{ ok: boolean; gifted: number; balance: number; recipient: { username: string } }>('/friends/gift', {
      method: 'POST', body: JSON.stringify({ username, amount }),
    }),
};

export type CasinoRound = {
  id: number;
  ref: string;
  game: string;
  stake: number;
  status: 'open' | 'won' | 'lost' | 'void';
  payout: number;
  result: string | null;
  multiplier: number | null;
  crashMultiplier: number | null;
  startedAt: string;
  crashAt: string | null;
  settledAt: string | null;
  detail: any;
};
