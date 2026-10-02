/**
 * REST surface. Every response is JSON; errors carry a stable `code` so the
 * client can react without string matching on messages.
 */
import express from 'express';
import { all, get, run } from './db.js';
import {
  COOKIE_NAME,
  clearSessionCookie,
  hashPassword,
  issueToken,
  publicUser,
  requireAdmin,
  requireAuth,
  setSessionCookie,
  throttle,
  touchLogin,
  verifyPassword,
} from './auth.js';
import {
  DAILY_TOPUP,
  LedgerError,
  WELCOME_BONUS,
  createWallet,
  grantBeans,
  houseSnapshot,
  statement,
  transferBeans,
  walletBalance,
} from './ledger.js';
import {
  BetError,
  MAX_LEGS,
  MAX_STAKE,
  MIN_STAKE,
  betStats,
  listBets,
  placeBet,
} from './betting.js';
import { boardPayload, forceFinish, serializeEvent } from './simulator.js';
import { createEvent as seedEvent } from './seed.js';
import { CLUBS, LEAGUES, SPORTS } from './catalogue.js';
import { voidEvent } from './betting.js';

export const router = express.Router();

const DROP_COOLDOWN_MS = Number(process.env.GOLDBEAN_DROP_COOLDOWN_MS ?? 3 * 60 * 1000);

const REWARDS = [
  { key: 'rm100', rmAmount: 100, beanCost: 5_000, label: 'RM100 reward' },
  { key: 'rm200', rmAmount: 200, beanCost: 10_000, label: 'RM200 reward' },
  { key: 'rm500', rmAmount: 500, beanCost: 20_000, label: 'RM500 reward' },
  { key: 'rm1000', rmAmount: 1_000, beanCost: 40_000, label: 'RM1,000 reward' },
];

function fail(res, error) {
  const status = error.status ?? 500;
  if (status >= 500) console.error('[api]', error);
  res.status(status).json({
    error: status >= 500 ? 'Something broke on our side.' : error.message,
    code: error.code ?? 'error',
  });
}

const wrap = (handler) => (req, res, next) => {
  try {
    handler(req, res, next);
  } catch (error) {
    fail(res, error);
  }
};

// ---------------------------------------------------------------------------
// Health & metadata
// ---------------------------------------------------------------------------

router.get('/health', (_req, res) => res.json({ ok: true, at: new Date().toISOString() }));

router.get(
  '/meta',
  wrap((_req, res) => {
    res.json({
      currency: { code: 'BEAN', name: 'Gold Beans', symbol: '🫘', isRealMoney: false },
      welcomeBonus: WELCOME_BONUS,
      dailyTopUp: DAILY_TOPUP,
      dropCooldownMs: DROP_COOLDOWN_MS,
      limits: { minStake: MIN_STAKE, maxStake: MAX_STAKE, maxLegs: MAX_LEGS },
      disclaimer:
        'GoldBean Arena is a fictional simulation built for coursework. Beans are play money: they cannot be bought, sold, transferred or cashed out, and no real wagering or payment service is connected.',
    });
  }),
);

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

function validateRegistration({ email, username, password }) {
  const cleanEmail = String(email ?? '').trim().toLowerCase();
  const cleanName = String(username ?? '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail)) {
    throw Object.assign(new Error('That email address does not look right.'), { code: 'bad_email', status: 400 });
  }
  if (!/^[A-Za-z0-9_]{3,20}$/.test(cleanName)) {
    throw Object.assign(new Error('Usernames are 3-20 letters, numbers or underscores.'), {
      code: 'bad_username',
      status: 400,
    });
  }
  if (String(password ?? '').length < 8) {
    throw Object.assign(new Error('Use at least 8 characters for your password.'), {
      code: 'bad_password',
      status: 400,
    });
  }
  return { email: cleanEmail, username: cleanName, password: String(password) };
}

router.post(
  '/auth/register',
  throttle({ max: 8 }),
  wrap((req, res) => {
    const { email, username, password } = validateRegistration(req.body ?? {});

    if (get('SELECT id FROM users WHERE email = ?', email)) {
      throw Object.assign(new Error('That email is already registered.'), { code: 'email_taken', status: 409 });
    }
    if (get('SELECT id FROM users WHERE lower(username) = lower(?)', username)) {
      throw Object.assign(new Error('That username is taken.'), { code: 'username_taken', status: 409 });
    }

    const info = run(
      'INSERT INTO users (email, username, password_hash, role, avatar_hue) VALUES (?, ?, ?, ?, ?)',
      email,
      username,
      hashPassword(password),
      'player',
      Math.floor(Math.random() * 360),
    );
    const userId = Number(info.lastInsertRowid);
    createWallet(userId, username);
    grantBeans({
      userId,
      amount: WELCOME_BONUS,
      refType: 'signup_bonus',
      refId: String(userId),
      memo: 'Welcome bonus',
    });

    const user = get('SELECT * FROM users WHERE id = ?', userId);
    const token = issueToken(user);
    setSessionCookie(req, res, token);
    res.status(201).json({
      user: publicUser(user),
      token,
      balance: walletBalance(userId),
      welcomeBonus: WELCOME_BONUS,
    });
  }),
);

router.post(
  '/auth/login',
  throttle({ max: 12 }),
  wrap((req, res) => {
    const identifier = String(req.body?.identifier ?? req.body?.email ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '');
    if (!identifier || !password) {
      throw Object.assign(new Error('Enter your username and password.'), { code: 'missing_fields', status: 400 });
    }

    const user = get('SELECT * FROM users WHERE email = ? OR lower(username) = ?', identifier, identifier);
    if (!user || !verifyPassword(password, user.password_hash)) {
      throw Object.assign(new Error('Those credentials do not match.'), { code: 'bad_credentials', status: 401 });
    }
    if (user.status !== 'active') {
      throw Object.assign(new Error('This account is suspended.'), { code: 'suspended', status: 403 });
    }

    touchLogin(user.id);
    const token = issueToken(user);
    setSessionCookie(req, res, token);
    res.json({ user: publicUser(user), token, balance: walletBalance(user.id) });
  }),
);

router.post('/auth/logout', (req, res) => {
  clearSessionCookie(req, res);
  res.json({ ok: true });
});

router.get('/auth/me', (req, res) => {
  if (!req.user) return res.json({ user: null });
  res.json({ user: publicUser(req.user), balance: walletBalance(req.user.id), cookieName: COOKIE_NAME });
});

// ---------------------------------------------------------------------------
// Board
// ---------------------------------------------------------------------------

router.get(
  '/board',
  wrap((req, res) => {
    const includeFinished = req.query.finished === '1';
    res.json(boardPayload({ includeFinished }));
  }),
);

router.get(
  '/events/:id',
  wrap((req, res) => {
    const id = Number(req.params.id);
    const event = get(
      `SELECT e.*, s.key AS sport_key, s.name AS sport_name, s.glyph AS sport_glyph
         FROM events e JOIN sports s ON s.id = e.sport_id WHERE e.id = ?`,
      id,
    );
    if (!event) {
      throw Object.assign(new Error('No such fixture.'), { code: 'not_found', status: 404 });
    }
    const markets = all('SELECT * FROM markets WHERE event_id = ? ORDER BY sort, id', id).map((market) => ({
      id: market.id,
      key: market.key,
      name: market.name,
      line: market.line,
      selections: all('SELECT * FROM selections WHERE market_id = ? ORDER BY sort, id', market.id).map((s) => ({
        id: s.id,
        key: s.key,
        name: s.name,
        odds: Number(s.odds),
        openingOdds: Number(s.opening_odds),
        result: s.result,
      })),
    }));
    res.json({ event: { ...serializeEvent(event), markets } });
  }),
);

router.get(
  '/sports',
  wrap((_req, res) => {
    res.json({
      sports: all('SELECT key, name, glyph FROM sports ORDER BY id'),
      clubs: CLUBS,
      leagues: LEAGUES,
    });
  }),
);

// ---------------------------------------------------------------------------
// Wallet
// ---------------------------------------------------------------------------

router.get(
  '/wallet',
  requireAuth,
  wrap((req, res) => {
    const lastDrop = get(
      `SELECT created_at FROM journals
        WHERE ref_type = 'daily_drop' AND ref_id = ?
        ORDER BY id DESC LIMIT 1`,
      String(req.user.id),
    );
    const lastAt = lastDrop ? new Date(`${lastDrop.created_at.replace(' ', 'T')}Z`).getTime() : 0;
    const nextDropAt = lastAt ? lastAt + DROP_COOLDOWN_MS : 0;

    res.json({
      balance: walletBalance(req.user.id),
      statement: statement(req.user.id, { limit: 60 }),
      stats: betStats(req.user.id),
      drop: {
        amount: DAILY_TOPUP,
        available: Date.now() >= nextDropAt,
        nextAt: nextDropAt ? new Date(nextDropAt).toISOString() : null,
        cooldownMs: DROP_COOLDOWN_MS,
      },
    });
  }),
);

router.post(
  '/wallet/drop',
  requireAuth,
  wrap((req, res) => {
    const lastDrop = get(
      `SELECT created_at FROM journals
        WHERE ref_type = 'daily_drop' AND ref_id = ?
        ORDER BY id DESC LIMIT 1`,
      String(req.user.id),
    );
    if (lastDrop) {
      const lastAt = new Date(`${lastDrop.created_at.replace(' ', 'T')}Z`).getTime();
      const waitMs = lastAt + DROP_COOLDOWN_MS - Date.now();
      if (waitMs > 0) {
        throw Object.assign(new Error(`Next free drop in ${Math.ceil(waitMs / 1000)}s.`), {
          code: 'drop_cooldown',
          status: 429,
          nextAt: new Date(lastAt + DROP_COOLDOWN_MS).toISOString(),
        });
      }
    }

    grantBeans({
      userId: req.user.id,
      amount: DAILY_TOPUP,
      refType: 'daily_drop',
      refId: String(req.user.id),
      memo: 'Free bean drop',
    });

    res.json({
      granted: DAILY_TOPUP,
      balance: walletBalance(req.user.id),
      statement: statement(req.user.id, { limit: 60 }),
      stats: betStats(req.user.id),
    });
  }),
);

// ---------------------------------------------------------------------------
// Rewards catalogue — unavailable simulation flow, never a cash-out
// ---------------------------------------------------------------------------

router.get(
  '/rewards',
  requireAuth,
  wrap((req, res) => {
    const redemption = get('SELECT reward_key, rm_amount, bean_cost, status, message, created_at FROM reward_redemptions WHERE user_id = ?', req.user.id);
    res.json({
      rewards: REWARDS,
      redemption: redemption
        ? { rewardKey: redemption.reward_key, rmAmount: redemption.rm_amount, beanCost: redemption.bean_cost, status: redemption.status, message: redemption.message, createdAt: redemption.created_at }
        : null,
      balance: walletBalance(req.user.id),
      terms: 'Each player may submit one reward redemption attempt. Reward products are currently unavailable, and no beans are deducted.',
    });
  }),
);

router.post(
  '/rewards/redeem',
  requireAuth,
  wrap((req, res) => {
    const reward = REWARDS.find((item) => item.key === String(req.body?.rewardKey ?? ''));
    if (!reward) throw Object.assign(new Error('Choose a valid reward.'), { code: 'reward_not_found', status: 400 });
    const existing = get('SELECT id FROM reward_redemptions WHERE user_id = ?', req.user.id);
    if (existing) throw Object.assign(new Error('Each player can redeem only one reward.'), { code: 'redemption_already_used', status: 409 });
    if (walletBalance(req.user.id) < reward.beanCost) {
      throw Object.assign(new Error(`You need ${reward.beanCost.toLocaleString()} gold beans for this reward.`), { code: 'insufficient_reward_balance', status: 400 });
    }
    run(
      `INSERT INTO reward_redemptions (user_id, reward_key, rm_amount, bean_cost, status, message)
       VALUES (?, ?, ?, ?, 'unavailable', 'Product unavailable')`,
      req.user.id, reward.key, reward.rmAmount, reward.beanCost,
    );
    res.status(202).json({
      ok: true,
      redemption: { rewardKey: reward.key, rmAmount: reward.rmAmount, beanCost: reward.beanCost, status: 'unavailable', message: 'Product unavailable' },
      balance: walletBalance(req.user.id),
    });
  }),
);

// ---------------------------------------------------------------------------
// Bets
// ---------------------------------------------------------------------------

router.get(
  '/bets',
  requireAuth,
  wrap((req, res) => {
    res.json({ bets: listBets(req.user.id), stats: betStats(req.user.id) });
  }),
);

router.post(
  '/bets',
  requireAuth,
  wrap((req, res) => {
    const bet = placeBet({
      userId: req.user.id,
      legs: req.body?.legs ?? [],
      stake: req.body?.stake,
    });
    res.status(201).json({ bet, balance: walletBalance(req.user.id), stats: betStats(req.user.id) });
  }),
);

// ---------------------------------------------------------------------------
// Social / stats
// ---------------------------------------------------------------------------

function socialUser(row) {
  return { id: row.id, username: row.username, avatarHue: row.avatar_hue, role: row.role };
}

function friendshipState(currentId, row) {
  if (!row.friendship_id) return 'none';
  if (row.status === 'accepted') return 'friend';
  return Number(row.requester_id) === Number(currentId) ? 'outgoing' : 'incoming';
}

router.get(
  '/friends/search',
  requireAuth,
  wrap((req, res) => {
    const query = String(req.query.q ?? '').trim();
    if (query.length < 2) return res.json({ users: [] });
    const rows = all(
      `SELECT u.id, u.username, u.avatar_hue, u.role,
              f.id AS friendship_id, f.status, f.requester_id
         FROM users u
         LEFT JOIN friendships f ON (f.requester_id = ? AND f.addressee_id = u.id)
                                OR (f.requester_id = u.id AND f.addressee_id = ?)
        WHERE u.id <> ? AND u.status = 'active' AND lower(u.username) LIKE lower(?)
        ORDER BY lower(u.username) ASC LIMIT 12`,
      req.user.id, req.user.id, req.user.id, `%${query}%`,
    );
    res.json({ users: rows.map((row) => ({ ...socialUser(row), relationship: friendshipState(req.user.id, row) })) });
  }),
);

router.get(
  '/friends',
  requireAuth,
  wrap((req, res) => {
    const friends = all(
      `SELECT f.id AS friendship_id, f.created_at,
              u.id, u.username, u.avatar_hue, u.role
         FROM friendships f
         JOIN users u ON u.id = CASE WHEN f.requester_id = ? THEN f.addressee_id ELSE f.requester_id END
        WHERE (f.requester_id = ? OR f.addressee_id = ?) AND f.status = 'accepted'
        ORDER BY lower(u.username)`,
      req.user.id, req.user.id, req.user.id,
    );
    const requests = all(
      `SELECT f.id AS request_id, f.created_at, u.id, u.username, u.avatar_hue, u.role
         FROM friendships f JOIN users u ON u.id = f.requester_id
        WHERE f.addressee_id = ? AND f.status = 'pending'
        ORDER BY f.id DESC`,
      req.user.id,
    );
    const sent = all(
      `SELECT f.id AS request_id, f.created_at, u.id, u.username, u.avatar_hue, u.role
         FROM friendships f JOIN users u ON u.id = f.addressee_id
        WHERE f.requester_id = ? AND f.status = 'pending'
        ORDER BY f.id DESC`,
      req.user.id,
    );
    res.json({
      friends: friends.map((row) => ({ friendshipId: row.friendship_id, createdAt: row.created_at, user: socialUser(row) })),
      requests: requests.map((row) => ({ requestId: row.request_id, createdAt: row.created_at, user: socialUser(row) })),
      sent: sent.map((row) => ({ requestId: row.request_id, createdAt: row.created_at, user: socialUser(row) })),
    });
  }),
);

router.post(
  '/friends/requests',
  requireAuth,
  wrap((req, res) => {
    const username = String(req.body?.username ?? '').trim();
    const target = get("SELECT id, username, avatar_hue, role FROM users WHERE lower(username) = lower(?) AND status = 'active'", username);
    if (!target) throw Object.assign(new Error('No active player has that username.'), { code: 'player_not_found', status: 404 });
    if (target.id === req.user.id) throw Object.assign(new Error('You cannot add yourself as a friend.'), { code: 'self_friend', status: 400 });

    const existing = get(
      `SELECT * FROM friendships WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?) LIMIT 1`,
      req.user.id, target.id, target.id, req.user.id,
    );
    if (existing?.status === 'accepted') throw Object.assign(new Error('You are already friends.'), { code: 'already_friends', status: 409 });
    if (existing?.status === 'pending') {
      if (existing.requester_id === target.id) {
        run("UPDATE friendships SET status = 'accepted', responded_at = datetime('now') WHERE id = ?", existing.id);
        return res.json({ ok: true, status: 'accepted', user: socialUser(target) });
      }
      throw Object.assign(new Error('A friend request is already pending.'), { code: 'request_pending', status: 409 });
    }
    if (existing?.status === 'declined') {
      run("UPDATE friendships SET requester_id = ?, addressee_id = ?, status = 'pending', created_at = datetime('now'), responded_at = NULL WHERE id = ?", req.user.id, target.id, existing.id);
    } else {
      run('INSERT INTO friendships (requester_id, addressee_id, status) VALUES (?, ?, \'pending\')', req.user.id, target.id);
    }
    res.status(201).json({ ok: true, status: 'pending', user: socialUser(target) });
  }),
);

router.post(
  '/friends/requests/:id/:action',
  requireAuth,
  wrap((req, res) => {
    const requestId = Number(req.params.id);
    const action = req.params.action;
    if (!['accept', 'decline'].includes(action)) throw Object.assign(new Error('Unknown friend request action.'), { code: 'bad_action', status: 400 });
    const request = get("SELECT * FROM friendships WHERE id = ? AND addressee_id = ? AND status = 'pending'", requestId, req.user.id);
    if (!request) throw Object.assign(new Error('Friend request not found.'), { code: 'request_not_found', status: 404 });
    const status = action === 'accept' ? 'accepted' : 'declined';
    run('UPDATE friendships SET status = ?, responded_at = datetime(\'now\') WHERE id = ?', status, requestId);
    res.json({ ok: true, status });
  }),
);

router.post(
  '/friends/gift',
  requireAuth,
  wrap((req, res) => {
    const username = String(req.body?.username ?? '').trim();
    const amount = Math.trunc(Number(req.body?.amount));
    const target = get("SELECT id, username, avatar_hue, role FROM users WHERE lower(username) = lower(?) AND status = 'active'", username);
    if (!target) throw Object.assign(new Error('No active player has that username.'), { code: 'player_not_found', status: 404 });
    const friendship = get(
      `SELECT id FROM friendships WHERE status = 'accepted'
        AND ((requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?))`,
      req.user.id, target.id, target.id, req.user.id,
    );
    if (!friendship) throw Object.assign(new Error('You can only gift beans to an accepted friend.'), { code: 'not_friends', status: 403 });
    const transfer = transferBeans({ fromUserId: req.user.id, toUserId: target.id, amount, refId: `${req.user.id}-${target.id}-${Date.now()}`, memo: `Friend gift to ${target.username}` });
    res.json({ ok: true, gifted: transfer.amount, balance: transfer.fromBalance, recipient: socialUser(target) });
  }),
);

router.get(
  '/leaderboard',
  wrap((_req, res) => {
    const rows = all(
      `SELECT u.id, u.username, u.avatar_hue,
              COALESCE(SUM(e.credit) - SUM(e.debit), 0) AS balance,
              (SELECT COUNT(*) FROM bets b WHERE b.user_id = u.id) AS bets,
              (SELECT COUNT(*) FROM bets b WHERE b.user_id = u.id AND b.status = 'won') AS wins
         FROM users u
         LEFT JOIN accounts a ON a.user_id = u.id AND a.kind = 'wallet'
         LEFT JOIN entries e ON e.account_id = a.id
        GROUP BY u.id
        ORDER BY balance DESC, u.id ASC
        LIMIT 25`,
    );
    res.json({
      leaders: rows.map((row, index) => ({
        rank: index + 1,
        id: row.id,
        username: row.username,
        avatarHue: row.avatar_hue,
        balance: Number(row.balance),
        bets: Number(row.bets),
        wins: Number(row.wins),
      })),
    });
  }),
);

router.get(
  '/stats',
  wrap((_req, res) => {
    const totals = get(
      `SELECT (SELECT COUNT(*) FROM users) AS players,
              (SELECT COUNT(*) FROM events WHERE status = 'live') AS liveEvents,
              (SELECT COUNT(*) FROM events WHERE status = 'upcoming') AS upcomingEvents,
              (SELECT COUNT(*) FROM bets) AS bets,
              (SELECT COALESCE(SUM(stake), 0) FROM bets) AS staked,
              (SELECT COALESCE(SUM(payout), 0) FROM bets WHERE status = 'won') AS paidOut`,
    );
    const house = houseSnapshot();
    const net = (kind) => house.accounts.find((account) => account.kind === kind)?.net ?? 0;
    const issued = net('issuance');
    const escrow = net('escrow');
    const rake = net('rake');
    const inWallets = house.beansInPlayersHands;

    res.json({
      players: Number(totals.players),
      liveEvents: Number(totals.liveEvents),
      upcomingEvents: Number(totals.upcomingEvents),
      bets: Number(totals.bets),
      beansStaked: Number(totals.staked),
      beansPaidOut: Number(totals.paidOut),
      beansInPlay: inWallets,
      beansInEscrow: escrow,
      beansRaked: rake,
      beansIssued: issued,
      // The accounting identity, evaluated on every read:
      //   beans issued = beans in wallets + beans held in escrow + beans raked
      ledgerBalanced: issued === inWallets + escrow + rake,
      ledger: house.accounts.map((account) => ({
        code: account.code,
        label: account.label,
        kind: account.kind,
        net: account.net,
      })),
    });
  }),
);

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

router.get(
  '/admin/overview',
  requireAdmin,
  wrap((_req, res) => {
    const users = all(
      `SELECT u.id, u.username, u.email, u.role, u.status, u.created_at, u.last_login_at,
              COALESCE((SELECT SUM(e.credit) - SUM(e.debit) FROM entries e
                          JOIN accounts a ON a.id = e.account_id
                         WHERE a.user_id = u.id), 0) AS balance
         FROM users u ORDER BY u.id`,
    );
    res.json({
      users: users.map((user) => ({ ...user, balance: Number(user.balance) })),
      events: all(
        `SELECT e.id, e.status, e.league, e.home_name, e.away_name, e.home_score, e.away_score, e.clock, e.starts_at
           FROM events e ORDER BY e.id DESC LIMIT 40`,
      ),
      house: houseSnapshot(),
      sports: SPORTS,
      clubs: CLUBS,
    });
  }),
);

router.post(
  '/admin/events',
  requireAdmin,
  wrap((req, res) => {
    const sportKey = String(req.body?.sportKey ?? 'football');
    const sport = SPORTS.find((s) => s.key === sportKey);
    if (!sport) {
      throw Object.assign(new Error('Unknown sport.'), { code: 'bad_sport', status: 400 });
    }
    const pool = CLUBS[sportKey];
    const pick = (index) => pool[index % pool.length];
    const home = pick(Number(req.body?.homeIndex ?? Math.floor(Math.random() * pool.length)));
    const away = pick(Number(req.body?.awayIndex ?? (Math.floor(Math.random() * pool.length) + 1)));

    const startsInMinutes = Number(req.body?.startsInMinutes ?? 10);
    const startsAt = new Date(Date.now() + startsInMinutes * 60_000)
      .toISOString()
      .replace('T', ' ')
      .slice(0, 19);

    const id = seedEvent({
      sportKey,
      league: String(req.body?.league ?? LEAGUES[sportKey][0]),
      home,
      away,
      status: req.body?.live ? 'live' : 'upcoming',
      startsAt,
      featured: req.body?.featured ? 1 : 0,
    });
    res.status(201).json({ id });
  }),
);

router.post(
  '/admin/events/:id/finish',
  requireAdmin,
  wrap((req, res) => {
    const id = Number(req.params.id);
    const outcome = forceFinish(id);
    if (!outcome) {
      throw Object.assign(new Error('Fixture is not in play.'), { code: 'not_live', status: 409 });
    }
    res.json({ ok: true, settled: outcome.settledBets.length });
  }),
);

router.post(
  '/admin/events/:id/void',
  requireAdmin,
  wrap((req, res) => {
    const id = Number(req.params.id);
    const settled = voidEvent(id);
    res.json({ ok: true, settled: settled.length });
  }),
);

export { fail, LedgerError, BetError };
