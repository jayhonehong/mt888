/**
 * Play-money casino games. Every bean movement goes through the same
 * double-entry ledger as the sportsbook. Blackjack keeps its deck and hand
 * state server-side inside the round detail JSON; the client only receives
 * the cards it is allowed to see.
 */
import crypto from 'node:crypto';
import { all, get, run, tx } from './db.js';
import { accountId, assertFunds, post } from './ledger.js';

export const CASINO_MIN_STAKE = 10;
export const CASINO_MAX_STAKE = 1_000_000;
export const BLACKJACK_DEALER_RULE = String(process.env.GOLDBEAN_BLACKJACK_DEALER_RULE ?? 'S17').toUpperCase() === 'H17' ? 'H17' : 'S17';

function ref(prefix) {
  return `${prefix}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

function amount(value) {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n) || n < CASINO_MIN_STAKE || n > CASINO_MAX_STAKE) {
    throw Object.assign(new Error(`Stake must be between ${CASINO_MIN_STAKE.toLocaleString()} and ${CASINO_MAX_STAKE.toLocaleString()} beans.`), {
      code: 'bad_casino_stake', status: 400,
    });
  }
  return n;
}

function placeEscrow(userId, stake, refId, memo) {
  assertFunds(userId, stake);
  post({
    refType: 'casino_stake',
    refId,
    memo,
    lines: [
      { accountId: accountId(`user:${userId}:wallet`), debit: stake },
      { accountId: accountId('house:escrow'), credit: stake },
    ],
  });
}

function settleWin(userId, stake, payout, refId, memo) {
  const wallet = accountId(`user:${userId}:wallet`);
  const profit = Math.max(0, payout - stake);
  const lines = [
    { accountId: accountId('house:escrow'), debit: stake },
    { accountId: wallet, credit: stake },
  ];
  if (profit) lines.push({ accountId: accountId('house:issuance'), debit: profit }, { accountId: wallet, credit: profit });
  post({ refType: 'casino_win', refId, memo, lines });
}

function settleLoss(stake, refId, memo) {
  post({
    refType: 'casino_loss',
    refId,
    memo,
    lines: [
      { accountId: accountId('house:escrow'), debit: stake },
      { accountId: accountId('house:rake'), credit: stake },
    ],
  });
}

/** Return exactly the amount owed from the round escrow, including mixed outcomes. */
function settlePayout(userId, escrow, payout, refId, memo) {
  const held = Math.trunc(escrow);
  const returned = Math.max(0, Math.trunc(payout));
  const wallet = accountId(`user:${userId}:wallet`);
  const lines = [{ accountId: accountId('house:escrow'), debit: held }];
  if (returned <= held) {
    if (returned) lines.push({ accountId: wallet, credit: returned });
    if (held > returned) lines.push({ accountId: accountId('house:rake'), credit: held - returned });
  } else {
    lines.push({ accountId: wallet, credit: held });
    lines.push({ accountId: accountId('house:issuance'), debit: returned - held }, { accountId: wallet, credit: returned - held });
  }
  post({ refType: 'casino_settlement', refId, memo, lines });
}

function crashPoint(seed = null) {
  const roll = seed ? seed.readUInt16BE(0) / 65_536 : crypto.randomInt(0, 10_000) / 10_000;
  const random = (offset) => seed ? seed.readUInt32BE(offset) / 4_294_967_296 : Math.random();
  const between = (min, max, offset = 0) => Number((min + random(offset) * (max - min)).toFixed(2));
  if (roll < 0.10) return 1;
  if (roll < 0.30) return between(1.01, 2, 4);
  if (roll < 0.70) return between(2, 4, 4);
  if (roll < 0.90) return between(4, 20, 4);
  if (roll < 0.96) return between(20, 100, 4);
  return between(100, 999, 4);
}

let activeAviatorCycle = null;

function sharedAviatorCycle(now = Date.now()) {
  if (!activeAviatorCycle || now >= activeAviatorCycle.crashAt) {
    const startedAt = now + 10_000;
    const seed = crypto.randomBytes(32);
    const crash = crashPoint(seed);
    const durationMs = crash <= 1 ? 650 : Math.min(30_000, Math.max(2_800, Math.round(3_600 + Math.log(crash) * 3_600)));
    activeAviatorCycle = { startedAt, crash, crashAt: startedAt + durationMs };
  }
  return activeAviatorCycle;
}

export const startAviator = tx(({ userId, stake, autoCashout = null }) => {
  const value = amount(stake);
  const refId = ref('AV');
  const requestedAuto = Number(autoCashout);
  const auto = !Number.isFinite(requestedAuto) || requestedAuto <= 0 ? null : Math.min(50, Math.max(1.01, requestedAuto));
  placeEscrow(userId, value, refId, `Aviator round ${refId}`);
  const cycle = sharedAviatorCycle(Date.now());
  const info = run(
    `INSERT INTO casino_rounds (ref, game, user_id, stake, status, crash_multiplier, started_at, crash_at, auto_cashout)
     VALUES (?, 'aviator', ?, ?, 'open', ?, datetime('now'), ?, ?)`,
    refId, userId, value, cycle.crash, new Date(cycle.crashAt).toISOString(), auto,
  );
  const startedAt = new Date(cycle.startedAt).toISOString();
  run('UPDATE casino_rounds SET started_at = ? WHERE id = ?', startedAt, Number(info.lastInsertRowid));
  return serializeRound(get('SELECT * FROM casino_rounds WHERE id = ?', Number(info.lastInsertRowid)));
});

function multiplierFor(round) {
  const startedAt = round.started_at.includes('T') ? round.started_at : `${round.started_at.replace(' ', 'T')}Z`;
  const started = new Date(startedAt).getTime();
  const elapsed = Math.max(0, Date.now() - started);
  const duration = Math.max(1, new Date(round.crash_at).getTime() - started);
  const progress = Math.min(1, elapsed / duration);
  const accelerated = Math.pow(progress, 2.25);
  return Math.min(Number(round.crash_multiplier), Number((1 + (Number(round.crash_multiplier) - 1) * accelerated).toFixed(2)));
}

export const settleAviator = tx(({ userId, roundId, forcedMultiplier = null }) => {
  const round = get('SELECT * FROM casino_rounds WHERE id = ? AND user_id = ? AND game = ?', roundId, userId, 'aviator');
  if (!round) throw Object.assign(new Error('Aviator round not found.'), { code: 'round_not_found', status: 404 });
  if (round.status !== 'open') return serializeRound(round);
  const now = Date.now();
  const crashAt = new Date(round.crash_at).getTime();
  const crashed = now >= crashAt;
  const multiplier = forcedMultiplier ? Number(forcedMultiplier) : multiplierFor(round);
  const refId = round.ref;
  if (crashed || multiplier >= Number(round.crash_multiplier)) {
    run("UPDATE casino_rounds SET status = 'lost', settled_at = datetime('now'), result = 'crashed' WHERE id = ?", round.id);
    settleLoss(Number(round.stake), refId, `Aviator ${refId} crashed`);
  } else {
    const payout = Math.floor(Number(round.stake) * multiplier);
    run("UPDATE casino_rounds SET status = 'won', payout = ?, cashout_multiplier = ?, settled_at = datetime('now'), result = 'cashed_out' WHERE id = ?", payout, multiplier, round.id);
    settleWin(userId, Number(round.stake), payout, refId, `Aviator ${refId} cash-out at ${multiplier.toFixed(2)}x`);
  }
  return serializeRound(get('SELECT * FROM casino_rounds WHERE id = ?', round.id));
});

export const readAviator = tx(({ userId, roundId }) => {
  const round = get('SELECT * FROM casino_rounds WHERE id = ? AND user_id = ? AND game = ?', roundId, userId, 'aviator');
  if (!round) throw Object.assign(new Error('Aviator round not found.'), { code: 'round_not_found', status: 404 });
  if (round.status === 'open') {
    const multiplier = multiplierFor(round);
    if (Date.now() >= new Date(round.crash_at).getTime() || multiplier >= Number(round.crash_multiplier)) return settleAviator({ userId, roundId });
    return { ...serializeRound(round), multiplier };
  }
  return serializeRound(round);
});

const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const SUITS = ['♠', '♥', '♦', '♣'];
const FACE_RANKS = new Set(['J', 'Q', 'K']);

function shuffledDeck() {
  const deck = RANKS.flatMap((rank) => SUITS.map((suit) => ({ rank, suit })));
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function draw(detail) {
  if (!detail.deck.length) detail.deck = shuffledDeck();
  return detail.deck.shift();
}

function score(hand) {
  let total = hand.reduce((sum, current) => sum + (current.rank === 'A' ? 11 : FACE_RANKS.has(current.rank) ? 10 : Number(current.rank)), 0);
  let aces = hand.filter((current) => current.rank === 'A').length;
  while (total > 21 && aces > 0) { total -= 10; aces -= 1; }
  return { total, soft: aces > 0 };
}

function isBlackjack(hand) { return hand.length === 2 && score(hand).total === 21; }
function samePair(hand) { return hand.length === 2 && hand[0].rank === hand[1].rank; }
function dealerNatural(detail) { return isBlackjack(detail.dealer.cards); }
function handLabel(hand) { return score(hand.cards).total > 21 ? 'bust' : score(hand.cards).total === 21 ? '21' : String(score(hand.cards).total); }

function dealerMustHit(hand) {
  const dealerScore = score(hand);
  return dealerScore.total < 17 || (BLACKJACK_DEALER_RULE === 'H17' && dealerScore.total === 17 && dealerScore.soft);
}

function playDealer(detail) {
  detail.phase = 'dealer';
  detail.dealer.revealed = true;
  detail.actionHistory.push('dealer_reveal');
  while (dealerMustHit(detail.dealer.cards)) {
    detail.dealer.cards.push(draw(detail));
    detail.actionHistory.push('dealer_hit');
  }
  detail.actionHistory.push(score(detail.dealer.cards).total > 21 ? 'dealer_bust' : 'dealer_stand');
}

function clientDetail(detail, open) {
  const safe = { ...detail, deck: undefined };
  delete safe.deck;
  safe.dealerRule = BLACKJACK_DEALER_RULE;
  safe.hands = detail.hands.map((hand) => ({ ...hand, cards: hand.cards.map((card) => ({ ...card })) }));
  safe.dealer = { ...detail.dealer, cards: detail.dealer.cards.map((card, index) => open && !detail.dealer.revealed && index === 1 ? { hidden: true } : { ...card }) };
  return safe;
}

function finishBlackjack(userId, round, detail) {
  detail.phase = 'settled';
  detail.dealer.revealed = true;
  const dealerScore = score(detail.dealer.cards);
  const dealerBJ = dealerScore.total === 21 && detail.dealer.cards.length === 2;
  const outcomes = [];
  let payout = 0;
  let hasWin = false;
  const accounts = new Map();
  for (const hand of detail.hands) {
    const playerId = Number(hand.userId ?? userId);
    const playerScore = score(hand.cards);
    let handPayout = 0;
    let result = 'lost';
    if (playerScore.total > 21) result = 'bust';
    else if (isBlackjack(hand.cards) && !detail.splitMade && !dealerBJ) { handPayout = Math.floor(hand.bet * 2.5); result = 'blackjack'; hasWin = true; }
    else if (dealerBJ && !isBlackjack(hand.cards)) result = 'dealer_blackjack';
    else if (dealerScore.total > 21 || playerScore.total > dealerScore.total) { handPayout = hand.bet * 2; result = 'won'; hasWin = true; }
    else if (playerScore.total === dealerScore.total) { handPayout = hand.bet; result = 'push'; }
    hand.result = result;
    hand.total = playerScore.total;
    handPayout = Math.trunc(handPayout);
    hand.payout = handPayout;
    payout += handPayout;
    outcomes.push(result);
    const account = accounts.get(playerId) ?? { escrow: 0, payout: 0 };
    account.escrow += Number(hand.bet);
    account.payout += handPayout;
    accounts.set(playerId, account);
  }
  const escrow = detail.hands.reduce((sum, hand) => sum + hand.bet, 0);
  const allPush = outcomes.length > 0 && outcomes.every((result) => result === 'push');
  const status = hasWin ? 'won' : allPush && payout === escrow ? 'void' : payout === escrow ? 'void' : 'lost';
  const result = outcomes.includes('blackjack') ? 'blackjack' : outcomes.includes('won') ? 'won' : allPush ? 'push' : 'lost';
  detail.dealer.total = dealerScore.total;
  detail.dealer.label = handLabel({ cards: detail.dealer.cards });
  detail.totalWager = escrow;
  detail.payout = payout;
  detail.result = result;
  run('UPDATE casino_rounds SET status = ?, payout = ?, result = ?, detail = ?, settled_at = datetime(\'now\') WHERE id = ?', status, payout, result, JSON.stringify(detail), round.id);
  for (const [playerId, account] of accounts) settlePayout(playerId, account.escrow, account.payout, `${round.ref}-${playerId}`, `Blackjack ${round.ref} — ${result}`);
  return get('SELECT * FROM casino_rounds WHERE id = ?', round.id);
}

function advanceHand(userId, round, detail) {
  while (detail.activeHand < detail.hands.length && detail.hands[detail.activeHand].status !== 'playing') detail.activeHand += 1;
  if (detail.activeHand >= detail.hands.length) {
    playDealer(detail);
    return finishBlackjack(userId, round, detail);
  }
  return null;
}

export const startBlackjack = tx(({ userId, stake }) => {
  const value = amount(stake);
  const refId = ref('BJ');
  const detail = {
    deck: shuffledDeck(),
    phase: 'player',
    tableCode: refId,
    splitMade: false,
    insuranceBet: 0,
    insurancePayout: 0,
    insuranceResult: 'not_taken',
    activeHand: 0,
    hands: [{ cards: [], bet: value, status: 'playing', doubled: false, userId, username: get('SELECT username FROM users WHERE id = ?', userId)?.username ?? 'Player' }],
    dealer: { cards: [], revealed: false },
    actionHistory: [],
  };
  detail.hands[0].cards.push(draw(detail), draw(detail));
  detail.dealer.cards.push(draw(detail), draw(detail));
  placeEscrow(userId, value, refId, `Blackjack round ${refId}`);
  const info = run(
    `INSERT INTO casino_rounds (ref, game, user_id, stake, status, started_at, detail)
     VALUES (?, 'blackjack', ?, ?, 'open', datetime('now'), ?)`,
    refId, userId, value, JSON.stringify(detail),
  );
  let round = get('SELECT * FROM casino_rounds WHERE id = ?', Number(info.lastInsertRowid));
  if (detail.phase !== 'insurance' && (dealerNatural(detail) || isBlackjack(detail.hands[0].cards))) round = finishBlackjack(userId, round, detail);
  return serializeRound(round);
});

export const joinBlackjack = tx(({ userId, tableId, stake }) => {
  const requested = String(tableId ?? '').trim();
  const openRounds = all("SELECT * FROM casino_rounds WHERE game = 'blackjack' AND status = 'open' ORDER BY id DESC LIMIT 20");
  const round = openRounds.find((item) => {
    if (requested && String(item.id) !== requested && item.ref !== requested) return false;
    const detail = item.detail ? JSON.parse(item.detail) : null;
    return detail?.phase === 'player' && Array.isArray(detail.hands) && detail.hands.length < 4;
  });
  if (!round) throw Object.assign(new Error(requested ? 'Blackjack table not found or already full.' : 'No open Blackjack table is waiting for a player.'), { code: 'table_not_found', status: 404 });
  const detail = JSON.parse(round.detail);
  if (detail.hands.some((hand) => Number(hand.userId) === Number(userId))) return serializeRound(round);
  const value = amount(stake);
  const refId = `${round.ref}-P${detail.hands.length + 1}`;
  placeEscrow(userId, value, refId, `Join Blackjack table ${round.ref}`);
  const user = get('SELECT username FROM users WHERE id = ?', userId);
  detail.hands.push({ cards: [draw(detail), draw(detail)], bet: value, status: 'playing', doubled: false, userId, username: user?.username ?? 'Player' });
  run('UPDATE casino_rounds SET detail = ? WHERE id = ?', JSON.stringify(detail), round.id);
  return serializeRound(get('SELECT * FROM casino_rounds WHERE id = ?', round.id));
});

export const readBlackjack = tx(({ userId, roundId }) => {
  const round = get('SELECT * FROM casino_rounds WHERE id = ? AND game = ?', roundId, 'blackjack');
  if (!round) throw Object.assign(new Error('Blackjack table not found.'), { code: 'round_not_found', status: 404 });
  const detail = round.detail ? JSON.parse(round.detail) : null;
  if (!detail?.hands?.some((hand) => Number(hand.userId) === Number(userId))) throw Object.assign(new Error('You are not seated at this Blackjack table.'), { code: 'not_at_table', status: 403 });
  return serializeRound(round);
});

export const blackjackAction = tx(({ userId, roundId, action }) => {
  let round = get('SELECT * FROM casino_rounds WHERE id = ? AND game = ?', roundId, 'blackjack');
  if (!round) throw Object.assign(new Error('Blackjack hand not found.'), { code: 'round_not_found', status: 404 });
  if (round.status !== 'open') return serializeRound(round);
  const detail = JSON.parse(round.detail);
  if (detail.phase === 'insurance') {
    if (!['insurance', 'decline_insurance'].includes(action)) throw Object.assign(new Error('Choose insurance or decline it before playing your hand.'), { code: 'insurance_choice_required', status: 400 });
    if (action === 'insurance') {
      detail.insuranceBet = Math.floor(Number(round.stake) / 2);
      placeEscrow(userId, detail.insuranceBet, `${round.ref}-INS`, `Insurance for ${round.ref}`);
    }
    detail.phase = 'player';
    detail.actionHistory.push(action);
    if (dealerNatural(detail) || isBlackjack(detail.hands[0].cards)) round = finishBlackjack(userId, round, detail);
    else {
      run('UPDATE casino_rounds SET detail = ? WHERE id = ?', JSON.stringify(detail), round.id);
      round = get('SELECT * FROM casino_rounds WHERE id = ?', round.id);
    }
    return serializeRound(round);
  }
  if (detail.phase !== 'player') return serializeRound(round);
  const hand = detail.hands[detail.activeHand];
  if (!hand || hand.status !== 'playing') throw Object.assign(new Error('That hand is no longer active.'), { code: 'hand_not_active', status: 409 });
  if (Number(hand.userId) !== Number(userId)) throw Object.assign(new Error('Wait for the active player to finish their hand.'), { code: 'not_your_turn', status: 409 });
  if (!['hit', 'stand', 'double', 'split'].includes(action)) throw Object.assign(new Error('Unknown Blackjack action.'), { code: 'bad_action', status: 400 });
  if (action === 'split') {
    if (detail.splitMade || !samePair(hand.cards)) throw Object.assign(new Error('Split is only available on your opening pair.'), { code: 'split_unavailable', status: 400 });
    placeEscrow(userId, hand.bet, `${round.ref}-SPLIT`, `Split hand for ${round.ref}`);
    const [left, right] = hand.cards;
    detail.hands = [
      { cards: [left, draw(detail)], bet: hand.bet, status: 'playing', doubled: false, userId: hand.userId, username: hand.username },
      { cards: [right, draw(detail)], bet: hand.bet, status: 'playing', doubled: false, userId: hand.userId, username: hand.username },
    ];
    detail.splitMade = true;
    detail.activeHand = 0;
    if (left.rank === 'A') {
      detail.splitAces = true;
      detail.hands.forEach((item) => { item.status = 'stand'; });
    }
  } else if (action === 'hit') {
    hand.cards.push(draw(detail));
    const total = score(hand.cards).total;
    if (total > 21) hand.status = 'bust';
    else if (total === 21) hand.status = 'stand';
  } else if (action === 'double') {
    if (hand.cards.length !== 2) throw Object.assign(new Error('Double Down is only available on your first two cards.'), { code: 'double_unavailable', status: 400 });
    placeEscrow(userId, hand.bet, `${round.ref}-DOUBLE-${detail.activeHand}`, `Double Down for ${round.ref}`);
    hand.bet *= 2;
    hand.doubled = true;
    hand.cards.push(draw(detail));
    hand.status = score(hand.cards).total > 21 ? 'bust' : 'stand';
  } else {
    hand.status = 'stand';
  }
  detail.actionHistory.push(action);
  const settled = advanceHand(userId, round, detail);
  if (!settled) run('UPDATE casino_rounds SET detail = ? WHERE id = ?', JSON.stringify(detail), round.id);
  return serializeRound(settled || get('SELECT * FROM casino_rounds WHERE id = ?', round.id));
});

export function casinoHistory(userId, limit = 20) {
  return all('SELECT * FROM casino_rounds WHERE user_id = ? ORDER BY id DESC LIMIT ?', userId, limit).map(serializeRound);
}

export function serializeRound(round) {
  if (!round) return null;
  const detail = round.detail ? JSON.parse(round.detail) : null;
  return {
    id: round.id, ref: round.ref, game: round.game, stake: Number(round.stake), status: round.status,
    payout: Number(round.payout ?? 0), result: round.result, multiplier: round.cashout_multiplier ? Number(round.cashout_multiplier) : null,
    crashMultiplier: round.crash_multiplier ? Number(round.crash_multiplier) : null,
    startedAt: round.started_at, crashAt: round.crash_at, settledAt: round.settled_at,
    detail: detail && round.game === 'blackjack' ? clientDetail(detail, round.status === 'open') : detail,
  };
}
