'use client';

import Link from 'next/link';
import { useState } from 'react';
import { EnvironmentBadge, ServiceGroupBadge } from '@/components/EnvironmentBadge';
import {
  createCronSchedule,
  formatApiError,
  getCronSchedule,
  toggleCronSchedule,
  updateCronSchedule
} from '@/lib/api';
import { formatDate, formatNumber } from '@/lib/format';

const filterControlClass = 'h-11 w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-blue-400 dark:focus:ring-blue-950';
const filterInputClass = `${filterControlClass} py-2`;
const filterSelectClass = `${filterControlClass} py-2`;

function parseServiceGroup(cronName = '') {
  return String(cronName || '').trim().split(/\s+/)[0] || 'Unassigned';
}

function jobKey(job) {
  return [
    job?.cron_name || '',
    job?.environment || job?.env || '',
    job?.service_group || ''
  ].join('|');
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
    schedule_expression: schedule?.schedule_expression || job?.schedule_expression || job?.heartbeat?.schedule_expression || '*/5 * * * *',
    timezone: schedule?.timezone || job?.timezone || 'Asia/Jakarta',
    grace_period_minutes: Number(schedule?.grace_period_minutes ?? job?.grace_period_minutes ?? job?.heartbeat?.grace_period_minutes ?? 10),
    cooldown_minutes: Number(schedule?.cooldown_minutes ?? job?.cooldown_minutes ?? job?.heartbeat?.cooldown_minutes ?? 30),
    severity: schedule?.severity || job?.severity || job?.heartbeat?.severity || 'critical',
    environment: schedule?.environment || job?.environment || job?.env || 'Production',
    service_group: schedule?.service_group || job?.service_group || parseServiceGroup(job?.cron_name),
    enabled: schedule?.enabled ?? job?.enabled ?? job?.heartbeat?.enabled ?? true,
    description: schedule?.description || job?.description || ''
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
              <p className="mt-1 text-sm text-slate-500">Schedule-aware monitoring for this registered cron.</p>
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
              <input value={form.schedule_expression} onChange={(event) => onChange('schedule_expression', event.target.value)} className={filterInputClass} placeholder="*/5 * * * *" required />
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
                  {form.enabled ? 'Pause Monitoring' : 'Resume Monitoring'}
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

export function CronInventoryClient({
  initialInventory = [],
  inventorySummary = {},
  inventoryNowWib = null,
  scopeOptions = { environments: [], service_groups: [] },
  filters = {},
  error = null
}) {
  const [inventory, setInventory] = useState(Array.isArray(initialInventory) ? initialInventory : []);
  const [actionError, setActionError] = useState('');
  const [inventoryActionId, setInventoryActionId] = useState(null);
  const [selectedJob, setSelectedJob] = useState(null);
  const [heartbeatForm, setHeartbeatForm] = useState(null);
  const [heartbeatLoading, setHeartbeatLoading] = useState(false);
  const [heartbeatSaving, setHeartbeatSaving] = useState(false);
  const [heartbeatError, setHeartbeatError] = useState('');
  const inventoryItems = inventory.map((item) => ({
    ...item,
    service_group: item?.service_group || parseServiceGroup(item?.cron_name)
  }));

  function cronHref(job) {
    const params = new URLSearchParams();
    if (job?.server) params.set('server', job.server);
    if (job?.env || job?.environment) params.set('env', job.env || job.environment);
    if (job?.service_group) params.set('service_group', job.service_group);
    const suffix = params.toString() ? `?${params.toString()}` : '';
    return `/cron/${encodeURIComponent(job?.cron_name ?? '')}${suffix}`;
  }

  function runtimeHref(job) {
    const params = new URLSearchParams();
    if (job?.cron_name) params.set('cron_name', job.cron_name);
    if (job?.server) params.set('server', job.server);
    if (job?.env || job?.environment) params.set('env', job.env || job.environment);
    if (job?.service_group) params.set('service_group', job.service_group);
    return `/cron?${params.toString()}`;
  }

  function mergeHeartbeatSchedule(schedule) {
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
    if (!job?.id) {
      return;
    }

    setInventoryActionId(job.id);
    setActionError('');

    try {
      const response = await toggleCronSchedule(job.id, !job.enabled);

      if (response?.schedule) {
        mergeHeartbeatSchedule(response.schedule);
      }
    } catch (toggleError) {
      setActionError(formatApiError(toggleError, 'Failed to update inventory monitoring state'));
    } finally {
      setInventoryActionId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-normal text-ink">Cron Inventory</h1>
            <span className="rounded-md bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700 ring-1 ring-blue-200 dark:bg-blue-950/40 dark:text-blue-200 dark:ring-blue-900">
              Admin control plane
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Registered cron schedules, heartbeat expectations, ownership scope, and schedule-aware operational health.
          </p>
        </div>
        <Link href="/cron" className="inline-flex min-h-11 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900">
          Runtime Activity
        </Link>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </div>
      ) : null}

      <form className="grid w-full min-w-0 grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950 sm:grid-cols-2 lg:grid-cols-[2fr_1.5fr_1.5fr_1.5fr_auto]" action="/cron/inventory">
        <input className={filterInputClass} name="cron_name" placeholder="Filter by cron name" defaultValue={filters.cron_name || ''} />
        <input className={filterInputClass} name="server" placeholder="Filter by server" defaultValue={filters.server || ''} />
        <select className={filterSelectClass} name="env" defaultValue={filters.env || ''}>
          <option value="">All environments</option>
          {scopeOptions.environments.map((option) => <option key={option.value} value={option.value}>{option.value}</option>)}
        </select>
        <select className={filterSelectClass} name="service_group" defaultValue={filters.service_group || ''}>
          <option value="">All services</option>
          {scopeOptions.service_groups.map((option) => <option key={option.value} value={option.value}>{option.value}</option>)}
        </select>
        <button className="h-11 w-full rounded-md bg-ink px-4 text-sm font-semibold text-white transition hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:bg-blue-600 dark:hover:bg-blue-500 dark:focus:ring-offset-slate-950 sm:col-span-2 lg:col-span-1" type="submit">
          Apply
        </button>
      </form>

      <div className="rounded-lg border border-blue-200 bg-blue-50/70 p-4 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-100">
        <p className="font-semibold">Expected operational world</p>
        <p className="mt-1 text-blue-800 dark:text-blue-200">
          Inventory is the authority for what should run. Runtime Activity shows what actually ran.
        </p>
      </div>

      {actionError ? <p className="whitespace-pre-line rounded-md bg-rose-50 p-3 text-sm font-medium text-rose-700 dark:bg-rose-950/40 dark:text-rose-200">{actionError}</p> : null}

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
                <button type="button" onClick={() => openHeartbeat(job)} className="min-h-9 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-900">Configure</button>
                <button type="button" onClick={() => toggleInventorySchedule(job)} disabled={inventoryActionId === job.id} className="min-h-9 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-900">{job.enabled ? 'Pause Monitoring' : 'Enable Heartbeat'}</button>
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
                      <button type="button" onClick={() => openHeartbeat(job)} className="min-h-9 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-900">Configure</button>
                      <button type="button" onClick={() => toggleInventorySchedule(job)} disabled={inventoryActionId === job.id} className="min-h-9 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-900">{job.enabled ? 'Pause' : 'Enable'}</button>
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
