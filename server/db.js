/**
 * Database bootstrap.
 *
 * GoldBean Arena ships with a tiny driver adapter so the project runs on a
 * plain Node install without compiling native modules:
 *
 *   1. node:sqlite        - built into Node >= 22.5 (needs --experimental-sqlite
 *                           on the 22.x line, stable from Node 24)
 *   2. better-sqlite3     - optional native fallback for older runtimes
 *
 * Both drivers expose the same prepare/run/get/all shape, so the rest of the
 * codebase never has to care which one is active. Swapping in PostgreSQL later
 * means reimplementing this one file.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const ROOT_DIR = path.resolve(__dirname, '..');
export const DATA_DIR = path.join(ROOT_DIR, 'data');
export const DB_FILE = process.env.GOLDBEAN_DB
  ? path.resolve(process.env.GOLDBEAN_DB)
  : path.join(DATA_DIR, 'goldbean.db');

fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });

async function loadDriver() {
  try {
    const mod = await import('node:sqlite');
    return { name: 'node:sqlite', open: (file) => new mod.DatabaseSync(file) };
  } catch (err) {
    if (process.env.GOLDBEAN_DEBUG) {
      console.warn('[db] node:sqlite unavailable:', err.message);
    }
  }
  try {
    const mod = await import('better-sqlite3');
    return { name: 'better-sqlite3', open: (file) => new mod.default(file) };
  } catch (err) {
    throw new Error(
      'No SQLite driver available. Use Node >= 22.5 with --experimental-sqlite, ' +
        'or install the optional better-sqlite3 dependency.\n' +
        `Underlying error: ${err.message}`,
    );
  }
}

const driver = await loadDriver();
const handle = driver.open(DB_FILE);

handle.exec('PRAGMA journal_mode = WAL;');
handle.exec('PRAGMA foreign_keys = ON;');
handle.exec('PRAGMA busy_timeout = 5000;');
handle.exec('PRAGMA synchronous = NORMAL;');

/** Sanitise arguments so both drivers accept the same call sites. */
function bind(params) {
  return params.map((value) => {
    if (value === undefined) return null;
    if (typeof value === 'boolean') return value ? 1 : 0;
    return value;
  });
}

export const db = handle;
export const driverName = driver.name;
export const dbFile = DB_FILE;

export function run(sql, ...params) {
  return handle.prepare(sql).run(...bind(params));
}

export function get(sql, ...params) {
  return handle.prepare(sql).get(...bind(params));
}

export function all(sql, ...params) {
  return handle.prepare(sql).all(...bind(params));
}

export function exec(sql) {
  handle.exec(sql);
}

let depth = 0;

/**
 * Run `fn` inside a transaction. Nested calls become savepoints, so service
 * functions can compose without every caller worrying about the transaction
 * already being open. Any thrown error rolls the whole thing back.
 */
export function tx(fn) {
  return (...args) => {
    const savepoint = depth > 0 ? `sp_${depth}` : null;
    if (savepoint) {
      handle.exec(`SAVEPOINT ${savepoint};`);
    } else {
      handle.exec('BEGIN IMMEDIATE;');
    }
    depth += 1;
    try {
      const result = fn(...args);
      depth -= 1;
      handle.exec(savepoint ? `RELEASE ${savepoint};` : 'COMMIT;');
      return result;
    } catch (err) {
      depth -= 1;
      try {
        handle.exec(savepoint ? `ROLLBACK TO ${savepoint}; RELEASE ${savepoint};` : 'ROLLBACK;');
      } catch {
        /* the transaction is already gone; surface the original error */
      }
      throw err;
    }
  };
}

export function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  handle.exec(sql);
  const eventColumns = all('PRAGMA table_info(events)');
  if (!eventColumns.some((column) => column.name === 'live_started_at')) {
    handle.exec('ALTER TABLE events ADD COLUMN live_started_at TEXT');
  }
  handle.exec("UPDATE events SET live_started_at = datetime('now') WHERE status = 'live' AND live_started_at IS NULL");
}
