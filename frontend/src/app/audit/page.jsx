'use client';

import { useEffect, useState } from 'react';
import { getAuditLogs, getUsers } from '@/lib/api';

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

export default function AuditPage() {
  const [logs, setLogs] = useState([]);
  const [users, setUsers] = useState([]);
  const [filters, setFilters] = useState({ action: '', user_id: '', start: '', end: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadAudit() {
    setLoading(true);
    setError('');

    try {
      const [auditData, userData] = await Promise.all([
        getAuditLogs(filters),
        getUsers().catch(() => ({ users: [] }))
      ]);
      setLogs(Array.isArray(auditData?.audit_logs) ? auditData.audit_logs : []);
      setUsers(Array.isArray(userData?.users) ? userData.users : []);
    } catch (fetchError) {
      setError(fetchError?.message || 'Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAudit();
  }, []);

  function updateFilter(key, value) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function submitFilters(event) {
    event.preventDefault();
    loadAudit();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal text-ink">Audit Log</h1>
        <p className="mt-1 text-sm text-slate-500">Trace administrative, authentication, and incident-management actions.</p>
      </div>

      <form onSubmit={submitFilters} className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950 md:grid-cols-5">
        <label className="space-y-1">
          <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Action</span>
          <select value={filters.action} onChange={(event) => updateFilter('action', event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950">
            <option value="">All actions</option>
            {actionOptions.map((action) => <option key={action} value={action}>{action}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium text-slate-600 dark:text-slate-300">User</span>
          <select value={filters.user_id} onChange={(event) => updateFilter('user_id', event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950">
            <option value="">All users</option>
            {users.map((user) => <option key={user.id} value={user.id}>{user.email}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Start</span>
          <input type="date" value={filters.start} onChange={(event) => updateFilter('start', event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950" />
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium text-slate-600 dark:text-slate-300">End</span>
          <input type="date" value={filters.end} onChange={(event) => updateFilter('end', event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950" />
        </label>
        <div className="flex items-end">
          <button type="submit" className="min-h-10 w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 dark:bg-blue-600 dark:hover:bg-blue-500">Apply</button>
        </div>
      </form>

      {error ? <p className="rounded-md bg-rose-50 p-3 text-sm font-medium text-rose-700 dark:bg-rose-950/40 dark:text-rose-200">{error}</p> : null}

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
        {loading ? <div className="p-8 text-center text-sm text-slate-500">Loading audit logs...</div> : null}
        <div className="space-y-3 p-4 md:hidden">
          {logs.map((log) => (
            <article key={log.id} className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-ink">{log.action}</p>
                  <p className="text-xs text-slate-500">{log.created_at}</p>
                </div>
                <StatusBadge status={log.status} />
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-300">{log.user_email || 'System'} → {log.target_label || log.target_id || log.target_type || 'NYX'}</p>
              <p className="text-xs text-slate-500">IP: {log.ip_address || '-'}</p>
            </article>
          ))}
        </div>
        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-normal text-slate-500 dark:bg-slate-900">
              <tr>
                <th className="px-4 py-3">Timestamp</th>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Target</th>
                <th className="px-4 py-3">IP</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {logs.map((log) => (
                <tr key={log.id}>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600 dark:text-slate-300">{log.created_at}</td>
                  <td className="px-4 py-3 font-medium text-ink">{log.user_email || 'System'}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600 dark:text-slate-300">{log.action}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{log.target_label || log.target_id || log.target_type || '-'}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600 dark:text-slate-300">{log.ip_address || '-'}</td>
                  <td className="px-4 py-3"><StatusBadge status={log.status} /></td>
                </tr>
              ))}
              {logs.length === 0 && !loading ? (
                <tr>
                  <td className="px-4 py-8 text-center text-slate-500" colSpan={6}>No audit events found.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
