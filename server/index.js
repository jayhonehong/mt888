/**
 * GoldBean Arena :: entry point.
 *
 * One process serves three things on one port:
 *   - the REST API under /api
 *   - the built React SPA (and the Vite dev server proxies to this in dev)
 *   - the live feed WebSocket on /ws
 *
 * ---------------------------------------------------------------------------
 * IMPORTANT
 * GoldBean Arena is a fictional simulation built for coursework. "Gold Beans"
 * are play money with no monetary value. There is no purchase flow, no
 * cash-out, no payment provider, and no real wagering of any kind.
 * ---------------------------------------------------------------------------
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cookieParser from 'cookie-parser';
import { WebSocketServer } from 'ws';

import { ROOT_DIR, dbFile, driverName, get } from './db.js';
import { attachUser, publicUser, userFromToken } from './auth.js';
import { router, fail } from './routes.js';
import { casinoRouter } from './casino-routes.js';
import { bootstrap } from './bootstrap.js';
import { setPublisher, startSimulator } from './simulator.js';
import { walletBalance } from './ledger.js';
import { listBets } from './betting.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? process.env.GOLDBEAN_PORT ?? 3000);
const HOST = process.env.HOST ?? '0.0.0.0';
const CLIENT_DIST = path.join(ROOT_DIR, 'client', 'dist');
const DEV_ORIGIN = process.env.GOLDBEAN_DEV_ORIGIN ?? 'http://localhost:5173';

const summary = bootstrap();

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);
app.use(express.json({ limit: '64kb' }));
app.use(cookieParser());

// The Vite dev server runs on another port, so allow it with credentials.
app.use((req, res, next) => {
  const origin = req.get('origin');
  if (origin && origin === DEV_ORIGIN) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use('/api', attachUser, router, casinoRouter);
app.use('/api', (_req, res) => res.status(404).json({ error: 'Unknown endpoint.', code: 'not_found' }));

// Platform page manifest (harmless locally, required if this is later hosted
// on Manus Webdev).
function routeManifest() {
  const manifest = {
    routes: [
      { path: '/', title: 'Aviator' },
      { path: '/board', title: 'Live Board' },
      { path: '/sports', title: 'All Sports' },
      { path: '/blackjack', title: 'Blackjack' },
      { path: '/event/:id', title: 'Fixture' },
      { path: '/my-bets', title: 'My Bets' },
      { path: '/wallet', title: 'Wallet & Ledger' },
      { path: '/friends', title: 'Friends' },
      { path: '/rewards', title: 'Rewards' },
      { path: '/leaderboard', title: 'Leaderboard' },
      { path: '/admin', title: 'Admin' },
      { path: '/login', title: 'Sign in' },
      { path: '/register', title: 'Create account' },
    ],
  };
  return JSON.stringify(manifest);
}

app.get('/manus-routes.json', (_req, res) => {
  res.type('application/json').send(routeManifest());
});

const indexHtml = path.join(CLIENT_DIST, 'index.html');
const hasBuild = fs.existsSync(indexHtml);

if (hasBuild) {
  app.use(
    express.static(CLIENT_DIST, {
      index: false,
      setHeaders(res, filePath) {
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    }),
  );
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path === '/ws') return next();
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(indexHtml);
  });
} else {
  app.get('/', (_req, res) => {
    res.type('text/html').send(
      `<!doctype html><html><body style="font-family:system-ui;background:#0B0F1A;color:#E6EDF7;padding:40px">
        <h1>GoldBean Arena API is up</h1>
        <p>The React client has not been built yet. Run <code>npm run build</code>, or use
        <code>npm run dev</code> to start the Vite dev server on port 5173.</p>
        <p>API: <a style="color:#FFC53D" href="/api/board">/api/board</a> · <a style="color:#FFC53D" href="/api/stats">/api/stats</a></p>
      </body></html>`,
    );
  });
}

app.use((err, _req, res, _next) => fail(res, err));

// ---------------------------------------------------------------------------
// Live feed
// ---------------------------------------------------------------------------

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

/** ws -> { userId | null } */
const clients = new Map();

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
  if (url.pathname !== '/ws') {
    socket.destroy();
    return;
  }

  let user = null;
  try {
    const cookies = Object.fromEntries(
      (req.headers.cookie ?? '')
        .split(';')
        .map((part) => part.trim().split('='))
        .filter((pair) => pair.length === 2)
        .map(([key, value]) => [key, decodeURIComponent(value)]),
    );
    const token = url.searchParams.get('token') || cookies.gb_session;
    user = userFromToken(token);
  } catch {
    user = null;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    clients.set(ws, { userId: user?.id ?? null });
    wss.emit('connection', ws, req);
  });
});

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });

  const context = clients.get(ws);
  const user = context?.userId ? get('SELECT * FROM users WHERE id = ?', context.userId) : null;

  ws.send(
    JSON.stringify({
      type: 'hello',
      payload: {
        serverTime: new Date().toISOString(),
        user: user ? publicUser(user) : null,
        balance: user ? walletBalance(user.id) : null,
      },
    }),
  );

  ws.on('message', (raw) => {
    let message;
    try {
      message = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (message?.type === 'ping') ws.send(JSON.stringify({ type: 'pong', at: Date.now() }));
    if (message?.type === 'bets.refresh' && context?.userId) {
      ws.send(JSON.stringify({ type: 'bets', payload: { bets: listBets(context.userId) } }));
    }
  });

  ws.on('close', () => clients.delete(ws));
  ws.on('error', () => clients.delete(ws));
});

setInterval(() => {
  for (const ws of clients.keys()) {
    if (ws.isAlive === false) {
      ws.terminate();
      clients.delete(ws);
      continue;
    }
    ws.isAlive = false;
    try {
      ws.ping();
    } catch {
      /* socket already gone */
    }
  }
}, 30_000);

function broadcast(message) {
  const payload = JSON.stringify(message);
  for (const [ws, context] of clients) {
    if (message.userId && context.userId !== message.userId) continue;
    if (ws.readyState === ws.OPEN) ws.send(payload);
  }
}

setPublisher((message) => {
  if (message.type === 'tick') {
    broadcast({
      type: 'tick',
      prices: message.prices,
      events: message.events,
      finished: message.finished,
      added: message.added,
      promoted: message.promoted,
      at: message.at,
    });
    // A fixture reaching full time can move balances, so signed-in clients get
    // a fresh figure alongside the settlement notifications below.
    if ((message.finished ?? []).length > 0) {
      for (const [ws, context] of clients) {
        if (!context.userId || ws.readyState !== ws.OPEN) continue;
        ws.send(JSON.stringify({ type: 'wallet', payload: { balance: walletBalance(context.userId) } }));
      }
    }
    return;
  }
  broadcast(message);
});

startSimulator();

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('  GoldBean Arena  ·  play-money sportsbook simulation');
  console.log(`  api      http://${HOST}:${PORT}/api/board`);
  console.log(`  live     ws://${HOST}:${PORT}/ws`);
  console.log(`  client   ${hasBuild ? 'serving client/dist' : 'not built (run npm run build, or npm run dev)'}`);
  console.log(`  storage  ${dbFile} via ${driverName}`);
  console.log(`  data     ${summary.users} accounts · ${summary.events} fixtures`);
  console.log('');
  console.log('  Reminder: beans are fake. No real money, no payments, no cash-out.');
  console.log('');
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    console.log(`\n[server] ${signal} received, shutting down`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });
}

export { app, server, wss };
