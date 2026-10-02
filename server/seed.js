/**
 * Fixture generation.
 *
 * Creates a fictional slate of events with markets and opening prices. Prices
 * are produced from a simple implied-probability model (a favourite, a
 * longshot, a margin for the book) rather than being typed in by hand, which
 * keeps the overround realistic and the whole board internally consistent.
 */
import { get, run, tx } from './db.js';
import { CLUBS, CLOCK_PROFILE, LEAGUES, MARKET_TEMPLATES, SPORTS } from './catalogue.js';

/** Margin the fictional book keeps, expressed as probability. */
const OVERROUND = 0.055;

function jitter(scale = 1) {
  return 1 + (Math.random() - 0.5) * 0.16 * scale;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function toOdds(probability) {
  const price = 1 / clamp(probability, 0.02, 0.97);
  return Math.round(clamp(price, 1.03, 20) * 100) / 100;
}

/** Probability weights for each selection kind. */
function probabilityFor(kind, homeStrength) {
  switch (kind) {
    case 'fav':
      return clamp(0.42 + homeStrength * 0.18, 0.28, 0.78);
    case 'dog':
      return clamp(0.3 - homeStrength * 0.16, 0.08, 0.42);
    case 'draw':
      return 0.24;
    case 'even':
      return 0.5;
    default:
      return 0.5;
  }
}

function normalise(selections) {
  const total = selections.reduce((sum, s) => sum + s.probability, 0);
  const target = 1 + OVERROUND;
  return selections.map((s) => ({ ...s, probability: (s.probability / total) * target }));
}

export function buildSelections(template, homeStrength) {
  const graded = template.selections.map((selection) => ({
    ...selection,
    probability: probabilityFor(selection.kind, homeStrength) * jitter(),
  }));
  return normalise(graded).map((selection) => ({ ...selection, odds: toOdds(selection.probability) }));
}

function pickPair(pool) {
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return [shuffled[0], shuffled[1]];
}

export const createEvent = tx(({ sportKey, league, home, away, status, startsAt, featured = 0 }) => {
  const sport = get('SELECT * FROM sports WHERE key = ?', sportKey);
  if (!sport) throw new Error(`Unknown sport: ${sportKey}`);

  const homeStrength = Math.random() * 0.6 - 0.3;

  const info = run(
    `INSERT INTO events
       (sport_id, league, home_name, home_abbr, home_color, away_name, away_abbr, away_color,
        status, period, clock, home_score, away_score, starts_at, live_started_at, featured)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?, ?)`,
    sport.id,
    league,
    home[0],
    home[1],
    home[2],
    away[0],
    away[1],
    away[2],
    status,
    status === 'live' ? 'Live' : 'Pre-match',
    startsAt,
    status === 'live' ? new Date().toISOString() : null,
    featured,
  );

  const eventId = Number(info.lastInsertRowid);
  const templates = MARKET_TEMPLATES[sportKey] ?? [];

  templates.forEach((template, marketIndex) => {
    const marketInfo = run(
      'INSERT INTO markets (event_id, key, name, line, sort) VALUES (?, ?, ?, ?, ?)',
      eventId,
      template.key,
      template.name,
      template.line ?? null,
      marketIndex,
    );
    const marketId = Number(marketInfo.lastInsertRowid);

    buildSelections(template, homeStrength).forEach((selection, selectionIndex) => {
      run(
        `INSERT INTO selections (market_id, key, name, odds, opening_odds, sort)
         VALUES (?, ?, ?, ?, ?, ?)`,
        marketId,
        selection.key,
        selection.name,
        selection.odds,
        selection.odds,
        selectionIndex,
      );
    });
  });

  return eventId;
});

export function ensureSports() {
  for (const sport of SPORTS) {
    run(
      `INSERT INTO sports (key, name, glyph) VALUES (?, ?, ?)
       ON CONFLICT(key) DO NOTHING`,
      sport.key,
      sport.name,
      sport.glyph,
    );
  }
}

/**
 * Build the opening slate: a few fixtures already in play, a few about to
 * start (so the player can watch pre-match turn into live), and the rest later
 * in the day.
 */
export const seedSlate = tx(({ liveCount = 5, startingSoon = 3, upcoming = 7 } = {}) => {
  const now = Date.now();
  const iso = (ms) => new Date(ms).toISOString().replace('T', ' ').slice(0, 19);

  const plan = [];

  for (let i = 0; i < liveCount; i += 1) {
    const sportKey = SPORTS[i % SPORTS.length].key;
    const profile = CLOCK_PROFILE[sportKey];
    const [home, away] = pickPair(CLUBS[sportKey]);
    plan.push({
      sportKey,
      league: LEAGUES[sportKey][Math.floor(Math.random() * LEAGUES[sportKey].length)],
      home,
      away,
      status: 'live',
      // Spread the live fixtures across the clock so they do not all finish together.
      progress: Math.floor(profile.max * (0.15 + 0.5 * (i / liveCount))),
      startsAt: iso(now - 1000 * 60 * (5 + i * 7)),
      featured: i < 2 ? 1 : 0,
    });
  }

  for (let i = 0; i < startingSoon; i += 1) {
    const sportKey = SPORTS[(i + 2) % SPORTS.length].key;
    const [home, away] = pickPair(CLUBS[sportKey]);
    plan.push({
      sportKey,
      league: LEAGUES[sportKey][Math.floor(Math.random() * LEAGUES[sportKey].length)],
      home,
      away,
      status: 'upcoming',
      startsAt: iso(now + 1000 * (25 + i * 35)),
    });
  }

  for (let i = 0; i < upcoming; i += 1) {
    const sportKey = SPORTS[i % SPORTS.length].key;
    const [home, away] = pickPair(CLUBS[sportKey]);
    plan.push({
      sportKey,
      league: LEAGUES[sportKey][Math.floor(Math.random() * LEAGUES[sportKey].length)],
      home,
      away,
      status: 'upcoming',
      startsAt: iso(now + 1000 * 60 * (12 + i * 9)),
    });
  }

  const created = [];
  for (const item of plan) {
    const eventId = createEvent(item);
    if (item.progress) {
      run('UPDATE events SET clock = ? WHERE id = ?', item.progress, eventId);
    }
    created.push(eventId);
  }

  return created;
});

export function catalogueSize() {
  const row = get('SELECT COUNT(*) AS n FROM events');
  return Number(row?.n ?? 0);
}
