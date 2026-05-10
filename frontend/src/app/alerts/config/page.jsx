'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { EnvironmentBadge, ServiceGroupBadge } from '@/components/EnvironmentBadge';
import { createAlertRule, getAlertRules, getCronList, getCurrentUser, getScopeOptions, sendTestTelegramNotification, updateAlertRule } from '@/lib/api';

const defaultRule = {
  name: '',
  type: 'failed_threshold',
  monitoring_profile: 'standard',
  cron_name: '',
  env: '',
  service_group: '',
  severity: 'warning',
  threshold: 3,
  timeframe_minutes: 30,
  cooldown_minutes: 30,
  expected_interval_minutes: 60,
  duration_spike_percent: 250,
  channels: ['telegram'],
  enabled: true
};

const monitoringProfiles = {
  realtime_critical: {
    label: 'Realtime Critical',
    summary: 'Aggressive monitoring for high-frequency business-critical jobs.',
    cadence: 'Every 5-15 minutes',
    runtime: 'Strict runtime tolerance',
    defaults: {
      type: 'failed_threshold',
      severity: 'critical',
      threshold: 1,
      timeframe_minutes: 5,
      cooldown_minutes: 5,
      expected_interval_minutes: 5,
      duration_spike_percent: 150
    }
  },
  scheduled_daily: {
    label: 'Scheduled Daily Job',
    summary: 'Patient alerting for daily batch jobs and scheduled reports.',
    cadence: 'Once per day',
    runtime: 'Long execution allowed',
    defaults: {
      type: 'cron_silence',
      severity: 'warning',
      threshold: 1440,
      timeframe_minutes: 1440,
      cooldown_minutes: 240,
      expected_interval_minutes: 1440,
      duration_spike_percent: 400
    }
  },
  heavy_processing: {
    label: 'Heavy Processing',
    summary: 'Runtime-tolerant monitoring for long-running processing jobs.',
    cadence: 'Variable or scheduled',
    runtime: 'High runtime tolerance',
    defaults: {
      type: 'duration_anomaly',
      severity: 'warning',
      threshold: 350,
      timeframe_minutes: 120,
      cooldown_minutes: 60,
      expected_interval_minutes: 240,
      duration_spike_percent: 350
    }
  },
  standard: {
    label: 'Standard',
    summary: 'Balanced defaults for normal cron reliability monitoring.',
    cadence: 'Hourly or regular',
    runtime: 'Moderate runtime tolerance',
    defaults: {
      type: 'failed_threshold',
      severity: 'warning',
      threshold: 3,
      timeframe_minutes: 30,
      cooldown_minutes: 30,
      expected_interval_minutes: 60,
      duration_spike_percent: 250
    }
  },
  custom: {
    label: 'Custom',
    summary: 'Manual policy tuning without applying preset thresholds.',
    cadence: 'User-defined',
    runtime: 'User-defined',
    defaults: {}
  }
};

const profileOrder = ['realtime_critical', 'scheduled_daily', 'heavy_processing', 'standard', 'custom'];

const ruleTypes = [
  ['failed_threshold', 'Failed execution threshold'],
  ['warning_threshold', 'Warning threshold'],
  ['success_rate_degradation', 'Success rate degradation'],
  ['duration_anomaly', 'Duration anomaly'],
  ['retry_storm', 'Retry storm detection'],
  ['cron_silence', 'Cron silence detection']
];

function formatMinutes(value) {
  const minutes = Number(value || 0);

  if (!minutes) {
    return 'No data';
  }

  if (minutes < 60) {
    return `${Math.round(minutes)}m`;
  }

  if (minutes < 1440) {
    const hours = minutes / 60;
    return `${Number.isInteger(hours) ? hours : hours.toFixed(1)}h`;
  }

  const days = minutes / 1440;
  return `${Number.isInteger(days) ? days : days.toFixed(1)}d`;
}

function formatRuntime(ms) {
  const value = Number(ms || 0);

  if (!value) {
    return 'No data';
  }

  const seconds = Math.round(value / 1000);

  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes < 60) {
    return remainingSeconds ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

function getCronBehavior(cronJobs, cronName, env, serviceGroup) {
  const selected = String(cronName || '').trim();
  const matchingJobs = Array.isArray(cronJobs)
    ? cronJobs.filter((job) => {
      const matchesName = !selected || job?.cron_name === selected;
      const matchesEnv = !env || job?.env === env;
      const matchesService = !serviceGroup || job?.service_group === serviceGroup;
      return matchesName && matchesEnv && matchesService;
    })
    : [];
  const totalRuns = matchingJobs.reduce((sum, job) => sum + Number(job?.total_runs || 0), 0);
  const weightedDuration = matchingJobs.reduce((sum, job) => {
    return sum + (Number(job?.avg_duration || 0) * Number(job?.total_runs || 0));
  }, 0);
  const avgDuration = totalRuns ? weightedDuration / totalRuns : 0;
  const avgIntervalMinutes = totalRuns ? (30 * 24 * 60) / totalRuns : 0;
  const suggestedMaxRuntime = avgDuration ? avgDuration * 2.5 : 0;

  return {
    totalRuns,
    avgDuration,
    avgIntervalMinutes,
    suggestedMaxRuntime,
    jobCount: matchingJobs.length
  };
}

export default function AlertConfigPage() {
  const router = useRouter();
  const [rules, setRules] = useState([]);
  const [cronJobs, setCronJobs] = useState([]);
  const [scopeOptions, setScopeOptions] = useState({ environments: [], service_groups: [] });
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

  async function loadCronContext() {
    try {
      const data = await getCronList({ range: '30d' });
      setCronJobs(Array.isArray(data?.jobs) ? data.jobs : []);
    } catch (fetchError) {
      console.error('Failed to load cron behavior context:', fetchError);
    }
  }

  useEffect(() => {
    let cancelled = false;

    getCurrentUser()
      .then((data) => {
        if (cancelled) return;

        if (data?.user?.role !== 'admin') {
          router.replace('/alerts');
          return;
        }

        loadRules();
        loadCronContext();
        getScopeOptions()
          .then((scopeData) => {
            if (cancelled) return;
            setScopeOptions({
              environments: Array.isArray(scopeData?.environments) ? scopeData.environments : [],
              service_groups: Array.isArray(scopeData?.service_groups) ? scopeData.service_groups : []
            });
          })
          .catch((scopeError) => console.error('Failed to load scope options:', scopeError));
      })
      .catch(() => router.replace('/alerts'));

    return () => {
      cancelled = true;
    };
  }, [router]);

  function updateField(key, value) {
    setForm((current) => {
      const normalizedEnv = key === 'env' ? String(value || '').toLowerCase() : '';
      const shouldDefaultSilent = ['development', 'develop', 'dev'].includes(normalizedEnv);

      return {
        ...current,
        [key]: value,
        ...(shouldDefaultSilent ? { enabled: false } : {})
      };
    });
  }

  function applyMonitoringProfile(profileKey) {
    const profile = monitoringProfiles[profileKey] || monitoringProfiles.standard;

    setForm((current) => ({
      ...current,
      monitoring_profile: profileKey,
      ...(profileKey === 'custom' ? {} : profile.defaults)
    }));
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
      monitoring_profile: rule.monitoring_profile || 'custom',
      cron_name: rule.cron_name || '',
      env: rule.env || '',
      service_group: rule.service_group || '',
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

  const selectedProfile = monitoringProfiles[form.monitoring_profile] || monitoringProfiles.standard;
  const cronBehavior = getCronBehavior(cronJobs, form.cron_name, form.env, form.service_group);
  const scopedCronNames = [...new Set(cronJobs.map((job) => job?.cron_name).filter(Boolean))].sort();

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
        <section className="space-y-4 md:col-span-2">
          <div>
            <h2 className="text-base font-semibold text-ink">Monitoring Profile</h2>
            <p className="mt-1 text-sm text-slate-500">Choose a cron-aware policy template, then fine-tune the thresholds below.</p>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            {profileOrder.map((profileKey) => {
              const profile = monitoringProfiles[profileKey];
              const active = form.monitoring_profile === profileKey;

              return (
                <button
                  key={profileKey}
                  type="button"
                  onClick={() => applyMonitoringProfile(profileKey)}
                  className={`rounded-lg border p-3 text-left transition-colors ${
                    active
                      ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-200 dark:border-blue-500 dark:bg-blue-950/40 dark:ring-blue-900'
                      : 'border-slate-200 bg-slate-50 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-950 dark:hover:bg-slate-900'
                  }`}
                >
                  <p className="text-sm font-semibold text-ink">{profile.label}</p>
                  <p className="mt-1 text-xs leading-snug text-slate-500">{profile.summary}</p>
                </button>
              );
            })}
          </div>

          <div className="grid gap-3 lg:grid-cols-[1.2fr_1fr]">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-ink">{selectedProfile.label} policy defaults</p>
                  <p className="mt-1 text-xs text-slate-500">{selectedProfile.summary}</p>
                </div>
                <span className="w-fit rounded-md bg-white px-2 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800">
                  {selectedProfile.cadence}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                <div className="rounded-md bg-white p-2 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
                  <p className="text-slate-500">Expected interval</p>
                  <p className="mt-1 font-medium text-slate-700 dark:text-slate-200">{form.expected_interval_minutes ? formatMinutes(form.expected_interval_minutes) : 'Manual'}</p>
                </div>
                <div className="rounded-md bg-white p-2 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
                  <p className="text-slate-500">Silence timeout</p>
                  <p className="mt-1 font-medium text-slate-700 dark:text-slate-200">{formatMinutes(form.expected_interval_minutes || form.threshold)}</p>
                </div>
                <div className="rounded-md bg-white p-2 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
                  <p className="text-slate-500">Cooldown</p>
                  <p className="mt-1 font-medium text-slate-700 dark:text-slate-200">{formatMinutes(form.cooldown_minutes)}</p>
                </div>
                <div className="rounded-md bg-white p-2 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
                  <p className="text-slate-500">Failure sensitivity</p>
                  <p className="mt-1 font-medium text-slate-700 dark:text-slate-200">{form.threshold} in {formatMinutes(form.timeframe_minutes)}</p>
                </div>
                <div className="rounded-md bg-white p-2 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
                  <p className="text-slate-500">Warning threshold</p>
                  <p className="mt-1 font-medium text-slate-700 dark:text-slate-200">{form.threshold} events</p>
                </div>
                <div className="rounded-md bg-white p-2 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
                  <p className="text-slate-500">Runtime model</p>
                  <p className="mt-1 font-medium text-slate-700 dark:text-slate-200">{form.duration_spike_percent ? `${form.duration_spike_percent}% spike` : selectedProfile.runtime}</p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
              <p className="text-sm font-semibold text-ink">Cron behavior context</p>
              <p className="mt-1 text-xs text-slate-500">
                {form.cron_name ? `Recent behavior for ${form.cron_name}.` : 'Recent behavior across all monitored cron jobs.'}
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-md bg-slate-50 p-2 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
                  <p className="text-slate-500">Typical frequency</p>
                  <p className="mt-1 font-medium text-slate-700 dark:text-slate-200">{cronBehavior.totalRuns ? `Every ${formatMinutes(cronBehavior.avgIntervalMinutes)}` : 'No data'}</p>
                </div>
                <div className="rounded-md bg-slate-50 p-2 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
                  <p className="text-slate-500">Average runtime</p>
                  <p className="mt-1 font-medium text-slate-700 dark:text-slate-200">{formatRuntime(cronBehavior.avgDuration)}</p>
                </div>
                <div className="rounded-md bg-slate-50 p-2 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
                  <p className="text-slate-500">30D runs</p>
                  <p className="mt-1 font-medium text-slate-700 dark:text-slate-200">{cronBehavior.totalRuns || 'No data'}</p>
                </div>
                <div className="rounded-md bg-slate-50 p-2 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
                  <p className="text-slate-500">Suggested max runtime</p>
                  <p className="mt-1 font-medium text-slate-700 dark:text-slate-200">{formatRuntime(cronBehavior.suggestedMaxRuntime)}</p>
                </div>
              </div>
            </div>
          </div>
        </section>

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
          <input list="cron-name-options" value={form.cron_name} onChange={(event) => updateField('cron_name', event.target.value)} placeholder="Leave blank for all cron jobs" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950" />
          <datalist id="cron-name-options">
            {scopedCronNames.map((cronName) => <option key={cronName} value={cronName} />)}
          </datalist>
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Environment scope</span>
          <select value={form.env} onChange={(event) => updateField('env', event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950">
            <option value="">All environments</option>
            {scopeOptions.environments.map((option) => <option key={option.value} value={option.value}>{option.value}</option>)}
          </select>
          <p className="text-xs text-slate-500">Production remains strict; staging and development reduce noise.</p>
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Service group scope</span>
          <input list="service-group-options" value={form.service_group} onChange={(event) => updateField('service_group', event.target.value)} placeholder="Leave blank for all services" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950" />
          <datalist id="service-group-options">
            {scopeOptions.service_groups.map((option) => <option key={option.value} value={option.value} />)}
          </datalist>
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
                <div className="mt-2 flex flex-wrap gap-2">
                  {rule.env ? <EnvironmentBadge env={rule.env} /> : <span className="text-xs text-slate-500">All environments</span>}
                  {rule.service_group ? <ServiceGroupBadge serviceGroup={rule.service_group} /> : <span className="text-xs text-slate-500">All services</span>}
                </div>
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
