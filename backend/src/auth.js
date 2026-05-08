import crypto from 'node:crypto';
import { pool } from './db.js';

const TOKEN_VERSION = 'v1';
const COOKIE_NAME = 'nyx_session';
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60 * 1000;
const attempts = new Map();
const PASSWORD_POLICY_MESSAGE = 'Password must be at least 8 characters and include uppercase, lowercase, number, and special character.';

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

function passwordPolicyErrors(password) {
  const value = String(password || '');
  const errors = [];

  if (value.length < 8) errors.push('Use at least 8 characters.');
  if (!/[A-Z]/.test(value)) errors.push('Add an uppercase letter.');
  if (!/[a-z]/.test(value)) errors.push('Add a lowercase letter.');
  if (!/[0-9]/.test(value)) errors.push('Add a number.');
  if (!/[^A-Za-z0-9]/.test(value)) errors.push('Add a special character.');

  return errors;
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

function accountStatus(row) {
  if (!row.is_active) {
    return 'disabled';
  }

  if (row.locked_until && new Date(row.locked_until).getTime() > Date.now()) {
    return 'locked';
  }

  return 'active';
}

function publicUser(row) {
  return {
    id: Number(row.id),
    name: row.name,
    email: row.email,
    role: row.role,
    is_active: Boolean(row.is_active),
    account_status: accountStatus(row),
    last_login_at: row.last_login_at || null
  };
}

async function tableExists(tableName) {
  const [[row]] = await pool.query(
    `SELECT COUNT(*) AS count
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?`,
    [tableName]
  );

  return Number(row?.count || 0) > 0;
}

async function columnExists(tableName, columnName) {
  const [[row]] = await pool.query(
    `SELECT COUNT(*) AS count
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?`,
    [tableName, columnName]
  );

  return Number(row?.count || 0) > 0;
}

async function ensureColumn(tableName, columnName, alterSql) {
  if (!(await tableExists(tableName)) || await columnExists(tableName, columnName)) {
    return;
  }

  await pool.query(alterSql);
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
      last_login_at TIMESTAMP NULL,
      locked_until TIMESTAMP NULL,
      failed_login_count INT UNSIGNED NOT NULL DEFAULT 0,
      session_version INT UNSIGNED NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_users_email (email),
      KEY idx_users_role_active (role, is_active)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await ensureColumn('users', 'last_login_at', 'ALTER TABLE users ADD COLUMN last_login_at TIMESTAMP NULL');
  await ensureColumn('users', 'locked_until', 'ALTER TABLE users ADD COLUMN locked_until TIMESTAMP NULL');
  await ensureColumn('users', 'failed_login_count', 'ALTER TABLE users ADD COLUMN failed_login_count INT UNSIGNED NOT NULL DEFAULT 0');
  await ensureColumn('users', 'session_version', 'ALTER TABLE users ADD COLUMN session_version INT UNSIGNED NOT NULL DEFAULT 1');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      user_id BIGINT UNSIGNED NULL,
      user_email VARCHAR(255) NULL,
      action VARCHAR(80) NOT NULL,
      target_type VARCHAR(80) NULL,
      target_id VARCHAR(255) NULL,
      target_label VARCHAR(255) NULL,
      ip_address VARCHAR(255) NULL,
      status ENUM('success', 'failed') NOT NULL DEFAULT 'success',
      metadata LONGTEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_audit_logs_created_at (created_at),
      KEY idx_audit_logs_action_created (action, created_at),
      KEY idx_audit_logs_user_created (user_id, created_at)
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
    "SELECT id, name, email, password_hash, role, is_active, locked_until, session_version, DATE_FORMAT(last_login_at, '%Y-%m-%d %H:%i:%s') AS last_login_at FROM users WHERE email = ? LIMIT 1",
    [String(email || '').toLowerCase()]
  );
  const user = rows[0];

  if (!user || !user.is_active || (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) || !verifyPassword(password, user.password_hash)) {
    return null;
  }

  await pool.query('UPDATE users SET last_login_at = UTC_TIMESTAMP(), failed_login_count = 0, locked_until = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);

  return { ...publicUser(user), _sessionVersion: Number(user.session_version || 1) };
}

export function createSessionToken(user, config) {
  const now = Math.floor(Date.now() / 1000);
  return signPayload({
    sub: String(user.id),
    name: user.name,
    email: user.email,
    role: user.role,
    sv: Number(user._sessionVersion || 1),
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

  const [rows] = await pool.query(
    "SELECT id, name, email, role, is_active, locked_until, session_version, DATE_FORMAT(last_login_at, '%Y-%m-%d %H:%i:%s') AS last_login_at FROM users WHERE id = ? LIMIT 1",
    [Number(payload.sub)]
  );
  const user = rows[0];

  if (!user || !user.is_active || Number(payload.sv || 0) !== Number(user.session_version || 1)) {
    reply.code(401).send({ error: 'Authentication required' });
    return;
  }

  request.user = {
    id: Number(user.id),
    name: user.name,
    email: user.email,
    role: user.role,
    account_status: accountStatus(user),
    last_login_at: user.last_login_at || null
  };
}

export async function requireAdmin(request, reply) {
  if (!request.user) {
    await requireAuth(request, reply);
  }

  if (reply.sent) {
    return;
  }

  if (request.user?.role !== 'admin') {
    reply.code(403).send({ error: 'Admin role required' });
  }
}

export async function listUsers(includeArchived = false) {
  const archiveFilter = includeArchived ? '' : 'WHERE archived_at IS NULL';
  
  const [rows] = await pool.query(`
    SELECT id, name, email, role, is_active, locked_until, failed_login_count, session_version,
      DATE_FORMAT(last_login_at, '%Y-%m-%d %H:%i:%s') AS last_login_at,
      DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
      DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at,
      DATE_FORMAT(archived_at, '%Y-%m-%d %H:%i:%s') AS archived_at
    FROM users
    ${archiveFilter}
    ORDER BY is_active DESC, role ASC, name ASC
  `);

  return rows.map((row) => ({
    id: Number(row.id),
    name: row.name,
    email: row.email,
    role: row.role,
    is_active: Boolean(row.is_active),
    account_status: accountStatus(row),
    locked_until: row.locked_until,
    failed_login_count: Number(row.failed_login_count || 0),
    session_version: Number(row.session_version || 1),
    last_login_at: row.last_login_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    archived_at: row.archived_at
  }));
}

export async function createUser(payload) {
  const role = payload.role === 'admin' ? 'admin' : 'user';
  const isActive = payload.is_active === false ? 0 : 1;
  const [result] = await pool.query(
    'INSERT INTO users (name, email, password_hash, role, is_active) VALUES (?, ?, ?, ?, ?)',
    [
      String(payload.name || '').trim(),
      String(payload.email || '').toLowerCase().trim(),
      hashPassword(payload.password),
      role,
      isActive
    ]
  );

  const users = await listUsers();
  return users.find((user) => user.id === Number(result.insertId));
}

export async function updateUser(id, payload) {
  const fields = [];
  const values = [];
  let invalidateSessions = false;

  if (payload.name !== undefined) {
    fields.push('name = ?');
    values.push(String(payload.name || '').trim());
  }

  if (payload.email !== undefined) {
    fields.push('email = ?');
    values.push(String(payload.email || '').toLowerCase().trim());
  }

  if (payload.role !== undefined) {
    fields.push('role = ?');
    values.push(payload.role === 'admin' ? 'admin' : 'user');
    invalidateSessions = true;
  }

  if (payload.is_active !== undefined) {
    fields.push('is_active = ?');
    values.push(payload.is_active ? 1 : 0);
    invalidateSessions = true;
  }

  if (invalidateSessions) {
    fields.push('session_version = session_version + 1');
  }

  if (fields.length === 0) {
    const users = await listUsers();
    return users.find((user) => user.id === Number(id));
  }

  values.push(Number(id));
  await pool.query(`UPDATE users SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, values);
  const users = await listUsers();
  return users.find((user) => user.id === Number(id));
}

export async function resetUserPassword(id, password) {
  await pool.query(
    'UPDATE users SET password_hash = ?, session_version = session_version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [hashPassword(password), Number(id)]
  );
}

export async function changeOwnPassword(userId, currentPassword, newPassword) {
  const [rows] = await pool.query(
    "SELECT id, name, email, password_hash, role, is_active, locked_until, session_version, DATE_FORMAT(last_login_at, '%Y-%m-%d %H:%i:%s') AS last_login_at FROM users WHERE id = ? LIMIT 1",
    [Number(userId)]
  );
  const user = rows[0];

  if (!user || !user.is_active || (user.locked_until && new Date(user.locked_until).getTime() > Date.now())) {
    const error = new Error('Account is not available for password change.');
    error.statusCode = 403;
    throw error;
  }

  if (!verifyPassword(currentPassword, user.password_hash)) {
    const error = new Error('Current password is incorrect.');
    error.statusCode = 400;
    throw error;
  }

  const policyErrors = passwordPolicyErrors(newPassword);
  if (policyErrors.length > 0) {
    const error = new Error(PASSWORD_POLICY_MESSAGE);
    error.statusCode = 400;
    error.details = policyErrors;
    throw error;
  }

  if (verifyPassword(newPassword, user.password_hash)) {
    const error = new Error('New password must be different from your current password.');
    error.statusCode = 400;
    throw error;
  }

  const nextSessionVersion = Number(user.session_version || 1) + 1;

  await pool.query(
    'UPDATE users SET password_hash = ?, session_version = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [hashPassword(newPassword), nextSessionVersion, Number(user.id)]
  );

  return {
    ...publicUser({
      ...user,
      session_version: nextSessionVersion,
      last_login_at: user.last_login_at || null
    }),
    _sessionVersion: nextSessionVersion
  };
}

export async function forceLogoutUser(id) {
  await pool.query(
    'UPDATE users SET session_version = session_version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [Number(id)]
  );
}

export async function archiveUser(id) {
  await pool.query(
    'UPDATE users SET archived_at = CURRENT_TIMESTAMP, session_version = session_version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [Number(id)]
  );
}

export async function permanentDeleteUser(id) {
  await pool.query(
    'DELETE FROM users WHERE id = ?',
    [Number(id)]
  );
}

export async function canPermanentlyDeleteUser(id) {
  const [rows] = await pool.query(`
    SELECT COUNT(*) as audit_count FROM audit_logs WHERE target_id = ? AND target_type = 'user'
  `, [Number(id)]);

  const auditCount = Number(rows[0]?.audit_count || 0);
  
  const [userRows] = await pool.query(`
    SELECT last_login_at FROM users WHERE id = ?
  `, [Number(id)]);

  const user = userRows[0];
  const hasNeverLoggedIn = !user?.last_login_at;

  return {
    canDelete: hasNeverLoggedIn && auditCount === 0,
    reason: auditCount > 0
      ? 'User has audit history'
      : hasNeverLoggedIn
      ? 'Can delete'
      : 'User has login history'
  };
}

export async function logAudit({
  user,
  action,
  targetType = null,
  targetId = null,
  targetLabel = null,
  request = null,
  status = 'success',
  metadata = null
}) {
  await pool.query(`
    INSERT INTO audit_logs
      (user_id, user_email, action, target_type, target_id, target_label, ip_address, status, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    user?.id || null,
    user?.email || null,
    action,
    targetType,
    targetId === undefined || targetId === null ? null : String(targetId),
    targetLabel,
    request?.ip || request?.headers?.['x-forwarded-for'] || null,
    status === 'failed' ? 'failed' : 'success',
    metadata ? JSON.stringify(metadata) : null
  ]);
}

export async function listAuditLogs({ action, userId, start, end, limit = 100 } = {}) {
  const filters = [];
  const values = [];

  if (action) {
    filters.push('action = ?');
    values.push(action);
  }

  if (userId) {
    filters.push('user_id = ?');
    values.push(Number(userId));
  }

  if (start) {
    filters.push('created_at >= ?');
    values.push(start);
  }

  if (end) {
    filters.push('created_at <= ?');
    values.push(end);
  }

  values.push(Number(limit || 100));
  const where = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';
  const [rows] = await pool.query(`
    SELECT id, user_id, user_email, action, target_type, target_id, target_label,
      ip_address, status, metadata,
      DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at
    FROM audit_logs
    ${where}
    ORDER BY created_at DESC
    LIMIT ?
  `, values);

  return rows.map((row) => ({
    ...row,
    id: Number(row.id),
    user_id: row.user_id ? Number(row.user_id) : null,
    metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata || '{}') : row.metadata
  }));
}

export async function listAuthActivityForUser(userId) {
  return listAuditLogs({
    userId,
    limit: 20
  });
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
      await logAudit({
        user: { email },
        action: 'failed_login',
        targetType: 'auth',
        targetLabel: email,
        request,
        status: 'failed',
        metadata: { reason: 'temporary_lockout' }
      });
      return reply.code(error.statusCode || 429).send({ error: error.message || 'Too many login attempts' });
    }

    const user = await authenticateUser(email, request.body.password);

    if (!user) {
      recordLoginFailure(request, email);
      const [rows] = await pool.query('SELECT id, email, failed_login_count FROM users WHERE email = ? LIMIT 1', [email]);
      const dbUser = rows[0];
      if (dbUser) {
        const failedCount = Number(dbUser.failed_login_count || 0) + 1;
        await pool.query(
          'UPDATE users SET failed_login_count = ?, locked_until = CASE WHEN ? >= ? THEN DATE_ADD(UTC_TIMESTAMP(), INTERVAL 5 MINUTE) ELSE locked_until END, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [failedCount, failedCount, MAX_LOGIN_ATTEMPTS, dbUser.id]
        );
      }
      await logAudit({
        user: dbUser ? { id: Number(dbUser.id), email: dbUser.email } : { email },
        action: 'failed_login',
        targetType: 'auth',
        targetLabel: email,
        request,
        status: 'failed'
      });
      return reply.code(401).send({ error: 'Invalid email or password' });
    }

    clearLoginFailures(request, email);
    const token = createSessionToken(user, app.config);
    const { _sessionVersion, ...responseUser } = user;
    reply.header('set-cookie', sessionCookie(token, app.config.sessionTtlSeconds, process.env.NODE_ENV === 'production'));
    await logAudit({ user: responseUser, action: 'login', targetType: 'auth', targetLabel: user.email, request });
    return { user: responseUser };
  });

  app.post('/auth/logout', async (request, reply) => {
    const payload = getSessionPayload(request);
    if (payload) {
      await logAudit({
        user: { id: Number(payload.sub), email: payload.email },
        action: 'logout',
        targetType: 'auth',
        targetLabel: payload.email,
        request
      });
    }
    reply.header('set-cookie', clearSessionCookie(process.env.NODE_ENV === 'production'));
    return { ok: true };
  });

  app.get('/auth/me', { preHandler: requireAuth }, async (request) => ({ user: request.user }));
  app.get('/auth/activity', { preHandler: requireAuth }, async (request) => ({
    activity: await listAuthActivityForUser(request.user.id)
  }));
  app.post('/auth/change-password', {
    preHandler: requireAuth,
    schema: {
      body: {
        type: 'object',
        required: ['current_password', 'new_password', 'confirm_password'],
        additionalProperties: false,
        properties: {
          current_password: { type: 'string', minLength: 1, maxLength: 1024 },
          new_password: { type: 'string', minLength: 1, maxLength: 1024 },
          confirm_password: { type: 'string', minLength: 1, maxLength: 1024 }
        }
      }
    }
  }, async (request, reply) => {
    const { current_password: currentPassword, new_password: newPassword, confirm_password: confirmPassword } = request.body;

    if (newPassword !== confirmPassword) {
      await logAudit({
        user: request.user,
        action: 'password_change_failed',
        targetType: 'user',
        targetId: request.user.id,
        targetLabel: request.user.email,
        request,
        status: 'failed',
        metadata: { reason: 'confirmation_mismatch' }
      });
      return reply.code(400).send({ error: 'New password confirmation does not match.' });
    }

    try {
      const updatedUser = await changeOwnPassword(request.user.id, currentPassword, newPassword);
      const token = createSessionToken(updatedUser, app.config);
      const { _sessionVersion, ...responseUser } = updatedUser;

      reply.header('set-cookie', sessionCookie(token, app.config.sessionTtlSeconds, process.env.NODE_ENV === 'production'));
      await logAudit({
        user: request.user,
        action: 'password_changed',
        targetType: 'user',
        targetId: request.user.id,
        targetLabel: request.user.email,
        request,
        metadata: { invalidated_other_sessions: true }
      });

      return { ok: true, user: responseUser };
    } catch (error) {
      await logAudit({
        user: request.user,
        action: 'password_change_failed',
        targetType: 'user',
        targetId: request.user.id,
        targetLabel: request.user.email,
        request,
        status: 'failed',
        metadata: { reason: error.message }
      });
      return reply.code(error.statusCode || 400).send({
        error: error.message || 'Unable to change password',
        details: error.details || undefined
      });
    }
  });
}
