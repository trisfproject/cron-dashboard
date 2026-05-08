import crypto from 'node:crypto';
import { pool } from './db.js';
import {
  createUser,
  forceLogoutUser,
  listAuditLogs,
  listUsers,
  logAudit,
  registerAuthRoutes,
  requireAdmin,
  requireAuth,
  resetUserPassword,
  updateUser
} from './auth.js';
import {
  acknowledgeAlert,
  createAlertRule,
  evaluateAlerts,
  evaluateAlertsSafely,
  getAlertRules,
  listAlerts,
  sendTestTelegramNotification,
  updateAlertRule
} from './alerting.js';
import { normalizeTimelineBuckets, resolveDateFilter } from './utils/range-filter.js';

const ingestBodySchema = {
  type: 'object',
  required: ['cron_name', 'command', 'server', 'env', 'status', 'duration', 'timestamp'],
  additionalProperties: false,
  properties: {
    cron_name: { type: 'string', minLength: 1, maxLength: 255 },
    command: { type: 'string', minLength: 1 },
    server: { type: 'string', minLength: 1, maxLength: 255 },
    env: { type: 'string', minLength: 1, maxLength: 80 },
    status: { type: 'integer', enum: [0, 1, 2] },
    duration: { type: 'integer', minimum: 0 },
    timestamp: { type: 'string', format: 'date-time' },
    stdout: { type: 'string', nullable: true },
    stderr: { type: 'string', nullable: true },
    output: { type: 'string', nullable: true },
    warning_messages: { type: 'string', nullable: true },
    exception_trace: { type: 'string', nullable: true },
    retry_logs: { type: 'string', nullable: true },
    timeout_info: { type: 'string', nullable: true }
  }
};

const logResponseSchema = {
  type: 'object',
  properties: {
    id: { type: 'number' },
    cron_name: { type: 'string' },
    command: { type: 'string' },
    server: { type: 'string' },
    env: { type: 'string' },
    status: { type: 'number' },
    duration: { type: 'number' },
    timestamp: { type: 'string' },
    stdout: { type: 'string', nullable: true },
    stderr: { type: 'string', nullable: true },
    output: { type: 'string', nullable: true },
    warning_messages: { type: 'string', nullable: true },
    exception_trace: { type: 'string', nullable: true },
    retry_logs: { type: 'string', nullable: true },
    timeout_info: { type: 'string', nullable: true },
    hash: { type: 'string' },
    created_at: { type: 'string' }
  }
};

const JAKARTA_SQL_TIMEZONE = '+07:00';
const UTC_SQL_TIMEZONE = '+00:00';
const JAKARTA_TIMESTAMP_SQL = `DATE_FORMAT(CONVERT_TZ(timestamp, '${UTC_SQL_TIMEZONE}', '${JAKARTA_SQL_TIMEZONE}'), '%Y-%m-%d %H:%i:%s')`;
const JAKARTA_CREATED_AT_SQL = `DATE_FORMAT(CONVERT_TZ(created_at, '${UTC_SQL_TIMEZONE}', '${JAKARTA_SQL_TIMEZONE}'), '%Y-%m-%d %H:%i:%s')`;

function normalizeTimestamp(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error('Invalid timestamp');
  }

  return date.toISOString().slice(0, 23).replace('T', ' ');
}

function buildHash({ cron_name, timestamp, server }) {
  return crypto
    .createHash('sha256')
    .update(`${cron_name}:${timestamp}:${server}`)
    .digest('hex');
}

function secureCompare(left, right) {
  const leftBuffer = Buffer.from(left || '');
  const rightBuffer = Buffer.from(right || '');

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function requireApiKey(request, reply, done) {
  if (!secureCompare(request.headers['x-api-key'], request.server.config.apiKey)) {
    reply.code(401).send({ error: 'Unauthorized' });
    return;
  }

  done();
}

export async function registerRoutes(app) {
  app.get('/health', async () => ({ ok: true }));
  await registerAuthRoutes(app);

  app.addHook('preHandler', async (request, reply) => {
    const publicRoutes = new Set([
      'GET /health',
      'POST /ingest',
      'POST /auth/login',
      'POST /auth/logout',
      'GET /auth/me'
    ]);
    const routeKey = `${request.method} ${request.routeOptions?.url || request.url.split('?')[0]}`;

    if (publicRoutes.has(routeKey)) {
      return;
    }

    await requireAuth(request, reply);

    if (reply.sent) {
      return;
    }

    const adminRoutePrefixes = ['/alerts', '/alert-rules', '/users', '/audit-logs'];
    const routePath = request.url.split('?')[0];

    if (adminRoutePrefixes.some((prefix) => routePath === prefix || routePath.startsWith(`${prefix}/`))) {
      await requireAdmin(request, reply);
    }
  });

  app.post(
    '/ingest',
    {
      preHandler: requireApiKey,
      schema: {
        body: ingestBodySchema,
        response: {
          201: {
            type: 'object',
            properties: {
              id: { type: 'number' },
              hash: { type: 'string' },
              duplicate: { type: 'boolean' }
            }
          },
          200: {
            type: 'object',
            properties: {
              id: { type: 'number' },
              hash: { type: 'string' },
              duplicate: { type: 'boolean' }
            }
          }
        }
      }
    },
    async (request, reply) => {
      const payload = request.body;
      const timestamp = normalizeTimestamp(payload.timestamp);
      const hash = buildHash({ ...payload, timestamp });

      try {
        const [result] = await pool.execute(
          `INSERT INTO cron_logs
            (cron_name, command, server, env, status, duration, timestamp, hash,
             stdout, stderr, output, warning_messages, exception_trace, retry_logs, timeout_info)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            payload.cron_name,
            payload.command,
            payload.server,
            payload.env,
            payload.status,
            payload.duration,
            timestamp,
            hash,
            payload.stdout ?? null,
            payload.stderr ?? null,
            payload.output ?? null,
            payload.warning_messages ?? null,
            payload.exception_trace ?? null,
            payload.retry_logs ?? null,
            payload.timeout_info ?? null
          ]
        );

        request.log.info({ cron_name: payload.cron_name, hash }, 'Cron log ingested');
        evaluateAlertsSafely(request.server);
        return reply.code(201).send({ id: result.insertId, hash, duplicate: false });
      } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
          const [[existing]] = await pool.execute('SELECT id FROM cron_logs WHERE hash = ? LIMIT 1', [hash]);
          return reply.code(200).send({ id: existing?.id || 0, hash, duplicate: true });
        }

        throw error;
      }
    }
  );

  app.get(
    '/stats',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            range: { type: 'string', enum: ['today', '7d', '30d'] },
            window: { type: 'string', enum: ['5m', '15m', '30m', '1h', '4h'] },
            start: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}(([ T]\\d{2}:\\d{2}(:\\d{2})?)|(T\\d{2}:\\d{2}(:\\d{2})?([+-]\\d{2}:\\d{2}|Z)))?$' },
            end: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}(([ T]\\d{2}:\\d{2}(:\\d{2})?)|(T\\d{2}:\\d{2}(:\\d{2})?([+-]\\d{2}:\\d{2}|Z)))?$' },
            cron_name: { type: 'string' },
            server: { type: 'string' },
            env: { type: 'string' }
          }
        }
      }
    },
    async (request) => {
      const dateFilter = resolveDateFilter(request.query);
      const filters = [dateFilter.clause];
      const values = [...dateFilter.values];

      if (request.query.cron_name) {
        filters.push('cron_name = ?');
        values.push(request.query.cron_name);
      }

      if (request.query.server) {
        filters.push('server = ?');
        values.push(request.query.server);
      }

      if (request.query.env) {
        filters.push('env = ?');
        values.push(request.query.env);
      }

      const where = filters.join(' AND ');

      const [[summary]] = await pool.query(`
        SELECT
          COUNT(*) AS total_runs,
          COUNT(DISTINCT cron_name) AS total_jobs,
          SUM(status = 0) AS success_count,
          SUM(status = 1) AS failed_count,
          SUM(status = 2) AS warning_count,
          COALESCE(AVG(duration), 0) AS average_duration,
          CASE WHEN COUNT(*) = 0 THEN 0 ELSE ROUND((SUM(status = 0) / COUNT(*)) * 100, 2) END AS success_rate,
          CASE WHEN COUNT(*) = 0 THEN 0 ELSE ROUND((SUM(status = 2) / COUNT(*)) * 100, 2) END AS warning_rate,
          DATE_FORMAT(CONVERT_TZ(MAX(created_at), '${UTC_SQL_TIMEZONE}', '${JAKARTA_SQL_TIMEZONE}'), '%Y-%m-%d %H:%i:%s') AS last_ingest_at
        FROM cron_logs
        WHERE ${where}
      `, values);

      const [timeline] = await pool.query(`
        SELECT
          ${dateFilter.timelineBucketSql} AS bucket,
          COUNT(*) AS total,
          SUM(CASE WHEN status = 0 THEN 1 ELSE 0 END) AS success,
          SUM(CASE WHEN status = 1 THEN 1 ELSE 0 END) AS failed,
          SUM(CASE WHEN status = 2 THEN 1 ELSE 0 END) AS warning,
          ROUND(AVG(duration), 2) AS average_duration
        FROM cron_logs
        WHERE ${where}
        GROUP BY bucket
        ORDER BY bucket ASC
      `, values);
      const normalizedTimeline = normalizeTimelineBuckets(timeline, dateFilter);
      const [problematicJobs] = await pool.query(`
        SELECT
          cron_name,
          COUNT(*) AS total_runs,
          SUM(CASE WHEN status = 0 THEN 1 ELSE 0 END) AS success_count,
          SUM(CASE WHEN status = 1 THEN 1 ELSE 0 END) AS failed_count,
          SUM(CASE WHEN status = 2 THEN 1 ELSE 0 END) AS warning_count,
          CASE WHEN COUNT(*) = 0 THEN 0 ELSE ROUND((SUM(status = 0) / COUNT(*)) * 100, 2) END AS success_rate,
          MAX(timestamp) AS latest_run
        FROM cron_logs
        WHERE ${where}
        GROUP BY cron_name
        ORDER BY warning_count DESC, success_rate ASC, failed_count DESC, latest_run DESC
        LIMIT 5
      `, values);
      const [slowestJobs] = await pool.query(`
        SELECT
          cron_name,
          ROUND(AVG(duration), 2) AS avg_duration,
          MAX(duration) AS max_duration,
          COUNT(*) AS total_runs
        FROM cron_logs
        WHERE ${where}
        GROUP BY cron_name
        ORDER BY avg_duration DESC, max_duration DESC
        LIMIT 5
      `, values);

      return {
        summary,
        timeline: normalizedTimeline,
        insights: {
          problematic_jobs: problematicJobs,
          slowest_jobs: slowestJobs
        },
        mode: dateFilter.mode,
        window: dateFilter.window,
        range: dateFilter.range,
        start: dateFilter.start,
        end: dateFilter.end,
        interval: dateFilter.timelineInterval
      };
    }
  );

  app.get(
    '/cron-list',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            range: { type: 'string', enum: ['today', '7d', '30d'], default: 'today' }
          }
        }
      }
    },
    async (request) => {
      const dateFilter = resolveDateFilter({ range: request.query.range || 'today' });
      const [rows] = await pool.query(`
        WITH filtered AS (
          SELECT id, cron_name, command, server, env, status, duration, timestamp, hash, created_at
          FROM cron_logs
          WHERE ${dateFilter.clause}
        ),
        latest AS (
          SELECT cron_name, server, MAX(timestamp) AS last_run
          FROM filtered
          GROUP BY cron_name, server
        ),
        current AS (
          SELECT filtered.cron_name, filtered.server, filtered.env, filtered.status AS last_status, filtered.timestamp AS last_run
          FROM filtered
          INNER JOIN latest
            ON latest.cron_name = filtered.cron_name
            AND latest.server = filtered.server
            AND latest.last_run = filtered.timestamp
        ),
        agg AS (
          SELECT cron_name, server, AVG(duration) AS avg_duration, SUM(status = 0) AS success_count, COUNT(*) AS total_runs
          FROM filtered
          GROUP BY cron_name, server
        )
        SELECT
          current.cron_name,
          current.server,
          current.env,
          current.last_status,
          DATE_FORMAT(CONVERT_TZ(current.last_run, '${UTC_SQL_TIMEZONE}', '${JAKARTA_SQL_TIMEZONE}'), '%Y-%m-%d %H:%i:%s') AS last_run,
          ROUND(agg.avg_duration, 2) AS avg_duration,
          CASE WHEN agg.total_runs = 0 THEN 0 ELSE ROUND((agg.success_count / agg.total_runs) * 100, 2) END AS success_rate,
          agg.total_runs
        FROM current
        INNER JOIN agg
          ON agg.cron_name = current.cron_name
          AND agg.server = current.server
        ORDER BY current.last_run DESC
      `, dateFilter.values);

      return {
        jobs: rows,
        range: dateFilter.range || 'today',
        timezone: 'Asia/Jakarta'
      };
    }
  );

  app.get(
    '/logs',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            cron_name: { type: 'string' },
            server: { type: 'string' },
            status: { type: 'integer', enum: [0, 1, 2] },
            range: { type: 'string', enum: ['today', '7d', '30d'] },
            window: { type: 'string', enum: ['5m', '15m', '30m', '1h', '4h'] },
            start: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}(([ T]\\d{2}:\\d{2}(:\\d{2})?)|(T\\d{2}:\\d{2}(:\\d{2})?([+-]\\d{2}:\\d{2}|Z)))?$' },
            end: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}(([ T]\\d{2}:\\d{2}(:\\d{2})?)|(T\\d{2}:\\d{2}(:\\d{2})?([+-]\\d{2}:\\d{2}|Z)))?$' },
            limit: { type: 'integer', minimum: 1, maximum: 500, default: 50 },
            offset: { type: 'integer', minimum: 0, maximum: 10000, default: 0 }
          }
        },
        response: {
          200: {
            type: 'object',
            properties: {
              logs: { type: 'array', items: logResponseSchema }
            }
          }
        }
      }
    },
    async (request) => {
      const { cron_name, server, status } = request.query;
      const dateFilter = resolveDateFilter(request.query);

      const limit = Number(request.query.limit || 50);
      const offset = Number(request.query.offset || 0);
      const filters = [];
      const values = [];

      filters.push(dateFilter.clause);
      values.push(...dateFilter.values);

      if (cron_name) {
        filters.push('cron_name = ?');
        values.push(cron_name);
      }

      if (server) {
        filters.push('server = ?');
        values.push(server);
      }

      if (status !== undefined) {
        filters.push('status = ?');
        values.push(Number(status));
      }

      const where = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';
      const [logs] = await pool.query(
        `SELECT id, cron_name, command, server, env, status, duration,
           ${JAKARTA_TIMESTAMP_SQL} AS timestamp,
           stdout,
           stderr,
           output,
           warning_messages,
           exception_trace,
           retry_logs,
           timeout_info,
           hash,
           ${JAKARTA_CREATED_AT_SQL} AS created_at
         FROM cron_logs
         ${where}
         ORDER BY timestamp DESC
         LIMIT ? OFFSET ?`,
        [...values, limit, offset]
      );

      return { logs, limit, offset };
    }
  );

  app.get(
    '/alerts',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            state: { type: 'string', enum: ['active', 'acknowledged', 'resolved', 'all'], default: 'active' },
            limit: { type: 'integer', minimum: 1, maximum: 500, default: 50 }
          }
        }
      }
    },
    async (request) => {
      return {
        alerts: await listAlerts({
          state: request.query.state || 'active',
          limit: Number(request.query.limit || 50)
        })
      };
    }
  );

  app.post('/alerts/evaluate', async (request) => {
    const alerts = await evaluateAlerts(request.server);
    return { evaluated: true, active_triggers: alerts.length };
  });

  app.post('/alerts/test-telegram', async (request, reply) => {
    const result = await sendTestTelegramNotification(request.server);
    return reply.code(200).send(result);
  });

  app.post(
    '/alerts/:id/acknowledge',
    {
      schema: {
        params: {
          type: 'object',
          properties: {
            id: { type: 'integer' }
          },
          required: ['id']
        }
      }
    },
    async (request) => {
      await acknowledgeAlert(Number(request.params.id));
      await logAudit({
        user: request.user,
        action: 'alert_acknowledged',
        targetType: 'alert',
        targetId: request.params.id,
        request
      });
      return { acknowledged: true };
    }
  );

  app.get('/alert-rules', async () => ({ rules: await getAlertRules() }));

  app.post(
    '/alert-rules',
    {
      schema: {
        body: {
          type: 'object',
          required: ['name', 'type'],
          additionalProperties: true,
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 255 },
            type: { type: 'string', enum: ['failed_threshold', 'warning_threshold', 'success_rate_degradation', 'duration_anomaly', 'retry_storm', 'cron_silence'] },
            cron_name: { type: 'string' },
            severity: { type: 'string', enum: ['info', 'warning', 'critical'] },
            threshold: { type: 'number' },
            timeframe_minutes: { type: 'integer', minimum: 1, maximum: 10080 },
            cooldown_minutes: { type: 'integer', minimum: 1, maximum: 1440 },
            expected_interval_minutes: { type: 'integer', minimum: 1, maximum: 10080 },
            duration_spike_percent: { type: 'integer', minimum: 1, maximum: 10000 },
            channels: { type: 'array', items: { type: 'string', enum: ['telegram', 'discord', 'slack'] } },
            enabled: { type: 'boolean' }
          }
        }
      }
    },
    async (request, reply) => {
      const rule = await createAlertRule(request.body);
      await logAudit({
        user: request.user,
        action: 'alert_rule_created',
        targetType: 'alert_rule',
        targetId: rule.id,
        targetLabel: rule.name,
        request
      });
      return reply.code(201).send({ rule });
    }
  );

  app.put(
    '/alert-rules/:id',
    {
      schema: {
        params: {
          type: 'object',
          properties: {
            id: { type: 'integer' }
          },
          required: ['id']
        },
        body: {
          type: 'object',
          required: ['name', 'type'],
          additionalProperties: true,
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 255 },
            type: { type: 'string', enum: ['failed_threshold', 'warning_threshold', 'success_rate_degradation', 'duration_anomaly', 'retry_storm', 'cron_silence'] },
            cron_name: { type: 'string' },
            severity: { type: 'string', enum: ['info', 'warning', 'critical'] },
            threshold: { type: 'number' },
            timeframe_minutes: { type: 'integer', minimum: 1, maximum: 10080 },
            cooldown_minutes: { type: 'integer', minimum: 1, maximum: 1440 },
            expected_interval_minutes: { type: 'integer', minimum: 1, maximum: 10080 },
            duration_spike_percent: { type: 'integer', minimum: 1, maximum: 10000 },
            channels: { type: 'array', items: { type: 'string', enum: ['telegram', 'discord', 'slack'] } },
            enabled: { type: 'boolean' }
          }
        }
      }
    },
    async (request) => {
      const rule = await updateAlertRule(Number(request.params.id), request.body);
      await logAudit({
        user: request.user,
        action: 'alert_rule_updated',
        targetType: 'alert_rule',
        targetId: rule.id,
        targetLabel: rule.name,
        request
      });
      return { rule };
    }
  );

  app.get(
    '/audit-logs',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            action: { type: 'string' },
            user_id: { type: 'integer' },
            start: { type: 'string' },
            end: { type: 'string' },
            limit: { type: 'integer', minimum: 1, maximum: 500, default: 100 }
          }
        }
      }
    },
    async (request) => ({
      audit_logs: await listAuditLogs({
        action: request.query.action,
        userId: request.query.user_id,
        start: request.query.start,
        end: request.query.end,
        limit: request.query.limit || 100
      })
    })
  );

  app.get('/users', async () => ({ users: await listUsers() }));

  app.post(
    '/users',
    {
      schema: {
        body: {
          type: 'object',
          required: ['name', 'email', 'password'],
          additionalProperties: false,
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 255 },
            email: { type: 'string', minLength: 3, maxLength: 255 },
            password: { type: 'string', minLength: 8, maxLength: 1024 },
            role: { type: 'string', enum: ['user', 'admin'], default: 'user' },
            is_active: { type: 'boolean' }
          }
        }
      }
    },
    async (request, reply) => {
      const user = await createUser(request.body);
      await logAudit({
        user: request.user,
        action: 'user_created',
        targetType: 'user',
        targetId: user.id,
        targetLabel: user.email,
        request,
        metadata: { role: user.role }
      });
      return reply.code(201).send({ user });
    }
  );

  app.put(
    '/users/:id',
    {
      schema: {
        params: {
          type: 'object',
          properties: {
            id: { type: 'integer' }
          },
          required: ['id']
        },
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 255 },
            email: { type: 'string', minLength: 3, maxLength: 255 },
            role: { type: 'string', enum: ['user', 'admin'] },
            is_active: { type: 'boolean' }
          }
        }
      }
    },
    async (request, reply) => {
      const id = Number(request.params.id);

      if (id === Number(request.user.id) && request.body.is_active === false) {
        return reply.code(400).send({ error: 'You cannot deactivate your own account' });
      }

      const user = await updateUser(id, request.body);
      if (request.body.role !== undefined) {
        await logAudit({
          user: request.user,
          action: 'role_changed',
          targetType: 'user',
          targetId: user.id,
          targetLabel: user.email,
          request,
          metadata: { role: user.role }
        });
      }
      if (request.body.is_active !== undefined) {
        await logAudit({
          user: request.user,
          action: request.body.is_active ? 'user_reactivated' : 'user_deactivated',
          targetType: 'user',
          targetId: user.id,
          targetLabel: user.email,
          request
        });
      }
      return { user };
    }
  );

  app.post(
    '/users/:id/reset-password',
    {
      schema: {
        params: {
          type: 'object',
          properties: {
            id: { type: 'integer' }
          },
          required: ['id']
        },
        body: {
          type: 'object',
          required: ['password'],
          additionalProperties: false,
          properties: {
            password: { type: 'string', minLength: 8, maxLength: 1024 }
          }
        }
      }
    },
    async (request) => {
      await resetUserPassword(Number(request.params.id), request.body.password);
      await logAudit({
        user: request.user,
        action: 'password_reset',
        targetType: 'user',
        targetId: request.params.id,
        request
      });
      return { reset: true };
    }
  );

  app.post(
    '/users/:id/deactivate',
    {
      schema: {
        params: {
          type: 'object',
          properties: {
            id: { type: 'integer' }
          },
          required: ['id']
        }
      }
    },
    async (request, reply) => {
      const id = Number(request.params.id);

      if (id === Number(request.user.id)) {
        return reply.code(400).send({ error: 'You cannot deactivate your own account' });
      }

      const user = await updateUser(id, { is_active: false });
      await logAudit({
        user: request.user,
        action: 'user_deactivated',
        targetType: 'user',
        targetId: user.id,
        targetLabel: user.email,
        request
      });
      return { user };
    }
  );

  app.post(
    '/users/:id/reactivate',
    {
      schema: {
        params: {
          type: 'object',
          properties: {
            id: { type: 'integer' }
          },
          required: ['id']
        }
      }
    },
    async (request) => {
      const user = await updateUser(Number(request.params.id), { is_active: true });
      await logAudit({
        user: request.user,
        action: 'user_reactivated',
        targetType: 'user',
        targetId: user.id,
        targetLabel: user.email,
        request
      });
      return { user };
    }
  );

  app.post(
    '/users/:id/force-logout',
    {
      schema: {
        params: {
          type: 'object',
          properties: {
            id: { type: 'integer' }
          },
          required: ['id']
        }
      }
    },
    async (request) => {
      await forceLogoutUser(Number(request.params.id));
      await logAudit({
        user: request.user,
        action: 'session_forced_logout',
        targetType: 'user',
        targetId: request.params.id,
        request
      });
      return { invalidated: true };
    }
  );
}
