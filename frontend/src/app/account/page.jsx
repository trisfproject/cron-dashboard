'use client';

import { useEffect, useState } from 'react';
import { getAuthActivity, getCurrentUser } from '@/lib/api';

export default function AccountPage() {
  const [user, setUser] = useState(null);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadSession() {
      try {
        const [userData, activityData] = await Promise.all([
          getCurrentUser(),
          getAuthActivity()
        ]);
        setUser(userData?.user || null);
        setActivity(Array.isArray(activityData?.activity) ? activityData.activity : []);
      } catch (fetchError) {
        setError(fetchError?.message || 'Failed to load session activity');
      } finally {
        setLoading(false);
      }
    }

    loadSession();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal text-ink">Session Security</h1>
        <p className="mt-1 text-sm text-slate-500">Review your current NYX session and recent authentication activity.</p>
      </div>

      {error ? <p className="rounded-md bg-rose-50 p-3 text-sm font-medium text-rose-700 dark:bg-rose-950/40 dark:text-rose-200">{error}</p> : null}
      {loading ? <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-950">Loading session...</div> : null}

      {user ? (
        <section className="grid gap-4 md:grid-cols-4">
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Current user</p>
            <p className="mt-2 font-semibold text-ink">{user.name}</p>
            <p className="text-sm text-slate-500">{user.email}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Role</p>
            <p className="mt-2 font-semibold uppercase text-ink">{user.role}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Session</p>
            <p className="mt-2 font-semibold text-emerald-700 dark:text-emerald-200">Active</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Last login</p>
            <p className="mt-2 font-semibold text-ink">{user.last_login_at || 'Current session'}</p>
          </div>
        </section>
      ) : null}

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div className="border-b border-slate-200 p-4 dark:border-slate-800">
          <h2 className="text-base font-semibold text-ink">Recent Authentication Activity</h2>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {activity.map((event) => (
            <div key={event.id} className="grid gap-1 p-4 text-sm sm:grid-cols-[10rem_1fr_auto] sm:items-center">
              <p className="font-medium text-ink">{event.action}</p>
              <p className="text-slate-500">IP {event.ip_address || '-'}</p>
              <p className="text-xs text-slate-500">{event.created_at}</p>
            </div>
          ))}
          {activity.length === 0 && !loading ? <div className="p-8 text-center text-sm text-slate-500">No recent authentication activity.</div> : null}
        </div>
      </section>
    </div>
  );
}
