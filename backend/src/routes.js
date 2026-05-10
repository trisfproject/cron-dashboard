import crypto from 'node:crypto';
import { pool } from './db.js';
import {
  archiveUser,
  canPermanentlyDeleteUser,
  createUser,
  forceLogoutUser,
  listAuditLogs,
  listUsers,
  logAudit,
  permanentDeleteUser,
  registerAuthRoutes,
  requireAdmin,
  requireAuth,
  resetUserPassword,
  restoreUser,
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
import {
  createCronSchedule,
  evaluateHeartbeatSchedules,
  getCronScheduleByScope,
  heartbeatSummary,
  listCronSchedules,
  setCronScheduleEnabled,
  updateCronSchedule
} from './heartbeat.js';
import { getReliabilityReport, listIncidentEvents } from './incidents.js';
import {
  createMaintenanceWindow,
  endMaintenanceWindow,
  listMaintenanceWindows
} from './maintenance.js';
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
    service_group: { type: 'string', nullable: true, maxLength: 120 },
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
    service_group: { type: 'string' },
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
const SERVICE_GROUP_FROM_CRON_SQL = "COALESCE(NULLIF(LEFT(SUBSTRING_INDEX(TRIM(cron_name), ' ', 1), 120), ''), 'Unassigned')";
const INGEST_INSERT_SQL = `INSERT INTO cron_logs
  (cron_name, command, server, env, service_group, status, duration, timestamp, hash,
   stdout, stderr, output, warning_messages, exception_trace, retry_logs, timeout_info)
 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

function compactSql(sql) {
  return String(sql || '').replace(/\s+/g, ' ').trim();
}

function endpointLabel(request) {
  return `${request.method} ${request.routeOptions?.url || request.url.split('?')[0]}`;
}

function logEndpointError(request, error, message) {
  request.log.error({
    err: error,
    error: error.message,
    code: error.code,
    errno: error.errno,
    sql_state: error.sqlState,
    stack: error.stack,
    endpoint: endpointLabel(request),
    table: error.alertQueryContext?.table,
    query_context: error.alertQueryContext
  }, message);
}

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

function parseServiceGroupFromCronName(cronName = '') {
  const [namespace] = String(cronName || '').trim().split(/\s+/);
  return namespace ? namespace.slice(0, 120) : 'Unassigned';
}

function addScopeFilters(filters, values, query) {
  if (query.env) {
    filters.push('env = ?');
    values.push(query.env);
  }

  if (query.service_group) {
    filters.push(`${SERVICE_GROUP_FROM_CRON_SQL} = ?`);
    values.push(query.service_group);
  }
}

function mergeScopeValues(defaultValues, rows) {
  const seen = new Set();
  const merged = [];

  for (const value of defaultValues) {
    seen.add(value.toLowerCase());
    merged.push({ value, total_runs: 0, latest_run: null });
  }

  for (const row of rows) {
    const value = String(row.value || '').trim();
    const key = value.toLowerCase();

    if (!value) {
      continue;
    }

    if (seen.has(key)) {
      const existing = merged.find((item) => item.value.toLowerCase() === key);
      existing.total_runs = row.total_runs;
      existing.latest_run = row.latest_run;
    } else {
      seen.add(key);
      merged.push(row);
    }
  }

  return merged;
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

function canAcknowledgeIncidents(user) {
  return ['admin', 'operator', 'user'].includes(user?.role);
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

    const adminRoutePrefixes = ['/alerts', '/alert-rules', '/cron-inventory', '/cron-schedules', '/users', '/audit-logs', '/audit'];
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
      const serviceGroup = parseServiceGroupFromCronName(payload.cron_name);

      try {
        const [result] = await pool.execute(
          INGEST_INSERT_SQL,
          [
            payload.cron_name,
            payload.command,
            payload.server,
            payload.env,
            serviceGroup,
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
        evaluateAlertsSafely(request.server, {
          endpoint: endpointLabel(request),
          phase: 'post_ingest_alert_evaluation'
        });
        evaluateHeartbeatSchedules({ persist: true, app: request.server }).catch((error) => {
          request.log.warn({ err: error, error: error.message }, 'Post-ingest heartbeat evaluation failed');
        });
        return reply.code(201).send({ id: result.insertId, hash, duplicate: false });
      } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
          const [[existing]] = await pool.execute('SELECT id FROM cron_logs WHERE hash = ? LIMIT 1', [hash]);
          return reply.code(200).send({ id: existing?.id || 0, hash, duplicate: true });
        }

        request.log.error({
          err: error,
          error: error.message,
          code: error.code,
          errno: error.errno,
          sql_state: error.sqlState,
          stack: error.stack,
          query_context: {
            operation: 'insert_cron_log',
            table: 'cron_logs',
            sql: compactSql(INGEST_INSERT_SQL),
            parameter_count: 16
          },
          cron_name: payload.cron_name,
          env: payload.env,
          service_group: serviceGroup,
          hash
        }, 'Cron ingest failed');

        throw error;
      }
    }
  );

  app.get('/scope-options', async () => {
    const [environmentRows] = await pool.query(`
      SELECT env AS value, COUNT(*) AS total_runs, MAX(timestamp) AS latest_run
      FROM cron_logs
      WHERE env IS NOT NULL AND env <> ''
      GROUP BY env
      ORDER BY FIELD(LOWER(env), 'production', 'prod', 'staging', 'stage', 'development', 'dev') ASC,
        latest_run DESC,
        env ASC
    `);
    const [serviceRows] = await pool.query(`
      SELECT ${SERVICE_GROUP_FROM_CRON_SQL} AS value, COUNT(*) AS total_runs, MAX(timestamp) AS latest_run
      FROM cron_logs
      GROUP BY value
      ORDER BY value ASC
    `);

    return {
      environments: mergeScopeValues(['Production', 'Staging', 'Development'], environmentRows),
      service_groups: mergeScopeValues([], serviceRows)
    };
  });

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
            env: { type: 'string' },
            service_group: { type: 'string' }
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

      addScopeFilters(filters, values, request.query);

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
          MAX(env) AS env,
          MAX(${SERVICE_GROUP_FROM_CRON_SQL}) AS service_group,
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
          MAX(env) AS env,
          MAX(${SERVICE_GROUP_FROM_CRON_SQL}) AS service_group,
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
        heartbeat: await heartbeatSummary({
          env: request.query.env,
          service_group: request.query.service_group
        }),
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
            range: { type: 'string', enum: ['today', '7d', '30d'], default: 'today' },
            env: { type: 'string' },
            service_group: { type: 'string' },
            cron_name: { type: 'string' },
            server: { type: 'string' },
            status: { type: 'integer', enum: [0, 1, 2] },
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
            offset: { type: 'integer', minimum: 0, maximum: 10000, default: 0 }
          }
        }
      }
    },
    async (request) => {
      const dateFilter = resolveDateFilter({ range: request.query.range || 'today' });
      const limit = Math.min(Number(request.query.limit || 20), 100);
      const offset = Number(request.query.offset || 0);
      const filters = [dateFilter.clause];
      const values = [...dateFilter.values];
      addScopeFilters(filters, values, request.query);

      if (request.query.cron_name) {
        filters.push('cron_name LIKE ?');
        values.push(`%${request.query.cron_name}%`);
      }

      if (request.query.server) {
        filters.push('server LIKE ?');
        values.push(`%${request.query.server}%`);
      }

      const finalFilters = [];
      const finalValues = [];

      if (request.query.status !== undefined) {
        finalFilters.push('current.last_status = ?');
        finalValues.push(Number(request.query.status));
      }

      const where = filters.join(' AND ');
      const finalWhere = finalFilters.length > 0 ? `WHERE ${finalFilters.join(' AND ')}` : '';
      const [rows] = await pool.query(`
        WITH filtered AS (
          SELECT id, cron_name, command, server, env, ${SERVICE_GROUP_FROM_CRON_SQL} AS service_group, status, duration, timestamp, hash, created_at
          FROM cron_logs
          WHERE ${where}
        ),
        latest AS (
          SELECT cron_name, server, env, service_group, MAX(timestamp) AS last_run
          FROM filtered
          GROUP BY cron_name, server, env, service_group
        ),
        current AS (
          SELECT filtered.cron_name, filtered.server, filtered.env, filtered.service_group, filtered.status AS last_status, filtered.timestamp AS last_run
          FROM filtered
          INNER JOIN latest
            ON latest.cron_name = filtered.cron_name
            AND latest.server = filtered.server
            AND latest.env <=> filtered.env
            AND latest.service_group <=> filtered.service_group
            AND latest.last_run = filtered.timestamp
        ),
        agg AS (
          SELECT cron_name, server, env, service_group, AVG(duration) AS avg_duration, SUM(status = 0) AS success_count, COUNT(*) AS total_runs
          FROM filtered
          GROUP BY cron_name, server, env, service_group
        )
        SELECT
          current.cron_name,
          current.server,
          current.env,
          current.service_group,
          current.last_status,
          DATE_FORMAT(CONVERT_TZ(current.last_run, '${UTC_SQL_TIMEZONE}', '${JAKARTA_SQL_TIMEZONE}'), '%Y-%m-%d %H:%i:%s') AS last_run,
          ROUND(agg.avg_duration, 2) AS avg_duration,
          CASE WHEN agg.total_runs = 0 THEN 0 ELSE ROUND((agg.success_count / agg.total_runs) * 100, 2) END AS success_rate,
          agg.total_runs
        FROM current
        INNER JOIN agg
          ON agg.cron_name = current.cron_name
          AND agg.server = current.server
          AND agg.env <=> current.env
          AND agg.service_group <=> current.service_group
        ${finalWhere}
        ORDER BY current.last_run DESC, current.service_group ASC, current.cron_name ASC
        LIMIT ? OFFSET ?
      `, [...values, ...finalValues, limit + 1, offset]);
      const pageRows = rows.slice(0, limit);
      const [heartbeat, registeredSchedules] = await Promise.all([
        heartbeatSummary({
          env: request.query.env,
          service_group: request.query.service_group
        }),
        listCronSchedules({
          env: request.query.env,
          service_group: request.query.service_group
        })
      ]);
      const heartbeatByScope = new Map((heartbeat.schedules || []).map((schedule) => [
        `${schedule.cron_name}|${String(schedule.environment || schedule.env || '').toLowerCase()}`,
        schedule
      ]));
      const scheduleByScope = new Map((registeredSchedules || []).map((schedule) => [
        `${schedule.cron_name}|${String(schedule.environment || '').toLowerCase()}`,
        schedule
      ]));
      const jobs = pageRows.map((job) => {
        const scopeKey = `${job.cron_name}|${String(job.env || '').toLowerCase()}`;
        const registeredSchedule = scheduleByScope.get(scopeKey);
        const heartbeatSchedule = heartbeatByScope.get(scopeKey) || registeredSchedule;

        return {
          ...job,
          heartbeat: heartbeatSchedule
            ? {
                id: heartbeatSchedule.id,
                enabled: heartbeatSchedule.enabled,
                status: heartbeatSchedule.enabled === false ? 'disabled' : heartbeatSchedule.heartbeat_status,
                schedule_expression: heartbeatSchedule.schedule_expression,
                schedule_description: heartbeatSchedule.schedule_description,
                grace_period_minutes: heartbeatSchedule.grace_period_minutes,
                cooldown_minutes: heartbeatSchedule.cooldown_minutes,
                severity: heartbeatSchedule.severity,
                last_heartbeat_at: heartbeatSchedule.last_heartbeat_at,
                missing_duration_minutes: heartbeatSchedule.missing_duration_minutes,
                heartbeat_lag_minutes: heartbeatSchedule.heartbeat_lag_minutes,
                heartbeat_state_reason: heartbeatSchedule.heartbeat_state_reason,
                schedule_window_state: heartbeatSchedule.schedule_window_state
              }
            : null
        };
      });

      return {
        jobs,
        range: dateFilter.range || 'today',
        timezone: 'Asia/Jakarta',
        limit,
        offset,
        next_offset: offset + pageRows.length,
        has_more: rows.length > limit
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
            env: { type: 'string' },
            service_group: { type: 'string' },
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

      addScopeFilters(filters, values, request.query);

      const where = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';
      const [logs] = await pool.query(
        `SELECT id, cron_name, command, server, env, ${SERVICE_GROUP_FROM_CRON_SQL} AS service_group, status, duration,
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
            state: { type: 'string', enum: ['active', 'acknowledged', 'resolved', 'open', 'all'], default: 'active' },
            env: { type: 'string' },
            service_group: { type: 'string' },
            limit: { type: 'integer', minimum: 1, maximum: 500, default: 20 },
            offset: { type: 'integer', minimum: 0, maximum: 100000, default: 0 }
          }
        }
      }
    },
    async (request) => {
      try {
        const limit = Math.min(Number(request.query.limit || 20), 500);
        const offset = Number(request.query.offset || 0);
        const rows = await listAlerts({
          state: request.query.state || 'active',
          env: request.query.env,
          service_group: request.query.service_group,
          limit: limit + 1,
          offset
        });
        const pageRows = rows.slice(0, limit);

        return {
          alerts: pageRows,
          limit,
          offset,
          next_offset: offset + pageRows.length,
          has_more: rows.length > limit
        };
      } catch (error) {
        logEndpointError(request, error, 'Alert list endpoint failed');
        throw error;
      }
    }
  );

  app.get(
    '/incidents',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            cron: { type: 'string' },
            env: { type: 'string' },
            service_group: { type: 'string' },
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
            offset: { type: 'integer', minimum: 0, default: 0 }
          }
        }
      }
    },
    async (request) => {
      try {
        return await listIncidentEvents({
          cron: request.query.cron,
          env: request.query.env,
          service_group: request.query.service_group,
          limit: request.query.limit,
          offset: request.query.offset
        });
      } catch (error) {
        logEndpointError(request, error, 'Incident timeline endpoint failed');
        throw error;
      }
    }
  );

  const reliabilityReportRoute = async (request) => {
    try {
      return await getReliabilityReport({
        range: request.query.range || '7d',
        start: request.query.start,
        end: request.query.end,
        env: request.query.env,
        service_group: request.query.service_group,
        sort: request.query.sort || 'downtime'
      });
    } catch (error) {
      logEndpointError(request, error, 'Reliability report endpoint failed');
      throw error;
    }
  };

  const reliabilityReportOptions = {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          range: { type: 'string', enum: ['today', '7d', '30d'], default: '7d' },
          start: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}([ T]\\d{2}:\\d{2}(:\\d{2})?([+-]\\d{2}:\\d{2}|Z)?)?$' },
          end: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}([ T]\\d{2}:\\d{2}(:\\d{2})?([+-]\\d{2}:\\d{2}|Z)?)?$' },
          env: { type: 'string' },
          service_group: { type: 'string' },
          sort: { type: 'string', enum: ['incidents', 'downtime'], default: 'downtime' }
        }
      }
    }
  };

  app.get(
    '/reports/reliability',
    reliabilityReportOptions,
    reliabilityReportRoute
  );

  app.get(
    '/reports',
    reliabilityReportOptions,
    reliabilityReportRoute
  );

  app.post(
    '/incidents/:id/acknowledge',
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
            note: { type: 'string', maxLength: 1000 }
          }
        }
      }
    },
    async (request, reply) => {
      try {
        if (!canAcknowledgeIncidents(request.user)) {
          return reply.code(403).send({ error: 'Incident acknowledgement requires operator access' });
        }

        const result = await acknowledgeAlert(Number(request.params.id), request.user, request.body?.note);

        if (!result.acknowledged) {
          return reply.code(409).send({
            error: 'Incident cannot be acknowledged',
            state: result.alert?.state || null
          });
        }

        await logAudit({
          user: request.user,
          action: 'incident_acknowledged',
          targetType: 'incident',
          targetId: request.params.id,
          targetLabel: result.alert?.cron_name,
          request,
          metadata: { note: request.body?.note || null }
        });

        return result;
      } catch (error) {
        logEndpointError(request, error, 'Incident acknowledge endpoint failed');
        throw error;
      }
    }
  );

  app.get(
    '/maintenance',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            cron_name: { type: 'string' },
            server: { type: 'string' },
            env: { type: 'string' },
            service_group: { type: 'string' },
            active: { type: 'boolean', default: true }
          }
        }
      }
    },
    async (request) => {
      try {
        return {
          maintenance_windows: await listMaintenanceWindows({
            cron_name: request.query.cron_name,
            server: request.query.server,
            env: request.query.env,
            service_group: request.query.service_group,
            active: request.query.active !== false
          })
        };
      } catch (error) {
        logEndpointError(request, error, 'Maintenance list endpoint failed');
        throw error;
      }
    }
  );

  app.post(
    '/maintenance',
    {
      preHandler: requireAdmin,
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            cron_name: { type: 'string', maxLength: 255 },
            server: { type: 'string', maxLength: 255 },
            env: { type: 'string', maxLength: 80 },
            service_group: { type: 'string', maxLength: 120 },
            duration_minutes: { type: 'integer', minimum: 1, maximum: 10080 },
            reason: { type: 'string', maxLength: 1000 }
          }
        }
      }
    },
    async (request) => {
      try {
        const maintenance = await createMaintenanceWindow(request.body, request.user);
        await logAudit({
          user: request.user,
          action: 'maintenance_enabled',
          targetType: 'maintenance_window',
          targetId: maintenance.id,
          targetLabel: maintenance.cron_name || maintenance.service_group || maintenance.env || 'global',
          request,
          metadata: { expires_at: maintenance.expires_at, reason: maintenance.reason }
        });
        return { maintenance };
      } catch (error) {
        logEndpointError(request, error, 'Maintenance create endpoint failed');
        throw error;
      }
    }
  );

  app.delete(
    '/maintenance/:id',
    {
      preHandler: requireAdmin,
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'integer', minimum: 1 }
          }
        }
      }
    },
    async (request) => {
      try {
        const maintenance = await endMaintenanceWindow(Number(request.params.id));
        await logAudit({
          user: request.user,
          action: 'maintenance_disabled',
          targetType: 'maintenance_window',
          targetId: Number(request.params.id),
          targetLabel: maintenance?.cron_name || maintenance?.service_group || maintenance?.env || 'global',
          request
        });
        return { maintenance };
      } catch (error) {
        logEndpointError(request, error, 'Maintenance disable endpoint failed');
        throw error;
      }
    }
  );

  app.post('/alerts/evaluate', async (request) => {
    try {
      const alerts = await evaluateAlerts(request.server);
      const heartbeat = await evaluateHeartbeatSchedules({ persist: true, app: request.server });
      return {
        evaluated: true,
        active_triggers: alerts.length,
        missing_cron_triggers: heartbeat.filter((item) => item.heartbeat_status === 'missing').length
      };
    } catch (error) {
      logEndpointError(request, error, 'Manual alert evaluation endpoint failed');
      throw error;
    }
  });

  app.get(
    '/heartbeat-health',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            env: { type: 'string' },
            service_group: { type: 'string' }
          }
        }
      }
    },
    async (request) => heartbeatSummary({
      env: request.query.env,
      service_group: request.query.service_group
    })
  );

  app.get(
    '/cron-inventory',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            env: { type: 'string' },
            service_group: { type: 'string' },
            cron_name: { type: 'string' },
            server: { type: 'string' }
          }
        }
      }
    },
    async (request) => {
      const [heartbeat, schedules] = await Promise.all([
        heartbeatSummary({
          env: request.query.env,
          service_group: request.query.service_group
        }),
        listCronSchedules({
          env: request.query.env,
          service_group: request.query.service_group
        })
      ]);
      const scopedSchedules = schedules.filter((schedule) => {
        if (request.query.cron_name && !String(schedule.cron_name || '').toLowerCase().includes(String(request.query.cron_name).toLowerCase())) return false;
        return true;
      });
      const healthByScope = new Map((heartbeat.schedules || []).map((schedule) => [
        `${schedule.cron_name}|${String(schedule.environment || schedule.env || '').toLowerCase()}`,
        schedule
      ]));
      const names = [...new Set(scopedSchedules.map((schedule) => schedule.cron_name).filter(Boolean))];
      let latestRows = [];

      if (names.length > 0) {
        const [rows] = await pool.query(`
          SELECT latest.cron_name, latest.env, latest.service_group, latest.server, latest.status AS last_status,
            latest.duration AS last_duration,
            DATE_FORMAT(CONVERT_TZ(latest.timestamp, '${UTC_SQL_TIMEZONE}', '${JAKARTA_SQL_TIMEZONE}'), '%Y-%m-%d %H:%i:%s') AS last_run
          FROM cron_logs latest
          INNER JOIN (
            SELECT cron_name, env, MAX(timestamp) AS last_run
            FROM cron_logs
            WHERE cron_name IN (${names.map(() => '?').join(',')})
            GROUP BY cron_name, env
          ) grouped
            ON grouped.cron_name = latest.cron_name
            AND grouped.env <=> latest.env
            AND grouped.last_run = latest.timestamp
        `, names);
        latestRows = rows;
      }

      const latestByScope = new Map();

      for (const row of latestRows) {
        const scopedKey = `${row.cron_name}|${String(row.env || '').toLowerCase()}`;

        if (!latestByScope.has(scopedKey)) {
          latestByScope.set(scopedKey, row);
        }

        if (!latestByScope.has(row.cron_name)) {
          latestByScope.set(row.cron_name, row);
        }
      }

      const inventory = scopedSchedules
        .map((schedule) => {
          const scopeKey = `${schedule.cron_name}|${String(schedule.environment || '').toLowerCase()}`;
          const health = healthByScope.get(scopeKey);
          const latest = latestByScope.get(scopeKey) || latestByScope.get(schedule.cron_name) || null;

          return {
            id: schedule.id,
            cron_name: schedule.cron_name,
            environment: schedule.environment,
            env: latest?.env || schedule.environment,
            service_group: schedule.service_group || latest?.service_group || null,
            schedule_expression: schedule.schedule_expression,
            schedule_description: health?.schedule_description || schedule.schedule_description,
            timezone: schedule.timezone,
            grace_period_minutes: schedule.grace_period_minutes,
            cooldown_minutes: schedule.cooldown_minutes,
            severity: schedule.severity,
            enabled: Boolean(schedule.enabled),
            description: schedule.description,
            health_status: schedule.enabled ? (health?.heartbeat_status || 'healthy') : 'disabled',
            health_reason: schedule.enabled ? (health?.heartbeat_state_reason || 'Monitoring schedule is enabled') : 'Monitoring intentionally disabled',
            schedule_window_state: schedule.enabled ? (health?.schedule_window_state || 'outside_window') : 'disabled',
            next_run: health?.next_expected_at || null,
            expected_at: health?.expected_at || null,
            overdue_at: health?.overdue_at || null,
            last_run: latest?.last_run || health?.last_heartbeat_at || null,
            last_status: latest?.last_status ?? null,
            last_duration: latest?.last_duration ?? null,
            server: latest?.server || null,
            heartbeat: {
              enabled: Boolean(schedule.enabled),
              status: schedule.enabled ? (health?.heartbeat_status || 'healthy') : 'disabled',
              last_heartbeat_at: health?.last_heartbeat_at || null,
              heartbeat_lag_minutes: health?.heartbeat_lag_minutes ?? null,
              missing_duration_minutes: health?.missing_duration_minutes ?? 0
            }
          };
        })
        .filter((item) => {
          if (request.query.server && !String(item.server || '').toLowerCase().includes(String(request.query.server).toLowerCase())) return false;
          return true;
        })
        .sort((left, right) => {
          const rank = { missing: 0, delayed: 1, unstable: 2, recovering: 3, healthy: 4, disabled: 5 };
          return (rank[left.health_status] ?? 9) - (rank[right.health_status] ?? 9)
            || String(left.service_group || '').localeCompare(String(right.service_group || ''))
            || String(left.cron_name || '').localeCompare(String(right.cron_name || ''));
        });

      return {
        inventory,
        summary: {
          registered: inventory.length,
          healthy: inventory.filter((item) => item.health_status === 'healthy' && item.schedule_window_state !== 'outside_window').length,
          waiting_window: inventory.filter((item) => item.enabled && item.schedule_window_state === 'outside_window').length,
          delayed: inventory.filter((item) => item.health_status === 'delayed').length,
          missing: inventory.filter((item) => item.health_status === 'missing').length,
          recovering: inventory.filter((item) => item.health_status === 'recovering').length,
          disabled: inventory.filter((item) => item.health_status === 'disabled').length
        },
        now_wib: heartbeat.now_wib || null,
        timezone: 'Asia/Jakarta'
      };
    }
  );

  app.get(
    '/cron-schedules',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            enabled: { type: 'boolean' },
            env: { type: 'string' },
            service_group: { type: 'string' }
          }
        }
      }
    },
    async (request) => ({
      schedules: await listCronSchedules({
        enabled: request.query.enabled,
        env: request.query.env,
        service_group: request.query.service_group
      })
    })
  );

  app.get(
    '/cron-schedules/lookup',
    {
      schema: {
        querystring: {
          type: 'object',
          required: ['cron_name'],
          properties: {
            cron_name: { type: 'string', minLength: 1 },
            env: { type: 'string' },
            environment: { type: 'string' }
          }
        }
      }
    },
    async (request, reply) => {
      const schedule = await getCronScheduleByScope(request.query);

      if (!schedule) {
        return reply.code(404).send({ error: 'Heartbeat schedule not found' });
      }

      return { schedule };
    }
  );

  app.post(
    '/cron-schedules',
    {
      schema: {
        body: {
          type: 'object',
          required: ['cron_name', 'schedule_expression'],
          additionalProperties: true,
          properties: {
            cron_name: { type: 'string', minLength: 1, maxLength: 255 },
            schedule_expression: { type: 'string', minLength: 1, maxLength: 120 },
            timezone: { type: 'string', maxLength: 80 },
            grace_period_minutes: { type: 'integer', minimum: 1, maximum: 10080 },
            cooldown_minutes: { type: 'integer', minimum: 1, maximum: 10080 },
            severity: { type: 'string', enum: ['warning', 'critical'] },
            enabled: { type: 'boolean' },
            environment: { type: 'string', maxLength: 80 },
            service_group: { type: 'string', maxLength: 120 },
            description: { type: 'string' }
          }
        }
      }
    },
    async (request, reply) => {
      const schedule = await createCronSchedule(request.body);
      await logAudit({
        user: request.user,
        action: 'heartbeat_schedule_created',
        targetType: 'cron_schedule',
        targetId: schedule.id,
        targetLabel: schedule.cron_name,
        request,
        metadata: { environment: schedule.environment }
      });
      return reply.code(201).send({ schedule });
    }
  );

  app.put(
    '/cron-schedules/:id',
    {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'integer' } }
        },
        body: {
          type: 'object',
          additionalProperties: true,
          properties: {
            cron_name: { type: 'string', minLength: 1, maxLength: 255 },
            schedule_expression: { type: 'string', minLength: 1, maxLength: 120 },
            timezone: { type: 'string', maxLength: 80 },
            grace_period_minutes: { type: 'integer', minimum: 1, maximum: 10080 },
            cooldown_minutes: { type: 'integer', minimum: 1, maximum: 10080 },
            severity: { type: 'string', enum: ['warning', 'critical'] },
            enabled: { type: 'boolean' },
            environment: { type: 'string', maxLength: 80 },
            service_group: { type: 'string', maxLength: 120 },
            description: { type: 'string' }
          }
        }
      }
    },
    async (request) => {
      const schedule = await updateCronSchedule(Number(request.params.id), request.body);
      await logAudit({
        user: request.user,
        action: 'heartbeat_schedule_updated',
        targetType: 'cron_schedule',
        targetId: schedule.id,
        targetLabel: schedule.cron_name,
        request,
        metadata: { environment: schedule.environment }
      });
      return { schedule };
    }
  );

  app.post(
    '/cron-schedules/:id/toggle',
    {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'integer' } }
        },
        body: {
          type: 'object',
          required: ['enabled'],
          additionalProperties: false,
          properties: { enabled: { type: 'boolean' } }
        }
      }
    },
    async (request) => {
      const schedule = await setCronScheduleEnabled(Number(request.params.id), request.body.enabled);
      await logAudit({
        user: request.user,
        action: schedule.enabled ? 'heartbeat_schedule_enabled' : 'heartbeat_schedule_disabled',
        targetType: 'cron_schedule',
        targetId: schedule.id,
        targetLabel: schedule.cron_name,
        request,
        metadata: { environment: schedule.environment }
      });
      return { schedule };
    }
  );

  app.post('/alerts/test-telegram', async (request, reply) => {
    try {
      const result = await sendTestTelegramNotification(request.server);
      return reply.code(200).send(result);
    } catch (error) {
      logEndpointError(request, error, 'Telegram test endpoint failed');
      throw error;
    }
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
        },
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            note: { type: 'string', maxLength: 1000 }
          }
        }
      }
    },
    async (request) => {
      try {
        const result = await acknowledgeAlert(Number(request.params.id), request.user, request.body?.note);
        await logAudit({
          user: request.user,
          action: 'alert_acknowledged',
          targetType: 'alert',
          targetId: request.params.id,
          targetLabel: result.alert?.cron_name,
          request
        });
        return result;
      } catch (error) {
        logEndpointError(request, error, 'Alert acknowledge endpoint failed');
        throw error;
      }
    }
  );

  app.get('/alert-rules', async (request) => {
    try {
      return { rules: await getAlertRules() };
    } catch (error) {
      logEndpointError(request, error, 'Alert rules list endpoint failed');
      throw error;
    }
  });

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
            type: { type: 'string', enum: ['failed_threshold', 'warning_threshold', 'success_rate_degradation', 'duration_anomaly', 'retry_storm', 'cron_silence', 'missing_cron'] },
            cron_name: { type: 'string' },
            env: { type: 'string' },
            service_group: { type: 'string' },
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
      try {
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
      } catch (error) {
        logEndpointError(request, error, 'Alert rule create endpoint failed');
        throw error;
      }
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
            type: { type: 'string', enum: ['failed_threshold', 'warning_threshold', 'success_rate_degradation', 'duration_anomaly', 'retry_storm', 'cron_silence', 'missing_cron'] },
            cron_name: { type: 'string' },
            env: { type: 'string' },
            service_group: { type: 'string' },
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
      try {
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
      } catch (error) {
        logEndpointError(request, error, 'Alert rule update endpoint failed');
        throw error;
      }
    }
  );

  const auditLogsRouteOptions = {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          action: { type: 'string' },
          user_id: { type: 'integer' },
          start: { type: 'string' },
          end: { type: 'string' },
          limit: { type: 'integer', minimum: 1, maximum: 500, default: 20 },
          offset: { type: 'integer', minimum: 0, maximum: 100000, default: 0 }
        }
      }
    }
  };

  async function auditLogsHandler(request) {
    const limit = Math.min(Number(request.query.limit || 20), 500);
    const offset = Number(request.query.offset || 0);
    const rows = await listAuditLogs({
      action: request.query.action,
      userId: request.query.user_id,
      start: request.query.start,
      end: request.query.end,
      limit: limit + 1,
      offset
    });
    const pageRows = rows.slice(0, limit);

    return {
      audit_logs: pageRows,
      limit,
      offset,
      next_offset: offset + pageRows.length,
      has_more: rows.length > limit
    };
  }

  app.get('/audit-logs', auditLogsRouteOptions, auditLogsHandler);
  app.get('/audit', auditLogsRouteOptions, auditLogsHandler);

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
      try {
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
      } catch (error) {
        if (error.statusCode === 409) {
          return reply.code(409).send({
            code: error.code,
            message: error.message,
            userId: error.userId,
            email: error.email,
            lifecycle_state: error.lifecycle_state,
            available_actions: error.available_actions
          });
        }

        throw error;
      }
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
    '/users/:id/restore',
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
      const user = await restoreUser(Number(request.params.id));
      if (!user) {
        return reply.code(404).send({ error: 'User not found' });
      }
      await logAudit({
        user: request.user,
        action: 'user_restored',
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

  app.post(
    '/users/:id/archive',
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
        return reply.code(400).send({ error: 'You cannot archive your own account' });
      }

      const users = await listUsers(true);
      const adminCount = users.filter((u) => u.role === 'admin' && u.is_active && !u.archived_at).length;
      const isLastAdmin = adminCount === 1 && users.find((u) => u.id === id)?.role === 'admin' && users.find((u) => u.id === id)?.is_active;

      if (isLastAdmin) {
        return reply.code(400).send({ error: 'Cannot archive the last active admin user' });
      }

      await archiveUser(id);
      await forceLogoutUser(id);
      
      const updatedUsers = await listUsers();
      const user = updatedUsers.find((u) => u.id === id) || { id };

      await logAudit({
        user: request.user,
        action: 'user_archived',
        targetType: 'user',
        targetId: id,
        targetLabel: user.email,
        request
      });

      return { archived: true, user };
    }
  );

  app.post(
    '/users/:id/delete',
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
            permanent: { type: 'boolean' }
          }
        }
      }
    },
    async (request, reply) => {
      const id = Number(request.params.id);
      const permanent = request.body?.permanent === true;

      if (id === Number(request.user.id)) {
        return reply.code(400).send({ error: 'You cannot delete your own account' });
      }

      if (permanent) {
        const canDelete = await canPermanentlyDeleteUser(id);
        if (!canDelete.canDelete) {
          return reply.code(400).send({ error: `Cannot permanently delete: ${canDelete.reason}` });
        }

        await permanentDeleteUser(id);
        await logAudit({
          user: request.user,
          action: 'user_permanently_deleted',
          targetType: 'user',
          targetId: id,
          request
        });

        return { deleted: true };
      }

      const users = await listUsers(true);
      const adminCount = users.filter((u) => u.role === 'admin' && u.is_active && !u.archived_at).length;
      const isLastAdmin = adminCount === 1 && users.find((u) => u.id === id)?.role === 'admin' && users.find((u) => u.id === id)?.is_active;

      if (isLastAdmin) {
        return reply.code(400).send({ error: 'Cannot delete the last active admin user' });
      }

      await archiveUser(id);
      await forceLogoutUser(id);

      await logAudit({
        user: request.user,
        action: 'user_archived',
        targetType: 'user',
        targetId: id,
        request
      });

      return { deleted: true };
    }
  );

  app.get(
    '/users/:id/can-delete',
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
      const id = Number(request.params.id);
      const canDelete = await canPermanentlyDeleteUser(id);
      return canDelete;
    }
  );
}
