/**
 * The live data feed simulator.
 *
 * This is the "broadcast truck" of the project. Every tick it:
 *   1. kicks off fixtures whose start time has arrived,
 *   2. advances the clock and score of anything in play,
 *   3. nudges prices and records them for the sparklines,
 *   4. grades and settles fixtures that reach full time,
 *   5. keeps the slate stocked so the board is never empty,
 *   6. publishes one compact patch over WebSocket for the clients to merge.
 *
 * Nothing here talks to a real data provider. Prices are a random walk with
 * mean reversion toward a fair value derived from the current score, which is
 * enough to look alive without inventing a fake market feed.
 */
import { all, get, run, tx } from './db.js';
import { CLOCK_PROFILE, LEAGUES, CLUBS, SPORTS } from './catalogue.js';
import { createEvent } from './seed.js';
import { settleEventBets } from './betting.js';

// Give players a predictable decision window. Each fixture runs for a stable,
// per-fixture duration between three and five real minutes.
const TICK_MS = Number(process.env.GOLDBEAN_TICK_MS ?? 3000);
const CLOCK_SCALE = Number(process.env.GOLDBEAN_CLOCK_SCALE ?? 0.5);
const MIN_GAME_DURATION_MS = 3 * 60 * 1000;
const MAX_GAME_DURATION_MS = 5 * 60 * 1000;
const MIN_LIVE = 4;
const MAX_LIVE = 6;
const PRICE_HISTORY = 40;

/** Per-sport scoring model used by the clock. */
const SCORING = {
  football: { kind: 'goals', perTick: 0.075 },
  hockey: { kind: 'goals', perTick: 0.1 },
  basketball: { kind: 'points', min: 4, max: 10 },
  tennis: { kind: 'sets', target: 2 },
  esports: { kind: 'sets', target: 2 },
};

const FINISH_LABEL = { football: 'FT', hockey: 'FT', basketball: 'FT', tennis: 'Final', esports: 'Final' };

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function gameDurationMs(eventId) {
  const span = MAX_GAME_DURATION_MS - MIN_GAME_DURATION_MS;
  return MIN_GAME_DURATION_MS + ((Number(eventId) * 7919) % (span + 1));
}

// ---------------------------------------------------------------------------
// Reading the board
// ---------------------------------------------------------------------------

export function eventsWithMarkets({ includeFinished = false } = {}) {
  const events = all(
    `SELECT e.*, s.key AS sport_key, s.name AS sport_name, s.glyph AS sport_glyph
       FROM events e JOIN sports s ON s.id = e.sport_id
      ${includeFinished ? '' : "WHERE e.status <> 'finished'"}
      ORDER BY CASE e.status WHEN 'live' THEN 0 WHEN 'upcoming' THEN 1 ELSE 2 END,
               e.starts_at ASC, e.id ASC`,
  );
  if (events.length === 0) return [];

  const ids = events.map((e) => e.id);
  const placeholders = ids.map(() => '?').join(',');
  const markets = all(
    `SELECT * FROM markets WHERE event_id IN (${placeholders}) ORDER BY sort, id`,
    ...ids,
  );
  const marketIds = markets.map((m) => m.id);
  const selections = marketIds.length
    ? all(
        `SELECT * FROM selections WHERE market_id IN (${marketIds.map(() => '?').join(',')})
          ORDER BY sort, id`,
        ...marketIds,
      )
    : [];

  const selectionsByMarket = new Map();
  for (const selection of selections) {
    if (!selectionsByMarket.has(selection.market_id)) selectionsByMarket.set(selection.market_id, []);
    selectionsByMarket.get(selection.market_id).push(serializeSelection(selection));
  }

  const marketsByEvent = new Map();
  for (const market of markets) {
    if (!marketsByEvent.has(market.event_id)) marketsByEvent.set(market.event_id, []);
    marketsByEvent.get(market.event_id).push({
      id: market.id,
      key: market.key,
      name: market.name,
      line: market.line,
      selections: selectionsByMarket.get(market.id) ?? [],
    });
  }

  return events.map((event) => ({
    ...serializeEvent(event),
    markets: marketsByEvent.get(event.id) ?? [],
  }));
}

export function serializeEvent(event) {
  const profile = CLOCK_PROFILE[event.sport_key] ?? { max: 90, label: 'min' };
  return {
    id: event.id,
    sport: event.sport_key,
    sportName: event.sport_name,
    sportGlyph: event.sport_glyph,
    league: event.league,
    status: event.status,
    period: event.period,
    clock: event.clock,
    clockLabel: event.status === 'live' ? `${event.clock}'` : profile.label === 'min' ? 'Pre' : 'Pre',
    clockMax: profile.max,
    durationSeconds: Math.round(gameDurationMs(event.id) / 1000),
    home: { name: event.home_name, abbr: event.home_abbr, color: event.home_color, score: event.home_score },
    away: { name: event.away_name, abbr: event.away_abbr, color: event.away_color, score: event.away_score },
    startsAt: event.starts_at,
    featured: Boolean(event.featured),
  };
}

export function serializeSelection(selection) {
  return {
    id: selection.id,
    key: selection.key,
    name: selection.name,
    odds: Number(selection.odds),
    openingOdds: Number(selection.opening_odds),
    result: selection.result,
  };
}

function priceHistory(selectionIds) {
  if (!selectionIds.length) return {};
  const rows = all(
    `SELECT selection_id, odds FROM price_ticks
      WHERE selection_id IN (${selectionIds.map(() => '?').join(',')})
      ORDER BY id ASC`,
    ...selectionIds,
  );
  const grouped = {};
  for (const row of rows) {
    (grouped[row.selection_id] ??= []).push(Number(row.odds));
  }
  for (const id of Object.keys(grouped)) {
    grouped[id] = grouped[id].slice(-PRICE_HISTORY);
  }
  return grouped;
}

export function boardPayload({ includeFinished = false } = {}) {
  const events = eventsWithMarkets({ includeFinished });
  const selectionIds = events.flatMap((e) => e.markets.flatMap((m) => m.selections.map((s) => s.id)));
  const history = priceHistory(selectionIds);
  for (const event of events) {
    for (const market of event.markets) {
      for (const selection of market.selections) {
        selection.history = history[selection.id] ?? [selection.odds];
      }
    }
  }
  return {
    sports: all('SELECT key, name, glyph FROM sports ORDER BY id'),
    events,
    serverTime: new Date().toISOString(),
    tickMs: TICK_MS,
  };
}

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------

/**
 * Fair price from the current state of play. For goal sports we compare the
 * remaining clock against the live scoreline; for set sports we use how close
 * each side is to the target.
 */
function fairOdds(event, marketKey, selectionKey, lineOverride) {
  const profile = CLOCK_PROFILE[event.sport_key] ?? { max: 90 };
  const progress = clamp(event.clock / profile.max, 0, 1);
  const remaining = 1 - progress;
  const diff = event.home_score - event.away_score;

  const oneXtwo = (homeEdge, drawWeight) => {
    const home = clamp(0.5 + homeEdge * 0.06, 0.05, 0.9) * (1 - progress * 0.5);
    const away = clamp(0.5 - homeEdge * 0.06, 0.05, 0.9) * (1 - progress * 0.5);
    const draw = remaining * drawWeight;
    return { home, away, draw };
  };

  const probabilities = oneXtwo(diff, 0.22);
  const total = probabilities.home + probabilities.away + probabilities.draw;

  switch (marketKey) {
    case '1x2': {
      const key = selectionKey === 'home' ? 'home' : selectionKey === 'away' ? 'away' : 'draw';
      return 1 / clamp(probabilities[key] / total, 0.03, 0.95);
    }
    case 'ml': {
      const key = selectionKey === 'home' ? 'home' : 'away';
      const share = probabilities[key] / (probabilities.home + probabilities.away);
      return 1 / clamp(share, 0.05, 0.95);
    }
    case 'ou25':
    case 'ou55':
    case 'total':
    case 'spread': {
      // Totals and handicaps drift with how far the live total is from the line.
      const line = Number(lineOverride ?? 2.5);
      const actual = event.home_score + event.away_score;
      const expected = line + (actual - line) * 0.35;
      const swing = clamp((expected - line) * 0.09, -0.28, 0.28);
      const over = clamp(0.5 + swing, 0.15, 0.85);
      const spreadHome = clamp(0.5 + diff * 0.07, 0.15, 0.85);
      if (marketKey === 'spread') {
        const p = selectionKey === 'home' ? spreadHome : 1 - spreadHome;
        return 1 / clamp(p, 0.08, 0.92);
      }
      const p = selectionKey === 'over' ? over : 1 - over;
      return 1 / clamp(p, 0.1, 0.9);
    }
    case 'btts': {
      const bothScored = event.home_score > 0 && event.away_score > 0;
      const p = clamp((bothScored ? 0.82 : 0.3) + (1 - progress) * 0.15, 0.08, 0.9);
      const value = selectionKey === 'yes' ? p : 1 - p;
      return 1 / clamp(value, 0.08, 0.92);
    }
    case 'sets':
    case 'maps': {
      const target = SCORING[event.sport_key]?.target ?? 2;
      const leader = Math.max(event.home_score, event.away_score);
      const closeness = leader >= target - 1 ? 0.86 : 0.34;
      const p = selectionKey === 'over' ? closeness : 1 - closeness;
      return 1 / clamp(p, 0.1, 0.9);
    }
    case 'handicap': {
      const p = clamp(0.5 + diff * 0.16, 0.12, 0.88);
      const value = selectionKey === 'home' ? p : 1 - p;
      return 1 / clamp(value, 0.1, 0.9);
    }
    default:
      return null;
  }
}

const drift = tx((event, markets) => {
  const updates = [];
  for (const market of markets) {
    for (const selection of market.selections) {
      const fair = fairOdds(event, market.key, selection.key, market.line);
      const current = Number(selection.odds);
      const anchor = fair ?? Number(selection.opening_odds);
      // Random walk with mean reversion: pull 6% toward fair, jiggle 1.2%.
      const jiggle = 1 + (Math.random() - 0.5) * 0.024;
      const next = round2(clamp(current + (anchor - current) * 0.06, current * 0.97, current * 1.03) * jiggle);
      const bounded = round2(clamp(next, 1.03, 25));
      if (Math.abs(bounded - current) < 0.01) continue;
      run('UPDATE selections SET odds = ? WHERE id = ?', bounded, selection.id);
      run('INSERT INTO price_ticks (selection_id, odds) VALUES (?, ?)', selection.id, bounded);
      updates.push({ id: selection.id, odds: bounded, dir: bounded > current ? 1 : -1 });
    }
  }
  return updates;
});

// ---------------------------------------------------------------------------
// Grading
// ---------------------------------------------------------------------------

function winnerKey(homeScore, awayScore) {
  if (homeScore === awayScore) return null;
  return homeScore > awayScore ? 'home' : 'away';
}

/** Returns { [selectionKey]: 'won' | 'lost' | 'void' } for one market. */
export function gradeMarket(sportKey, market, event) {
  const line = Number(market.line ?? 0);
  const home = event.home_score;
  const away = event.away_score;
  const total = home + away;
  const outcomes = {};

  const mark = (keys, winningKey) => {
    for (const key of keys) outcomes[key] = key === winningKey ? 'won' : 'lost';
  };

  switch (market.key) {
    case '1x2': {
      const winner = winnerKey(home, away) ?? 'draw';
      mark(['home', 'draw', 'away'], winner);
      break;
    }
    case 'ml': {
      const winner = winnerKey(home, away);
      if (!winner) mark(['home', 'away'], '__none__');
      else mark(['home', 'away'], winner);
      break;
    }
    case 'ou25':
    case 'ou55':
    case 'total':
    case 'sets':
    case 'maps': {
      mark(['over', 'under'], total > line ? 'over' : 'under');
      break;
    }
    case 'btts': {
      mark(['yes', 'no'], home > 0 && away > 0 ? 'yes' : 'no');
      break;
    }
    case 'spread':
    case 'handicap': {
      // Line is expressed from the home side (e.g. -6.5).
      const margin = home - away + line;
      mark(['home', 'away'], margin > 0 ? 'home' : 'away');
      break;
    }
    default:
      mark([], null);
  }
  return outcomes;
}

/** Write results onto selections, settle affected bets, and report what changed. */
export const finishEvent = tx((eventId) => {
  const event = get(
    `SELECT e.*, s.key AS sport_key FROM events e JOIN sports s ON s.id = e.sport_id WHERE e.id = ?`,
    eventId,
  );
  if (!event || event.status === 'finished') return null;

  const markets = all('SELECT * FROM markets WHERE event_id = ? ORDER BY sort, id', eventId);
  const graded = [];

  for (const market of markets) {
    const selections = all('SELECT * FROM selections WHERE market_id = ? ORDER BY sort, id', market.id);
    const outcomes = gradeMarket(event.sport_key, market, event);
    for (const selection of selections) {
      const result = outcomes[selection.key] ?? 'void';
      run('UPDATE selections SET result = ? WHERE id = ?', result, selection.id);
      graded.push({ selectionId: selection.id, result });
    }
  }

  run(
    `UPDATE events SET status = 'finished', period = ?, finished_at = datetime('now') WHERE id = ?`,
    FINISH_LABEL[event.sport_key] ?? 'FT',
    eventId,
  );

  const settledBets = settleEventBets(eventId);
  return { eventId, graded, settledBets };
});

// ---------------------------------------------------------------------------
// The clock
// ---------------------------------------------------------------------------

const advanceClock = tx((eventId) => {
  const event = get(
    `SELECT e.*, s.key AS sport_key FROM events e JOIN sports s ON s.id = e.sport_id WHERE e.id = ?`,
    eventId,
  );
  if (!event || event.status !== 'live') return null;

  const profile = CLOCK_PROFILE[event.sport_key] ?? { max: 90, minStep: 3, maxStep: 6 };
  const scoring = SCORING[event.sport_key] ?? { kind: 'goals', perTick: 0.05 };

  const minStep = Math.max(1, Math.round(profile.minStep * CLOCK_SCALE));
  const maxStep = Math.max(minStep, Math.round(profile.maxStep * CLOCK_SCALE));
  let clock = event.clock + randInt(minStep, maxStep);
  let home = event.home_score;
  let away = event.away_score;
  const timeline = [];

  const strength = () => {
    const markets = all(
      `SELECT s.* FROM selections s JOIN markets m ON m.id = s.market_id
        WHERE m.event_id = ? AND m.key IN ('1x2','ml') ORDER BY m.sort, s.sort`,
      eventId,
    );
    const homeSelection = markets.find((s) => s.key === 'home');
    const awaySelection = markets.find((s) => s.key === 'away');
    if (!homeSelection || !awaySelection) return 0.5;
    const h = 1 / Number(homeSelection.opening_odds);
    const a = 1 / Number(awaySelection.opening_odds);
    return h / (h + a);
  };

  if (scoring.kind === 'goals') {
    if (Math.random() < scoring.perTick) {
      if (Math.random() < strength()) home += 1;
      else away += 1;
      timeline.push({ at: Math.min(clock, profile.max), side: 'home', kind: 'score' });
    }
  } else if (scoring.kind === 'points') {
    home += randInt(scoring.min, scoring.max);
    away += randInt(scoring.min, scoring.max);
  } else if (scoring.kind === 'sets') {
    const target = scoring.target;
    const done = home >= target || away >= target;
    if (!done && Math.random() < 0.12 + clock / profile.max * 0.2) {
      if (Math.random() < strength()) home += 1;
      else away += 1;
      timeline.push({ at: clock, side: 'home', kind: 'set' });
    }
  }

  const startedAt = event.live_started_at ? new Date(event.live_started_at.replace(' ', 'T') + (event.live_started_at.includes('Z') ? '' : 'Z')).getTime() : Date.now();
  const finished = Date.now() - startedAt >= gameDurationMs(event.id);
  if (finished) clock = profile.max;
  else if (clock >= profile.max) clock = Math.max(0, profile.max - 1);

  run(
    `UPDATE events SET clock = ?, home_score = ?, away_score = ?, period = ? WHERE id = ?`,
    clock,
    home,
    away,
    finished ? FINISH_LABEL[event.sport_key] ?? 'FT' : `${clock}'`,
    eventId,
  );

  return { clock, home, away, finished, timeline };
});

/** Promote fixtures whose start time has arrived. */
const kickOff = tx(() => {
  const due = all(
    `SELECT id FROM events WHERE status = 'upcoming' AND datetime(starts_at) <= datetime('now')`,
  );
  for (const row of due) {
    run("UPDATE events SET status = 'live', period = '1''', clock = 0, live_started_at = datetime('now') WHERE id = ?", row.id);
  }
  return due.map((row) => row.id);
});

const stockSlate = tx(() => {
  const live = Number(get("SELECT COUNT(*) AS n FROM events WHERE status = 'live'")?.n ?? 0);
  const upcoming = Number(get("SELECT COUNT(*) AS n FROM events WHERE status = 'upcoming'")?.n ?? 0);
  const created = [];
  const now = Date.now();
  const iso = (ms) => new Date(ms).toISOString().replace('T', ' ').slice(0, 19);

  for (let i = live; i < MIN_LIVE + randInt(0, MAX_LIVE - MIN_LIVE); i += 1) {
    const sport = SPORTS[randInt(0, SPORTS.length - 1)];
    const pool = [...CLUBS[sport.key]].sort(() => Math.random() - 0.5);
    const eventId = createEvent({
      sportKey: sport.key,
      league: LEAGUES[sport.key][randInt(0, LEAGUES[sport.key].length - 1)],
      home: pool[0],
      away: pool[1],
      status: 'live',
      startsAt: iso(now - 1000 * 60 * randInt(2, 20)),
    });
    run('UPDATE events SET clock = ? WHERE id = ?', randInt(1, 12), eventId);
    created.push(eventId);
  }

  for (let i = upcoming; i < 6; i += 1) {
    const sport = SPORTS[randInt(0, SPORTS.length - 1)];
    const pool = [...CLUBS[sport.key]].sort(() => Math.random() - 0.5);
    const eventId = createEvent({
      sportKey: sport.key,
      league: LEAGUES[sport.key][randInt(0, LEAGUES[sport.key].length - 1)],
      home: pool[0],
      away: pool[1],
      status: 'upcoming',
      startsAt: iso(now + 1000 * randInt(60, 420)),
    });
    created.push(eventId);
  }

  return created;
});

function pruneHistory() {
  run(
    `DELETE FROM price_ticks
      WHERE id NOT IN (SELECT id FROM price_ticks ORDER BY id DESC LIMIT 4000)`,
  );
}

// ---------------------------------------------------------------------------
// Public engine
// ---------------------------------------------------------------------------

let timer = null;
let publisher = () => {};

export function setPublisher(fn) {
  publisher = fn;
}

export function startSimulator() {
  if (timer) return;
  timer = setInterval(() => {
    try {
      runTick();
    } catch (err) {
      console.error('[simulator] tick failed:', err);
    }
  }, TICK_MS);
  console.log(`[simulator] live feed running every ${TICK_MS}ms`);
}

export function stopSimulator() {
  if (timer) clearInterval(timer);
  timer = null;
}

function runTick() {
  const started = kickOff();
  const liveEvents = all(
    `SELECT e.id, s.key AS sport_key FROM events e JOIN sports s ON s.id = e.sport_id
      WHERE e.status = 'live' ORDER BY e.id`,
  );

  const priceUpdates = [];
  const eventUpdates = [];
  const finished = [];

  for (const row of liveEvents) {
    const before = get('SELECT home_score, away_score, clock FROM events WHERE id = ?', row.id);
    const result = advanceClock(row.id);
    if (!result) continue;

    if (result.finished) {
      const outcome = finishEvent(row.id);
      if (outcome) finished.push(outcome);
      continue;
    }

    const event = get(
      `SELECT e.*, s.key AS sport_key FROM events e JOIN sports s ON s.id = e.sport_id WHERE e.id = ?`,
      row.id,
    );
    const markets = all('SELECT * FROM markets WHERE event_id = ? ORDER BY sort, id', row.id).map((market) => ({
      ...market,
      selections: all('SELECT * FROM selections WHERE market_id = ? ORDER BY sort, id', market.id),
    }));

    priceUpdates.push(...drift(event, markets));
    eventUpdates.push({
      id: event.id,
      clock: event.clock,
      period: event.period,
      homeScore: event.home_score,
      awayScore: event.away_score,
      scored: event.home_score !== before.home_score || event.away_score !== before.away_score,
    });
  }

  // Pre-match prices also breathe, so the board is never static.
  const upcoming = all(
    `SELECT e.*, s.key AS sport_key FROM events e JOIN sports s ON s.id = e.sport_id
      WHERE e.status = 'upcoming' ORDER BY e.id LIMIT 12`,
  );
  for (const event of upcoming) {
    const markets = all('SELECT * FROM markets WHERE event_id = ? ORDER BY sort, id', event.id).map((market) => ({
      ...market,
      selections: all('SELECT * FROM selections WHERE market_id = ? ORDER BY sort, id', market.id),
    }));
    priceUpdates.push(...drift(event, markets));
  }

  const created = stockSlate();
  const newEvents = created.map((id) => {
    const event = get(
      `SELECT e.*, s.key AS sport_key, s.name AS sport_name, s.glyph AS sport_glyph
         FROM events e JOIN sports s ON s.id = e.sport_id WHERE e.id = ?`,
      id,
    );
    const markets = all('SELECT * FROM markets WHERE event_id = ? ORDER BY sort, id', id).map((market) => ({
      id: market.id,
      key: market.key,
      name: market.name,
      selections: all('SELECT * FROM selections WHERE market_id = ? ORDER BY sort, id', market.id).map(
        serializeSelection,
      ),
    }));
    return { ...serializeEvent(event), markets };
  });

  const promoted = started.map((id) => {
    const event = get(
      `SELECT e.*, s.key AS sport_key, s.name AS sport_name, s.glyph AS sport_glyph
         FROM events e JOIN sports s ON s.id = e.sport_id WHERE e.id = ?`,
      id,
    );
    const markets = all('SELECT * FROM markets WHERE event_id = ? ORDER BY sort, id', id).map((market) => ({
      id: market.id,
      key: market.key,
      name: market.name,
      selections: all('SELECT * FROM selections WHERE market_id = ? ORDER BY sort, id', market.id).map(
        serializeSelection,
      ),
    }));
    return { ...serializeEvent(event), markets };
  });

  if (priceUpdates.length || eventUpdates.length || finished.length || newEvents.length || promoted.length) {
    publisher({
      type: 'tick',
      prices: priceUpdates,
      events: eventUpdates,
      finished: finished.map((f) => f.eventId),
      added: newEvents,
      promoted,
      at: new Date().toISOString(),
    });
  }

  if (finished.length) {
    for (const outcome of finished) {
      for (const bet of outcome.settledBets) {
        publisher({ type: 'bet.settled', userId: bet.userId, bet });
      }
    }
  }

  if (Math.random() < 0.02) pruneHistory();
}

/** Admin escape hatch: blow the whistle early. */
export const forceFinish = tx((eventId) => finishEvent(eventId));
