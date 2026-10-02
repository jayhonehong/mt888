/**
 * `npm run seed`   - create the schema and a starter slate if they are missing
 * `npm run reset`  - wipe every account, bet and fixture, then start over
 *
 * Reset is destructive, so it needs an explicit --force (the `npm run reset`
 * script passes it).
 *
 * IMPORTANT: the database file must be deleted *before* `db.js` is imported.
 * That module opens the file at import time, and deleting a file that already
 * has an open handle leaves the process writing to an unlinked inode — the
 * "reset" would appear to work while changing nothing on disk. So the paths are
 * computed here and the app modules are loaded dynamically afterwards.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const dataDir = path.join(root, 'data');
const dbFile = process.env.GOLDBEAN_DB
  ? path.resolve(process.env.GOLDBEAN_DB)
  : path.join(dataDir, 'goldbean.db');

const force = process.argv.includes('--force');

if (force) {
  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(`${dbFile}${suffix}`, { force: true });
  }
  fs.rmSync(path.join(dataDir, 'jwt.secret'), { force: true });
  console.log('[reset] removed the database and the session secret');
  console.log('[reset] a fresh database will be created at ' + dbFile);
}

const { bootstrap, accountSummary } = await import('./bootstrap.js');
const summary = bootstrap();

console.log(`[seed] ${summary.users} accounts, ${summary.events} fixtures`);
for (const account of accountSummary()) {
  console.log(`       #${account.id} ${account.username.padEnd(10)} ${account.role.padEnd(6)} ${account.balance} beans`);
}
console.log('\nDemo logins: demo / goldbean   ·   admin / goldbean-admin');
console.log('Beans are fake. Nothing here touches real money.');
process.exit(0);