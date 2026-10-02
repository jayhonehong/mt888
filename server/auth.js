/**
 * Accounts, sessions and role-based access control.
 *
 * Sessions use a signed JWT delivered two ways so the app works in every
 * hosting context:
 *   - an httpOnly cookie (the normal browser path)
 *   - a bearer token in the response body, kept by the SPA as a fallback for
 *     environments that block third-party cookies (embedded previews, etc.)
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { DATA_DIR, get, run } from './db.js';

const TOKEN_TTL = '7d';
export const COOKIE_NAME = 'gb_session';

function loadSecret() {
  if (process.env.GOLDBEAN_JWT_SECRET) return process.env.GOLDBEAN_JWT_SECRET;
  const file = path.join(DATA_DIR, 'jwt.secret');
  try {
    return fs.readFileSync(file, 'utf8').trim();
  } catch {
    const secret = crypto.randomBytes(48).toString('hex');
    fs.writeFileSync(file, secret, { mode: 0o600 });
    return secret;
  }
}

const SECRET = loadSecret();

export function hashPassword(plain) {
  return bcrypt.hashSync(plain, 10);
}

export function verifyPassword(plain, hash) {
  try {
    return bcrypt.compareSync(plain, hash);
  } catch {
    return false;
  }
}

export function issueToken(user) {
  return jwt.sign({ sub: user.id, username: user.username, role: user.role }, SECRET, {
    expiresIn: TOKEN_TTL,
  });
}

export function readToken(req) {
  const header = req.get('authorization');
  if (header && header.startsWith('Bearer ')) return header.slice(7).trim();
  return req.cookies?.[COOKIE_NAME] ?? null;
}

function requestTokens(req) {
  const header = req.get('authorization');
  const bearer = header && header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  const cookie = req.cookies?.[COOKIE_NAME] ?? null;
  return [...new Set([bearer, cookie].filter(Boolean))];
}

/** Resolve a raw token string to an active user row, or null. */
export function userFromToken(token) {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, SECRET);
    const user = get('SELECT * FROM users WHERE id = ?', payload.sub);
    return user && user.status === 'active' ? user : null;
  } catch {
    return null;
  }
}

/**
 * The public preview is HTTPS and may be embedded in a cross-site iframe, so
 * the session cookie needs SameSite=None; Secure there. Plain HTTP localhost
 * must not send Secure or the browser drops the cookie entirely.
 */
function isHttps(req) {
  const proto = req.get('x-forwarded-proto') || (req.secure ? 'https' : 'http');
  return proto.split(',')[0].trim() === 'https';
}

export function setSessionCookie(req, res, token) {
  const https = isHttps(req);
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: https ? 'none' : 'lax',
    secure: https,
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

export function clearSessionCookie(req, res) {
  const https = isHttps(req);
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    sameSite: https ? 'none' : 'lax',
    secure: https,
    path: '/',
  });
}

export function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    role: user.role,
    status: user.status,
    avatarHue: user.avatar_hue,
    createdAt: user.created_at,
  };
}

/** Attaches req.user when a valid session is present; never rejects. */
export function attachUser(req, _res, next) {
  for (const token of requestTokens(req)) {
    try {
      const payload = jwt.verify(token, SECRET);
      const user = get('SELECT * FROM users WHERE id = ?', payload.sub);
      if (user && user.status === 'active') {
        req.user = user;
        break;
      }
    } catch {
      // Try the next credential, e.g. a valid cookie after a stale bearer token.
    }
  }
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Sign in to keep your gold beans.', code: 'auth_required' });
  }
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Sign in first.', code: 'auth_required' });
  }
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin only.', code: 'forbidden' });
  }
  next();
}

export function touchLogin(userId) {
  run("UPDATE users SET last_login_at = datetime('now') WHERE id = ?", userId);
}

// ---------------------------------------------------------------------------
// Very small in-memory throttle for credential endpoints. Enough to stop a
// script from hammering login; not a substitute for a real WAF.
// ---------------------------------------------------------------------------
const attempts = new Map();

export function throttle({ max = 12, windowMs = 60_000 } = {}) {
  return (req, res, next) => {
    const key = `${req.ip}:${req.path}`;
    const now = Date.now();
    const bucket = attempts.get(key) ?? { count: 0, resetAt: now + windowMs };
    if (now > bucket.resetAt) {
      bucket.count = 0;
      bucket.resetAt = now + windowMs;
    }
    bucket.count += 1;
    attempts.set(key, bucket);
    if (bucket.count > max) {
      return res
        .status(429)
        .json({ error: 'Too many attempts. Take a breath and try again in a minute.', code: 'throttled' });
    }
    next();
  };
}
