/**
 * Placing and settling bets.
 *
 * A bet is a slip of 1..6 selections. Stake leaves the wallet the instant the
 * slip is accepted and parks in the escrow account; it only leaves escrow when
 * every leg has a result. That ordering is what stops a player from staking the
 * same beans twice while a fixture is still running.
 */
import crypto from 'node:crypto';
import { all, get, run, tx } from './db.js';
import { LedgerError, accountId, assertFunds, post } from './ledger.js';

export const MIN_STAKE = 10;
export const MAX_STAKE = 5000;
export const MAX_LEGS = 6;
export const MAX_PAYOUT = 250_000;

export class BetError extends Error {
  constructor(message, code = 'bet_rejected') {
    super(message);
    this.name = 'BetError';
    this.code = code;
    this.status = 400;
  }
}

function newRef() {
  return `GB-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

export function serializeBet(bet, legs) {
  return {
    id: bet.id,
    ref: bet.ref,
    stake: Number(bet.stake),
    combinedOdds: Number(bet.combined_odds),
    potentialPayout: Number(bet.potential_payout),
    payout: Number(bet.payout),
    status: bet.status,
    placedAt: bet.placed_at,
    settledAt: bet.settled_at,
    legs: (legs ?? []).map((leg) => ({
      id: leg.id,
      eventId: leg.event_id,
      marketName: leg.market_name,
      selectionName: leg.selection_name,
      eventLabel: leg.event_label,
      odds: Number(leg.odds),
      result: leg.result,
    })),
  };
}

export function listBets(userId, { limit = 50 } = {}) {
  const bets = all('SELECT * FROM bets WHERE user_id = ? ORDER BY id DESC LIMIT ?', userId, limit);
  if (!bets.length) return [];
  const legs = all(
    `SELECT * FROM bet_legs WHERE bet_id IN (${bets.map(() => '?').join(',')}) ORDER BY id`,
    ...bets.map((bet) => bet.id),
  );
  const byBet = new Map();
  for (const leg of legs) {
    if (!byBet.has(leg.bet_id)) byBet.set(leg.bet_id, []);
    byBet.get(leg.bet_id).push(leg);
  }
  return bets.map((bet) => serializeBet(bet, byBet.get(bet.id)));
}

export const placeBet = tx(({ userId, legs, stake }) => {
  const amount = Math.trunc(Number(stake));
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new BetError('Enter a stake first.', 'bad_stake');
  }
  if (amount < MIN_STAKE) throw new BetError(`Minimum stake is ${MIN_STAKE} beans.`, 'stake_too_small');
  if (amount > MAX_STAKE) throw new BetError(`Maximum stake is ${MAX_STAKE} beans.`, 'stake_too_large');
  if (!Array.isArray(legs) || legs.length === 0) throw new BetError('Your slip is empty.', 'empty_slip');
  if (legs.length > MAX_LEGS) throw new BetError(`A slip holds at most ${MAX_LEGS} selections.`, 'too_many_legs');

  const selectionIds = [...new Set(legs.map((leg) => Math.trunc(Number(leg?.selectionId))))];
  if (selectionIds.some((id) => !Number.isFinite(id) || id <= 0)) {
    throw new BetError('That selection does not exist.', 'bad_selection');
  }
  if (selectionIds.length !== legs.length) {
    throw new BetError('The same selection is on the slip twice.', 'duplicate_selection');
  }

  const rows = all(
    `SELECT s.id AS selection_id, s.key AS selection_key, s.name AS selection_name, s.odds, s.result,
            m.id AS market_id, m.key AS market_key, m.name AS market_name,
            e.id AS event_id, e.status AS event_status, e.league,
            e.home_name, e.away_name
       FROM selections s
       JOIN markets m ON m.id = s.market_id
       JOIN events  e ON e.id = m.event_id
      WHERE s.id IN (${selectionIds.map(() => '?').join(',')})`,
    ...selectionIds,
  );

  if (rows.length !== selectionIds.length) throw new BetError('A selection has vanished.', 'bad_selection');

  const seenEvents = new Set();
  for (const row of rows) {
    if (row.event_status === 'finished') {
      throw new BetError(`${row.home_name} v ${row.away_name} has already finished.`, 'event_finished');
    }
    if (row.result !== 'pending') {
      throw new BetError('That market is already settled.', 'market_settled');
    }
    if (seenEvents.has(row.event_id)) {
      throw new BetError('You can only pick once per fixture.', 'duplicate_event');
    }
    seenEvents.add(row.event_id);
  }

  const combinedOdds = round2(rows.reduce((product, row) => product * Number(row.odds), 1));
  const potentialPayout = Math.floor(amount * combinedOdds);
  if (potentialPayout > MAX_PAYOUT) {
    throw new BetError(`Payouts are capped at ${MAX_PAYOUT} beans. Lower your stake.`, 'payout_cap');
  }

  assertFunds(userId, amount);

  const ref = newRef();
  const info = run(
    `INSERT INTO bets (ref, user_id, stake, combined_odds, potential_payout, status)
     VALUES (?, ?, ?, ?, ?, 'open')`,
    ref,
    userId,
    amount,
    combinedOdds,
    potentialPayout,
  );
  const betId = Number(info.lastInsertRowid);

  for (const row of rows) {
    run(
      `INSERT INTO bet_legs
         (bet_id, event_id, market_id, selection_id, market_name, selection_name, event_label, odds)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      betId,
      row.event_id,
      row.market_id,
      row.selection_id,
      row.market_name,
      row.selection_name,
      `${row.home_name} v ${row.away_name}`,
      Number(row.odds),
    );
  }

  post({
    refType: 'bet_stake',
    refId: ref,
    memo: `${rows.length === 1 ? 'Single' : `${rows.length}-fold`} stake - ${ref}`,
    lines: [
      { accountId: accountId(`user:${userId}:wallet`), debit: amount },
      { accountId: accountId('house:escrow'), credit: amount },
    ],
  });

  const bet = get('SELECT * FROM bets WHERE id = ?', betId);
  const storedLegs = all('SELECT * FROM bet_legs WHERE bet_id = ? ORDER BY id', betId);
  return serializeBet(bet, storedLegs);
});

/**
 * Settle every open bet that has a leg on `eventId`.
 *
 * Returns the bets that reached a terminal state, so the caller can push a
 * private notification to whoever owns them.
 */
export const settleEventBets = tx((eventId) => {
  const openBets = all(
    `SELECT DISTINCT b.* FROM bets b
       JOIN bet_legs l ON l.bet_id = b.id
      WHERE l.event_id = ? AND b.status = 'open'`,
    eventId,
  );

  const settled = [];

  for (const bet of openBets) {
    run(
      `UPDATE bet_legs
          SET result = COALESCE((SELECT s.result FROM selections s WHERE s.id = bet_legs.selection_id), 'void')
        WHERE bet_id = ? AND result = 'pending'`,
      bet.id,
    );

    const legs = all('SELECT * FROM bet_legs WHERE bet_id = ? ORDER BY id', bet.id);
    if (legs.some((leg) => leg.result === 'pending')) continue;

    const stake = Number(bet.stake);
    const wallet = accountId(`user:${bet.user_id}:wallet`);
    const escrow = accountId('house:escrow');
    const rake = accountId('house:rake');
    const issuance = accountId('house:issuance');

    const lost = legs.some((leg) => leg.result === 'lost');
    const won = legs.filter((leg) => leg.result === 'won');

    if (lost) {
      run(
        `UPDATE bets SET status = 'lost', payout = 0, settled_at = datetime('now') WHERE id = ?`,
        bet.id,
      );
      post({
        refType: 'bet_lost',
        refId: bet.ref,
        memo: `Settled - ${bet.ref} (lost)`,
        lines: [
          { accountId: escrow, debit: stake },
          { accountId: rake, credit: stake },
        ],
      });
    } else if (won.length === 0) {
      // Every leg was voided: the slip is cancelled and the stake comes home.
      run(
        `UPDATE bets SET status = 'void', payout = ?, settled_at = datetime('now') WHERE id = ?`,
        stake,
        bet.id,
      );
      post({
        refType: 'bet_refund',
        refId: bet.ref,
        memo: `Settled - ${bet.ref} (void, stake returned)`,
        lines: [
          { accountId: escrow, debit: stake },
          { accountId: wallet, credit: stake },
        ],
      });
    } else {
      const effectiveOdds = round2(won.reduce((product, leg) => product * Number(leg.odds), 1));
      const payout = Math.max(stake, Math.floor(stake * effectiveOdds));
      run(
        `UPDATE bets SET status = 'won', payout = ?, combined_odds = ?, settled_at = datetime('now')
          WHERE id = ?`,
        payout,
        effectiveOdds,
        bet.id,
      );

      const lines = [
        { accountId: escrow, debit: stake },
        { accountId: wallet, credit: stake },
      ];
      if (payout > stake) {
        lines.push(
          { accountId: issuance, debit: payout - stake },
          { accountId: wallet, credit: payout - stake },
        );
      }
      post({
        refType: 'bet_won',
        refId: bet.ref,
        memo: `Settled - ${bet.ref} (won ${payout})`,
        lines,
      });
    }

    const updated = get('SELECT * FROM bets WHERE id = ?', bet.id);
    const finalLegs = all('SELECT * FROM bet_legs WHERE bet_id = ? ORDER BY id', bet.id);
    settled.push({ userId: bet.user_id, bet: serializeBet(updated, finalLegs) });
  }

  return settled;
});

/** Void an entire fixture (abandoned match) and return every stake. */
export const voidEvent = tx((eventId) => {
  run("UPDATE selections SET result = 'void' WHERE market_id IN (SELECT id FROM markets WHERE event_id = ?)", eventId);
  run(
    "UPDATE events SET status = 'finished', period = 'Abandoned', finished_at = datetime('now') WHERE id = ?",
    eventId,
  );
  return settleEventBets(eventId);
});

export function betStats(userId) {
  const row = get(
    `SELECT COUNT(*) AS total,
            COALESCE(SUM(CASE WHEN status = 'open' THEN stake END), 0) AS atRisk,
            COALESCE(SUM(CASE WHEN status = 'won' THEN payout - stake END), 0) AS netWin,
            COALESCE(SUM(CASE WHEN status = 'lost' THEN stake END), 0) AS netLoss,
            COALESCE(SUM(CASE WHEN status = 'won' THEN 1 END), 0) AS won,
            COALESCE(SUM(CASE WHEN status = 'lost' THEN 1 END), 0) AS lost
       FROM bets WHERE user_id = ?`,
    userId,
  );
  const settled = Number(row.won) + Number(row.lost);
  return {
    total: Number(row.total),
    open: Number(get("SELECT COUNT(*) AS n FROM bets WHERE user_id = ? AND status = 'open'", userId)?.n ?? 0),
    atRisk: Number(row.atRisk),
    won: Number(row.won),
    lost: Number(row.lost),
    strikeRate: settled ? Math.round((Number(row.won) / settled) * 100) : 0,
    net: Number(row.netWin) - Number(row.netLoss),
  };
}

export { LedgerError };
