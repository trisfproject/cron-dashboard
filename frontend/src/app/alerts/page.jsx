'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertSeverityBadge, AlertStateBadge } from '@/components/AlertBadge';
import { EnvironmentBadge, ServiceGroupBadge } from '@/components/EnvironmentBadge';
import { acknowledgeAlert, evaluateAlerts, getAlerts, getScopeOptions } from '@/lib/api';

function normalizeAlerts(data) {
  return Array.isArray(data?.alerts) ? data.alerts : [];
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState([]);
  const [state, setState] = useState('all');
  const [scope, setScope] = useState({ env: '', service_group: '' });
  const [scopeOptions, setScopeOptions] = useState({ environments: [], service_groups: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadAlerts(nextState = state, nextScope = scope) {
    setLoading(true);
    setError('');

    try {
      const data = await getAlerts({
        state: nextState,
        limit: 200,
        ...(nextScope.env ? { env: nextScope.env } : {}),
        ...(nextScope.service_group ? { service_group: nextScope.service_group } : {})
      });
      setAlerts(normalizeAlerts(data));
    } catch (fetchError) {
      setError(fetchError?.message || 'Failed to load alerts');
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAlerts(state);
  }, [state, scope.env, scope.service_group]);

  useEffect(() => {
    getScopeOptions()
      .then((data) => setScopeOptions({
        environments: Array.isArray(data?.environments) ? data.environments : [],
        service_groups: Array.isArray(data?.service_groups) ? data.service_groups : []
      }))
      .catch((scopeError) => console.error('Failed to load scope options:', scopeError));
  }, []);

  async function acknowledge(id) {
    await acknowledgeAlert(id);
    await loadAlerts(state, scope);
  }

  async function runEvaluation() {
    await evaluateAlerts();
    await loadAlerts(state, scope);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal text-ink">Alert History</h1>
          <p className="mt-1 text-sm text-slate-500">Lifecycle history for active, acknowledged, and resolved cron alerts.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/alerts/config" className="inline-flex min-h-10 items-center rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-900">
            Configure alerts
          </Link>
          <button type="button" onClick={runEvaluation} className="inline-flex min-h-10 items-center rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 dark:bg-blue-600 dark:hover:bg-blue-500">
            Evaluate now
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {['active', 'acknowledged', 'resolved', 'all'].map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setState(item)}
            className={`min-h-10 rounded-md px-3 py-2 text-sm font-medium capitalize ring-1 ${
              state === item
                ? 'bg-blue-600 text-white ring-blue-600'
                : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50 dark:bg-slate-950 dark:text-slate-300 dark:ring-slate-800'
            }`}
          >
            {item}
          </button>
        ))}
      </div>

      <div className="grid gap-2 rounded-lg border border-slate-200 bg-white p-3 shadow-sm sm:grid-cols-2 lg:max-w-xl dark:border-slate-800 dark:bg-slate-950">
        <select
          value={scope.env}
          onChange={(event) => setScope((current) => ({ ...current, env: event.target.value }))}
          className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950"
        >
          <option value="">All environments</option>
          {scopeOptions.environments.map((option) => <option key={option.value} value={option.value}>{option.value}</option>)}
        </select>
        <select
          value={scope.service_group}
          onChange={(event) => setScope((current) => ({ ...current, service_group: event.target.value }))}
          className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950"
        >
          <option value="">All services</option>
          {scopeOptions.service_groups.map((option) => <option key={option.value} value={option.value}>{option.value}</option>)}
        </select>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        {error ? <div className="border-b border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div> : null}
        {loading ? <div className="p-8 text-center text-sm text-slate-500">Loading alerts...</div> : null}
        {!loading ? (
          <>
            <div className="space-y-3 p-3 md:hidden">
              {alerts.map((alert) => (
                <article key={alert.id} className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 break-words text-sm font-semibold text-ink">{alert.cron_name || 'All monitored cron jobs'}</p>
                    <AlertSeverityBadge severity={alert.severity} />
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-300">{alert.reason}</p>
                  <div className="flex flex-wrap gap-2">
                    {alert.env ? <EnvironmentBadge env={alert.env} /> : null}
                    <ServiceGroupBadge serviceGroup={alert.service_group} />
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <AlertStateBadge state={alert.state} />
                    {alert.last_notification_status ? (
                      <span className="rounded-md bg-white px-2 py-1 font-medium capitalize ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
                        Notify: {alert.last_notification_status}
                      </span>
                    ) : null}
                    <span>{alert.triggered_at || '-'}</span>
                  </div>
                  {alert.state === 'active' ? (
                    <button type="button" onClick={() => acknowledge(alert.id)} className="min-h-10 rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 dark:border-slate-800 dark:text-slate-200">
                      Acknowledge
                    </button>
                  ) : null}
                </article>
              ))}
              {alerts.length === 0 ? <div className="px-4 py-8 text-center text-sm text-slate-500">No alerts found.</div> : null}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-normal text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Cron</th>
                    <th className="px-4 py-3">Severity</th>
                    <th className="px-4 py-3">State</th>
                    <th className="px-4 py-3">Scope</th>
                    <th className="px-4 py-3">Reason</th>
                    <th className="px-4 py-3">Notify</th>
                    <th className="px-4 py-3">Triggered</th>
                    <th className="px-4 py-3">Resolved</th>
                    <th className="px-4 py-3">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {alerts.map((alert) => (
                    <tr key={alert.id} className="align-top">
                      <td className="max-w-[18rem] truncate px-4 py-3 font-medium text-ink">{alert.cron_name || 'All monitored cron jobs'}</td>
                      <td className="whitespace-nowrap px-4 py-3"><AlertSeverityBadge severity={alert.severity} /></td>
                      <td className="whitespace-nowrap px-4 py-3"><AlertStateBadge state={alert.state} /></td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <div className="flex gap-1.5">
                          {alert.env ? <EnvironmentBadge env={alert.env} /> : null}
                          <ServiceGroupBadge serviceGroup={alert.service_group} />
                        </div>
                      </td>
                      <td className="min-w-[24rem] px-4 py-3 text-slate-600 dark:text-slate-300">{alert.reason}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600 dark:text-slate-300">
                        {alert.last_notification_status || '-'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600 dark:text-slate-300">{alert.triggered_at || '-'}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600 dark:text-slate-300">{alert.resolved_at || '-'}</td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {alert.state === 'active' ? (
                          <button type="button" onClick={() => acknowledge(alert.id)} className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 dark:border-slate-800 dark:text-slate-200">
                            Acknowledge
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                  {alerts.length === 0 ? (
                    <tr>
                      <td className="px-4 py-8 text-center text-slate-500" colSpan={9}>No alerts found.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </section>
    </div>
  );
}
