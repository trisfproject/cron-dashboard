'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertSeverityBadge, AlertStateBadge } from '@/components/AlertBadge';
import { EnvironmentBadge, ServiceGroupBadge } from '@/components/EnvironmentBadge';
import { acknowledgeAlert, evaluateAlerts, formatApiError, getAlerts, getScopeOptions } from '@/lib/api';
import { formatDate } from '@/lib/format';

const PAGE_SIZE = 20;
const POLL_INTERVAL_MS = 10000;
const RETRY_DELAY_MS = 800;

function pollingDebug(message, metadata = {}) {
  console.debug(`[NYX polling] ${message}`, metadata);
}

function wait(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function isAbortError(error) {
  return error?.name === 'AbortError' || /aborted|abort/i.test(error?.message || '');
}

async function retryOnce(label, requestFactory) {
  try {
    return await requestFactory();
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }

    pollingDebug('retrying fetch', { label, error: error?.message });
    await wait(RETRY_DELAY_MS);
    const result = await requestFactory();
    pollingDebug('fetch recovered', { label });
    return result;
  }
}

function normalizeAlerts(data) {
  return Array.isArray(data?.alerts) ? data.alerts : [];
}

function alertKey(alert) {
  return String(alert?.id || `${alert?.triggered_at}-${alert?.cron_name}-${alert?.reason}`);
}

function alertParams(nextState, nextScope, offset = 0) {
  return {
    state: nextState,
    limit: PAGE_SIZE,
    offset,
    ...(nextScope.env ? { env: nextScope.env } : {}),
    ...(nextScope.service_group ? { service_group: nextScope.service_group } : {})
  };
}

function mergeFreshAlerts(currentAlerts, freshAlerts) {
  const freshById = new Map(freshAlerts.map((alert) => [alertKey(alert), alert]));
  const currentKeys = new Set(currentAlerts.map(alertKey));
  const newAlerts = freshAlerts.filter((alert) => !currentKeys.has(alertKey(alert)));
  const updatedCurrent = currentAlerts.map((alert) => freshById.get(alertKey(alert)) || alert);

  return {
    alerts: [...newAlerts, ...updatedCurrent],
    added: newAlerts.length
  };
}

function triggeredLabel(alert) {
  return formatDate(alert.triggered_at || alert.now_wib);
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState([]);
  const [state, setState] = useState('all');
  const [scope, setScope] = useState({ env: '', service_group: '' });
  const [scopeOptions, setScopeOptions] = useState({ environments: [], service_groups: [] });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState(0);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const alertsRef = useRef([]);
  const pollInFlightRef = useRef(false);
  const visibleRef = useRef(true);

  function replaceAlerts(nextAlerts) {
    alertsRef.current = nextAlerts;
    setAlerts(nextAlerts);
  }

  const loadAlerts = useCallback(async (nextState = state, nextScope = scope) => {
    setLoading(true);
    setError('');
    setLoadError('');

    try {
      const data = await getAlerts(alertParams(nextState, nextScope, 0));
      const nextAlerts = normalizeAlerts(data);
      replaceAlerts(nextAlerts);
      setHasMore(Boolean(data?.has_more));
      setNextOffset(Number(data?.next_offset || nextAlerts.length || 0));
    } catch (fetchError) {
      setError(formatApiError(fetchError, 'Failed to load alerts'));
      replaceAlerts([]);
      setHasMore(false);
      setNextOffset(0);
    } finally {
      setLoading(false);
    }
  }, [scope, state]);

  useEffect(() => {
    loadAlerts(state);
  }, [loadAlerts, state, scope.env, scope.service_group]);

  useEffect(() => {
    alertsRef.current = alerts;
  }, [alerts]);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return undefined;
    }

    visibleRef.current = !document.hidden;

    function onVisibilityChange() {
      visibleRef.current = !document.hidden;
      pollingDebug(document.hidden ? 'polling paused' : 'polling resumed', { page: 'alerts' });
    }

    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(async () => {
      if (!visibleRef.current) {
        pollingDebug('polling paused', { page: 'alerts' });
        return;
      }

      if (pollInFlightRef.current) {
        pollingDebug('poll skipped; request still in flight', { page: 'alerts' });
        return;
      }

      pollInFlightRef.current = true;

      try {
        const data = await retryOnce('alerts-page', () => getAlerts(alertParams(state, scope, 0)));
        const freshAlerts = normalizeAlerts(data);
        const merged = mergeFreshAlerts(alertsRef.current, freshAlerts);
        replaceAlerts(merged.alerts);
        if (merged.added > 0) {
          setNextOffset((offset) => offset + merged.added);
        }
        setHasMore(Boolean(data?.has_more) || merged.alerts.length > PAGE_SIZE);
      } catch (pollError) {
        if (isAbortError(pollError)) {
          pollingDebug('request aborted', { page: 'alerts' });
        } else {
          console.warn('Failed to refresh alerts:', pollError);
        }
      } finally {
        pollInFlightRef.current = false;
      }
    }, POLL_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [scope.env, scope.service_group, state]);

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
    const nextAlerts = state === 'active'
      ? alertsRef.current.filter((alert) => Number(alert.id) !== Number(id))
      : alertsRef.current.map((alert) => Number(alert.id) === Number(id)
        ? { ...alert, state: 'acknowledged' }
        : alert);
    replaceAlerts(nextAlerts);
    setNextOffset(nextAlerts.length);
  }

  async function runEvaluation() {
    setEvaluating(true);
    setError('');

    try {
      await evaluateAlerts();
      await loadAlerts(state, scope);
    } catch (evaluationError) {
      setError(formatApiError(evaluationError, 'Failed to evaluate alerts'));
    } finally {
      setEvaluating(false);
    }
  }

  async function loadMore() {
    setLoadingMore(true);
    setLoadError('');

    try {
      const data = await getAlerts(alertParams(state, scope, nextOffset));
      const nextAlerts = normalizeAlerts(data);
      const seen = new Set(alertsRef.current.map(alertKey));
      const merged = [...alertsRef.current];

      for (const alert of nextAlerts) {
        if (!seen.has(alertKey(alert))) {
          merged.push(alert);
        }
      }

      replaceAlerts(merged);
      setHasMore(Boolean(data?.has_more));
      setNextOffset(Number(data?.next_offset || nextOffset + nextAlerts.length));
    } catch (fetchError) {
      setLoadError(formatApiError(fetchError, 'Failed to load more alerts'));
    } finally {
      setLoadingMore(false);
    }
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
          <button type="button" onClick={runEvaluation} disabled={evaluating} className="inline-flex min-h-10 items-center rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-blue-600 dark:hover:bg-blue-500">
            {evaluating ? 'Evaluating...' : 'Evaluate now'}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm dark:border-slate-800 dark:bg-slate-950 lg:flex-row lg:items-start lg:justify-between lg:p-3">
        <div className="flex gap-1 overflow-x-auto rounded-md bg-slate-100 p-1 dark:bg-slate-800/70">
          {['active', 'acknowledged', 'resolved', 'all'].map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setState(item)}
              className={`min-h-10 shrink-0 rounded px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
                state === item
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-700 hover:bg-white dark:text-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {item}
            </button>
          ))}
        </div>

        <div className="grid min-w-0 grid-cols-1 gap-2 min-[520px]:grid-cols-2 lg:flex lg:shrink-0">
          <select
            value={scope.env}
            onChange={(event) => setScope((current) => ({ ...current, env: event.target.value }))}
            className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950 lg:w-48"
          >
            <option value="">All environments</option>
            {scopeOptions.environments.map((option) => <option key={option.value} value={option.value}>{option.value}</option>)}
          </select>
          <select
            value={scope.service_group}
            onChange={(event) => setScope((current) => ({ ...current, service_group: event.target.value }))}
            className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950 lg:w-48"
          >
            <option value="">All services</option>
            {scopeOptions.service_groups.map((option) => <option key={option.value} value={option.value}>{option.value}</option>)}
          </select>
        </div>
      </div>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
        {error ? <div className="border-b border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div> : null}
        {loading ? <div className="p-8 text-center text-sm text-slate-500">Loading alerts...</div> : null}
        {!loading ? (
          <>
            <div className="space-y-3 p-3 lg:hidden">
              {alerts.map((alert) => (
                <article key={alert.id} className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap gap-2">
                        <AlertSeverityBadge severity={alert.severity} />
                        <AlertStateBadge state={alert.state} />
                      </div>
                      <p className="break-words text-sm font-semibold text-ink">{alert.cron_name || 'All monitored cron jobs'}</p>
                    </div>
                    {alert.state === 'active' ? (
                      <button type="button" onClick={() => acknowledge(alert.id)} className="min-h-10 shrink-0 rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 dark:border-slate-800 dark:text-slate-200">
                        Ack
                      </button>
                    ) : null}
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-300">{alert.reason}</p>
                  <div className="flex flex-wrap gap-2">
                    {alert.env ? <EnvironmentBadge env={alert.env} /> : null}
                    <ServiceGroupBadge serviceGroup={alert.service_group} />
                  </div>
                  <div className="grid gap-2 text-xs text-slate-500 sm:grid-cols-2">
                    <span>Triggered: {triggeredLabel(alert)}</span>
                    {alert.resolved_at ? <span>Resolved: {formatDate(alert.resolved_at)}</span> : null}
                    {alert.acknowledged_at ? <span>Acknowledged: {formatDate(alert.acknowledged_at)}</span> : null}
                    {alert.last_notification_status ? (
                      <span className="w-fit rounded-md bg-white px-2 py-1 font-medium capitalize ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
                        Notify: {alert.last_notification_status}
                      </span>
                    ) : null}
                  </div>
                </article>
              ))}
              {alerts.length === 0 ? <div className="px-4 py-8 text-center text-sm text-slate-500">No alerts found.</div> : null}
            </div>

            <div className="hidden overflow-x-auto lg:block">
              <table className="min-w-[82rem] divide-y divide-slate-200 text-sm dark:divide-slate-800">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-normal text-slate-500 dark:bg-slate-900">
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
                      <td className="min-w-[24rem] px-4 py-3 text-slate-600 dark:text-slate-300">
                        <div className="space-y-1">
                          <p>{alert.reason}</p>
                          {alert.rule_name ? <p className="text-xs text-slate-500">Rule: {alert.rule_name}</p> : null}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600 dark:text-slate-300">
                        <div className="space-y-1">
                          <p>{alert.last_notification_status || '-'}</p>
                          <p className="text-xs text-slate-500">{alert.notification_count || 0} sent</p>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600 dark:text-slate-300">{alert.triggered_at ? formatDate(alert.triggered_at) : '-'}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600 dark:text-slate-300">{alert.resolved_at ? formatDate(alert.resolved_at) : '-'}</td>
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
            <div className="flex flex-col gap-3 border-t border-slate-200 p-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-500">
                {alerts.length > 0 ? `${alerts.length} alert ${alerts.length === 1 ? 'event' : 'events'} loaded` : 'No alert events loaded'}
                {hasMore ? '. More alerts are available.' : alerts.length > 0 ? '. All matching alerts are loaded.' : ''}
              </p>
              <button
                type="button"
                onClick={loadMore}
                disabled={!hasMore || loadingMore || loading}
                className="min-h-10 w-full rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900 sm:w-auto"
              >
                {loadingMore ? 'Loading...' : 'Load More'}
              </button>
            </div>
            {loadError ? <p className="border-t border-rose-200 bg-rose-50 p-3 text-sm font-medium text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">{loadError}</p> : null}
          </>
        ) : null}
      </section>
    </div>
  );
}
