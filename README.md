# GoldBean Arena

A live, high-density wagering terminal built as a full-stack engineering project: real-time
pricing over WebSockets, a proper double-entry ledger, JWT sessions with role-based access
control, and an admin console for operating the simulation.

> **This is a simulation, not a gambling product.**
> "Gold Beans" are a fictional play-money token. They cannot be bought, sold, transferred or
> cashed out. The project contains **no payment integration of any kind** — no processor, no
> card handling, no deposit or withdrawal rail. Every club, league, fixture and price is
> generated locally by the simulator. Nothing connects to a real sportsbook or data feed.
>
> If you or someone you know is struggling with gambling, help is available — in the UK,
> GamCare on 0808 8020 133.

---

## Why it is interesting

Most "betting site" coursework stops at a CRUD form that writes `balance = balance - stake`.
That pattern is where real systems die: the balance and the transaction history drift apart,
and nobody can explain the discrepancy. GoldBean Arena takes the opposite approach.

| Problem | How this project solves it |
| --- | --- |
| Balances drifting from history | Balances are **derived** from ledger entries, never stored. There is no `balance` column. |
| Double-spending a stake | Every journal is enforced balanced (`Σdebit = Σcredit`) inside the transaction that writes it. |
| Race conditions on stake/withdraw | All money movement runs under `BEGIN IMMEDIATE`, so the balance is re-read while the write lock is held. |
| Stale UI on fast-moving prices | One compact WebSocket patch per tick; the client merges it into local state instead of refetching. |
| Silent accounting errors | `GET /api/stats` evaluates `issued = wallets + escrow + rake` on every read and exposes it as `ledgerBalanced`. |

---

## Feature map

The build follows the four-phase roadmap in the brief, all four delivered.

### Phase 1 — Wireframing & UI layout
- Three-zone shell: collapsible left rail, dense centre board, persistent right bet slip.
- Fully responsive: side rail collapses to a bottom tab bar below `lg`; the bet slip becomes a
  slide-up sheet below `xl` with a floating summary bar.
- Dark "broadcast terminal" design system built on Tailwind v4 design tokens.

### Phase 2 — Core authentication & database
- Registration and login with **bcrypt** password hashing and **JWT** sessions (7-day expiry).
- Sessions delivered as an httpOnly cookie *and* a bearer token, so the app also works in
  embedded/cross-site contexts where third-party cookies are blocked.
- Roles: `player` and `admin`, enforced server-side via `requireAuth` / `requireAdmin`.
- In-memory request throttling on the credential endpoints.

### Phase 3 — Virtual wallet & transaction mocking
- A real double-entry ledger: `journals` + `entries` across per-user wallets plus three house
  accounts (issuance, escrow, rake).
- Welcome bonus, free bean drops on a cooldown, and a statement view with a **running balance**
  after every entry so the header figure can be reconciled by hand.
- Wallet and ledger tables (behind login) so balances persist per account.

### Phase 4 — Interactive features & WebSockets
- A live feed engine that advances clocks, scores goals, drifts prices, promotes pre-match
  fixtures to live, settles completed fixtures and restocks the slate.
- ~50 price updates and several clock/score updates pushed per tick (every 2s by default).
- Automatic settlement: when a fixture ends, every open slip touching it is graded leg-by-leg
  and the payout or loss is posted to the ledger — the player is notified in real time.

### Beyond the brief
- **Admin console**: inspect accounts, read the house ledger, generate fixtures, settle or void
  a fixture by hand and watch the accounting post.
- **Settlement engine** handling singles and accumulators, void legs (recomputed at 1.00),
  abandoned fixtures (full stake refund) and payout caps.
- **Odds movement visualisation**: every price change is recorded and drawn as a sparkline on
  each selection, with the implied probability alongside.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Browser (React 18 + TypeScript + Tailwind v4)                           │
│                                                                          │
│   AuthContext   ── session, balance                                      │
│   LiveContext   ── fixtures + odds, merges WebSocket patches              │
│   BetSlipContext── slip persisted to localStorage                        │
│   ToastContext  ── settlement notifications                              │
└───────────┬────────────────────────────────────┬─────────────────────────┘
            │ REST  /api/*                       │ WebSocket  /ws
            ▼                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  Node 22 · Express 4 · ws          (one process, one port)               │
│                                                                          │
│   routes.js      REST endpoints, validation, error codes                 │
│   auth.js        bcrypt, JWT, cookies, RBAC, throttling                  │
│   betting.js     slip validation, stake posting, settlement engine       │
│   ledger.js      balanced journals, derived balances, statements         │
│   simulator.js   clock, scoring, pricing, grading, tick broadcasting     │
│   seed.js        fixture + market generation from templates              │
│   db.js          driver adapter + transaction helper (savepoint nesting) │
└───────────────────────────────┬──────────────────────────────────────────┘
                                │
                                ▼
                    SQLite (WAL, foreign keys on)
        users · accounts · journals · entries
        sports · events · markets · selections · price_ticks
        bets · bet_legs
```

### The ledger in one diagram

```
        signup bonus / free drop              stake placed
                 │                                 │
                 ▼                                 ▼
   ┌───────────────────┐              ┌───────────────────┐
   │  house:issuance   │              │   user wallet     │
   │  (the faucet)     │              └─────────┬─────────┘
   └─────────┬─────────┘                        │ DR stake
             │ DR amount                        ▼
             │                        ┌───────────────────┐
             └───────────────────────▶│   house:escrow    │
                                      └─────────┬─────────┘
                                                │
                      ┌─────────────────────────┴──────────────────────┐
                      ▼                                                ▼
              slip won: DR escrow(stake)                    slip lost: DR escrow(stake)
              CR wallet(stake)                              CR house:rake(stake)
              DR issuance(profit)  ──▶ CR wallet(profit)
```

`issued = wallets + escrow + rake` holds after every operation, because every journal balances.

---

## Quick start

Requires **Node 22.5+** (the project uses the built-in `node:sqlite` module).

```bash
npm install
npm run build          # build the React client
npm start              # http://localhost:3000
```

Open <http://localhost:3000>. The first boot creates the schema, the house accounts, a slate of
fixtures and two marker logins.

### Development (hot reload)

```bash
npm run dev            # Express on :3000 + Vite on :5173 (proxies /api and /ws)
```

Then use <http://localhost:5173>. The API server is started with `--watch`, so server edits
restart automatically.

### Marker logins

| Account | Username | Password | Role |
| --- | --- | --- | --- |
| Player | `demo` | `goldbean` | player |
| Operator | `admin` | `goldbean-admin` | admin |

Seeded only when the `users` table is empty, so registering real accounts does not disturb them.

### Scripts

| Command | What it does |
| --- | --- |
| `npm start` | Build-free production run: serves `client/dist` + API + WebSocket |
| `npm run dev` | Vite + Express with hot reload |
| `npm run build` | Typecheck and build the client |
| `npm run typecheck` | `tsc --noEmit` over the client |
| `npm run seed` | Create schema/fixtures if missing, then list accounts |
| `npm run reset` | **Destructive.** Delete the database and start over |
| `node scripts/verify.mjs` | 47-check end-to-end smoke test against a running server |
| `python3 scripts/screenshots.py` | Render every page in Chromium, capture screenshots and console errors |

---

## Project layout

```
goldbean/
├── server/
│   ├── index.js         entry point: express app, static SPA, WebSocket hub, shutdown
│   ├── routes.js        REST surface and validation
│   ├── auth.js          bcrypt, JWT, cookies, RBAC, throttling
│   ├── ledger.js        balanced journals, derived balances, statements, house accounts
│   ├── betting.js       slip validation, settlement engine, bet statistics
│   ├── simulator.js     live clock, scoring, pricing, grading, tick broadcasting
│   ├── seed.js          fixture/market generation
│   ├── catalogue.js     fictional clubs, leagues and market templates
│   ├── bootstrap.js     first-run setup and marker accounts
│   ├── db.js            SQLite driver adapter + transaction helper
│   ├── schema.sql       schema, documented
│   └── reset.js         `npm run seed` / `npm run reset`
├── client/
│   ├── src/
│   │   ├── lib/         api client, types, formatters
│   │   ├── state/       auth, live feed, bet slip, toasts
│   │   ├── components/  app shell, event card, odds button, bet slip, UI primitives
│   │   └── pages/       board, sports, fixture, bets, wallet, leaderboard, admin, auth
│   └── index.html
├── scripts/
│   ├── verify.mjs       end-to-end smoke test
│   └── screenshots.py   visual regression / console-error check
└── docs/
    ├── architecture.d2  diagram source
    └── screenshots/     generated by scripts/screenshots.py
```

---

## Data model

**Identity** — `users` (email, username, bcrypt hash, role, status) and one `accounts` row per
user wallet, keyed `user:<id>:wallet`.

**Ledger** — `journals` (a dated, described transaction) and `entries` (one row per account
touched, with a `debit` or `credit`). Three house accounts share the same table:
`house:issuance` (beans created), `house:escrow` (beans locked in open slips), `house:rake`
(beans retained from settled slips).

**Catalogue** — `sports` → `events` → `markets` → `selections`, plus `price_ticks` for the
per-selection price history behind the sparklines. Markets carry an optional `line` so totals
and handicaps can be graded generically without hard-coding per-sport logic into the database.

**Wagering** — `bets` (stake, combined odds, potential payout, status) and `bet_legs` (one row
per selection with the odds **as taken at placement** and its own graded result).

### Journal recipes

| Event | Debits | Credits |
| --- | --- | --- |
| Welcome bonus / free drop | `house:issuance` | `user wallet` |
| Slip placed | `user wallet (stake)` | `house:escrow (stake)` |
| Slip won | `house:escrow (stake)`, `house:issuance (profit)` | `user wallet (stake)`, `user wallet (profit)` |
| Slip lost | `house:escrow (stake)` | `house:rake (stake)` |
| Slip voided | `house:escrow (stake)` | `user wallet (stake)` |

---

## API reference

All responses are JSON. Errors carry a stable `code` (`insufficient_funds`, `stake_too_small`,
`duplicate_event`, `email_taken`, …) so the client never string-matches a message.

### Public

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/health` | liveness |
| `GET` | `/api/meta` | currency, bonuses, stake limits, disclaimer |
| `GET` | `/api/board` | sports + every open fixture with markets, prices and price history |
| `GET` | `/api/board?finished=1` | include settled fixtures |
| `GET` | `/api/events/:id` | one fixture |
| `GET` | `/api/stats` | platform totals, house ledger, `ledgerBalanced` |
| `GET` | `/api/leaderboard` | top 25 by derived balance |

### Authentication

| Method | Path | Notes |
| --- | --- | --- |
| `POST` | `/api/auth/register` | `{ email, username, password }` → user, token, balance |
| `POST` | `/api/auth/login` | `{ identifier, password }` (username or email) |
| `POST` | `/api/auth/logout` | clears the session cookie |
| `GET` | `/api/auth/me` | current user + balance, or `null` |

### Authenticated

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/wallet` | balance, statement with running balance, stats, drop state |
| `POST` | `/api/wallet/drop` | claim the free bean drop (cooldown enforced) |
| `GET` | `/api/bets` | every slip with a leg-by-leg breakdown |
| `POST` | `/api/bets` | `{ stake, legs: [{ selectionId }] }` |

### Admin

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/admin/overview` | accounts, balances, fixtures, house ledger |
| `POST` | `/api/admin/events` | generate a fixture (`{ sportKey, live, startsInMinutes }`) |
| `POST` | `/api/admin/events/:id/finish` | settle a fixture now and post the results |
| `POST` | `/api/admin/events/:id/void` | abandon a fixture and refund every stake |

---

## WebSocket protocol

Connect to `ws://<host>/ws` (or `wss://` over HTTPS). An optional `?token=<jwt>` — or the
session cookie — associates the socket with an account so it receives private messages.

**Server → client**

| Type | Payload | Meaning |
| --- | --- | --- |
| `hello` | `{ serverTime, user, balance }` | sent once on connect |
| `tick` | `{ prices, events, finished, added, promoted, at }` | one live-feed patch |
| `wallet` | `{ balance }` | balance changed (settlement) |
| `bet.settled` | `{ bet }` | one of your slips reached a terminal state |
| `pong` | `{ at }` | heartbeat reply |

**Client → server** — `{ type: 'ping' }`, `{ type: 'bets.refresh' }`.

`tick.prices` is a list of `{ id, odds, dir }`; `tick.events` a list of
`{ id, clock, period, homeScore, awayScore, scored }`. The client merges these into its local
fixture state, so a busy board costs one small frame every two seconds rather than a refetch.

---

## Configuration

Everything has a working default — see `.env.example`.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port |
| `HOST` | `0.0.0.0` | bind address |
| `GOLDBEAN_DB` | `./data/goldbean.db` | SQLite file |
| `GOLDBEAN_JWT_SECRET` | generated into `data/jwt.secret` | session signing key |
| `GOLDBEAN_TICK_MS` | `2000` | live feed interval (lower for a faster demo) |
| `GOLDBEAN_DROP_COOLDOWN_MS` | `180000` | free drop cooldown |
| `GOLDBEAN_DEV_ORIGIN` | `http://localhost:5173` | CORS origin in dev |

---

## Testing

```bash
npm start &                 # or npm run dev:server
node scripts/verify.mjs     # 47 checks
```

The smoke test walks the whole product surface: board integrity and pricing sanity, registration
and duplicate/credential rejection, auth guards, wallet and drop cooldown, stake limits, the
one-leg-per-fixture rule, insufficient-funds rejection, a live WebSocket tick, admin-only
routes, forced settlement with leg grading, and finally the accounting identity

```
issued === wallets + escrow + rake
```

checked through the public API — so a broken journal cannot pass.

Visual verification (`python3 scripts/screenshots.py`) renders every page in Chromium at desktop
and mobile widths, writes screenshots to `docs/screenshots/`, and fails loudly on any console
error, page exception or failed request.

---

## Security notes

Implemented: bcrypt password hashing (cost 10), signed JWTs, httpOnly cookies with
`SameSite=None; Secure` on HTTPS and `Lax` on plain HTTP, server-side role checks on every
privileged route, balanced-journal enforcement, positive-integer money (no floats),
parameterised SQL everywhere, credential-endpoint throttling, and JSON body limits.

**Deliberately out of scope for coursework:** email verification, password reset, 2FA, refresh
token rotation, CSRF tokens (mitigated here by `SameSite` plus a bearer-token path), rate
limiting at the edge, audit logging, and any real-money concerns — because there is no real money.

---

## Where to take it next

1. **Swap SQLite for PostgreSQL.** Only `server/db.js` knows about the driver; reimplement
   `run/get/all/exec/tx` against `pg` and nothing else changes. Real concurrency then needs
   `SELECT ... FOR UPDATE` on the wallet row inside the transaction.
2. **Redis pub/sub for the live feed.** The simulator currently broadcasts in-process; move the
   hub to Redis so several API instances can serve sockets.
3. **Cash-out / partial settlement.** A new journal recipe plus a market-voiding rule.
4. **Optimistic UI on the slip.** Show the accepted slip before the round trip completes, and
   reconcile on failure.
5. **Property-based ledger tests.** Generate thousands of random operations and assert the
   accounting identity and non-negative balances after each one.

---

## Academic honesty note

If you submit this as coursework, read it, run it, and be ready to explain every part of it —
particularly the ledger design and the transaction boundaries, which are the parts worth
marking. Also check your institution's rules on the subject matter before submitting anything in
the gambling domain.

## Licence

MIT. The design, code and data are original; all clubs, leagues and fixtures are invented.