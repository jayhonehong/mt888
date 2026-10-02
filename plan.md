# GoldBean Arena — design & implementation plan

## 1. The brief, restated

The source brief asks for a high-density, real-time transactional platform in the shape of a
sportsbook: complex front-end layout, real-time data sync, user authentication, and a secure
transaction ledger, delivered as a student project through a four-phase MVP roadmap.

Two constraints were added by the client during scoping and they govern every decision below:

1. **The currency is fake.** "Gold Beans" are a play-money token. No real money, no payment
   provider, no cash-out.
2. **Login is required to hold beans.** A user's balance must be tied to their account and
   survive a refresh.

Constraint 2 is what makes this project interesting. The moment beans must persist per user, the
naive implementation — a `balance` column that you add to and subtract from — becomes a
correctness liability. The rest of this plan is largely about avoiding it.

## 2. Scope

**In scope:** authentication with roles, a dense responsive layout engine, a persistent virtual
wallet backed by a real ledger, a live data feed over WebSockets, slip placement and settlement,
an admin console, and documentation.

**Out of scope, deliberately:** real payments, KYC, licensing, email delivery, password reset,
and any integration with a real sportsbook or odds provider. These are named in the README so the
omission reads as a decision rather than an oversight.

## 3. The central design decision: derived balances

A balance is **never stored**. It is computed:

```sql
SELECT SUM(credit) - SUM(debit) FROM entries WHERE account_id = ?
```

Everything else follows from that. A balance cannot drift from its history, because it *is* its
history. Four rules make it hold:

1. **Every journal balances.** `post()` sums debits and credits and throws before writing if they
   differ. An unbalanced journal cannot reach the database.
2. **Money is integers.** Beans are `INTEGER` with `CHECK (amount >= 0)`. Floats are used only
   for odds, never for a balance.
3. **Spending happens inside the transaction that checks it.** `assertFunds()` re-reads the
   balance under `BEGIN IMMEDIATE`, so two concurrent requests cannot both pass the check.
4. **The identity is asserted on every read.** `issued = wallets + escrow + rake`. If a journal
   ever broke, `GET /api/stats` would return `ledgerBalanced: false`.

### Accounts

Per user: `user:<id>:wallet` (credits increase the player's beans).
House: `house:issuance` (the faucet), `house:escrow` (beans locked in open slips), `house:rake`
(beans retained from settled slips).

### Journal recipes

| Event | Debits | Credits |
| --- | --- | --- |
| Welcome bonus / free drop | issuance | wallet |
| Slip placed | wallet (stake) | escrow (stake) |
| Slip won | escrow (stake), issuance (profit) | wallet (stake), wallet (profit) |
| Slip lost | escrow (stake) | rake (stake) |
| Slip voided | escrow (stake) | wallet (stake) |

Escrow is what prevents double-spending: the stake leaves the spendable balance the instant a slip
is accepted, but it is not revenue until every leg is graded.

## 4. Database choice

The brief suggests PostgreSQL + Redis. For a project that must run on a marker's laptop with one
command, SQLite in WAL mode is the better trade: it is ACID, needs no server, and supports the
same transaction semantics the ledger depends on. Redis's stated roles (session cache, pub/sub)
are unnecessary at single-process scale.

To keep the PostgreSQL migration cheap, `server/db.js` is the only file that knows about the
driver. It exposes `run/get/all/exec/tx`; swapping in `pg` means reimplementing four functions.

The driver adapter also solves a practical problem: Node 22's built-in `node:sqlite` needs no
native build, but older runtimes do not have it. The adapter prefers `node:sqlite` and falls back
to `better-sqlite3`, so the project runs on either without the application code caring.

## 5. Real-time design

The simulator is the only writer of live state. Every 2 seconds it:

1. promotes fixtures whose start time has arrived,
2. advances clocks and scores,
3. drifts prices with mean reversion toward a fair value derived from the live scoreline,
4. grades and settles fixtures that reach full time,
5. restocks the slate so the board is never empty,
6. publishes **one** compact patch.

The patch carries `prices[]`, `events[]`, `finished[]`, `added[]`, `promoted[]`. The client merges
it into a `Map<id, Fixture>`. This is the key scalability decision on the client: a busy board
costs one small frame per tick, not a refetch of the whole catalogue. Settlement produces
separate `bet.settled` and `wallet` messages addressed to the owning socket only.

Prices are generated from implied probabilities plus a 5.5% overround rather than typed by hand,
so the board is internally consistent and the overround is realistic.

## 6. Settlement engine

When a fixture ends, `finishEvent()` grades every market from the final scoreline, writes the
result onto each selection, then settles each affected open slip:

- any leg lost → slip lost, stake to rake;
- all legs void → slip voided, stake returned;
- otherwise → slip won, payout `floor(stake × Π(odds of winning legs))`, void legs recomputed at
  1.00, profit drawn from issuance.

Payouts are capped (`MAX_PAYOUT`) and graded inside one transaction, so a fixture that ends while
a slip is being placed cannot half-settle.

## 7. Front end

**Design movement — "Broadcast Terminal".** The visual language of a live sports broadcast
graphics package (score bugs, odds tickers, lower thirds) fused with a trading desk: dark, dense,
and quiet until data moves.

- **Core principles.** Information density without chaos; live state always visible; colour used
  as signal rather than decoration; motion only where data changes.
- **Colour philosophy.** A near-black navy base (`#070A12`) keeps long sessions comfortable and
  lets the board read as one instrument. One signature amber-gold (`#FFC53D`) is reserved for
  value — beans, prices you have backed, the primary action. Emerald and rose mean one thing only:
  the direction a number just moved.
- **Layout paradigm.** Three zones rather than a centred grid: a collapsible left rail, a dense
  centre board, and a persistent right bet slip. The slip is never a modal on desktop — the whole
  point is that your exposure stays visible while you browse.
- **Signature elements.** Odds chips that flash green or red on a price change and carry a
  sparkline of that selection's own history; a pulsing live dot with the match clock; a gold bean
  counter in the header that ticks on settlement.
- **Interaction philosophy.** Tap a price and it is on the slip; one leg per fixture (picking a
  second market on the same fixture replaces the first, which is what a real punter expects).
  Every rejection explains itself in the server's own words.
- **Animation.** A 900ms background flash on price movement, a 320ms rise for slip legs, a
  1.8s live pulse. All of it is disabled under `prefers-reduced-motion`.
- **Typography.** Inter for interface text, Barlow Condensed for display numerals and headings,
  JetBrains Mono with tabular figures for anything a user might compare vertically.
- **Brand essence.** A live wagering terminal that never lets you lose track of your balance —
  disciplined, transparent, alive. Personality: *precise, candid, kinetic*.
- **Brand voice.** Headlines state the mechanic rather than selling it ("The board never stops
  moving"), and microcopy admits the limits ("Play money only. Beans have no cash value and cannot
  be withdrawn").
- **Wordmark.** A rotated gold bean with a specular highlight, set against a condensed wordmark
  where "BEAN" carries the brand colour.
- **Signature brand colour.** `#FFC53D`.

## 8. Honesty as a design requirement

Because the subject matter is gambling, the interface carries its own context rather than relying
on a README:

- a non-dismissible strip above the header on every page;
- a footer that names the simulation and includes a real support signpost;
- "play money only" microcopy directly beneath every place-slip button;
- a wallet panel that states plainly that there is no deposit and no withdrawal;
- and no purchase, deposit or cash-out affordance anywhere in the product.

## 9. Build order

1. Ledger and schema, verified by hand before anything rendered.
2. Auth, so beans could be tied to an account.
3. Catalogue generation and the simulator, so the board had something to show.
4. REST surface.
5. Client design system, then shell, then pages.
6. End-to-end smoke test and visual pass.

## 10. Verification

- `scripts/verify.mjs` — 47 checks over the whole surface, ending with the accounting identity
  asserted through the public API only.
- `scripts/screenshots.py` — renders every page in Chromium at desktop and mobile widths and
  fails on any console error, page exception or failed request.
- `tsc --noEmit` in strict mode over the client, including `noUnusedLocals` and
  `noUnusedParameters`.
