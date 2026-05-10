'use client';

import Link from 'next/link';
import { Fragment, useState } from 'react';
import { EnvironmentBadge, ServiceGroupBadge } from '@/components/EnvironmentBadge';
import { StatusBadge } from '@/components/StatusBadge';
import { formatApiError, getCronList } from '@/lib/api';
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

export function CronListClient({
  initialJobs = [],
  initialPagination = {},
  scopeOptions = { environments: [], service_groups: [] },
  filters = {},
  error = null,
  canManageInventory = false
}) {
  const [jobs, setJobs] = useState(Array.isArray(initialJobs) ? initialJobs : []);
  const [hasMore, setHasMore] = useState(Boolean(initialPagination?.has_more));
  const [nextOffset, setNextOffset] = useState(Number(initialPagination?.next_offset || initialJobs.length || 0));
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState('');
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
    ? 'This cron may still exist in Cron Inventory or appear in Reports when it ran in a wider analytical range.'
    : 'Runtime Activity lists observed execution logs inside the selected operational window. Use Cron Inventory for registered schedule expectations.';

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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-normal text-ink">Cron jobs</h1>
            <span className="rounded-md bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700 ring-1 ring-blue-200 dark:bg-blue-950/40 dark:text-blue-200 dark:ring-blue-900">
              Runtime Activity
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Realtime execution telemetry from observed cron logs. Metrics are calculated only from executions within {rangeLabel} in WIB.
          </p>
        </div>
        {canManageInventory ? (
          <Link href="/cron/inventory" className="inline-flex min-h-11 items-center justify-center rounded-md bg-ink px-4 text-sm font-semibold text-white transition hover:bg-slate-700 dark:bg-blue-600 dark:hover:bg-blue-500">
            Configure Inventory
          </Link>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </div>
      ) : null}

      <form className="grid w-full min-w-0 grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-950 sm:gap-3 sm:p-4 xl:grid-cols-[repeat(14,minmax(0,1fr))]" action="/cron">
        <input className={`${filterInputClass} col-span-2 xl:col-span-3`} name="cron_name" placeholder="Filter by cron name" defaultValue={filters.cron_name || ''} />
        <input className={`${filterInputClass} col-span-2 xl:col-span-2`} name="server" placeholder="Filter by server" defaultValue={filters.server || ''} />
        <select className={`${filterSelectClass} col-span-1 xl:col-span-2`} name="range" defaultValue={filters.range || 'today'}>
          <option value="today">Active Today</option>
          <option value="7d">Activity 7D</option>
          <option value="30d">Activity 30D</option>
        </select>
        <select className={`${filterSelectClass} col-span-1 xl:col-span-2`} name="env" defaultValue={filters.env || ''}>
          <option value="">All environments</option>
          {scopeOptions.environments.map((option) => <option key={option.value} value={option.value}>{option.value}</option>)}
        </select>
        <select className={`${filterSelectClass} col-span-1 xl:col-span-2`} name="service_group" defaultValue={filters.service_group || ''}>
          <option value="">All services</option>
          {scopeOptions.service_groups.map((option) => <option key={option.value} value={option.value}>{option.value}</option>)}
        </select>
        <select className={`${filterSelectClass} col-span-1 xl:col-span-2`} name="status" defaultValue={filters.status || ''}>
          <option value="">All statuses</option>
          <option value="0">Success</option>
          <option value="1">Failed</option>
          <option value="2">Warning</option>
        </select>
        <button className="col-span-2 h-11 w-full rounded-md bg-ink px-4 text-sm font-semibold text-white transition hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:bg-blue-600 dark:hover:bg-blue-500 dark:focus:ring-offset-slate-950 xl:col-span-1" type="submit">
          Apply
        </button>
      </form>

      <div className="rounded-lg border border-blue-200 bg-blue-50/70 p-4 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-100">
        <p className="font-semibold">Runtime Activity</p>
        <p className="mt-1 text-blue-800 dark:text-blue-200">
          This page shows what actually executed. Registered schedules, heartbeat expectations, and monitoring ownership live in Cron Inventory.
        </p>
      </div>

      <div className="w-full min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div className="border-b border-slate-200 px-4 py-3 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
          Showing {formatNumber(displayJobs.length)} latest cron execution rows. Last status, freshness, runs, success rate, and average duration use the selected range and Asia/Jakarta day boundary.
        </div>

        {loadError ? <p className="m-4 whitespace-pre-line rounded-md bg-rose-50 p-3 text-sm font-medium text-rose-700 dark:bg-rose-950/40 dark:text-rose-200">{loadError}</p> : null}

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
          <table className="min-w-[56rem] divide-y divide-slate-200 text-sm dark:divide-slate-800 xl:min-w-full">
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
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {serviceGroups.map((group) => (
                <Fragment key={`${group}-desktop-group`}>
                  <tr key={`${group}-header`} className="bg-slate-50/70 dark:bg-slate-900/50">
                    <td className="px-4 py-2 text-xs font-semibold uppercase tracking-normal text-slate-500 dark:text-slate-400" colSpan={8}>
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
                    </tr>
                  ))}
                </Fragment>
              ))}
              {displayJobs.length === 0 && !error ? (
                <tr>
                  <td className="px-4 py-8 text-center text-slate-500 dark:text-slate-400" colSpan={8}>
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
    </div>
  );
}
