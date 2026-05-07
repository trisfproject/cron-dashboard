'use client';

import { useEffect, useState } from 'react';
import { createAlertRule, getAlertRules, sendTestTelegramNotification, updateAlertRule } from '@/lib/api';

const defaultRule = {
  name: '',
  type: 'failed_threshold',
  cron_name: '',
  severity: 'warning',
  threshold: 3,
  timeframe_minutes: 5,
  cooldown_minutes: 10,
  expected_interval_minutes: '',
  duration_spike_percent: '',
  channels: ['telegram'],
  enabled: true
};

const ruleTypes = [
  ['failed_threshold', 'Failed execution threshold'],
  ['warning_threshold', 'Warning threshold'],
  ['success_rate_degradation', 'Success rate degradation'],
  ['duration_anomaly', 'Duration anomaly'],
  ['retry_storm', 'Retry storm detection'],
  ['cron_silence', 'Cron silence detection']
];

export default function AlertConfigPage() {
  const [rules, setRules] = useState([]);
  const [form, setForm] = useState(defaultRule);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [testStatus, setTestStatus] = useState('');
  const [testLoading, setTestLoading] = useState(false);

  async function loadRules() {
    try {
      const data = await getAlertRules();
      setRules(Array.isArray(data?.rules) ? data.rules : []);
    } catch (fetchError) {
      setError(fetchError?.message || 'Failed to load alert rules');
    }
  }

  useEffect(() => {
    loadRules();
  }, []);

  function updateField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function toggleChannel(channel) {
    setForm((current) => {
      const channels = current.channels.includes(channel)
        ? current.channels.filter((item) => item !== channel)
        : [...current.channels, channel];

      return { ...current, channels };
    });
  }

  function editRule(rule) {
    setEditingId(rule.id);
    setForm({
      ...defaultRule,
      ...rule,
      cron_name: rule.cron_name || '',
      expected_interval_minutes: rule.expected_interval_minutes || '',
      duration_spike_percent: rule.duration_spike_percent || '',
      channels: Array.isArray(rule.channels) ? rule.channels : []
    });
  }

  async function saveRule(event) {
    event.preventDefault();
    setError('');

    const payload = {
      ...form,
      threshold: Number(form.threshold || 1),
      timeframe_minutes: Number(form.timeframe_minutes || 5),
      cooldown_minutes: Number(form.cooldown_minutes || 10),
      expected_interval_minutes: form.expected_interval_minutes ? Number(form.expected_interval_minutes) : undefined,
      duration_spike_percent: form.duration_spike_percent ? Number(form.duration_spike_percent) : undefined
    };

    try {
      if (editingId) {
        await updateAlertRule(editingId, payload);
      } else {
        await createAlertRule(payload);
      }

      setForm(defaultRule);
      setEditingId(null);
      await loadRules();
    } catch (saveError) {
      setError(saveError?.message || 'Failed to save alert rule');
    }
  }

  async function testTelegram() {
    setTestLoading(true);
    setTestStatus('');
    setError('');

    try {
      const result = await sendTestTelegramNotification();
      setTestStatus(result?.status === 'success'
        ? 'Telegram test notification delivered successfully.'
        : `Telegram test notification was not delivered: ${result?.error || 'unknown error'}`);
    } catch (testError) {
      setTestStatus(`Telegram test notification failed: ${testError?.message || 'unknown error'}`);
    } finally {
      setTestLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal text-ink">Alert Configuration</h1>
        <p className="mt-1 text-sm text-slate-500">Configure thresholds, cooldowns, and notification channels. Webhook secrets stay in environment variables.</p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-ink">Telegram Delivery</h2>
            <p className="mt-1 text-sm text-slate-500">Sends a safe test message using TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID from the backend environment.</p>
          </div>
          <button
            type="button"
            onClick={testTelegram}
            disabled={testLoading}
            className="inline-flex min-h-10 items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300 dark:bg-blue-600 dark:hover:bg-blue-500"
          >
            {testLoading ? 'Sending...' : 'Send Test Notification'}
          </button>
        </div>
        {testStatus ? (
          <p className={`mt-3 rounded-md p-3 text-sm ${
            testStatus.includes('successfully')
              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200'
              : 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-200'
          }`}
          >
            {testStatus}
          </p>
        ) : null}
      </section>

      <form onSubmit={saveRule} className="grid gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-2">
        {error ? <div className="rounded-md bg-rose-50 p-3 text-sm text-rose-700 md:col-span-2">{error}</div> : null}
        <label className="space-y-1">
          <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Rule name</span>
          <input value={form.name} onChange={(event) => updateField('name', event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950" required />
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Type</span>
          <select value={form.type} onChange={(event) => updateField('type', event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950">
            {ruleTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Cron name scope</span>
          <input value={form.cron_name} onChange={(event) => updateField('cron_name', event.target.value)} placeholder="Leave blank for all cron jobs" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950" />
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Severity</span>
          <select value={form.severity} onChange={(event) => updateField('severity', event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950">
            <option value="info">Info</option>
            <option value="warning">Warning</option>
            <option value="critical">Critical</option>
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Threshold</span>
          <input type="number" value={form.threshold} onChange={(event) => updateField('threshold', event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950" />
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Timeframe minutes</span>
          <input type="number" value={form.timeframe_minutes} onChange={(event) => updateField('timeframe_minutes', event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950" />
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Cooldown minutes</span>
          <input type="number" value={form.cooldown_minutes} onChange={(event) => updateField('cooldown_minutes', event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950" />
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Expected interval minutes</span>
          <input type="number" value={form.expected_interval_minutes} onChange={(event) => updateField('expected_interval_minutes', event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950" />
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Duration spike percent</span>
          <input type="number" value={form.duration_spike_percent} onChange={(event) => updateField('duration_spike_percent', event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950" />
        </label>
        <div className="space-y-2">
          <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Notification channels</span>
          <div className="flex flex-wrap gap-2">
            {['telegram', 'discord', 'slack'].map((channel) => (
              <button key={channel} type="button" onClick={() => toggleChannel(channel)} className={`min-h-10 rounded-md px-3 py-2 text-sm font-medium capitalize ring-1 ${form.channels.includes(channel) ? 'bg-blue-600 text-white ring-blue-600' : 'bg-white text-slate-600 ring-slate-200 dark:bg-slate-950 dark:text-slate-300 dark:ring-slate-800'}`}>
                {channel}
              </button>
            ))}
          </div>
        </div>
        <label className="flex min-h-10 items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300">
          <input type="checkbox" checked={form.enabled} onChange={(event) => updateField('enabled', event.target.checked)} />
          Enabled
        </label>
        <div className="flex flex-wrap gap-2 md:col-span-2">
          <button type="submit" className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 dark:bg-blue-600 dark:hover:bg-blue-500">
            {editingId ? 'Update rule' : 'Create rule'}
          </button>
          {editingId ? (
            <button type="button" onClick={() => { setEditingId(null); setForm(defaultRule); }} className="rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 dark:border-slate-800 dark:text-slate-200">
              Cancel
            </button>
          ) : null}
        </div>
      </form>

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-4">
          <h2 className="text-base font-semibold text-ink">Configured Rules</h2>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {rules.map((rule) => (
            <div key={rule.id} className="grid gap-3 p-4 md:grid-cols-[1fr_auto_auto] md:items-center">
              <div>
                <p className="font-medium text-ink">{rule.name}</p>
                <p className="mt-1 text-sm text-slate-500">{rule.type} · threshold {rule.threshold} · {rule.timeframe_minutes}m window · {rule.cooldown_minutes}m cooldown</p>
              </div>
              <span className={`w-fit rounded-md px-2 py-1 text-xs font-medium ring-1 ${rule.enabled ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-slate-50 text-slate-600 ring-slate-200'}`}>
                {rule.enabled ? 'Enabled' : 'Disabled'}
              </span>
              <button type="button" onClick={() => editRule(rule)} className="w-fit rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 dark:border-slate-800 dark:text-slate-200">
                Edit
              </button>
            </div>
          ))}
          {rules.length === 0 ? <div className="p-8 text-center text-sm text-slate-500">No alert rules configured.</div> : null}
        </div>
      </section>
    </div>
  );
}
