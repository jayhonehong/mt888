/**
 * The ledger.
 *
 * Rules this module enforces so the rest of the app cannot corrupt balances:
 *   1. Every journal is balanced: SUM(debit) === SUM(credit).
 *   2. Bean amounts are positive integers. No floats ever touch a balance.
 *   3. A wallet can never be overdrawn, because `post()` re-reads the balance
 *      inside the same transaction it writes in (BEGIN IMMEDIATE holds the
 *      write lock, so no other request can interleave).
 *   4. Balances are derived, never stored.
 */
import { all, get, run, tx } from './db.js';

export class LedgerError extends Error {
  constructor(message, code = 'ledger_error') {
    super(message);
    this.name = 'LedgerError';
    this.code = code;
    this.status = 400;
  }
}

const HOUSE_ACCOUNTS = [
  { code: 'house:issuance', kind: 'issuance', label: 'Bean issuance (faucet)' },
  { code: 'house:escrow', kind: 'escrow', label: 'Stakes held in open bets' },
  { code: 'house:rake', kind: 'rake', label: 'Beans retained from settled bets' },
];

export const WELCOME_BONUS = 1000;
export const DAILY_TOPUP = 500;

export const ensureHouseAccounts = tx(() => {
  for (const account of HOUSE_ACCOUNTS) {
    run(
      `INSERT INTO accounts (code, owner_type, user_id, kind, label)
       VALUES (?, 'house', NULL, ?, ?)
       ON CONFLICT(code) DO NOTHING`,
      account.code,
      account.kind,
      account.label,
    );
  }
});

export function accountId(code) {
  const row = get('SELECT id FROM accounts WHERE code = ?', code);
  if (!row) throw new LedgerError(`Unknown ledger account: ${code}`, 'account_missing');
  return row.id;
}

export function createWallet(userId, username) {
  run(
    `INSERT INTO accounts (code, owner_type, user_id, kind, label)
     VALUES (?, 'user', ?, 'wallet', ?)`,
    `user:${userId}:wallet`,
    userId,
    `${username} wallet`,
  );
  return accountId(`user:${userId}:wallet`);
}

/** Derived balance of a user's wallet account. */
export function walletBalance(userId) {
  const row = get(
    `SELECT COALESCE(SUM(e.credit) - SUM(e.debit), 0) AS balance
       FROM accounts a
       LEFT JOIN entries e ON e.account_id = a.id
      WHERE a.code = ?`,
    `user:${userId}:wallet`,
  );
  return Number(row?.balance ?? 0);
}

export function houseSnapshot() {
  const rows = all(
    `SELECT a.code, a.kind, a.label,
            COALESCE(SUM(e.debit), 0)  AS debit,
            COALESCE(SUM(e.credit), 0) AS credit
       FROM accounts a
       LEFT JOIN entries e ON e.account_id = a.id
      WHERE a.owner_type = 'house'
      GROUP BY a.id
      ORDER BY a.id`,
  );
  const outstanding = get(
    `SELECT COALESCE(SUM(e.credit) - SUM(e.debit), 0) AS total
       FROM accounts a JOIN entries e ON e.account_id = a.id
      WHERE a.owner_type = 'user'`,
  );
  return {
    accounts: rows.map((account) => ({
      code: account.code,
      label: account.label,
      kind: account.kind,
      debit: Number(account.debit),
      credit: Number(account.credit),
      // Issuance is the faucet, so its debits are the beans created. Escrow and
      // rake hold beans, so their credits are what they are sitting on.
      net:
        account.kind === 'issuance'
          ? Number(account.debit) - Number(account.credit)
          : Number(account.credit) - Number(account.debit),
    })),
    beansInPlayersHands: Number(outstanding?.total ?? 0),
  };
}

/**
 * Post a balanced journal.
 *
 * @param {object}   journal
 * @param {string}   journal.refType  e.g. 'bet_stake'
 * @param {string?}  journal.refId    e.g. bet reference
 * @param {string}   journal.memo     human readable line for the statement
 * @param {Array}    journal.lines    [{ accountId, debit, credit }]
 */
export const post = tx(({ refType, refId = null, memo, lines }) => {
  if (!Array.isArray(lines) || lines.length < 2) {
    throw new LedgerError('A journal needs at least two lines.', 'unbalanced');
  }

  let debit = 0;
  let credit = 0;
  for (const line of lines) {
    const d = Math.trunc(line.debit ?? 0);
    const c = Math.trunc(line.credit ?? 0);
    if (d < 0 || c < 0) throw new LedgerError('Negative amounts are not allowed.', 'negative_amount');
    if (d > 0 && c > 0) throw new LedgerError('A line is either a debit or a credit.', 'ambiguous_line');
    if (d === 0 && c === 0) continue;
    debit += d;
    credit += c;
  }

  if (debit !== credit) {
    throw new LedgerError(
      `Journal is unbalanced: debits ${debit} vs credits ${credit}.`,
      'unbalanced',
    );
  }
  if (debit === 0) throw new LedgerError('Journal has no value.', 'empty_journal');

  const info = run(
    'INSERT INTO journals (ref_type, ref_id, memo) VALUES (?, ?, ?)',
    refType,
    refId,
    memo,
  );
  const journalId = Number(info.lastInsertRowid);

  for (const line of lines) {
    const d = Math.trunc(line.debit ?? 0);
    const c = Math.trunc(line.credit ?? 0);
    if (d === 0 && c === 0) continue;
    run(
      'INSERT INTO entries (journal_id, account_id, debit, credit) VALUES (?, ?, ?, ?)',
      journalId,
      line.accountId,
      d,
      c,
    );
  }

  return { journalId, amount: debit };
});

/** Throws unless the wallet can cover `amount`. Called inside the same tx as the spend. */
export function assertFunds(userId, amount) {
  const balance = walletBalance(userId);
  if (balance < amount) {
    throw new LedgerError(
      `Not enough gold beans. Balance ${balance}, needed ${amount}.`,
      'insufficient_funds',
    );
  }
  return balance;
}

export const grantBeans = tx(({ userId, amount, refType, refId = null, memo }) => {
  const value = Math.trunc(amount);
  if (value <= 0) throw new LedgerError('Grant amount must be positive.', 'bad_amount');
  return post({
    refType,
    refId,
    memo,
    lines: [
      { accountId: accountId('house:issuance'), debit: value },
      { accountId: accountId(`user:${userId}:wallet`), credit: value },
    ],
  });
});

export const transferBeans = tx(({ fromUserId, toUserId, amount, refId = null, memo = 'Friend bean gift' }) => {
  const value = Math.trunc(amount);
  if (fromUserId === toUserId) throw new LedgerError('You cannot gift beans to yourself.', 'same_recipient');
  if (value <= 0 || value > 1_000_000_000_000) throw new LedgerError('Gift amount must be between 1 and 1,000,000,000,000 beans.', 'bad_amount');
  assertFunds(fromUserId, value);
  post({
    refType: 'friend_gift',
    refId,
    memo,
    lines: [
      { accountId: accountId(`user:${fromUserId}:wallet`), debit: value },
      { accountId: accountId(`user:${toUserId}:wallet`), credit: value },
    ],
  });
  return { amount: value, fromBalance: walletBalance(fromUserId), toBalance: walletBalance(toUserId) };
});

/**
 * Statement for the wallet page: every entry with a running balance so the
 * player can reconcile the number in the header by hand.
 */
export function statement(userId, { limit = 60 } = {}) {
  const rows = all(
    `SELECT e.id, e.debit, e.credit, e.created_at,
            j.ref_type, j.ref_id, j.memo
       FROM entries e
       JOIN journals j ON j.id = e.journal_id
       JOIN accounts a ON a.id = e.account_id
      WHERE a.code = ?
      ORDER BY e.id DESC
      LIMIT ?`,
    `user:${userId}:wallet`,
    limit,
  );

  let running = walletBalance(userId);
  return rows.map((row) => {
    const delta = Number(row.credit) - Number(row.debit);
    const entry = {
      id: row.id,
      at: row.created_at,
      refType: row.ref_type,
      refId: row.ref_id,
      memo: row.memo,
      delta,
      balance: running,
    };
    running -= delta;
    return entry;
  });
}
