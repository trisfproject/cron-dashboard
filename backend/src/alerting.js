import { pool } from './db.js';
import { logAudit } from './auth.js';

const JAKARTA_SQL_TIMEZONE = '+07:00';
const UTC_SQL_TIMEZONE = '+00:00';
const JAKARTA_NOW_SQL = `DATE_FORMAT(CONVERT_TZ(UTC_TIMESTAMP(), '${UTC_SQL_TIMEZONE}', '${JAKARTA_SQL_TIMEZONE}'), '%Y-%m-%d %H:%i:%s')`;
const ALERT_EVALUATION_LOG_THROTTLE_MS = 60000;

const RULE_TYPES = new Set([
  'failed_threshold',
  'warning_threshold',
  'success_rate_degradation',
  'duration_anomaly',
  'retry_storm',
  'cron_silence',
  'missing_cron'
]);

const lastEvaluationFailureLogAt = new Map();
let alertSchemaReadyPromise;

function compactSql(sql) {
  return String(sql || '').replace(/\s+/g, ' ').trim();
}

function attachAlertQueryContext(error, context, sql, values) {
  error.alertQueryContext = {
    operation: context.operation,
    table: context.table,
    rule_id: context.rule?.id,
    rule_type: context.rule?.type,
    rule_name: context.rule?.name,
    alert_id: context.alert_id,
    sql: compactSql(sql),
    parameter_count: values.length
  };
  return error;
}

function schemaQueryContext(operation, table) {
  return { operation, table };
}

async function alertQuery(context, sql, values = []) {
  try {
    return await pool.query(sql, values);
  } catch (error) {
    throw attachAlertQueryContext(error, context, sql, values);
  }
}

async function tableColumnSet(tableName) {
  const [rows] = await alertQuery(
    schemaQueryContext('inspect_alert_schema_columns', 'INFORMATION_SCHEMA.COLUMNS'),
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?`,
    [tableName]
  );

  return new Set(rows.map((row) => row.COLUMN_NAME));
}

async function tableIndexSet(tableName) {
  const [rows] = await alertQuery(
    schemaQueryContext('inspect_alert_schema_indexes', 'INFORMATION_SCHEMA.STATISTICS'),
    `SELECT DISTINCT INDEX_NAME
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?`,
    [tableName]
  );

  return new Set(rows.map((row) => row.INDEX_NAME));
}

async function ensureColumn(tableName, columns, columnName, definition) {
  if (columns.has(columnName)) {
    return;
  }

  try {
    await alertQuery(
      schemaQueryContext(`add_${tableName}_${columnName}_column`, tableName),
      `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`
    );
  } catch (error) {
    if (error.code !== 'ER_DUP_FIELDNAME') {
      throw error;
    }
  }

  columns.add(columnName);
}

async function ensureIndex(tableName, indexes, indexName, definition) {
  if (indexes.has(indexName)) {
    return;
  }

  try {
    await alertQuery(
      schemaQueryContext(`add_${tableName}_${indexName}_index`, tableName),
      `CREATE INDEX ${indexName} ON ${tableName} ${definition}`
    );
  } catch (error) {
    if (error.code !== 'ER_DUP_KEYNAME') {
      throw error;
    }
  }

  indexes.add(indexName);
}

async function ensureAlertSchema() {
  if (!alertSchemaReadyPromise) {
    alertSchemaReadyPromise = (async () => {
      const cronLogColumns = await tableColumnSet('cron_logs');
      const alertRuleColumns = await tableColumnSet('alert_rules');
      const alertEventColumns = await tableColumnSet('alert_events');

      await ensureColumn('cron_logs', cronLogColumns, 'service_group', "VARCHAR(120) NOT NULL DEFAULT 'Unassigned'");
      await ensureColumn('alert_rules', alertRuleColumns, 'env', 'VARCHAR(80) NULL');
      await ensureColumn('alert_rules', alertRuleColumns, 'service_group', 'VARCHAR(120) NULL');
      await ensureColumn('alert_events', alertEventColumns, 'env', 'VARCHAR(80) NULL');
      await ensureColumn('alert_events', alertEventColumns, 'service_group', 'VARCHAR(120) NULL');

      const cronLogIndexes = await tableIndexSet('cron_logs');
      const alertRuleIndexes = await tableIndexSet('alert_rules');
      const alertEventIndexes = await tableIndexSet('alert_events');

      if (cronLogColumns.has('env') && cronLogColumns.has('service_group') && cronLogColumns.has('timestamp')) {
        await ensureIndex('cron_logs', cronLogIndexes, 'idx_cron_logs_env_service_timestamp', '(env, service_group, timestamp)');
      }

      if (cronLogColumns.has('service_group') && cronLogColumns.has('timestamp')) {
        await ensureIndex('cron_logs', cronLogIndexes, 'idx_cron_logs_service_timestamp', '(service_group, timestamp)');
      }

      if (alertRuleColumns.has('env') && alertRuleColumns.has('service_group') && alertRuleColumns.has('cron_name')) {
        await ensureIndex('alert_rules', alertRuleIndexes, 'idx_alert_rules_scope', '(env, service_group, cron_name)');
      }

      if (alertEventColumns.has('env') && alertEventColumns.has('service_group') && alertEventColumns.has('state') && alertEventColumns.has('triggered_at')) {
        await ensureIndex('alert_events', alertEventIndexes, 'idx_alert_events_scope_state', '(env, service_group, state, triggered_at)');
      }
    })().catch((error) => {
      alertSchemaReadyPromise = null;
      throw error;
    });
  }

  await alertSchemaReadyPromise;
}

function shouldLogEvaluationFailure(error) {
  const context = error.alertQueryContext || {};
  const key = [
    error.code || error.errno || error.message,
    context.operation || 'unknown-operation',
    context.table || 'unknown-table',
    context.rule_type || 'unknown-rule'
  ].join(':');
  const now = Date.now();
  const lastLoggedAt = lastEvaluationFailureLogAt.get(key) || 0;

  if (now - lastLoggedAt < ALERT_EVALUATION_LOG_THROTTLE_MS) {
    return false;
  }

  lastEvaluationFailureLogAt.set(key, now);
  return true;
}

function parseChannels(value) {
  if (Array.isArray(value)) {
    return value.filter(Boolean);
  }

  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return String(value)
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
}

function normalizeRulePayload(payload = {}) {
  const type = payload.type || 'failed_threshold';

  if (!RULE_TYPES.has(type)) {
    throw new Error('Unsupported alert rule type');
  }

  const env = payload.env ? String(payload.env).trim() : null;
  const serviceGroup = payload.service_group ? String(payload.service_group).trim() : null;
  return {
    name: String(payload.name || type).trim(),
    type,
    cron_name: payload.cron_name ? String(payload.cron_name).trim() : null,
    env,
    service_group: serviceGroup,
    severity: ['info', 'warning', 'critical'].includes(payload.severity) ? payload.severity : 'warning',
    threshold: Number(payload.threshold || (type === 'success_rate_degradation' ? 80 : 3)),
    timeframe_minutes: Number(payload.timeframe_minutes || 5),
    cooldown_minutes: Number(payload.cooldown_minutes || 10),
    expected_interval_minutes: payload.expected_interval_minutes ? Number(payload.expected_interval_minutes) : null,
    duration_spike_percent: payload.duration_spike_percent ? Number(payload.duration_spike_percent) : null,
    channels: parseChannels(payload.channels)
  };
}

function normalizeEnvironment(value) {
  return String(value || '').trim().toLowerCase();
}

function getEnvironmentPolicy(env) {
  const normalized = normalizeEnvironment(env);
  const isStaging = normalized === 'staging' || normalized === 'stage' || normalized === 'stg';
  const isDevelopment = normalized === 'development' || normalized === 'develop' || normalized === 'dev';

  return {
    severity: (severity) => {
      if (isStaging && severity === 'critical') return 'warning';
      if (isDevelopment && severity === 'critical') return 'warning';
      return severity;
    },
    threshold: (threshold, type) => {
      if (type === 'success_rate_degradation') return threshold;
      if (isStaging) return Math.max(threshold, threshold * 2);
      if (isDevelopment) return Math.max(threshold, threshold * 3);
      return threshold;
    },
    timeframe: (minutes) => {
      if (isStaging) return Math.max(minutes, Math.round(minutes * 1.5));
      if (isDevelopment) return Math.max(minutes, minutes * 2);
      return minutes;
    },
    cooldown: (minutes) => {
      if (isStaging) return Math.max(minutes, minutes * 2);
      if (isDevelopment) return Math.max(minutes, minutes * 4);
      return minutes;
    },
    durationSpike: (percent) => {
      if (isStaging) return Math.max(percent, Math.round(percent * 1.25));
      if (isDevelopment) return Math.max(percent, Math.round(percent * 1.5));
      return percent;
    },
    enabledByDefault: !isDevelopment
  };
}

function applyEnvironmentRuntimePolicy(rule) {
  const environmentPolicy = getEnvironmentPolicy(rule.env);

  return {
    ...rule,
    severity: environmentPolicy.severity(rule.severity),
    threshold: environmentPolicy.threshold(Number(rule.threshold || 0), rule.type),
    timeframe_minutes: environmentPolicy.timeframe(Number(rule.timeframe_minutes || 5)),
    cooldown_minutes: environmentPolicy.cooldown(Number(rule.cooldown_minutes || 10)),
    duration_spike_percent: rule.duration_spike_percent
      ? environmentPolicy.durationSpike(Number(rule.duration_spike_percent))
      : rule.duration_spike_percent
  };
}

function addRuleScope(filters, values, rule, tableName = 'cron_logs') {
  const prefix = tableName ? `${tableName}.` : '';

  if (rule.cron_name) {
    filters.push(`${prefix}cron_name = ?`);
    values.push(rule.cron_name);
  }

  if (rule.env) {
    filters.push(`${prefix}env = ?`);
    values.push(rule.env);
  }

  if (rule.service_group) {
    filters.push(`${prefix}service_group = ?`);
    values.push(rule.service_group);
  }
}

function selectScopeFields() {
  return 'cron_name, env, service_group';
}

function groupScopeFields() {
  return 'cron_name, env, service_group';
}

function ruleChannels(rule) {
  return parseChannels(rule.channels);
}

function alertKey(rule, cronName, env, serviceGroup) {
  return `${rule.id}:${rule.type}:${cronName || 'global'}:${env || rule.env || 'all-env'}:${serviceGroup || rule.service_group || 'all-service'}`;
}

function nowIso() {
  return new Date().toISOString();
}

function telegramChatIds() {
  return String(process.env.TELEGRAM_CHAT_ID || '')
    .split(',')
    .map((chatId) => chatId.trim())
    .filter(Boolean);
}

function normalizeTelegramTopicId(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const topicId = Number(value);
  return Number.isFinite(topicId) && topicId > 0 ? topicId : null;
}

function telegramTopicIdForSeverity(severity) {
  const normalizedSeverity = String(severity || '').toUpperCase();
  const severityTopic = normalizeTelegramTopicId(process.env[`TELEGRAM_${normalizedSeverity}_TOPIC_ID`]);

  return severityTopic
    || normalizeTelegramTopicId(process.env.TELEGRAM_TOPIC_ID)
    || normalizeTelegramTopicId(process.env.TELEGRAM_MESSAGE_THREAD_ID);
}

function severityIcon(severity) {
  return {
    info: '🔵',
    warning: '🟠',
    critical: '🔴'
  }[severity] || '⚪';
}

function stateIcon(state) {
  return {
    active: '🚨',
    acknowledged: '👀',
    resolved: '✅',
    test: '🧪'
  }[state] || '📡';
}

function escapeTelegramHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

async function getAlertContext(alert, rule) {
  const values = [Number(rule.timeframe_minutes || 5)];
  const filters = [];

  if (alert.cron_name) {
    filters.push('cron_name = ?');
    values.push(alert.cron_name);
  }

  if (alert.env) {
    filters.push('env = ?');
    values.push(alert.env);
  }

  if (alert.service_group) {
    filters.push('service_group = ?');
    values.push(alert.service_group);
  }

  const scopeFilter = filters.length ? `AND ${filters.join(' AND ')}` : '';

  const [[metrics]] = await alertQuery({ operation: 'select_alert_context', table: 'cron_logs', rule }, `
    SELECT
      COUNT(*) AS total_runs,
      SUM(status = 1) AS failed_count,
      SUM(status = 2) AS warning_count,
      CASE WHEN COUNT(*) = 0 THEN 0 ELSE ROUND((SUM(status = 0) / COUNT(*)) * 100, 2) END AS success_rate,
      MAX(server) AS server,
      MAX(env) AS env,
      MAX(service_group) AS service_group,
      DATE_FORMAT(CONVERT_TZ(MAX(timestamp), '${UTC_SQL_TIMEZONE}', '${JAKARTA_SQL_TIMEZONE}'), '%Y-%m-%d %H:%i:%s') AS last_run_wib
    FROM cron_logs
    WHERE timestamp >= UTC_TIMESTAMP() - INTERVAL ? MINUTE
      ${scopeFilter}
  `, values);

  return metrics || {};
}

async function buildTelegramMessage(alert, rule, lifecycle = 'triggered') {
  const context = await getAlertContext(alert, rule);
  const title = lifecycle === 'resolved'
    ? 'NYX Alert Resolved'
    : lifecycle === 'test'
      ? 'NYX Test Notification'
      : alert.escalated
        ? 'NYX Critical Escalation'
        : 'NYX Alert Triggered';
  const state = lifecycle === 'resolved' ? 'resolved' : lifecycle === 'test' ? 'test' : alert.state;
  const timestamp = context.last_run_wib || nowIso();

  return [
    `${stateIcon(state)} <b>${escapeTelegramHtml(title)}</b>`,
    '',
    `${severityIcon(alert.severity)} <b>Severity:</b> ${escapeTelegramHtml(alert.severity || 'unknown')}`,
    `📌 <b>Rule:</b> ${escapeTelegramHtml(rule.name || alert.type)}`,
    `🧭 <b>Cron:</b> ${escapeTelegramHtml(alert.cron_name || 'all monitored cron jobs')}`,
    `🖥️ <b>Server:</b> ${escapeTelegramHtml(context.server || '-')}`,
    `🏷️ <b>Env:</b> ${escapeTelegramHtml(context.env || '-')}`,
    `🧩 <b>Service:</b> ${escapeTelegramHtml(context.service_group || '-')}`,
    '',
    `❌ <b>Failures:</b> ${Number(context.failed_count || 0)}`,
    `⚠️ <b>Warnings:</b> ${Number(context.warning_count || 0)}`,
    `📈 <b>Success rate:</b> ${Number(context.success_rate || 0)}%`,
    '',
    `🧾 <b>Reason:</b> ${escapeTelegramHtml(alert.reason)}`,
    `🕒 <b>Timestamp:</b> ${escapeTelegramHtml(timestamp)} WIB`
  ].join('\n');
}

async function sendTelegram(text, { severity } = {}) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatIds = telegramChatIds();
  const topicId = telegramTopicIdForSeverity(severity);

  if (!token || chatIds.length === 0) {
    return { sent: false, error: 'Telegram credentials are not configured' };
  }

  const results = await Promise.all(chatIds.map(async (chatId) => {
    const basePayload = {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true
    };
    const payload = { ...basePayload };

    if (topicId) {
      payload.message_thread_id = topicId;
    }

    let response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok && topicId) {
      response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(basePayload)
      });
    }

    if (!response.ok) {
      const responseText = await response.text();
      throw new Error(`Telegram API ${response.status}: ${responseText.slice(0, 300)}`);
    }

    return response.json();
  }));

  return { sent: true, count: results.length, topic_id: topicId };
}

async function sendWebhook(url, text, flavor) {
  if (!url) {
    return;
  }

  const body = flavor === 'slack'
    ? { text }
    : { content: text };

  await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
}

async function notifyAlert(app, alert, rule, lifecycle = 'triggered') {
  const channels = ruleChannels(rule);

  if (channels.length === 0) {
    return { sent: false, status: 'skipped', error: 'No notification channels selected' };
  }

  const text = lifecycle === 'test'
    ? [
        '🧪 <b>NYX Test Notification</b>',
        '',
        'Telegram delivery is configured correctly.',
        `🕒 <b>Timestamp:</b> ${escapeTelegramHtml(nowIso())}`
      ].join('\n')
    : await buildTelegramMessage(alert, rule, lifecycle);
  let delivered = false;
  const errors = [];

  const tasks = channels.map(async (channel) => {
    try {
      if (channel === 'telegram') {
        const result = await sendTelegram(text, { severity: alert.severity });
        delivered = delivered || Boolean(result.sent);
        if (!result.sent && result.error) {
          errors.push(result.error);
        }
      } else if (channel === 'discord') {
        await sendWebhook(process.env.DISCORD_WEBHOOK_URL, text, 'discord');
        delivered = true;
      } else if (channel === 'slack') {
        await sendWebhook(process.env.SLACK_WEBHOOK_URL, text, 'slack');
        delivered = true;
      }
    } catch (error) {
      errors.push(`${channel}: ${error.message}`);
      app.log.warn({ channel, alert_id: alert.id, error: error.message }, 'Alert notification failed');
    }
  });

  await Promise.all(tasks);
  return {
    sent: delivered,
    status: delivered ? 'success' : 'failed',
    error: errors.join('; ') || null
  };
}

async function listRules() {
  await ensureAlertSchema();

  const [rules] = await alertQuery({ operation: 'list_alert_rules', table: 'alert_rules' }, `
    SELECT id, name, type, cron_name, severity, threshold, timeframe_minutes,
      env, service_group,
      cooldown_minutes, expected_interval_minutes, duration_spike_percent,
      channels, enabled, created_at, updated_at
    FROM alert_rules
    ORDER BY enabled DESC, severity DESC, name ASC
  `);

  return rules.map((rule) => ({ ...rule, channels: ruleChannels(rule), enabled: Boolean(rule.enabled) }));
}

async function evaluateThresholdRule(rule, status) {
  const values = [Number(rule.timeframe_minutes || 5)];
  const filters = ['timestamp >= UTC_TIMESTAMP() - INTERVAL ? MINUTE'];
  addRuleScope(filters, values, rule);

  values.push(status, Number(rule.threshold || 1));

  const [rows] = await alertQuery({ operation: 'evaluate_threshold_rule', table: 'cron_logs', rule }, `
    SELECT ${selectScopeFields()}, COUNT(*) AS metric
    FROM cron_logs
    WHERE ${filters.join(' AND ')}
      AND status = ?
    GROUP BY ${groupScopeFields()}
    HAVING metric >= ?
  `, values);

  return rows.map((row) => ({
    cron_name: row.cron_name,
    env: row.env,
    service_group: row.service_group,
    metric: Number(row.metric || 0),
    reason: `${row.cron_name} recorded ${row.metric} ${status === 1 ? 'failed' : 'warning'} executions within ${rule.timeframe_minutes} minutes`
  }));
}

async function evaluateSuccessRateRule(rule) {
  const values = [Number(rule.timeframe_minutes || 5)];
  const filters = ['timestamp >= UTC_TIMESTAMP() - INTERVAL ? MINUTE'];
  addRuleScope(filters, values, rule);

  values.push(Number(rule.threshold || 80));

  const [rows] = await alertQuery({ operation: 'evaluate_success_rate_rule', table: 'cron_logs', rule }, `
    SELECT ${selectScopeFields()}, COUNT(*) AS total_runs,
      ROUND((SUM(status = 0) / COUNT(*)) * 100, 2) AS success_rate
    FROM cron_logs
    WHERE ${filters.join(' AND ')}
    GROUP BY ${groupScopeFields()}
    HAVING total_runs > 0 AND success_rate < ?
  `, values);

  return rows.map((row) => ({
    cron_name: row.cron_name,
    env: row.env,
    service_group: row.service_group,
    metric: Number(row.success_rate || 0),
    reason: `${row.cron_name} success rate dropped to ${row.success_rate}% within ${rule.timeframe_minutes} minutes`
  }));
}

async function evaluateDurationAnomalyRule(rule) {
  const timeframe = Number(rule.timeframe_minutes || 5);
  const spikePercent = Number(rule.duration_spike_percent || rule.threshold || 300);
  const multiplier = 1 + (spikePercent / 100);
  const values = [timeframe];
  const recentFilters = ['timestamp >= UTC_TIMESTAMP() - INTERVAL ? MINUTE'];
  addRuleScope(recentFilters, values, rule);
  values.push(timeframe);
  const baselineFilters = [
    'timestamp < UTC_TIMESTAMP() - INTERVAL ? MINUTE',
    'timestamp >= UTC_TIMESTAMP() - INTERVAL 1 DAY'
  ];
  addRuleScope(baselineFilters, values, rule);
  values.push(multiplier);

  const [rows] = await alertQuery({ operation: 'evaluate_duration_anomaly_rule', table: 'cron_logs', rule }, `
    WITH recent AS (
      SELECT ${selectScopeFields()}, AVG(duration) AS recent_avg, COUNT(*) AS recent_runs
      FROM cron_logs
      WHERE ${recentFilters.join(' AND ')}
      GROUP BY ${groupScopeFields()}
    ),
    baseline AS (
      SELECT ${selectScopeFields()}, AVG(duration) AS baseline_avg
      FROM cron_logs
      WHERE ${baselineFilters.join(' AND ')}
      GROUP BY ${groupScopeFields()}
    )
    SELECT recent.cron_name, recent.env, recent.service_group, ROUND(recent.recent_avg, 2) AS recent_avg,
      ROUND(baseline.baseline_avg, 2) AS baseline_avg
    FROM recent
    INNER JOIN baseline ON baseline.cron_name = recent.cron_name
      AND baseline.env <=> recent.env
      AND baseline.service_group <=> recent.service_group
    WHERE baseline.baseline_avg > 0
      AND recent.recent_runs > 0
      AND recent.recent_avg >= baseline.baseline_avg * ?
  `, values);

  return rows.map((row) => ({
    cron_name: row.cron_name,
    env: row.env,
    service_group: row.service_group,
    metric: Number(row.recent_avg || 0),
    reason: `${row.cron_name} duration spiked to ${row.recent_avg}ms from ${row.baseline_avg}ms baseline`
  }));
}

async function evaluateRetryStormRule(rule) {
  const values = [Number(rule.timeframe_minutes || 5)];
  const filters = ['timestamp >= UTC_TIMESTAMP() - INTERVAL ? MINUTE'];
  addRuleScope(filters, values, rule);

  values.push(Number(rule.threshold || 3));

  const [rows] = await alertQuery({ operation: 'evaluate_retry_storm_rule', table: 'cron_logs', rule }, `
    SELECT ${selectScopeFields()}, COUNT(*) AS retry_count
    FROM cron_logs
    WHERE ${filters.join(' AND ')}
      AND (
        retry_logs IS NOT NULL
        OR output REGEXP 'retry|retrying|attempt'
        OR stderr REGEXP 'retry|retrying|attempt'
      )
    GROUP BY ${groupScopeFields()}
    HAVING retry_count >= ?
  `, values);

  return rows.map((row) => ({
    cron_name: row.cron_name,
    env: row.env,
    service_group: row.service_group,
    metric: Number(row.retry_count || 0),
    reason: `${row.cron_name} recorded ${row.retry_count} retry-related executions within ${rule.timeframe_minutes} minutes`
  }));
}

async function evaluateSilenceRule(rule) {
  const expected = Number(rule.expected_interval_minutes || rule.threshold || 60);
  const values = [];
  const filters = [];
  addRuleScope(filters, values, rule);
  values.push(expected);
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  const [rows] = await alertQuery({ operation: 'evaluate_silence_rule', table: 'cron_logs', rule }, `
    SELECT ${selectScopeFields()},
      DATE_FORMAT(CONVERT_TZ(MAX(timestamp), '${UTC_SQL_TIMEZONE}', '${JAKARTA_SQL_TIMEZONE}'), '%Y-%m-%d %H:%i:%s') AS last_run,
      TIMESTAMPDIFF(MINUTE, MAX(timestamp), UTC_TIMESTAMP()) AS silent_minutes
    FROM cron_logs
    ${where}
    GROUP BY ${groupScopeFields()}
    HAVING silent_minutes >= ?
  `, values);

  return rows.map((row) => ({
    cron_name: row.cron_name,
    env: row.env,
    service_group: row.service_group,
    metric: Number(row.silent_minutes || 0),
    reason: `${row.cron_name} has been silent for ${row.silent_minutes} minutes; last run was ${row.last_run || 'unknown'} WIB`
  }));
}

async function evaluateRule(rule) {
  if (rule.type === 'failed_threshold') {
    return evaluateThresholdRule(rule, 1);
  }

  if (rule.type === 'warning_threshold') {
    return evaluateThresholdRule(rule, 2);
  }

  if (rule.type === 'success_rate_degradation') {
    return evaluateSuccessRateRule(rule);
  }

  if (rule.type === 'duration_anomaly') {
    return evaluateDurationAnomalyRule(rule);
  }

  if (rule.type === 'retry_storm') {
    return evaluateRetryStormRule(rule);
  }

  if (rule.type === 'cron_silence') {
    return evaluateSilenceRule(rule);
  }

  return [];
}

async function upsertAlert(app, rule, trigger) {
  const key = alertKey(rule, trigger.cron_name, trigger.env, trigger.service_group);
  const [[existing]] = await alertQuery(
    { operation: 'find_existing_alert_event', table: 'alert_events', rule },
    `SELECT id, state, severity, last_notified_at
     FROM alert_events
     WHERE alert_key = ?
     LIMIT 1`,
    [key]
  );

  if (!existing) {
    const [result] = await alertQuery({ operation: 'insert_alert_event', table: 'alert_events', rule }, `
      INSERT INTO alert_events
        (rule_id, alert_key, cron_name, env, service_group, type, severity, reason, state, triggered_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', UTC_TIMESTAMP())
    `, [rule.id, key, trigger.cron_name, trigger.env || rule.env || null, trigger.service_group || rule.service_group || null, rule.type, rule.severity, trigger.reason]);

    const alert = {
      id: result.insertId,
      rule_id: rule.id,
      cron_name: trigger.cron_name,
      env: trigger.env || rule.env || null,
      service_group: trigger.service_group || rule.service_group || null,
      type: rule.type,
      severity: rule.severity,
      reason: trigger.reason,
      state: 'active'
    };

    await maybeNotify(app, alert, rule, null, 'triggered');
    return alert;
  }

  const escalated = existing.severity !== 'critical' && rule.severity === 'critical';
  const reactivated = existing.state === 'resolved';
  await alertQuery({ operation: 'update_alert_event', table: 'alert_events', rule, alert_id: existing.id }, `
    UPDATE alert_events
    SET reason = ?,
      env = ?,
      service_group = ?,
      severity = ?,
      state = CASE WHEN state = 'resolved' THEN 'active' ELSE state END,
      triggered_at = CASE WHEN state = 'resolved' THEN UTC_TIMESTAMP() ELSE triggered_at END,
      resolved_at = NULL,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [trigger.reason, trigger.env || rule.env || null, trigger.service_group || rule.service_group || null, rule.severity, existing.id]);

  const alert = {
    id: existing.id,
    rule_id: rule.id,
    cron_name: trigger.cron_name,
    env: trigger.env || rule.env || null,
    service_group: trigger.service_group || rule.service_group || null,
    type: rule.type,
    severity: rule.severity,
    reason: trigger.reason,
    state: reactivated ? 'active' : existing.state,
    escalated
  };

  if (reactivated || escalated) {
    await maybeNotify(app, alert, rule, existing.last_notified_at, escalated ? 'escalated' : 'triggered');
  }

  return alert;
}

async function updateNotificationStatus(alertId, result) {
  await alertQuery({ operation: 'update_alert_notification_status', table: 'alert_events', alert_id: alertId }, `
    UPDATE alert_events
    SET last_notification_status = ?,
      last_notification_error = ?,
      last_notified_at = CASE WHEN ? = 'success' THEN UTC_TIMESTAMP() ELSE last_notified_at END,
      notification_count = CASE WHEN ? = 'success' THEN notification_count + 1 ELSE notification_count END,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [
    result.status,
    result.error ? String(result.error).slice(0, 1000) : null,
    result.status,
    result.status,
    alertId
  ]);
}

async function maybeNotify(app, alert, rule, lastNotifiedAt, lifecycle = 'triggered') {
  const cooldown = Number(rule.cooldown_minutes || 10) * 60 * 1000;
  const last = lastNotifiedAt ? new Date(lastNotifiedAt).getTime() : 0;

  if (lifecycle === 'triggered' && last && Date.now() - last < cooldown) {
    return;
  }

  const result = await notifyAlert(app, alert, rule, lifecycle === 'escalated' ? 'triggered' : lifecycle);
  await updateNotificationStatus(alert.id, result);
}

export async function evaluateAlerts(app) {
  const rules = (await listRules()).filter((rule) => rule.enabled && rule.type !== 'missing_cron');
  const activeKeys = new Set();
  const alerts = [];

  for (const rule of rules) {
    const effectiveRule = applyEnvironmentRuntimePolicy(rule);
    const triggers = await evaluateRule(effectiveRule);

    for (const trigger of triggers) {
      const key = alertKey(effectiveRule, trigger.cron_name, trigger.env, trigger.service_group);
      activeKeys.add(key);
      alerts.push(await upsertAlert(app, effectiveRule, trigger));
    }
  }

  if (rules.length > 0) {
    const ruleIds = rules.map((rule) => rule.id);
    const [activeRows] = await alertQuery(
      { operation: 'list_active_alert_events_for_resolution', table: 'alert_events' },
      `SELECT id, alert_key
       FROM alert_events
       WHERE state IN ('active', 'acknowledged')
         AND rule_id IN (${ruleIds.map(() => '?').join(',')})`,
      ruleIds
    );

    const resolvedIds = activeRows
      .filter((row) => !activeKeys.has(row.alert_key))
      .map((row) => row.id);

    if (resolvedIds.length > 0) {
      const [resolvedAlerts] = await alertQuery({ operation: 'load_resolved_alert_events', table: 'alert_events' }, `
        SELECT alert_events.id, alert_events.rule_id, alert_rules.name AS rule_name,
          alert_rules.channels, alert_rules.cooldown_minutes,
          alert_events.cron_name, alert_events.type, alert_events.severity,
          alert_events.env, alert_events.service_group,
          alert_events.reason, alert_events.state
        FROM alert_events
        INNER JOIN alert_rules ON alert_rules.id = alert_events.rule_id
        WHERE alert_events.id IN (${resolvedIds.map(() => '?').join(',')})
      `, resolvedIds);

      await alertQuery(
        { operation: 'resolve_alert_events', table: 'alert_events' },
        `UPDATE alert_events
         SET state = 'resolved',
           resolved_at = UTC_TIMESTAMP(),
           updated_at = CURRENT_TIMESTAMP
         WHERE id IN (${resolvedIds.map(() => '?').join(',')})`,
        resolvedIds
      );

      for (const resolvedAlert of resolvedAlerts) {
        const rule = {
          id: resolvedAlert.rule_id,
          name: resolvedAlert.rule_name,
          channels: resolvedAlert.channels,
          cooldown_minutes: resolvedAlert.cooldown_minutes,
          timeframe_minutes: 5
        };
        await maybeNotify(app, { ...resolvedAlert, state: 'resolved' }, rule, null, 'resolved');
        await logAudit({
          user: { email: 'system@nyx' },
          action: 'alert_resolved',
          targetType: 'alert',
          targetId: resolvedAlert.id,
          targetLabel: resolvedAlert.cron_name || resolvedAlert.reason
        });
      }
    }
  }

  return alerts;
}

export async function evaluateAlertsSafely(app, context = {}) {
  try {
    await evaluateAlerts(app);
  } catch (error) {
    const logPayload = {
      err: error,
      error: error.message,
      code: error.code,
      errno: error.errno,
      sql_state: error.sqlState,
      stack: error.stack,
      endpoint: context.endpoint,
      phase: context.phase,
      query_context: error.alertQueryContext
    };

    if (shouldLogEvaluationFailure(error)) {
      app.log.warn(logPayload, 'Alert evaluation failed');
    } else {
      app.log.debug(logPayload, 'Alert evaluation failure suppressed by throttle');
    }
  }
}

export async function getAlertRules() {
  return listRules();
}

export async function createAlertRule(payload) {
  await ensureAlertSchema();

  const rule = normalizeRulePayload(payload);
  const enabled = typeof payload.enabled === 'boolean'
    ? payload.enabled
    : getEnvironmentPolicy(rule.env).enabledByDefault;
  const [result] = await alertQuery({ operation: 'insert_alert_rule', table: 'alert_rules', rule }, `
    INSERT INTO alert_rules
      (name, type, cron_name, env, service_group, severity, threshold, timeframe_minutes,
       cooldown_minutes, expected_interval_minutes, duration_spike_percent, channels, enabled)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    rule.name,
    rule.type,
    rule.cron_name,
    rule.env,
    rule.service_group,
    rule.severity,
    rule.threshold,
    rule.timeframe_minutes,
    rule.cooldown_minutes,
    rule.expected_interval_minutes,
    rule.duration_spike_percent,
    JSON.stringify(rule.channels),
    enabled ? 1 : 0
  ]);

  return { id: result.insertId, ...rule, enabled };
}

export async function updateAlertRule(id, payload) {
  await ensureAlertSchema();

  const rule = normalizeRulePayload(payload);
  await alertQuery({ operation: 'update_alert_rule', table: 'alert_rules', rule }, `
    UPDATE alert_rules
    SET name = ?, type = ?, cron_name = ?, env = ?, service_group = ?, severity = ?, threshold = ?,
      timeframe_minutes = ?, cooldown_minutes = ?, expected_interval_minutes = ?,
      duration_spike_percent = ?, channels = ?, enabled = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [
    rule.name,
    rule.type,
    rule.cron_name,
    rule.env,
    rule.service_group,
    rule.severity,
    rule.threshold,
    rule.timeframe_minutes,
    rule.cooldown_minutes,
    rule.expected_interval_minutes,
    rule.duration_spike_percent,
    JSON.stringify(rule.channels),
    payload.enabled === false ? 0 : 1,
    id
  ]);

  return { id, ...rule, enabled: payload.enabled !== false };
}

export async function listAlerts({ state = 'active', env, service_group, limit = 50, offset = 0 } = {}) {
  await ensureAlertSchema();

  const values = [];
  const filters = [];
  const safeLimit = Math.min(Math.max(Number(limit || 50), 1), 501);
  const safeOffset = Math.max(Number(offset || 0), 0);

  if (state && state !== 'all') {
    filters.push('alert_events.state = ?');
    values.push(state);
  }

  if (env) {
    filters.push('alert_events.env = ?');
    values.push(env);
  }

  if (service_group) {
    filters.push('alert_events.service_group = ?');
    values.push(service_group);
  }

  values.push(safeLimit, safeOffset);

  const where = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';
  const [rows] = await alertQuery({ operation: 'list_alert_events', table: 'alert_events' }, `
    SELECT alert_events.id, alert_events.rule_id, alert_rules.name AS rule_name,
      alert_events.cron_name, alert_events.type, alert_events.severity,
      alert_events.env, alert_events.service_group,
      alert_events.reason, alert_events.state,
      DATE_FORMAT(CONVERT_TZ(alert_events.triggered_at, '${UTC_SQL_TIMEZONE}', '${JAKARTA_SQL_TIMEZONE}'), '%Y-%m-%d %H:%i:%s') AS triggered_at,
      DATE_FORMAT(CONVERT_TZ(alert_events.acknowledged_at, '${UTC_SQL_TIMEZONE}', '${JAKARTA_SQL_TIMEZONE}'), '%Y-%m-%d %H:%i:%s') AS acknowledged_at,
      DATE_FORMAT(CONVERT_TZ(alert_events.resolved_at, '${UTC_SQL_TIMEZONE}', '${JAKARTA_SQL_TIMEZONE}'), '%Y-%m-%d %H:%i:%s') AS resolved_at,
      DATE_FORMAT(CONVERT_TZ(alert_events.last_notified_at, '${UTC_SQL_TIMEZONE}', '${JAKARTA_SQL_TIMEZONE}'), '%Y-%m-%d %H:%i:%s') AS last_notified_at,
      alert_events.notification_count,
      alert_events.last_notification_status,
      alert_events.last_notification_error,
      ${JAKARTA_NOW_SQL} AS now_wib
    FROM alert_events
    INNER JOIN alert_rules ON alert_rules.id = alert_events.rule_id
    ${where}
    ORDER BY alert_events.triggered_at DESC, alert_events.id DESC
    LIMIT ? OFFSET ?
  `, values);

  return rows;
}

export async function acknowledgeAlert(id) {
  await ensureAlertSchema();

  await alertQuery({ operation: 'acknowledge_alert_event', table: 'alert_events', alert_id: id }, `
    UPDATE alert_events
    SET state = 'acknowledged',
      acknowledged_at = UTC_TIMESTAMP(),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND state = 'active'
  `, [id]);
}

export async function sendTestTelegramNotification(app) {
  const result = await notifyAlert(
    app,
    {
      id: 0,
      cron_name: 'nyx-test-cron',
      severity: 'info',
      reason: 'Manual test notification from NYX Alert Configuration',
      state: 'test',
      type: 'test'
    },
    {
      name: 'Telegram delivery test',
      channels: ['telegram'],
      timeframe_minutes: 5
    },
    'test'
  );

  return result;
}
