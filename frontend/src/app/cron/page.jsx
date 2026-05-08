import Link from 'next/link';
import { Fragment } from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getCronList, getScopeOptions } from '@/lib/api';
import { formatDate, formatDuration, formatNumber, formatPercent } from '@/lib/format';
import { EnvironmentBadge, ServiceGroupBadge } from '@/components/EnvironmentBadge';
import { StatusBadge } from '@/components/StatusBadge';

export const dynamic = 'force-dynamic';

function parseServiceGroup(cronName = '') {
  return String(cronName || '').trim().split(/\s+/)[0] || 'Unassigned';
}

function compareServiceGroups(left, right) {
  if (left === 'Unassigned') return 1;
  if (right === 'Unassigned') return -1;
  return left.localeCompare(right);
}

const filterControlClass = 'h-11 w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-blue-400 dark:focus:ring-blue-950';
const filterInputClass = `${filterControlClass} py-2`;
const filterSelectClass = `${filterControlClass} py-2`;

export default async function CronListPage({ searchParams }) {
  const resolvedSearchParams = await searchParams;
  const requestHeaders = await headers();
  const cookie = requestHeaders.get('cookie') || '';
  const authorization = requestHeaders.get('authorization') || '';
  const apiOptions = {
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(authorization ? { authorization } : {})
    }
  };
  const nameFilter = resolvedSearchParams?.cron_name || '';
  const serverFilter = resolvedSearchParams?.server || '';
  const statusFilter = resolvedSearchParams?.status || '';
  const envFilter = resolvedSearchParams?.env || '';
  const serviceGroupFilter = resolvedSearchParams?.service_group || '';
  const rangeFilter = ['today', '7d', '30d'].includes(resolvedSearchParams?.range)
    ? resolvedSearchParams.range
    : 'today';
  const rangeLabel = {
    today: 'today',
    '7d': 'the last 7 days',
    '30d': 'the last 30 days'
  }[rangeFilter];
  let jobs = [];
  let scopeOptions = { environments: [], service_groups: [] };
  let error = null;

  try {
    const [response, scopeResponse] = await Promise.all([
      getCronList({ range: rangeFilter, env: envFilter, service_group: serviceGroupFilter }, apiOptions),
      getScopeOptions(apiOptions).catch((scopeError) => {
        if (scopeError?.status === 401) {
          throw scopeError;
        }

        return { environments: [], service_groups: [] };
      })
    ]);
    jobs = Array.isArray(response?.jobs) ? response.jobs : [];
    scopeOptions = {
      environments: Array.isArray(scopeResponse?.environments) ? scopeResponse.environments : [],
      service_groups: Array.isArray(scopeResponse?.service_groups) ? scopeResponse.service_groups : []
    };
  } catch (fetchError) {
    if (fetchError?.status === 401) {
      redirect('/login?next=/cron');
    }

    console.error('Failed to fetch cron list:', fetchError);
    error = fetchError?.message || 'Failed to load cron jobs';
  }

  const displayJobs = jobs.map((job) => ({
    ...job,
    service_group: job?.service_group || parseServiceGroup(job?.cron_name)
  }));

  const filteredJobs = displayJobs.filter((job) => {
    const cronName = String(job?.cron_name ?? '');
    const server = String(job?.server ?? '');
    const matchesName = nameFilter ? cronName.toLowerCase().includes(nameFilter.toLowerCase()) : true;
    const matchesServer = serverFilter ? server.toLowerCase().includes(serverFilter.toLowerCase()) : true;
    const matchesStatus = statusFilter !== '' ? Number(job.last_status) === Number(statusFilter) : true;

    return matchesName && matchesServer && matchesStatus;
  });
  const groupedJobs = filteredJobs.reduce((groups, job) => {
    const key = job?.service_group;
    groups[key] = [...(groups[key] || []), job];
    return groups;
  }, {});
  const serviceGroups = Object.keys(groupedJobs).sort(compareServiceGroups);

  function cronHref(job) {
    const params = new URLSearchParams();
    if (job?.server) params.set('server', job.server);
    if (job?.env) params.set('env', job.env);
    if (job?.service_group) params.set('service_group', job.service_group);
    const suffix = params.toString() ? `?${params.toString()}` : '';
    return `/cron/${encodeURIComponent(job?.cron_name ?? '')}${suffix}`;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal text-ink">Cron jobs</h1>
        <p className="mt-1 text-sm text-slate-500">Daily cron health overview. Metrics calculated from {rangeLabel} in WIB.</p>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <form className="grid w-full min-w-0 grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950 sm:grid-cols-2 xl:grid-cols-[repeat(14,minmax(0,1fr))]" action="/cron">
        <input
          className={`${filterInputClass} xl:col-span-3`}
          name="cron_name"
          placeholder="Filter by cron name"
          defaultValue={nameFilter}
        />
        <input
          className={`${filterInputClass} xl:col-span-2`}
          name="server"
          placeholder="Filter by server"
          defaultValue={serverFilter}
        />
        <select
          className={`${filterSelectClass} xl:col-span-2`}
          name="range"
          defaultValue={rangeFilter}
        >
          <option value="today">Today</option>
          <option value="7d">7D</option>
          <option value="30d">30D</option>
        </select>
        <select
          className={`${filterSelectClass} xl:col-span-2`}
          name="env"
          defaultValue={envFilter}
        >
          <option value="">All environments</option>
          {scopeOptions.environments.map((option) => <option key={option.value} value={option.value}>{option.value}</option>)}
        </select>
        <select
          className={`${filterSelectClass} xl:col-span-2`}
          name="service_group"
          defaultValue={serviceGroupFilter}
        >
          <option value="">All services</option>
          {scopeOptions.service_groups.map((option) => <option key={option.value} value={option.value}>{option.value}</option>)}
        </select>
        <select
          className={`${filterSelectClass} xl:col-span-2`}
          name="status"
          defaultValue={statusFilter}
        >
          <option value="">All statuses</option>
          <option value="0">Success</option>
          <option value="1">Failed</option>
          <option value="2">Warning</option>
        </select>
        <button className="h-11 w-full rounded-md bg-ink px-4 text-sm font-semibold text-white transition hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:bg-blue-600 dark:hover:bg-blue-500 dark:focus:ring-offset-slate-950 sm:col-span-2 xl:col-span-1" type="submit">
          Apply
        </button>
      </form>

      <div className="w-full min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div className="border-b border-slate-200 px-4 py-3 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
          Last status, last run freshness, runs, success rate, and average duration are calculated only from {rangeLabel} using the Asia/Jakarta day boundary.
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800 lg:hidden">
          {serviceGroups.map((group) => (
            <div key={`${group}-mobile-group`}>
              <div className="bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-normal text-slate-500 dark:bg-slate-900/60 dark:text-slate-400">
                <span>{group}</span>
                <span className="ml-2 font-medium normal-case text-slate-400">{formatNumber(groupedJobs[group].length)} jobs</span>
              </div>
              {groupedJobs[group].map((job, index) => (
                <article key={`${job?.cron_name ?? 'cron'}-${job?.server ?? 'server'}-mobile-${index}`} className="space-y-4 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <Link className="min-w-0 break-words font-medium text-ink hover:text-blue-700 dark:text-slate-100 dark:hover:text-blue-300" href={cronHref(job)}>
                      {job?.cron_name ?? '-'}
                    </Link>
                    <StatusBadge status={job?.last_status} />
                  </div>
                  <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                    <div className="min-w-0">
                      <p className="text-xs text-slate-500">Server</p>
                      <p className="mt-1 truncate text-slate-700 dark:text-slate-300">{job?.server ?? '-'}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-slate-500">Env</p>
                      <p className="mt-1 truncate text-slate-700 dark:text-slate-300">{job?.env ? <EnvironmentBadge env={job.env} /> : '-'}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-slate-500">Service</p>
                      <p className="mt-1 truncate text-slate-700 dark:text-slate-300"><ServiceGroupBadge serviceGroup={job?.service_group} />{!job?.service_group ? '-' : null}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-slate-500">Runs</p>
                      <p className="mt-1 font-medium text-slate-700 dark:text-slate-300">{formatNumber(job?.total_runs ?? 0)}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-slate-500">Success</p>
                      <p className="mt-1 font-medium text-slate-700 dark:text-slate-300">{formatPercent(job?.success_rate ?? 0)}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-2 border-t border-slate-100 pt-3 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-400 sm:grid-cols-2">
                    <span>Avg duration: {formatDuration(job?.avg_duration ?? 0)}</span>
                    <span>Last run: {formatDate(job?.last_run)}</span>
                  </div>
                </article>
              ))}
            </div>
          ))}
          {filteredJobs.length === 0 && !error ? (
            <div className="px-4 py-8 text-center text-sm text-slate-500">No cron executions found for {rangeLabel}.</div>
          ) : null}
        </div>

        <div className="hidden overflow-x-auto lg:block">
          <table className="min-w-[68rem] divide-y divide-slate-200 text-sm dark:divide-slate-800 xl:min-w-full">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-normal text-slate-500 dark:bg-slate-900/60 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3">Service</th>
                <th className="px-4 py-3">Cron</th>
                <th className="px-4 py-3">Server</th>
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
                    <td className="px-4 py-2 text-xs font-semibold uppercase tracking-normal text-slate-500 dark:text-slate-400" colSpan={9}>
                      <span>{group}</span>
                      <span className="ml-2 font-medium normal-case text-slate-400">{formatNumber(groupedJobs[group].length)} jobs</span>
                    </td>
                  </tr>
                  {groupedJobs[group].map((job, index) => (
                    <tr key={`${job?.cron_name ?? 'cron'}-${job?.server ?? 'server'}-${index}`} className="dark:border-slate-800">
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600 dark:text-slate-300"><ServiceGroupBadge serviceGroup={job?.service_group} />{!job?.service_group ? '-' : null}</td>
                      <td className="max-w-[22rem] px-4 py-3 font-medium text-ink dark:text-slate-100">
                        <Link className="block truncate hover:text-blue-700 dark:hover:text-blue-300" href={cronHref(job)}>
                          {job?.cron_name ?? '-'}
                        </Link>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600 dark:text-slate-300">{job?.server ?? '-'}</td>
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
              {filteredJobs.length === 0 && !error ? (
                <tr>
                  <td className="px-4 py-8 text-center text-slate-500" colSpan={9}>No cron executions found for {rangeLabel}.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
