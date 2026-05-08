import crypto from 'node:crypto';
import { pool } from './db.js';

const TOKEN_VERSION = 'v1';
const COOKIE_NAME = 'nyx_session';
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60 * 1000;
const attempts = new Map();

function base64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}

function base64urlJson(value) {
  return base64url(JSON.stringify(value));
}

function decodeBase64url(value) {
  const normalized = String(value || '').replaceAll('-', '+').replaceAll('_', '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return Buffer.from(padded, 'base64').toString('utf8');
}

function signPayload(payload, secret) {
  const header = base64urlJson({ alg: 'HS256', typ: 'JWT', ver: TOKEN_VERSION });
  const body = base64urlJson(payload);
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${header}.${body}`)
    .digest('base64url');

  return `${header}.${body}.${signature}`;
}

function timingSafeCompare(left, right) {
  const leftBuffer = Buffer.from(left || '');
  const rightBuffer = Buffer.from(right || '');

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function verifySessionToken(token, secret) {
  const [header, body, signature] = String(token || '').split('.');

  if (!header || !body || !signature) {
    return null;
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${header}.${body}`)
    .digest('base64url');

  if (!timingSafeCompare(signature, expected)) {
    return null;
  }

  try {
    const payload = JSON.parse(decodeBase64url(body));
    const expiresAt = Number(payload.exp || 0);

    if (!expiresAt || expiresAt * 1000 <= Date.now()) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

function parseCookie(header) {
  return String(header || '')
    .split(';')
    .map((part) => part.trim())
    .reduce((cookies, part) => {
      const separator = part.indexOf('=');

      if (separator > -1) {
        cookies[part.slice(0, separator)] = decodeURIComponent(part.slice(separator + 1));
      }

      return cookies;
    }, {});
}

function sessionCookie(token, maxAgeSeconds, secure) {
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`
  ];

  if (secure) {
    parts.push('Secure');
  }

  return parts.join('; ');
}

function clearSessionCookie(secure) {
  return sessionCookie('', 0, secure);
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('base64url');
  const hash = crypto.scryptSync(String(password), salt, 64, { N: 16384, r: 8, p: 1 }).toString('base64url');
  return `scrypt$16384$8$1$${salt}$${hash}`;
}

function verifyPassword(password, storedHash) {
  const [scheme, n, r, p, salt, expectedHash] = String(storedHash || '').split('$');

  if (scheme !== 'scrypt' || !salt || !expectedHash) {
    return false;
  }

  const actualHash = crypto.scryptSync(String(password), salt, 64, {
    N: Number(n),
    r: Number(r),
    p: Number(p)
  }).toString('base64url');

  return timingSafeCompare(actualHash, expectedHash);
}

function clientKey(request, email) {
  return `${request.ip || request.headers['x-forwarded-for'] || 'unknown'}:${String(email || '').toLowerCase()}`;
}

function assertLoginAllowed(request, email) {
  const key = clientKey(request, email);
  const state = attempts.get(key);

  if (state?.lockedUntil && state.lockedUntil > Date.now()) {
    const seconds = Math.ceil((state.lockedUntil - Date.now()) / 1000);
    const error = new Error(`Too many login attempts. Try again in ${seconds}s.`);
    error.statusCode = 429;
    throw error;
  }
}

function recordLoginFailure(request, email) {
  const key = clientKey(request, email);
  const state = attempts.get(key) || { count: 0, lockedUntil: 0 };
  const count = state.count + 1;

  attempts.set(key, {
    count,
    lockedUntil: count >= MAX_LOGIN_ATTEMPTS ? Date.now() + LOCKOUT_MS : 0
  });
}

function clearLoginFailures(request, email) {
  attempts.delete(clientKey(request, email));
}

function publicUser(row) {
  return {
    id: Number(row.id),
    name: row.name,
    email: row.email,
    role: row.role,
    is_active: Boolean(row.is_active)
  };
}

export async function ensureAuthSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      role ENUM('user', 'admin') NOT NULL DEFAULT 'user',
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_users_email (email),
      KEY idx_users_role_active (role, is_active)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

export async function bootstrapAdminUser(config, logger) {
  if (!config.bootstrapAdminEmail || !config.bootstrapAdminPassword) {
    logger.warn('NYX_ADMIN_EMAIL/NYX_ADMIN_PASSWORD not set; no bootstrap user was created');
    return;
  }

  const [existing] = await pool.query('SELECT id FROM users WHERE email = ? LIMIT 1', [config.bootstrapAdminEmail]);

  if (existing.length > 0) {
    return;
  }

  await pool.query(
    'INSERT INTO users (name, email, password_hash, role, is_active) VALUES (?, ?, ?, ?, 1)',
    [
      config.bootstrapAdminName,
      config.bootstrapAdminEmail.toLowerCase(),
      hashPassword(config.bootstrapAdminPassword),
      'admin'
    ]
  );
  logger.info({ email: config.bootstrapAdminEmail }, 'Bootstrapped NYX admin user');
}

export async function authenticateUser(email, password) {
  const [rows] = await pool.query(
    'SELECT id, name, email, password_hash, role, is_active FROM users WHERE email = ? LIMIT 1',
    [String(email || '').toLowerCase()]
  );
  const user = rows[0];

  if (!user || !user.is_active || !verifyPassword(password, user.password_hash)) {
    return null;
  }

  return publicUser(user);
}

export function createSessionToken(user, config) {
  const now = Math.floor(Date.now() / 1000);
  return signPayload({
    sub: String(user.id),
    name: user.name,
    email: user.email,
    role: user.role,
    iat: now,
    exp: now + config.sessionTtlSeconds
  }, config.authSecret);
}

export function getSessionPayload(request) {
  const cookies = parseCookie(request.headers.cookie);
  return verifySessionToken(cookies[COOKIE_NAME], request.server.config.authSecret);
}

export async function requireAuth(request, reply) {
  const payload = getSessionPayload(request);

  if (!payload) {
    reply.code(401).send({ error: 'Authentication required' });
    return;
  }

  request.user = {
    id: Number(payload.sub),
    name: payload.name,
    email: payload.email,
    role: payload.role
  };
}

export async function registerAuthRoutes(app) {
  app.post('/auth/login', {
    schema: {
      body: {
        type: 'object',
        required: ['email', 'password'],
        additionalProperties: false,
        properties: {
          email: { type: 'string', minLength: 3, maxLength: 255 },
          password: { type: 'string', minLength: 1, maxLength: 1024 }
        }
      }
    }
  }, async (request, reply) => {
    const email = String(request.body.email || '').toLowerCase();

    try {
      assertLoginAllowed(request, email);
    } catch (error) {
      return reply.code(error.statusCode || 429).send({ error: error.message || 'Too many login attempts' });
    }

    const user = await authenticateUser(email, request.body.password);

    if (!user) {
      recordLoginFailure(request, email);
      return reply.code(401).send({ error: 'Invalid email or password' });
    }

    clearLoginFailures(request, email);
    const token = createSessionToken(user, app.config);
    reply.header('set-cookie', sessionCookie(token, app.config.sessionTtlSeconds, process.env.NODE_ENV === 'production'));
    return { user };
  });

  app.post('/auth/logout', async (_request, reply) => {
    reply.header('set-cookie', clearSessionCookie(process.env.NODE_ENV === 'production'));
    return { ok: true };
  });

  app.get('/auth/me', { preHandler: requireAuth }, async (request) => ({ user: request.user }));
}
