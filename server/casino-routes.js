import express from 'express';
import { get } from './db.js';
import { requireAdmin, requireAuth } from './auth.js';
import { grantBeans, walletBalance } from './ledger.js';
import { blackjackAction, casinoHistory, joinBlackjack, readAviator, readBlackjack, settleAviator, startAviator, startBlackjack } from './casino.js';

export const casinoRouter = express.Router();

const wrap = (handler) => (req, res, next) => {
  try { handler(req, res, next); } catch (error) {
    const status = error.status ?? 500;
    if (status >= 500) console.error('[casino-api]', error);
    res.status(status).json({ error: status >= 500 ? 'Something broke on our side.' : error.message, code: error.code ?? 'error' });
  }
};

casinoRouter.get('/games/history', requireAuth, wrap((req, res) => {
  res.json({ rounds: casinoHistory(req.user.id) });
}));

casinoRouter.post('/games/aviator/start', requireAuth, wrap((req, res) => {
  const round = startAviator({ userId: req.user.id, stake: req.body?.stake, autoCashout: req.body?.autoCashout });
  res.status(201).json({ round, balance: walletBalance(req.user.id) });
}));

casinoRouter.get('/games/aviator/:id', requireAuth, wrap((req, res) => {
  res.json({ round: readAviator({ userId: req.user.id, roundId: Number(req.params.id) }), balance: walletBalance(req.user.id) });
}));

casinoRouter.post('/games/aviator/:id/cashout', requireAuth, wrap((req, res) => {
  const round = settleAviator({ userId: req.user.id, roundId: Number(req.params.id), forcedMultiplier: req.body?.multiplier });
  res.json({ round, balance: walletBalance(req.user.id) });
}));

casinoRouter.post('/games/blackjack/start', requireAuth, wrap((req, res) => {
  const round = startBlackjack({ userId: req.user.id, stake: req.body?.stake });
  res.status(201).json({ round, balance: walletBalance(req.user.id) });
}));

casinoRouter.post('/games/blackjack/join-random', requireAuth, wrap((req, res) => {
  const round = joinBlackjack({ userId: req.user.id, stake: req.body?.stake });
  res.status(201).json({ round, balance: walletBalance(req.user.id) });
}));

casinoRouter.post('/games/blackjack/:id/join', requireAuth, wrap((req, res) => {
  const round = joinBlackjack({ userId: req.user.id, tableId: req.params.id, stake: req.body?.stake });
  res.status(201).json({ round, balance: walletBalance(req.user.id) });
}));

casinoRouter.get('/games/blackjack/:id', requireAuth, wrap((req, res) => {
  res.json({ round: readBlackjack({ userId: req.user.id, roundId: Number(req.params.id) }), balance: walletBalance(req.user.id) });
}));

casinoRouter.post('/games/blackjack/:id/action', requireAuth, wrap((req, res) => {
  const round = blackjackAction({ userId: req.user.id, roundId: Number(req.params.id), action: String(req.body?.action ?? '') });
  res.json({ round, balance: walletBalance(req.user.id) });
}));

casinoRouter.post('/admin/beans/grant', requireAdmin, wrap((req, res) => {
  const identifier = String(req.body?.username ?? req.body?.email ?? '').trim().toLowerCase();
  const target = get('SELECT * FROM users WHERE lower(username) = ? OR lower(email) = ?', identifier, identifier);
  if (!target) throw Object.assign(new Error('Player account not found.'), { code: 'player_not_found', status: 404 });
  const amount = Math.trunc(Number(req.body?.amount));
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 9_000_000_000_000_000) {
    throw Object.assign(new Error('Enter a positive whole-number grant within the safe integer range.'), { code: 'bad_grant_amount', status: 400 });
  }
  grantBeans({ userId: target.id, amount, refType: 'admin_grant', refId: String(req.user.id), memo: String(req.body?.memo ?? `Admin grant from ${req.user.username}`).slice(0, 120) });
  res.json({ ok: true, username: target.username, granted: amount, balance: walletBalance(target.id) });
}));
