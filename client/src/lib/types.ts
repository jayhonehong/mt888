export type Sport = { key: string; name: string; glyph: string };

export type FixtureStatus = 'upcoming' | 'live' | 'finished';
export type LegResult = 'pending' | 'won' | 'lost' | 'void';
export type BetStatus = 'open' | 'won' | 'lost' | 'void';

export type Selection = {
  id: number;
  key: string;
  name: string;
  odds: number;
  openingOdds: number;
  result: LegResult;
  history?: number[];
};

export type Market = {
  id: number;
  key: string;
  name: string;
  line: number | null;
  selections: Selection[];
};

export type Side = { name: string; abbr: string; color: string; score: number };

export type Fixture = {
  id: number;
  sport: string;
  sportName: string;
  sportGlyph: string;
  league: string;
  status: FixtureStatus;
  period: string;
  clock: number;
  clockLabel: string;
  clockMax: number;
  durationSeconds: number;
  home: Side;
  away: Side;
  startsAt: string;
  featured: boolean;
  markets: Market[];
};

export type User = {
  id: number;
  email: string;
  username: string;
  role: 'player' | 'admin';
  status: string;
  avatarHue: number;
  createdAt: string;
};

export type SocialUser = Pick<User, 'id' | 'username' | 'avatarHue' | 'role'>;

export type FriendRecord = { friendshipId: number; createdAt: string; user: SocialUser };
export type FriendRequest = { requestId: number; createdAt: string; user: SocialUser };
export type FriendsState = { friends: FriendRecord[]; requests: FriendRequest[]; sent: FriendRequest[] };

export type BetLeg = {
  id: number;
  eventId: number;
  marketName: string;
  selectionName: string;
  eventLabel: string;
  odds: number;
  result: LegResult;
};

export type Bet = {
  id: number;
  ref: string;
  stake: number;
  combinedOdds: number;
  potentialPayout: number;
  payout: number;
  status: BetStatus;
  placedAt: string;
  settledAt: string | null;
  legs: BetLeg[];
};

export type BetStats = {
  total: number;
  open: number;
  atRisk: number;
  won: number;
  lost: number;
  strikeRate: number;
  net: number;
};

export type LedgerEntry = {
  id: number;
  at: string;
  refType: string;
  refId: string | null;
  memo: string;
  delta: number;
  balance: number;
};

export type DropState = {
  amount: number;
  available: boolean;
  nextAt: string | null;
  cooldownMs: number;
};

export type WalletState = {
  balance: number;
  statement: LedgerEntry[];
  stats: BetStats;
  drop: DropState;
};

export type Reward = { key: string; rmAmount: number; beanCost: number; label: string };
export type Redemption = { rewardKey: string; rmAmount: number; beanCost: number; status: 'unavailable'; message: string; createdAt?: string };
export type RewardsState = { rewards: Reward[]; redemption: Redemption | null; balance: number; terms: string };

export type Leader = {
  rank: number;
  id: number;
  username: string;
  avatarHue: number;
  balance: number;
  bets: number;
  wins: number;
};

export type PlatformStats = {
  players: number;
  liveEvents: number;
  upcomingEvents: number;
  bets: number;
  beansStaked: number;
  beansPaidOut: number;
  beansInPlay: number;
  beansInEscrow: number;
  beansRaked: number;
  beansIssued: number;
  ledgerBalanced: boolean;
  ledger: { code: string; label: string; kind: string; net: number }[];
};

export type Meta = {
  currency: { code: string; name: string; symbol: string; isRealMoney: boolean };
  welcomeBonus: number;
  dailyTopUp: number;
  dropCooldownMs: number;
  limits: { minStake: number; maxStake: number; maxLegs: number };
  disclaimer: string;
};

export type SlipLeg = {
  selectionId: number;
  eventId: number;
  eventLabel: string;
  marketName: string;
  selectionName: string;
  odds: number;
  sport: string;
  status: FixtureStatus;
};

export type PricePatch = { id: number; odds: number; dir: 1 | -1 };

export type EventPatch = {
  id: number;
  clock: number;
  period: string;
  homeScore: number;
  awayScore: number;
  scored: boolean;
};

export type TickMessage = {
  type: 'tick';
  prices: PricePatch[];
  events: EventPatch[];
  finished: number[];
  added: Fixture[];
  promoted: Fixture[];
  at: string;
};
