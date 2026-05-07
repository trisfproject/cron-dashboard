import { pool } from './db.js';

const JAKARTA_SQL_TIMEZONE = '+07:00';
const UTC_SQL_TIMEZONE = '+00:00';
const JAKARTA_NOW_SQL = `DATE_FORMAT(CONVERT_TZ(UTC_TIMESTAMP(), '${UTC_SQL_TIMEZONE}', '${JAKARTA_SQL_TIMEZONE}'), '%Y-%m-%d %H:%i:%s')`;

const RULE_TYPES = new Set([
  'failed_threshold',
  'warning_threshold',
  'success_rate_degradation',
  'duration_anomaly',
  'retry_storm',
  'cron_silence'
]);

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

  return {
    name: String(payload.name || type).trim(),
    type,
    cron_name: payload.cron_name ? String(payload.cron_name).trim() : null,
    severity: ['info', 'warning', 'critical'].includes(payload.severity) ? payload.severity : 'warning',
    threshold: Number(payload.threshold || (type === 'success_rate_degradation' ? 80 : 3)),
    timeframe_minutes: Number(payload.timeframe_minutes || 5),
    cooldown_minutes: Number(payload.cooldown_minutes || 10),
    expected_interval_minutes: payload.expected_interval_minutes ? Number(payload.expected_interval_minutes) : null,
    duration_spike_percent: payload.duration_spike_percent ? Number(payload.duration_spike_percent) : null,
    channels: parseChannels(payload.channels)
  };
}

function ruleChannels(rule) {
  return parseChannels(rule.channels);
}

function alertKey(rule, cronName) {
  return `${rule.id}:${rule.type}:${cronName || 'global'}`;
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
  const cronFilter = alert.cron_name ? 'AND cron_name = ?' : '';

  if (alert.cron_name) {
    values.push(alert.cron_name);
  }

  const [[metrics]] = await pool.query(`
    SELECT
      COUNT(*) AS total_runs,
      SUM(status = 1) AS failed_count,
      SUM(status = 2) AS warning_count,
      CASE WHEN COUNT(*) = 0 THEN 0 ELSE ROUND((SUM(status = 0) / COUNT(*)) * 100, 2) END AS success_rate,
      MAX(server) AS server,
      MAX(env) AS env,
      DATE_FORMAT(CONVERT_TZ(MAX(timestamp), '${UTC_SQL_TIMEZONE}', '${JAKARTA_SQL_TIMEZONE}'), '%Y-%m-%d %H:%i:%s') AS last_run_wib
    FROM cron_logs
    WHERE timestamp >= UTC_TIMESTAMP() - INTERVAL ? MINUTE
      ${cronFilter}
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
  const [rules] = await pool.query(`
    SELECT id, name, type, cron_name, severity, threshold, timeframe_minutes,
      cooldown_minutes, expected_interval_minutes, duration_spike_percent,
      channels, enabled, created_at, updated_at
    FROM alert_rules
    ORDER BY enabled DESC, severity DESC, name ASC
  `);

  return rules.map((rule) => ({ ...rule, channels: ruleChannels(rule), enabled: Boolean(rule.enabled) }));
}

async function evaluateThresholdRule(rule, status) {
  const values = [Number(rule.timeframe_minutes || 5)];
  const cronFilter = rule.cron_name ? 'AND cron_name = ?' : '';

  if (rule.cron_name) {
    values.push(rule.cron_name);
  }

  values.push(status, Number(rule.threshold || 1));

  const [rows] = await pool.query(`
    SELECT cron_name, COUNT(*) AS metric
    FROM cron_logs
    WHERE timestamp >= UTC_TIMESTAMP() - INTERVAL ? MINUTE
      ${cronFilter}
      AND status = ?
    GROUP BY cron_name
    HAVING metric >= ?
  `, values);

  return rows.map((row) => ({
    cron_name: row.cron_name,
    metric: Number(row.metric || 0),
    reason: `${row.cron_name} recorded ${row.metric} ${status === 1 ? 'failed' : 'warning'} executions within ${rule.timeframe_minutes} minutes`
  }));
}

async function evaluateSuccessRateRule(rule) {
  const values = [Number(rule.timeframe_minutes || 5)];
  const cronFilter = rule.cron_name ? 'AND cron_name = ?' : '';

  if (rule.cron_name) {
    values.push(rule.cron_name);
  }

  values.push(Number(rule.threshold || 80));

  const [rows] = await pool.query(`
    SELECT cron_name, COUNT(*) AS total_runs,
      ROUND((SUM(status = 0) / COUNT(*)) * 100, 2) AS success_rate
    FROM cron_logs
    WHERE timestamp >= UTC_TIMESTAMP() - INTERVAL ? MINUTE
      ${cronFilter}
    GROUP BY cron_name
    HAVING total_runs > 0 AND success_rate < ?
  `, values);

  return rows.map((row) => ({
    cron_name: row.cron_name,
    metric: Number(row.success_rate || 0),
    reason: `${row.cron_name} success rate dropped to ${row.success_rate}% within ${rule.timeframe_minutes} minutes`
  }));
}

async function evaluateDurationAnomalyRule(rule) {
  const timeframe = Number(rule.timeframe_minutes || 5);
  const spikePercent = Number(rule.duration_spike_percent || rule.threshold || 300);
  const multiplier = 1 + (spikePercent / 100);
  const values = rule.cron_name
    ? [timeframe, rule.cron_name, timeframe, rule.cron_name, multiplier]
    : [timeframe, timeframe, multiplier];
  const recentCronFilter = rule.cron_name ? 'AND cron_name = ?' : '';
  const baselineCronFilter = rule.cron_name ? 'AND cron_name = ?' : '';

  const [rows] = await pool.query(`
    WITH recent AS (
      SELECT cron_name, AVG(duration) AS recent_avg, COUNT(*) AS recent_runs
      FROM cron_logs
      WHERE timestamp >= UTC_TIMESTAMP() - INTERVAL ? MINUTE
        ${recentCronFilter}
      GROUP BY cron_name
    ),
    baseline AS (
      SELECT cron_name, AVG(duration) AS baseline_avg
      FROM cron_logs
      WHERE timestamp < UTC_TIMESTAMP() - INTERVAL ? MINUTE
        AND timestamp >= UTC_TIMESTAMP() - INTERVAL 1 DAY
        ${baselineCronFilter}
      GROUP BY cron_name
    )
    SELECT recent.cron_name, ROUND(recent.recent_avg, 2) AS recent_avg,
      ROUND(baseline.baseline_avg, 2) AS baseline_avg
    FROM recent
    INNER JOIN baseline ON baseline.cron_name = recent.cron_name
    WHERE baseline.baseline_avg > 0
      AND recent.recent_runs > 0
      AND recent.recent_avg >= baseline.baseline_avg * ?
  `, values);

  return rows.map((row) => ({
    cron_name: row.cron_name,
    metric: Number(row.recent_avg || 0),
    reason: `${row.cron_name} duration spiked to ${row.recent_avg}ms from ${row.baseline_avg}ms baseline`
  }));
}

async function evaluateRetryStormRule(rule) {
  const values = [Number(rule.timeframe_minutes || 5)];
  const cronFilter = rule.cron_name ? 'AND cron_name = ?' : '';

  if (rule.cron_name) {
    values.push(rule.cron_name);
  }

  values.push(Number(rule.threshold || 3));

  const [rows] = await pool.query(`
    SELECT cron_name, COUNT(*) AS retry_count
    FROM cron_logs
    WHERE timestamp >= UTC_TIMESTAMP() - INTERVAL ? MINUTE
      ${cronFilter}
      AND (
        retry_logs IS NOT NULL
        OR output REGEXP 'retry|retrying|attempt'
        OR stderr REGEXP 'retry|retrying|attempt'
      )
    GROUP BY cron_name
    HAVING retry_count >= ?
  `, values);

  return rows.map((row) => ({
    cron_name: row.cron_name,
    metric: Number(row.retry_count || 0),
    reason: `${row.cron_name} recorded ${row.retry_count} retry-related executions within ${rule.timeframe_minutes} minutes`
  }));
}

async function evaluateSilenceRule(rule) {
  const expected = Number(rule.expected_interval_minutes || rule.threshold || 60);
  const values = [expected];
  const cronFilter = rule.cron_name ? 'WHERE cron_name = ?' : '';

  if (rule.cron_name) {
    values.unshift(rule.cron_name);
  }

  const [rows] = await pool.query(`
    SELECT cron_name,
      DATE_FORMAT(CONVERT_TZ(MAX(timestamp), '${UTC_SQL_TIMEZONE}', '${JAKARTA_SQL_TIMEZONE}'), '%Y-%m-%d %H:%i:%s') AS last_run,
      TIMESTAMPDIFF(MINUTE, MAX(timestamp), UTC_TIMESTAMP()) AS silent_minutes
    FROM cron_logs
    ${cronFilter}
    GROUP BY cron_name
    HAVING silent_minutes >= ?
  `, values);

  return rows.map((row) => ({
    cron_name: row.cron_name,
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
  const key = alertKey(rule, trigger.cron_name);
  const [[existing]] = await pool.query(
    `SELECT id, state, severity, last_notified_at
     FROM alert_events
     WHERE alert_key = ?
     LIMIT 1`,
    [key]
  );

  if (!existing) {
    const [result] = await pool.query(`
      INSERT INTO alert_events
        (rule_id, alert_key, cron_name, type, severity, reason, state, triggered_at)
      VALUES (?, ?, ?, ?, ?, ?, 'active', UTC_TIMESTAMP())
    `, [rule.id, key, trigger.cron_name, rule.type, rule.severity, trigger.reason]);

    const alert = {
      id: result.insertId,
      rule_id: rule.id,
      cron_name: trigger.cron_name,
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
  await pool.query(`
    UPDATE alert_events
    SET reason = ?,
      severity = ?,
      state = CASE WHEN state = 'resolved' THEN 'active' ELSE state END,
      triggered_at = CASE WHEN state = 'resolved' THEN UTC_TIMESTAMP() ELSE triggered_at END,
      resolved_at = NULL,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [trigger.reason, rule.severity, existing.id]);

  const alert = {
    id: existing.id,
    rule_id: rule.id,
    cron_name: trigger.cron_name,
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
  await pool.query(`
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
  const rules = (await listRules()).filter((rule) => rule.enabled);
  const activeKeys = new Set();
  const alerts = [];

  for (const rule of rules) {
    const triggers = await evaluateRule(rule);

    for (const trigger of triggers) {
      const key = alertKey(rule, trigger.cron_name);
      activeKeys.add(key);
      alerts.push(await upsertAlert(app, rule, trigger));
    }
  }

  if (rules.length > 0) {
    const ruleIds = rules.map((rule) => rule.id);
    const [activeRows] = await pool.query(
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
      const [resolvedAlerts] = await pool.query(`
        SELECT alert_events.id, alert_events.rule_id, alert_rules.name AS rule_name,
          alert_rules.channels, alert_rules.cooldown_minutes,
          alert_events.cron_name, alert_events.type, alert_events.severity,
          alert_events.reason, alert_events.state
        FROM alert_events
        INNER JOIN alert_rules ON alert_rules.id = alert_events.rule_id
        WHERE alert_events.id IN (${resolvedIds.map(() => '?').join(',')})
      `, resolvedIds);

      await pool.query(
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
      }
    }
  }

  return alerts;
}

export async function evaluateAlertsSafely(app) {
  try {
    await evaluateAlerts(app);
  } catch (error) {
    app.log.warn({ error: error.message }, 'Alert evaluation failed');
  }
}

export async function getAlertRules() {
  return listRules();
}

export async function createAlertRule(payload) {
  const rule = normalizeRulePayload(payload);
  const [result] = await pool.query(`
    INSERT INTO alert_rules
      (name, type, cron_name, severity, threshold, timeframe_minutes,
       cooldown_minutes, expected_interval_minutes, duration_spike_percent, channels, enabled)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    rule.name,
    rule.type,
    rule.cron_name,
    rule.severity,
    rule.threshold,
    rule.timeframe_minutes,
    rule.cooldown_minutes,
    rule.expected_interval_minutes,
    rule.duration_spike_percent,
    JSON.stringify(rule.channels),
    payload.enabled === false ? 0 : 1
  ]);

  return { id: result.insertId, ...rule, enabled: payload.enabled !== false };
}

export async function updateAlertRule(id, payload) {
  const rule = normalizeRulePayload(payload);
  await pool.query(`
    UPDATE alert_rules
    SET name = ?, type = ?, cron_name = ?, severity = ?, threshold = ?,
      timeframe_minutes = ?, cooldown_minutes = ?, expected_interval_minutes = ?,
      duration_spike_percent = ?, channels = ?, enabled = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [
    rule.name,
    rule.type,
    rule.cron_name,
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

export async function listAlerts({ state = 'active', limit = 50 } = {}) {
  const values = [];
  const filters = [];

  if (state && state !== 'all') {
    filters.push('alert_events.state = ?');
    values.push(state);
  }

  values.push(Number(limit || 50));

  const where = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';
  const [rows] = await pool.query(`
    SELECT alert_events.id, alert_events.rule_id, alert_rules.name AS rule_name,
      alert_events.cron_name, alert_events.type, alert_events.severity,
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
    ORDER BY alert_events.triggered_at DESC
    LIMIT ?
  `, values);

  return rows;
}

export async function acknowledgeAlert(id) {
  await pool.query(`
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
