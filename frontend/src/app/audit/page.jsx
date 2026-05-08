'use client';

import { useEffect, useState } from 'react';
import { getAuditLogs, getUsers, formatApiError } from '@/lib/api';
import { formatDate } from '@/lib/format';

const PAGE_SIZE = 20;

const actionOptions = [
  'login',
  'logout',
  'failed_login',
  'alert_rule_created',
  'alert_rule_updated',
  'user_created',
  'role_changed',
  'password_reset',
  'alert_acknowledged',
  'session_forced_logout',
  'user_deactivated',
  'user_reactivated'
];

function StatusBadge({ status }) {
  return (
    <span className={`w-fit rounded-md px-2 py-1 text-xs font-semibold ring-1 ${
      status === 'failed'
        ? 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-200 dark:ring-rose-900'
        : 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:ring-emerald-900'
    }`}
    >
      {status}
    </span>
  );
}

function auditKey(log) {
  return String(log?.id || `${log?.created_at}-${log?.action}-${log?.user_email}-${log?.target_label}`);
}

function formatAction(action) {
  return String(action || 'audit_event').replaceAll('_', ' ');
}

function metadataSummary(metadata) {
  if (!metadata) {
    return '';
  }

  const value = typeof metadata === 'string' ? metadata : JSON.stringify(metadata);
  return value.length > 96 ? `${value.slice(0, 96)}...` : value;
}

function targetLabel(log) {
  return log.target_label || log.target_id || log.target_type || 'NYX';
}

export default function AuditPage() {
  const [logs, setLogs] = useState([]);
  const [users, setUsers] = useState([]);
  const [filters, setFilters] = useState({ action: '', user_id: '', start: '', end: '' });
  const [appliedFilters, setAppliedFilters] = useState({ action: '', user_id: '', start: '', end: '' });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState(0);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');

  async function loadUsers() {
    try {
      const userData = await getUsers();
      setUsers(Array.isArray(userData?.users) ? userData.users : []);
    } catch {
      setUsers([]);
    }
  }

  async function loadAudit(nextFilters = appliedFilters) {
    setLoading(true);
    setError('');
    setLoadError('');

    try {
      const auditData = await getAuditLogs({ ...nextFilters, limit: PAGE_SIZE, offset: 0 });
      const nextLogs = Array.isArray(auditData?.audit_logs) ? auditData.audit_logs : [];
      setLogs(nextLogs);
      setHasMore(Boolean(auditData?.has_more));
      setNextOffset(Number(auditData?.next_offset || nextLogs.length || 0));
    } catch (fetchError) {
      setError(formatApiError(fetchError, 'Failed to load audit logs'));
      setLogs([]);
      setHasMore(false);
      setNextOffset(0);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
    loadAudit({ action: '', user_id: '', start: '', end: '' });
  }, []);

  function updateFilter(key, value) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function submitFilters(event) {
    event.preventDefault();
    setAppliedFilters(filters);
    loadAudit(filters);
  }

  async function loadMore() {
    setLoadingMore(true);
    setLoadError('');

    try {
      const auditData = await getAuditLogs({ ...appliedFilters, limit: PAGE_SIZE, offset: nextOffset });
      const nextLogs = Array.isArray(auditData?.audit_logs) ? auditData.audit_logs : [];
      setLogs((current) => {
        const seen = new Set(current.map(auditKey));
        const merged = [...current];

        for (const log of nextLogs) {
          if (!seen.has(auditKey(log))) {
            merged.push(log);
          }
        }

        return merged;
      });
      setHasMore(Boolean(auditData?.has_more));
      setNextOffset(Number(auditData?.next_offset || nextOffset + nextLogs.length));
    } catch (fetchError) {
      setLoadError(formatApiError(fetchError, 'Failed to load more audit logs'));
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal text-ink">Audit Log</h1>
        <p className="mt-1 text-sm text-slate-500">Trace administrative, authentication, and incident-management actions.</p>
      </div>

      <form onSubmit={submitFilters} className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
        <label className="space-y-1">
          <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Action</span>
          <select value={filters.action} onChange={(event) => updateFilter('action', event.target.value)} className="min-h-10 w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950">
            <option value="">All actions</option>
            {actionOptions.map((action) => <option key={action} value={action}>{action}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium text-slate-600 dark:text-slate-300">User</span>
          <select value={filters.user_id} onChange={(event) => updateFilter('user_id', event.target.value)} className="min-h-10 w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950">
            <option value="">All users</option>
            {users.map((user) => <option key={user.id} value={user.id}>{user.email}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Start</span>
          <input type="date" value={filters.start} onChange={(event) => updateFilter('start', event.target.value)} className="min-h-10 w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950" />
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium text-slate-600 dark:text-slate-300">End</span>
          <input type="date" value={filters.end} onChange={(event) => updateFilter('end', event.target.value)} className="min-h-10 w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950" />
        </label>
        <div className="flex items-end sm:col-span-2 xl:col-span-1">
          <button type="submit" className="min-h-10 w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 dark:bg-blue-600 dark:hover:bg-blue-500 xl:w-auto" disabled={loading}>
            {loading ? 'Loading...' : 'Apply'}
          </button>
        </div>
      </form>

      {error ? <p className="rounded-md bg-rose-50 p-3 text-sm font-medium text-rose-700 dark:bg-rose-950/40 dark:text-rose-200">{error}</p> : null}

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
        {loading ? <div className="p-8 text-center text-sm text-slate-500">Loading audit logs...</div> : null}
        <div className="space-y-3 p-4 lg:hidden">
          {logs.map((log) => (
            <article key={log.id} className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="break-words font-semibold capitalize text-ink">{formatAction(log.action)}</p>
                  <p className="text-xs text-slate-500">{formatDate(log.created_at)}</p>
                </div>
                <StatusBadge status={log.status} />
              </div>
              <div className="grid gap-2 text-sm text-slate-600 dark:text-slate-300 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">Actor</p>
                  <p className="break-words">{log.user_email || 'System'}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">Target</p>
                  <p className="break-words">{targetLabel(log)}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">IP</p>
                  <p>{log.ip_address || '-'}</p>
                </div>
                {metadataSummary(log.metadata) ? (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">Metadata</p>
                    <p className="break-words font-mono text-xs">{metadataSummary(log.metadata)}</p>
                  </div>
                ) : null}
              </div>
            </article>
          ))}
          {logs.length === 0 && !loading ? <div className="py-8 text-center text-sm text-slate-500">No audit events found.</div> : null}
        </div>
        <div className="hidden overflow-x-auto lg:block">
          <table className="min-w-[76rem] divide-y divide-slate-200 text-sm dark:divide-slate-800">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-normal text-slate-500 dark:bg-slate-900">
              <tr>
                <th className="px-4 py-3">Timestamp</th>
                <th className="px-4 py-3">Actor</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Target</th>
                <th className="px-4 py-3">IP</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Metadata</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {logs.map((log) => (
                <tr key={log.id}>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600 dark:text-slate-300">{formatDate(log.created_at)}</td>
                  <td className="px-4 py-3 font-medium text-ink">{log.user_email || 'System'}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-medium capitalize text-slate-700 dark:text-slate-200">{formatAction(log.action)}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{targetLabel(log)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600 dark:text-slate-300">{log.ip_address || '-'}</td>
                  <td className="px-4 py-3"><StatusBadge status={log.status} /></td>
                  <td className="max-w-xs truncate px-4 py-3 font-mono text-xs text-slate-500">{metadataSummary(log.metadata) || '-'}</td>
                </tr>
              ))}
              {logs.length === 0 && !loading ? (
                <tr>
                  <td className="px-4 py-8 text-center text-slate-500" colSpan={7}>No audit events found.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-3 border-t border-slate-200 p-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-500">
            {logs.length > 0 ? `${logs.length} audit ${logs.length === 1 ? 'event' : 'events'} loaded` : 'No audit events loaded'}
            {hasMore ? '. More events are available.' : logs.length > 0 ? '. All matching events are loaded.' : ''}
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
      </section>
    </div>
  );
}
