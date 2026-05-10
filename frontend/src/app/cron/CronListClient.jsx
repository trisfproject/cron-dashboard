'use client';

import Link from 'next/link';
import { Fragment, useState } from 'react';
import { EnvironmentBadge, ServiceGroupBadge } from '@/components/EnvironmentBadge';
import { StatusBadge } from '@/components/StatusBadge';
import {
  createCronSchedule,
  formatApiError,
  getCronList,
  getCronSchedule,
  toggleCronSchedule,
  updateCronSchedule
} from '@/lib/api';
import { formatDate, formatDuration, formatNumber, formatPercent } from '@/lib/format';

const PAGE_SIZE = 20;
const filterControlClass = 'h-11 w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-blue-400 dark:focus:ring-blue-950';
const filterInputClass = `${filterControlClass} py-2`;
const filterSelectClass = `${filterControlClass} py-2`;

function parseServiceGroup(cronName = '') {
  return String(cronName || '').trim().split(/\s+/)[0] || 'Unassigned';
}

function jobKey(job) {
  return [
    job?.cron_name || '',
    job?.server || '',
    job?.env || '',
    job?.service_group || ''
  ].join('|');
}

function timestampValue(value) {
  if (!value) return 0;
  const normalized = typeof value === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(value)
    ? `${value.replace(' ', 'T')}+07:00`
    : value;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function groupSort(left, right, groupedJobs) {
  if (left === 'Unassigned') return 1;
  if (right === 'Unassigned') return -1;

  const leftLatest = Math.max(...(groupedJobs[left] || []).map((job) => timestampValue(job?.last_run)));
  const rightLatest = Math.max(...(groupedJobs[right] || []).map((job) => timestampValue(job?.last_run)));

  if (leftLatest !== rightLatest) {
    return rightLatest - leftLatest;
  }

  return left.localeCompare(right);
}

function heartbeatStatus(job) {
  const heartbeat = job?.heartbeat;

  if (!heartbeat) {
    return { label: 'Not Configured', tone: 'not_configured' };
  }

  if (heartbeat.enabled === false || heartbeat.status === 'disabled') {
    return { label: 'Disabled', tone: 'disabled' };
  }

  if (heartbeat.status === 'missing') {
    return { label: 'Missing', tone: 'missing' };
  }

  if (heartbeat.status === 'delayed') {
    return { label: 'Delayed', tone: 'delayed' };
  }

  if (heartbeat.status === 'unstable') {
    return { label: 'Unstable', tone: 'unstable' };
  }

  if (heartbeat.status === 'recovering') {
    return { label: 'Recovering', tone: 'recovering' };
  }

  if (heartbeat.status === 'invalid_schedule') {
    return { label: 'Invalid', tone: 'invalid' };
  }

  if (heartbeat.status === 'healthy') {
    return { label: 'Healthy', tone: 'healthy' };
  }

  if (heartbeat.status === 'outside_window') {
    return { label: 'Healthy', tone: 'healthy' };
  }

  return { label: 'Healthy', tone: 'healthy' };
}

function HeartbeatBadge({ job }) {
  const status = heartbeatStatus(job);
  const className = {
    healthy: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:ring-emerald-900',
    delayed: 'bg-yellow-50 text-yellow-800 ring-yellow-200 dark:bg-yellow-950/40 dark:text-yellow-100 dark:ring-yellow-900',
    unstable: 'bg-orange-50 text-orange-800 ring-orange-200 dark:bg-orange-950/40 dark:text-orange-100 dark:ring-orange-900',
    missing: 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-200 dark:ring-rose-900',
    recovering: 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-950/40 dark:text-sky-100 dark:ring-sky-900',
    invalid: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-900',
    disabled: 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800',
    not_configured: 'bg-slate-50 text-slate-500 ring-slate-200 dark:bg-slate-950 dark:text-slate-400 dark:ring-slate-800'
  }[status.tone];

  return (
    <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ${className}`}>
      {status.label}
    </span>
  );
}

function inventoryHealth(job) {
  if (!job?.enabled || job?.health_status === 'disabled') {
    return { label: 'Disabled', tone: 'disabled' };
  }

  if (job?.schedule_window_state === 'outside_window' && job?.health_status === 'healthy') {
    return { label: 'Waiting Window', tone: 'waiting' };
  }

  if (job?.health_status === 'missing') {
    return { label: 'Missing', tone: 'missing' };
  }

  if (job?.health_status === 'delayed') {
    return { label: 'Delayed', tone: 'delayed' };
  }

  if (job?.health_status === 'unstable') {
    return { label: 'Unstable', tone: 'unstable' };
  }

  if (job?.health_status === 'recovering') {
    return { label: 'Recovering', tone: 'recovering' };
  }

  return { label: 'Healthy', tone: 'healthy' };
}

function InventoryHealthBadge({ job }) {
  const status = inventoryHealth(job);
  const className = {
    healthy: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:ring-emerald-900',
    waiting: 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-950/40 dark:text-sky-100 dark:ring-sky-900',
    delayed: 'bg-yellow-50 text-yellow-800 ring-yellow-200 dark:bg-yellow-950/40 dark:text-yellow-100 dark:ring-yellow-900',
    unstable: 'bg-orange-50 text-orange-800 ring-orange-200 dark:bg-orange-950/40 dark:text-orange-100 dark:ring-orange-900',
    missing: 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-200 dark:ring-rose-900',
    recovering: 'bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-950/40 dark:text-blue-100 dark:ring-blue-900',
    disabled: 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800'
  }[status.tone];

  return (
    <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ${className}`}>
      {status.label}
    </span>
  );
}

function scheduleDefaults(job, schedule = null) {
  return {
    id: schedule?.id || job?.heartbeat?.id || job?.id || null,
    cron_name: job?.cron_name || schedule?.cron_name || '',
    schedule_expression: schedule?.schedule_expression || job?.heartbeat?.schedule_expression || '*/5 * * * *',
    timezone: schedule?.timezone || 'Asia/Jakarta',
    grace_period_minutes: Number(schedule?.grace_period_minutes ?? job?.heartbeat?.grace_period_minutes ?? 10),
    cooldown_minutes: Number(schedule?.cooldown_minutes ?? job?.heartbeat?.cooldown_minutes ?? 30),
    severity: schedule?.severity || job?.heartbeat?.severity || 'critical',
    environment: schedule?.environment || job?.environment || job?.env || 'Production',
    service_group: schedule?.service_group || job?.service_group || parseServiceGroup(job?.cron_name),
    enabled: schedule?.enabled ?? job?.heartbeat?.enabled ?? true,
    description: schedule?.description || ''
  };
}

function HeartbeatModal({ job, form, saving, loading, error, onChange, onClose, onSubmit, onToggle }) {
  if (!job || !form) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true">
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-lg border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-950 sm:max-w-2xl sm:rounded-lg">
        <form onSubmit={onSubmit} className="space-y-5 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-ink">Heartbeat Configuration</h2>
              <p className="mt-1 text-sm text-slate-500">Schedule-aware monitoring for this observed cron row.</p>
            </div>
            <button type="button" onClick={onClose} className="rounded-md px-2 py-1 text-sm font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-900">
              Close
            </button>
          </div>

          {error ? (
            <div className="whitespace-pre-line rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
              {error}
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1 sm:col-span-2">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Cron Name</span>
              <input value={form.cron_name} readOnly className={`${filterInputClass} bg-slate-50 dark:bg-slate-900`} />
            </label>

            <label className="space-y-1 sm:col-span-2">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Schedule Expression</span>
              <input
                value={form.schedule_expression}
                onChange={(event) => onChange('schedule_expression', event.target.value)}
                className={filterInputClass}
                placeholder="*/5 * * * *"
                required
              />
            </label>

            <label className="space-y-1">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Grace Period Minutes</span>
              <input type="number" min="1" max="10080" value={form.grace_period_minutes} onChange={(event) => onChange('grace_period_minutes', Number(event.target.value))} className={filterInputClass} />
            </label>

            <label className="space-y-1">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Cooldown Minutes</span>
              <input type="number" min="1" max="10080" value={form.cooldown_minutes} onChange={(event) => onChange('cooldown_minutes', Number(event.target.value))} className={filterInputClass} />
            </label>

            <label className="space-y-1">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Severity</span>
              <select value={form.severity} onChange={(event) => onChange('severity', event.target.value)} className={filterSelectClass}>
                <option value="critical">Critical</option>
                <option value="warning">Warning</option>
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Enabled</span>
              <select value={form.enabled ? 'true' : 'false'} onChange={(event) => onChange('enabled', event.target.value === 'true')} className={filterSelectClass}>
                <option value="true">Enabled</option>
                <option value="false">Disabled</option>
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Environment</span>
              <input value={form.environment} onChange={(event) => onChange('environment', event.target.value)} className={filterInputClass} />
            </label>

            <label className="space-y-1">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Service Group</span>
              <input value={form.service_group || ''} onChange={(event) => onChange('service_group', event.target.value)} className={filterInputClass} />
            </label>
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
            <div>
              {form.id ? (
                <button type="button" onClick={onToggle} disabled={saving || loading} className="min-h-10 rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-900">
                  {form.enabled ? 'Disable Heartbeat' : 'Enable Heartbeat'}
                </button>
              ) : null}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button type="button" onClick={onClose} className="min-h-10 rounded-md border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-900">
                Cancel
              </button>
              <button type="submit" disabled={saving || loading} className="min-h-10 rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-blue-600 dark:hover:bg-blue-500">
                {saving ? 'Saving...' : form.id ? 'Save Changes' : 'Enable Heartbeat'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

export function CronListClient({
  initialJobs = [],
  initialPagination = {},
  initialInventory = [],
  inventorySummary = {},
  inventoryNowWib = null,
  scopeOptions = { environments: [], service_groups: [] },
  filters = {},
  error = null,
  canManageHeartbeat = false
}) {
  const [jobs, setJobs] = useState(Array.isArray(initialJobs) ? initialJobs : []);
  const [inventory, setInventory] = useState(Array.isArray(initialInventory) ? initialInventory : []);
  const [hasMore, setHasMore] = useState(Boolean(initialPagination?.has_more));
  const [nextOffset, setNextOffset] = useState(Number(initialPagination?.next_offset || initialJobs.length || 0));
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [inventoryActionId, setInventoryActionId] = useState(null);
  const [selectedJob, setSelectedJob] = useState(null);
  const [heartbeatForm, setHeartbeatForm] = useState(null);
  const [heartbeatLoading, setHeartbeatLoading] = useState(false);
  const [heartbeatSaving, setHeartbeatSaving] = useState(false);
  const [heartbeatError, setHeartbeatError] = useState('');
  const rangeLabel = {
    today: 'today',
    '7d': 'the last 7 days',
    '30d': 'the last 30 days'
  }[filters.range] || 'today';
  const hasCronNameFilter = Boolean(String(filters.cron_name || '').trim());
  const emptyStateTitle = hasCronNameFilter
    ? `No executions for "${filters.cron_name}" within ${rangeLabel}.`
    : `No cron executions found for ${rangeLabel}.`;
  const emptyStateDetail = hasCronNameFilter
    ? 'This cron may still exist historically or appear in Reports when it ran in a wider analytical range.'
    : 'Cron page lists execution activity inside the selected operational window. Use Reports for historical analytics across wider time ranges.';
  const activeView = filters.view === 'runtime' ? 'runtime' : 'inventory';
  const inventoryItems = inventory.map((item) => ({
    ...item,
    service_group: item?.service_group || parseServiceGroup(item?.cron_name)
  }));

  function viewHref(view) {
    const params = new URLSearchParams();
    params.set('view', view);
    if (filters.cron_name) params.set('cron_name', filters.cron_name);
    if (filters.server) params.set('server', filters.server);
    if (filters.env) params.set('env', filters.env);
    if (filters.service_group) params.set('service_group', filters.service_group);
    if (view === 'runtime') {
      if (filters.range) params.set('range', filters.range);
      if (filters.status) params.set('status', filters.status);
    }
    return `/cron?${params.toString()}`;
  }

  const displayJobs = jobs.map((job) => ({
    ...job,
    service_group: job?.service_group || parseServiceGroup(job?.cron_name)
  }));
  const groupedJobs = displayJobs.reduce((groups, job) => {
    const key = job?.service_group || 'Unassigned';
    groups[key] = [...(groups[key] || []), job];
    return groups;
  }, {});
  const serviceGroups = Object.keys(groupedJobs).sort((left, right) => groupSort(left, right, groupedJobs));

  function cronHref(job) {
    const params = new URLSearchParams();
    if (job?.server) params.set('server', job.server);
    if (job?.env) params.set('env', job.env);
    if (job?.service_group) params.set('service_group', job.service_group);
    const suffix = params.toString() ? `?${params.toString()}` : '';
    return `/cron/${encodeURIComponent(job?.cron_name ?? '')}${suffix}`;
  }

  function runtimeHref(job) {
    const params = new URLSearchParams();
    params.set('view', 'runtime');
    if (job?.cron_name) params.set('cron_name', job.cron_name);
    if (job?.server) params.set('server', job.server);
    if (job?.env || job?.environment) params.set('env', job.env || job.environment);
    if (job?.service_group) params.set('service_group', job.service_group);
    return `/cron?${params.toString()}`;
  }

  async function loadMore() {
    setLoadingMore(true);
    setLoadError('');

    try {
      const response = await getCronList({
        ...filters,
        limit: PAGE_SIZE,
        offset: nextOffset
      });
      const nextJobs = Array.isArray(response?.jobs) ? response.jobs : [];
      setJobs((current) => {
        const seen = new Set(current.map(jobKey));
        const merged = [...current];

        for (const job of nextJobs) {
          if (!seen.has(jobKey(job))) {
            merged.push(job);
          }
        }

        return merged;
      });
      setHasMore(Boolean(response?.has_more));
      setNextOffset(Number(response?.next_offset || nextOffset + nextJobs.length));
    } catch (fetchError) {
      setLoadError(formatApiError(fetchError, 'Failed to load more cron jobs'));
    } finally {
      setLoadingMore(false);
    }
  }

  function mergeHeartbeatSchedule(schedule) {
    setJobs((currentJobs) => currentJobs.map((job) => {
      if (job.cron_name !== schedule.cron_name || String(job.env || '').toLowerCase() !== String(schedule.environment || '').toLowerCase()) {
        return job;
      }

      return {
        ...job,
        heartbeat: {
          ...(job.heartbeat || {}),
          id: schedule.id,
          enabled: schedule.enabled,
          status: schedule.enabled ? (job.heartbeat?.status && job.heartbeat.status !== 'disabled' ? job.heartbeat.status : 'enabled') : 'disabled',
          schedule_expression: schedule.schedule_expression,
          schedule_description: schedule.schedule_description,
          grace_period_minutes: schedule.grace_period_minutes,
          cooldown_minutes: schedule.cooldown_minutes,
          severity: schedule.severity
        }
      };
    }));
    setInventory((currentItems) => currentItems.map((item) => {
      if (item.id !== schedule.id && (item.cron_name !== schedule.cron_name || String(item.environment || item.env || '').toLowerCase() !== String(schedule.environment || '').toLowerCase())) {
        return item;
      }

      return {
        ...item,
        id: schedule.id,
        schedule_expression: schedule.schedule_expression,
        schedule_description: schedule.schedule_description,
        timezone: schedule.timezone,
        grace_period_minutes: schedule.grace_period_minutes,
        cooldown_minutes: schedule.cooldown_minutes,
        severity: schedule.severity,
        enabled: schedule.enabled,
        environment: schedule.environment,
        service_group: schedule.service_group || item.service_group,
        health_status: schedule.enabled ? item.health_status === 'disabled' ? 'healthy' : (item.health_status || 'healthy') : 'disabled',
        health_reason: schedule.enabled ? 'Monitoring schedule is enabled' : 'Monitoring intentionally disabled',
        heartbeat: {
          ...(item.heartbeat || {}),
          enabled: schedule.enabled,
          status: schedule.enabled ? item.heartbeat?.status === 'disabled' ? 'healthy' : (item.heartbeat?.status || 'healthy') : 'disabled'
        }
      };
    }));
  }

  async function openHeartbeat(job) {
    if (!canManageHeartbeat) {
      return;
    }

    setSelectedJob(job);
    setHeartbeatForm(scheduleDefaults(job));
    setHeartbeatError('');
    setHeartbeatLoading(true);

    try {
      const response = await getCronSchedule({ cron_name: job.cron_name, env: job.environment || job.env }, { redirectOnAuthFailure: false });
      if (response?.schedule) {
        setHeartbeatForm(scheduleDefaults(job, response.schedule));
      }
    } catch (fetchError) {
      if (fetchError?.status !== 404) {
        setHeartbeatError(formatApiError(fetchError, 'Failed to load heartbeat configuration'));
      }
    } finally {
      setHeartbeatLoading(false);
    }
  }

  function updateHeartbeatForm(key, value) {
    setHeartbeatForm((current) => ({ ...current, [key]: value }));
  }

  async function saveHeartbeat(event) {
    event.preventDefault();
    setHeartbeatError('');

    if (!String(heartbeatForm?.schedule_expression || '').trim()) {
      setHeartbeatError('Schedule expression is required.');
      return;
    }

    setHeartbeatSaving(true);

    try {
      const payload = {
        ...heartbeatForm,
        grace_period_minutes: Number(heartbeatForm.grace_period_minutes),
        cooldown_minutes: Number(heartbeatForm.cooldown_minutes)
      };
      const response = heartbeatForm.id
        ? await updateCronSchedule(heartbeatForm.id, payload)
        : await createCronSchedule(payload);

      if (response?.schedule) {
        mergeHeartbeatSchedule(response.schedule);
        setHeartbeatForm(scheduleDefaults(selectedJob, response.schedule));
      }

      setSelectedJob(null);
      setHeartbeatForm(null);
    } catch (saveError) {
      setHeartbeatError(formatApiError(saveError, 'Failed to save heartbeat schedule'));
    } finally {
      setHeartbeatSaving(false);
    }
  }

  async function toggleHeartbeat() {
    if (!heartbeatForm?.id) {
      return;
    }

    setHeartbeatSaving(true);
    setHeartbeatError('');

    try {
      const response = await toggleCronSchedule(heartbeatForm.id, !heartbeatForm.enabled);
      if (response?.schedule) {
        mergeHeartbeatSchedule(response.schedule);
        setHeartbeatForm(scheduleDefaults(selectedJob, response.schedule));
      }
    } catch (toggleError) {
      setHeartbeatError(formatApiError(toggleError, 'Failed to toggle heartbeat schedule'));
    } finally {
      setHeartbeatSaving(false);
    }
  }

  async function toggleInventorySchedule(job) {
    if (!job?.id || !canManageHeartbeat) {
      return;
    }

    setInventoryActionId(job.id);
    setLoadError('');

    try {
      const response = await toggleCronSchedule(job.id, !job.enabled);

      if (response?.schedule) {
        mergeHeartbeatSchedule(response.schedule);
      }
    } catch (toggleError) {
      setLoadError(formatApiError(toggleError, 'Failed to update inventory monitoring state'));
    } finally {
      setInventoryActionId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-normal text-ink">Cron jobs</h1>
          <span className="rounded-md bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700 ring-1 ring-blue-200 dark:bg-blue-950/40 dark:text-blue-200 dark:ring-blue-900">
            {activeView === 'inventory' ? 'Cron Inventory' : 'Runtime Activity'}
          </span>
        </div>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {activeView === 'inventory'
            ? 'Registered cron schedules are the expected operational world. Use inventory to manage heartbeat expectations, health, ownership scope, and schedule-aware monitoring.'
            : `Metrics are calculated only from cron executions within ${rangeLabel} in WIB. Crons with no executions in this window may still appear in Reports historical analytics.`}
        </p>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </div>
      ) : null}

      <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-2 shadow-sm dark:border-slate-800 dark:bg-slate-950 sm:flex-row">
        <Link
          href={viewHref('inventory')}
          className={`flex min-h-11 flex-1 items-center justify-center rounded-md px-4 text-sm font-semibold transition ${activeView === 'inventory' ? 'bg-ink text-white dark:bg-blue-600' : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-900'}`}
        >
          Cron Inventory
        </Link>
        <Link
          href={viewHref('runtime')}
          className={`flex min-h-11 flex-1 items-center justify-center rounded-md px-4 text-sm font-semibold transition ${activeView === 'runtime' ? 'bg-ink text-white dark:bg-blue-600' : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-900'}`}
        >
          Runtime Activity
        </Link>
      </div>

      <form className="grid w-full min-w-0 grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950 sm:grid-cols-2 xl:grid-cols-[repeat(14,minmax(0,1fr))]" action="/cron">
        <input type="hidden" name="view" value={activeView} />
        <input className={`${filterInputClass} xl:col-span-3`} name="cron_name" placeholder="Filter by cron name" defaultValue={filters.cron_name || ''} />
        <input className={`${filterInputClass} xl:col-span-2`} name="server" placeholder="Filter by server" defaultValue={filters.server || ''} />
        {activeView === 'runtime' ? (
          <select className={`${filterSelectClass} xl:col-span-2`} name="range" defaultValue={filters.range || 'today'}>
            <option value="today">Active Today</option>
            <option value="7d">Activity 7D</option>
            <option value="30d">Activity 30D</option>
          </select>
        ) : null}
        <select className={`${filterSelectClass} xl:col-span-2`} name="env" defaultValue={filters.env || ''}>
          <option value="">All environments</option>
          {scopeOptions.environments.map((option) => <option key={option.value} value={option.value}>{option.value}</option>)}
        </select>
        <select className={`${filterSelectClass} xl:col-span-2`} name="service_group" defaultValue={filters.service_group || ''}>
          <option value="">All services</option>
          {scopeOptions.service_groups.map((option) => <option key={option.value} value={option.value}>{option.value}</option>)}
        </select>
        {activeView === 'runtime' ? (
          <select className={`${filterSelectClass} xl:col-span-2`} name="status" defaultValue={filters.status || ''}>
            <option value="">All statuses</option>
            <option value="0">Success</option>
            <option value="1">Failed</option>
            <option value="2">Warning</option>
          </select>
        ) : null}
        <button className="h-11 w-full rounded-md bg-ink px-4 text-sm font-semibold text-white transition hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:bg-blue-600 dark:hover:bg-blue-500 dark:focus:ring-offset-slate-950 sm:col-span-2 xl:col-span-1" type="submit">
          Apply
        </button>
      </form>

      <div className="grid gap-3 rounded-lg border border-blue-200 bg-blue-50/70 p-4 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-100 md:grid-cols-2">
        <div>
          <p className="font-semibold">Cron Inventory</p>
          <p className="mt-1 text-blue-800 dark:text-blue-200">Authoritative registry of expected schedules, heartbeat configuration, and schedule-aware operational state.</p>
        </div>
        <div>
          <p className="font-semibold">Runtime Activity</p>
          <p className="mt-1 text-blue-800 dark:text-blue-200">Observed execution logs for recent runs, durations, statuses, retries, and range-bound activity.</p>
        </div>
      </div>

      {loadError ? <p className="whitespace-pre-line rounded-md bg-rose-50 p-3 text-sm font-medium text-rose-700 dark:bg-rose-950/40 dark:text-rose-200">{loadError}</p> : null}

      <div className={activeView === 'inventory' ? 'space-y-4' : 'hidden'}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <p className="text-xs font-medium uppercase tracking-normal text-slate-500">Registered</p>
            <p className="mt-1 text-xl font-semibold text-ink">{formatNumber(inventorySummary.registered ?? inventoryItems.length)}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <p className="text-xs font-medium uppercase tracking-normal text-slate-500">Waiting</p>
            <p className="mt-1 text-xl font-semibold text-sky-700 dark:text-sky-200">{formatNumber(inventorySummary.waiting_window ?? 0)}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <p className="text-xs font-medium uppercase tracking-normal text-slate-500">Delayed</p>
            <p className="mt-1 text-xl font-semibold text-yellow-700 dark:text-yellow-200">{formatNumber(inventorySummary.delayed ?? 0)}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <p className="text-xs font-medium uppercase tracking-normal text-slate-500">Missing</p>
            <p className="mt-1 text-xl font-semibold text-rose-700 dark:text-rose-200">{formatNumber(inventorySummary.missing ?? 0)}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <p className="text-xs font-medium uppercase tracking-normal text-slate-500">Recovering</p>
            <p className="mt-1 text-xl font-semibold text-blue-700 dark:text-blue-200">{formatNumber(inventorySummary.recovering ?? 0)}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <p className="text-xs font-medium uppercase tracking-normal text-slate-500">Disabled</p>
            <p className="mt-1 text-xl font-semibold text-slate-700 dark:text-slate-200">{formatNumber(inventorySummary.disabled ?? 0)}</p>
          </div>
        </div>

        <div className="w-full min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div className="border-b border-slate-200 px-4 py-3 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
            Showing {formatNumber(inventoryItems.length)} registered cron schedules. {inventoryNowWib ? `Inventory evaluated at ${inventoryNowWib} WIB.` : 'Inventory uses schedule-aware heartbeat evaluation.'}
          </div>
          <div className="space-y-4 bg-slate-50/70 px-3 py-4 dark:bg-slate-950/60 lg:hidden">
            {inventoryItems.map((job) => (
              <article key={`inventory-mobile-${job.id || jobKey(job)}`} className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm ring-1 ring-slate-100 dark:border-slate-800 dark:bg-slate-950 dark:ring-slate-900">
                <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3 dark:border-slate-800">
                  <Link className="min-w-0 break-words font-medium text-ink hover:text-blue-700 dark:text-slate-100 dark:hover:text-blue-300" href={cronHref(job)}>
                    {job?.cron_name ?? '-'}
                  </Link>
                  <InventoryHealthBadge job={job} />
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="min-w-0 rounded-md bg-slate-50 p-2 ring-1 ring-slate-100 dark:bg-slate-900/60 dark:ring-slate-800">
                    <p className="text-xs text-slate-500">Schedule</p>
                    <p className="mt-1 break-words font-medium text-slate-700 dark:text-slate-300">{job?.schedule_description || job?.schedule_expression || '-'}</p>
                  </div>
                  <div className="min-w-0 rounded-md bg-slate-50 p-2 ring-1 ring-slate-100 dark:bg-slate-900/60 dark:ring-slate-800">
                    <p className="text-xs text-slate-500">Next Run</p>
                    <p className="mt-1 font-medium text-slate-700 dark:text-slate-300">{formatDate(job?.next_run)}</p>
                  </div>
                  <div className="min-w-0 rounded-md bg-slate-50 p-2 ring-1 ring-slate-100 dark:bg-slate-900/60 dark:ring-slate-800">
                    <p className="text-xs text-slate-500">Last Run</p>
                    <p className="mt-1 font-medium text-slate-700 dark:text-slate-300">{formatDate(job?.last_run)}</p>
                  </div>
                  <div className="min-w-0 rounded-md bg-slate-50 p-2 ring-1 ring-slate-100 dark:bg-slate-900/60 dark:ring-slate-800">
                    <p className="text-xs text-slate-500">Heartbeat</p>
                    <p className="mt-1 font-medium text-slate-700 dark:text-slate-300">{job?.enabled ? 'Enabled' : 'Disabled'}</p>
                  </div>
                  <div className="min-w-0 rounded-md bg-slate-50 p-2 ring-1 ring-slate-100 dark:bg-slate-900/60 dark:ring-slate-800">
                    <p className="text-xs text-slate-500">Env</p>
                    <p className="mt-1 truncate text-slate-700 dark:text-slate-300">{job?.environment ? <EnvironmentBadge env={job.environment} /> : '-'}</p>
                  </div>
                  <div className="min-w-0 rounded-md bg-slate-50 p-2 ring-1 ring-slate-100 dark:bg-slate-900/60 dark:ring-slate-800">
                    <p className="text-xs text-slate-500">Service</p>
                    <div className="mt-1"><ServiceGroupBadge serviceGroup={job?.service_group} /></div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {canManageHeartbeat ? (
                    <>
                      <button type="button" onClick={() => openHeartbeat(job)} className="min-h-9 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-900">Configure</button>
                      <button type="button" onClick={() => toggleInventorySchedule(job)} disabled={inventoryActionId === job.id} className="min-h-9 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-900">{job.enabled ? 'Pause Monitoring' : 'Resume Monitoring'}</button>
                    </>
                  ) : null}
                  <Link href={runtimeHref(job)} className="min-h-9 rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-900">View Executions</Link>
                </div>
              </article>
            ))}
            {inventoryItems.length === 0 && !error ? (
              <div className="rounded-lg border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500 shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
                <p className="font-medium text-slate-700 dark:text-slate-200">No registered cron schedules match the current filters.</p>
                <p className="mx-auto mt-2 max-w-xl">Cron Inventory shows registered expected schedules. Runtime Activity may still show observed logs that have not been registered for heartbeat monitoring yet.</p>
              </div>
            ) : null}
          </div>
          <div className="hidden overflow-x-auto lg:block">
            <table className="min-w-[72rem] divide-y divide-slate-200 text-sm dark:divide-slate-800 xl:min-w-full">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-normal text-slate-500 dark:bg-slate-900/60 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3">Cron</th>
                  <th className="px-4 py-3">Schedule</th>
                  <th className="px-4 py-3">Next Run</th>
                  <th className="px-4 py-3">Last Run</th>
                  <th className="px-4 py-3">Health</th>
                  <th className="px-4 py-3">Heartbeat</th>
                  <th className="px-4 py-3">Scope</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {inventoryItems.map((job) => (
                  <tr key={`inventory-${job.id || jobKey(job)}`} className="align-top">
                    <td className="max-w-[24rem] px-4 py-3 font-medium text-ink dark:text-slate-100"><Link className="block truncate hover:text-blue-700 dark:hover:text-blue-300" href={cronHref(job)}>{job?.cron_name ?? '-'}</Link></td>
                    <td className="max-w-[18rem] px-4 py-3 text-slate-600 dark:text-slate-300"><span className="block break-words">{job?.schedule_description || job?.schedule_expression || '-'}</span></td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600 dark:text-slate-300">{formatDate(job?.next_run)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600 dark:text-slate-300">{formatDate(job?.last_run)}</td>
                    <td className="whitespace-nowrap px-4 py-3"><InventoryHealthBadge job={job} /></td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600 dark:text-slate-300">{job?.enabled ? 'Enabled' : 'Disabled'}</td>
                    <td className="px-4 py-3"><div className="flex flex-wrap gap-1.5">{job?.environment ? <EnvironmentBadge env={job.environment} /> : null}<ServiceGroupBadge serviceGroup={job?.service_group} /></div></td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        {canManageHeartbeat ? (
                          <>
                            <button type="button" onClick={() => openHeartbeat(job)} className="min-h-9 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-900">Configure</button>
                            <button type="button" onClick={() => toggleInventorySchedule(job)} disabled={inventoryActionId === job.id} className="min-h-9 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-900">{job.enabled ? 'Pause' : 'Resume'}</button>
                          </>
                        ) : null}
                        <Link href={runtimeHref(job)} className="min-h-9 rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-900">View Executions</Link>
                      </div>
                    </td>
                  </tr>
                ))}
                {inventoryItems.length === 0 && !error ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-slate-500 dark:text-slate-400" colSpan={8}>
                      <p className="font-medium text-slate-700 dark:text-slate-200">No registered cron schedules match the current filters.</p>
                      <p className="mx-auto mt-2 max-w-xl">Cron Inventory shows registered expected schedules. Runtime Activity may still show observed logs that have not been registered for heartbeat monitoring yet.</p>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className={activeView === 'runtime' ? 'w-full min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950' : 'hidden'}>
        <div className="border-b border-slate-200 px-4 py-3 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
          Showing {formatNumber(displayJobs.length)} latest cron execution rows. Last status, freshness, runs, success rate, and average duration use the selected range and Asia/Jakarta day boundary.
        </div>

        <div className="space-y-5 bg-slate-50/70 px-3 py-4 dark:bg-slate-950/60 lg:hidden">
          {serviceGroups.map((group) => (
            <div key={`${group}-mobile-group`} className="space-y-3">
              <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-normal text-slate-500 shadow-sm dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-400">
                <span>{group}</span>
                <span className="ml-2 font-medium normal-case text-slate-400">{formatNumber(groupedJobs[group].length)} rows</span>
              </div>
              {groupedJobs[group].map((job, index) => (
                <article key={`${jobKey(job)}-mobile-${index}`} className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm ring-1 ring-slate-100 dark:border-slate-800 dark:bg-slate-950 dark:ring-slate-900">
                  <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3 dark:border-slate-800">
                    <Link className="min-w-0 break-words font-medium text-ink hover:text-blue-700 dark:text-slate-100 dark:hover:text-blue-300" href={cronHref(job)}>
                      {job?.cron_name ?? '-'}
                    </Link>
                    <StatusBadge status={job?.last_status} />
                  </div>
                  <div className="flex flex-wrap items-center gap-2 rounded-md bg-slate-50 p-2 ring-1 ring-slate-100 dark:bg-slate-900/60 dark:ring-slate-800">
                    <HeartbeatBadge job={job} />
                    {canManageHeartbeat ? (
                      <button type="button" onClick={() => openHeartbeat(job)} className="min-h-9 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-900">
                        {job?.heartbeat ? 'Configure Heartbeat' : 'Enable Heartbeat'}
                      </button>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="min-w-0 rounded-md bg-slate-50 p-2 ring-1 ring-slate-100 dark:bg-slate-900/60 dark:ring-slate-800">
                      <p className="text-xs text-slate-500">Freshness</p>
                      <p className="mt-1 font-medium text-slate-700 dark:text-slate-300">{formatDate(job?.last_run)}</p>
                    </div>
                    <div className="min-w-0 rounded-md bg-slate-50 p-2 ring-1 ring-slate-100 dark:bg-slate-900/60 dark:ring-slate-800">
                      <p className="text-xs text-slate-500">Avg duration</p>
                      <p className="mt-1 font-medium text-slate-700 dark:text-slate-300">{formatDuration(job?.avg_duration ?? 0)}</p>
                    </div>
                    <div className="min-w-0 rounded-md bg-slate-50 p-2 ring-1 ring-slate-100 dark:bg-slate-900/60 dark:ring-slate-800">
                      <p className="text-xs text-slate-500">Env</p>
                      <p className="mt-1 truncate text-slate-700 dark:text-slate-300">{job?.env ? <EnvironmentBadge env={job.env} /> : '-'}</p>
                    </div>
                    <div className="min-w-0 rounded-md bg-slate-50 p-2 ring-1 ring-slate-100 dark:bg-slate-900/60 dark:ring-slate-800">
                      <p className="text-xs text-slate-500">Success</p>
                      <p className="mt-1 font-medium text-slate-700 dark:text-slate-300">{formatPercent(job?.success_rate ?? 0)}</p>
                    </div>
                    <div className="min-w-0 rounded-md bg-slate-50 p-2 ring-1 ring-slate-100 dark:bg-slate-900/60 dark:ring-slate-800">
                      <p className="text-xs text-slate-500">Runs</p>
                      <p className="mt-1 font-medium text-slate-700 dark:text-slate-300">{formatNumber(job?.total_runs ?? 0)}</p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ))}
          {displayJobs.length === 0 && !error ? (
            <div className="rounded-lg border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500 shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
              <p className="font-medium text-slate-700 dark:text-slate-200">{emptyStateTitle}</p>
              <p className="mx-auto mt-2 max-w-xl">{emptyStateDetail}</p>
            </div>
          ) : null}
        </div>

        <div className="hidden overflow-x-auto lg:block">
          <table className="min-w-[60rem] divide-y divide-slate-200 text-sm dark:divide-slate-800 xl:min-w-full">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-normal text-slate-500 dark:bg-slate-900/60 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3">Service</th>
                <th className="px-4 py-3">Cron</th>
                <th className="px-4 py-3">Env</th>
                <th className="px-4 py-3">Last status</th>
                <th className="px-4 py-3">Last run freshness</th>
                <th className="px-4 py-3">Avg duration</th>
                <th className="px-4 py-3">Success rate</th>
                <th className="px-4 py-3">Runs</th>
                <th className="px-4 py-3">Heartbeat</th>
                {canManageHeartbeat ? <th className="px-4 py-3">Actions</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {serviceGroups.map((group) => (
                <Fragment key={`${group}-desktop-group`}>
                  <tr key={`${group}-header`} className="bg-slate-50/70 dark:bg-slate-900/50">
                    <td className="px-4 py-2 text-xs font-semibold uppercase tracking-normal text-slate-500 dark:text-slate-400" colSpan={canManageHeartbeat ? 10 : 9}>
                      <span>{group}</span>
                      <span className="ml-2 font-medium normal-case text-slate-400">{formatNumber(groupedJobs[group].length)} rows</span>
                    </td>
                  </tr>
                  {groupedJobs[group].map((job, index) => (
                    <tr key={`${jobKey(job)}-${index}`} className="dark:border-slate-800">
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600 dark:text-slate-300"><ServiceGroupBadge serviceGroup={job?.service_group} />{!job?.service_group ? '-' : null}</td>
                      <td className="max-w-[30rem] px-4 py-3 font-medium text-ink dark:text-slate-100">
                        <Link className="block truncate hover:text-blue-700 dark:hover:text-blue-300" href={cronHref(job)}>{job?.cron_name ?? '-'}</Link>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600 dark:text-slate-300">{job?.env ? <EnvironmentBadge env={job.env} /> : '-'}</td>
                      <td className="whitespace-nowrap px-4 py-3"><StatusBadge status={job?.last_status} /></td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600 dark:text-slate-300">{formatDate(job?.last_run)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600 dark:text-slate-300">{formatDuration(job?.avg_duration ?? 0)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600 dark:text-slate-300">{formatPercent(job?.success_rate ?? 0)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600 dark:text-slate-300">{formatNumber(job?.total_runs ?? 0)}</td>
                      <td className="whitespace-nowrap px-4 py-3"><HeartbeatBadge job={job} /></td>
                      {canManageHeartbeat ? (
                        <td className="whitespace-nowrap px-4 py-3">
                          <button type="button" onClick={() => openHeartbeat(job)} className="min-h-9 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-900">
                            {job?.heartbeat ? 'Configure' : 'Enable'}
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </Fragment>
              ))}
              {displayJobs.length === 0 && !error ? (
                <tr>
                  <td className="px-4 py-8 text-center text-slate-500 dark:text-slate-400" colSpan={canManageHeartbeat ? 10 : 9}>
                    <p className="font-medium text-slate-700 dark:text-slate-200">{emptyStateTitle}</p>
                    <p className="mx-auto mt-2 max-w-xl">{emptyStateDetail}</p>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="border-t border-slate-200 px-4 py-4 dark:border-slate-800">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {hasMore ? 'More cron execution rows are available for the current filters.' : 'All matching execution rows are loaded for this operational window.'}
            </p>
            <button
              type="button"
              onClick={loadMore}
              disabled={!hasMore || loadingMore}
              className="flex min-h-11 w-full items-center justify-center rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900 sm:w-auto"
            >
              {loadingMore ? 'Loading...' : 'Load More'}
            </button>
          </div>
        </div>
      </div>
      <HeartbeatModal
        job={selectedJob}
        form={heartbeatForm}
        saving={heartbeatSaving}
        loading={heartbeatLoading}
        error={heartbeatError}
        onChange={updateHeartbeatForm}
        onClose={() => {
          setSelectedJob(null);
          setHeartbeatForm(null);
          setHeartbeatError('');
        }}
        onSubmit={saveHeartbeat}
        onToggle={toggleHeartbeat}
      />
    </div>
  );
}
