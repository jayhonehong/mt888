/**
 * End-to-end smoke test.
 *
 *   node --experimental-sqlite scripts/verify.mjs [baseUrl]
 *
 * Exercises the paths a marker would walk: register, claim a drop, place a
 * slip, watch the live feed push a price change, force a settlement, and prove
 * the ledger still balances afterwards.
 */
import WebSocket from 'ws';

const BASE = process.argv[2] ?? 'http://localhost:3000';
const API = `${BASE}/api`;
const WS_URL = BASE.replace(/^http/, 'ws') + '/ws';

let passed = 0;
let failed = 0;

function check(label, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${label}${detail ? ` — ${detail}` : ''}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

async function call(path, { method = 'GET', body, token } = {}) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  return { status: response.status, payload: text ? JSON.parse(text) : {} };
}

console.log(`\nGoldBean Arena :: smoke test against ${BASE}\n`);

// 1. public surface -----------------------------------------------------------
console.log('public surface');
const meta = await call('/meta');
check('GET /api/meta', meta.status === 200 && meta.payload.currency.isRealMoney === false, meta.payload.currency?.name);

const board = await call('/board');
check('GET /api/board', board.status === 200 && board.payload.events.length > 0, `${board.payload.events.length} fixtures`);

const sports = new Set(board.payload.events.map((event) => event.sport));
check('board spans multiple sports', sports.size >= 3, [...sports].join(', '));

const marketsOk = board.payload.events.every((event) => event.markets.length > 0);
check('every fixture has markets', marketsOk);

const priced = board.payload.events.flatMap((event) => event.markets.flatMap((market) => market.selections));
check('every selection is priced above 1.00', priced.every((selection) => selection.odds > 1), `${priced.length} selections`);

const stats = await call('/stats');
check('GET /api/stats', stats.status === 200);

// 2. auth ---------------------------------------------------------------------
console.log('\nauthentication');
const suffix = Date.now().toString(36);
const email = `marker+${suffix}@goldbean.local`;
const username = `marker${suffix}`.slice(0, 20);

const registered = await call('/auth/register', {
  method: 'POST',
  body: { email, username, password: 'goldbeans1' },
});
check('POST /api/auth/register', registered.status === 201, `id ${registered.payload.user?.id}`);
const token = registered.payload.token;
check('welcome bonus credited', registered.payload.balance === meta.payload.welcomeBonus, `${registered.payload.balance} beans`);

const duplicate = await call('/auth/register', {
  method: 'POST',
  body: { email, username, password: 'goldbeans1' },
});
check('duplicate email rejected', duplicate.status === 409, duplicate.payload.code);

const badLogin = await call('/auth/login', { method: 'POST', body: { identifier: username, password: 'wrong' } });
check('wrong password rejected', badLogin.status === 401, badLogin.payload.code);

const me = await call('/auth/me', { token });
check('GET /api/auth/me with bearer token', me.payload.user?.username === username);

const anonymous = await call('/wallet');
check('wallet requires auth', anonymous.status === 401, anonymous.payload.code);

// 3. wallet -------------------------------------------------------------------
console.log('\nwallet & ledger');
const wallet = await call('/wallet', { token });
check('GET /api/wallet', wallet.status === 200 && wallet.payload.balance === meta.payload.welcomeBonus);
check('statement has the signup entry', wallet.payload.statement.some((entry) => entry.refType === 'signup_bonus'));

const drop = await call('/wallet/drop', { method: 'POST', token });
check('POST /api/wallet/drop', drop.status === 200, `+${drop.payload.granted}`);

const dropAgain = await call('/wallet/drop', { method: 'POST', token });
check('drop cooldown enforced', dropAgain.status === 429, dropAgain.payload.code);

// 4. betting ------------------------------------------------------------------
console.log('\nbetting');
const openEvents = board.payload.events.filter((event) => event.status !== 'finished').slice(0, 3);
const legs = openEvents.map((event) => ({ selectionId: event.markets[0].selections[0].id }));

const tooSmall = await call('/bets', { method: 'POST', token, body: { stake: 1, legs: [legs[0]] } });
check('minimum stake enforced', tooSmall.status === 400, tooSmall.payload.code);

const duplicateEvent = await call('/bets', {
  method: 'POST',
  token,
  body: { stake: 50, legs: [legs[0], { selectionId: openEvents[0].markets[1].selections[0].id }] },
});
check('one leg per fixture enforced', duplicateEvent.status === 400, duplicateEvent.payload.code);

const stake = 120;
const placed = await call('/bets', { method: 'POST', token, body: { stake, legs } });
check('POST /api/bets', placed.status === 201, placed.payload.bet?.ref);
const expectedBalance = meta.payload.welcomeBonus + drop.payload.granted - stake;
check('stake debited from wallet', placed.payload.balance === expectedBalance, `${placed.payload.balance} beans`);
check(
  'combined odds = product of legs',
  Math.abs(placed.payload.bet.combinedOdds - legs.reduce((p, leg) => p * openEvents.find((e) => e.markets[0].selections[0].id === leg.selectionId).markets[0].selections[0].odds, 1)) < 0.02,
);

const overspend = await call('/bets', { method: 'POST', token, body: { stake: 999999, legs: [legs[0]] } });
const overMax = await call('/bets', { method: 'POST', token, body: { stake: 999999, legs: [legs[0]] } });
check('stake above the cap rejected', overMax.status === 400, overMax.payload.code);

const broke = await call('/bets', { method: 'POST', token, body: { stake: 4000, legs: [legs[0]] } });
check('stake beyond the balance rejected', broke.status === 400 && broke.payload.code === 'insufficient_funds', broke.payload.code);

const afterRejections = await call('/wallet', { token });
check('rejected slips did not move the balance', afterRejections.payload.balance === expectedBalance, `${afterRejections.payload.balance} beans`);

const myBets = await call('/bets', { token });
check('GET /api/bets', myBets.payload.bets.length === 1 && myBets.payload.stats.atRisk === stake);

// 5. live feed ----------------------------------------------------------------
console.log('\nlive feed');
const tick = await new Promise((resolve) => {
  const socket = new WebSocket(WS_URL);
  const timeout = setTimeout(() => {
    socket.close();
    resolve(null);
  }, 12_000);

  socket.on('message', (raw) => {
    const message = JSON.parse(String(raw));
    if (message.type === 'hello') return;
    if (message.type === 'tick') {
      clearTimeout(timeout);
      socket.close();
      resolve(message);
    }
  });
  socket.on('error', () => {
    clearTimeout(timeout);
    resolve(null);
  });
});

check('WebSocket connects and streams ticks', tick !== null);
if (tick) {
  const patches = tick.prices?.length ?? 0;
  const moved = tick.events?.length ?? 0;
  check('tick carries price updates', patches > 0, `${patches} prices`);
  check('tick carries clock/score updates', moved > 0, `${moved} fixtures`);
  check('tick carries a timestamp', Boolean(tick.at));
}

// 6. settlement ---------------------------------------------------------------
console.log('\nsettlement');
const admin = await call('/auth/login', { method: 'POST', body: { identifier: 'admin', password: 'goldbean-admin' } });
check('admin login', admin.status === 200 && admin.payload.user.role === 'admin');

const forbidden = await call('/admin/overview', { token });
check('admin routes reject players', forbidden.status === 403, forbidden.payload.code);

const overview = await call('/admin/overview', { token: admin.payload.token });
check('GET /api/admin/overview', overview.status === 200, `${overview.payload.users.length} accounts`);

// Kick off a brand-new fixture, back it, then settle it by hand.
const created = await call('/admin/events', {
  method: 'POST',
  token: admin.payload.token,
  body: { sportKey: 'football', live: true },
});
check('POST /api/admin/events', created.status === 201, `fixture ${created.payload.id}`);

const fresh = await call(`/events/${created.payload.id}`);
const firstMarket = fresh.payload.event.markets[0];

const beforeSettlement = (await call('/wallet', { token })).payload.balance;
const singleStake = 60;
const single = await call('/bets', {
  method: 'POST',
  token,
  body: { stake: singleStake, legs: [{ selectionId: firstMarket.selections[0].id }] },
});
check('slip placed on the new fixture', single.status === 201, single.payload.bet?.ref);
check('stake parked in escrow', single.payload.balance === beforeSettlement - singleStake);

const settled = await call('/admin/events/' + created.payload.id + '/finish', {
  method: 'POST',
  token: admin.payload.token,
});
check('POST /api/admin/events/:id/finish', settled.status === 200, `${settled.payload.settled} slip(s) settled`);
check('the slip was settled by the settlement engine', settled.payload.settled === 1);

const graded = await call(`/events/${created.payload.id}`);
check(
  'selections graded after settlement',
  graded.payload.event.markets[0].selections.every((selection) => selection.result !== 'pending'),
  graded.payload.event.markets[0].selections.map((s) => `${s.key}:${s.result}`).join(' '),
);
check('market name preserved', graded.payload.event.markets[0].name === firstMarket.name);

const finishedBet = await call('/bets', { token });
const latest = finishedBet.payload.bets[0];
check('slip reached a terminal state', latest.status !== 'open', latest.status);
check('every leg on that slip is graded', latest.legs.every((leg) => leg.result !== 'pending'), latest.legs.map((l) => l.result).join(', '));

const afterSettlement = await call('/wallet', { token });
// The stake left the wallet when the slip was accepted, so a loss simply
// leaves the balance where it was; a win adds the payout back on top.
const expectedAfter = beforeSettlement - singleStake + (latest.status === 'won' ? latest.payout : 0);
check(
  latest.status === 'won' ? 'winning payout credited to the wallet' : 'losing stake stayed with the house',
  afterSettlement.payload.balance === expectedAfter,
  `${afterSettlement.payload.balance} beans (payout ${latest.payout})`,
);
check(
  'settlement posted to the statement',
  afterSettlement.payload.statement.some((entry) => entry.refId === latest.ref),
  latest.ref,
);

// The core accounting identity, checked through the public API only:
//   beans issued = beans in wallets + beans held in escrow + beans kept as rake
const finalStats = await call('/stats');
const find = (kind) => finalStats.payload.ledger.find((account) => account.kind === kind)?.net ?? 0;
const issued = find('issuance');
const escrow = find('escrow');
const rake = find('rake');
const inWallets = finalStats.payload.beansInPlay;
check(
  'ledger identity holds: issued = wallets + escrow + rake',
  issued === inWallets + escrow + rake,
  `${issued} = ${inWallets} + ${escrow} + ${rake}`,
);
check('escrow never goes negative', escrow >= 0, `${escrow} beans held`);

// 7. leaderboard --------------------------------------------------------------
console.log('\nsocial');
const leaderboard = await call('/leaderboard');
check('GET /api/leaderboard', leaderboard.status === 200 && leaderboard.payload.leaders.length > 0);
check(
  'leaderboard is sorted by balance',
  leaderboard.payload.leaders.every((leader, index, all) => index === 0 || all[index - 1].balance >= leader.balance),
);

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
