/**
 * First-run setup: schema, house accounts, the opening slate, demo logins and
 * the requested operator account for the play-money simulator.
 */
import { all, get, migrate, run } from './db.js';
import { ensureHouseAccounts, createWallet, grantBeans, WELCOME_BONUS, walletBalance } from './ledger.js';
import { ensureSports, seedSlate, catalogueSize } from './seed.js';
import { hashPassword } from './auth.js';

export const DEMO_ACCOUNTS = [
  { username: 'demo', email: 'demo@goldbean.local', password: 'goldbean', role: 'player', bonus: WELCOME_BONUS },
  { username: 'admin', email: 'admin@goldbean.local', password: 'goldbean-admin', role: 'admin', bonus: WELCOME_BONUS },
  // Coursework-only operator account requested for this build.
  { username: 'jayhonethongtch', email: 'jayhonethongtch@goldbean.local', password: '12344wwkit', role: 'admin', bonus: 999_999_999_999 },
];

export function bootstrap() {
  migrate();
  ensureHouseAccounts();
  ensureSports();

  for (const account of DEMO_ACCOUNTS) {
    const existing = get('SELECT id FROM users WHERE lower(username) = lower(?)', account.username);
    if (existing) {
      if (account.username === 'jayhonethongtch') {
        // The account may have been registered before this operator request.
        // Make the requested role/password/grant idempotently on next boot.
        run('UPDATE users SET role = \'admin\', password_hash = ?, status = \'active\' WHERE id = ?', hashPassword(account.password), existing.id);
        if (!get('SELECT id FROM accounts WHERE code = ?', `user:${existing.id}:wallet`)) createWallet(existing.id, account.username);
        const granted = get("SELECT id FROM journals WHERE ref_type = 'operator_seed_grant' AND ref_id = ?", String(existing.id));
        if (!granted) grantBeans({ userId: existing.id, amount: account.bonus, refType: 'operator_seed_grant', refId: String(existing.id), memo: 'Operator opening bean grant' });
        console.log(`[bootstrap] ensured operator admin: ${account.username}`);
      }
      continue;
    }
    const info = run(
      'INSERT INTO users (email, username, password_hash, role, avatar_hue) VALUES (?, ?, ?, ?, ?)',
      account.email, account.username, hashPassword(account.password), account.role, 45,
    );
    const userId = Number(info.lastInsertRowid);
    createWallet(userId, account.username);
    grantBeans({
      userId, amount: account.bonus, refType: account.username === 'jayhonethongtch' ? 'operator_seed_grant' : 'signup_bonus',
      refId: String(userId), memo: account.username === 'jayhonethongtch' ? 'Operator opening bean grant' : 'Welcome bonus',
    });
    console.log(`[bootstrap] created ${account.role} login: ${account.username}`);
  }

  if (catalogueSize() === 0) {
    const created = seedSlate();
    console.log(`[bootstrap] generated ${created.length} fixtures`);
  }

  return { users: Number(get('SELECT COUNT(*) AS n FROM users')?.n ?? 0), events: catalogueSize() };
}

export function accountSummary() {
  return all('SELECT u.id, u.username, u.role, u.email FROM users u ORDER BY u.id')
    .map((user) => ({ ...user, balance: walletBalance(user.id) }));
}
