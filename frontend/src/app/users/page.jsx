'use client';

import { useEffect, useState } from 'react';
import { createUser, deactivateUser, getUsers, reactivateUser, resetUserPassword, updateUser } from '@/lib/api';

const emptyForm = {
  name: '',
  email: '',
  password: '',
  role: 'user'
};

function StatusBadge({ active }) {
  return (
    <span className={`w-fit rounded-md px-2 py-1 text-xs font-semibold ring-1 ${
      active
        ? 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:ring-emerald-900'
        : 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800'
    }`}
    >
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}

function RoleBadge({ role }) {
  const admin = role === 'admin';

  return (
    <span className={`w-fit rounded-md px-2 py-1 text-xs font-semibold uppercase ring-1 ${
      admin
        ? 'bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-950/40 dark:text-blue-200 dark:ring-blue-900'
        : 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800'
    }`}
    >
      {role}
    </span>
  );
}

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [passwords, setPasswords] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function loadUsers() {
    setLoading(true);
    setError('');

    try {
      const data = await getUsers();
      setUsers(Array.isArray(data?.users) ? data.users : []);
    } catch (fetchError) {
      setError(fetchError?.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  function updateForm(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function runAction(action) {
    setError('');

    try {
      await action();
    } catch (actionError) {
      setError(actionError?.message || 'User management action failed');
    }
  }

  async function submitUser(event) {
    event.preventDefault();
    setSaving(true);
    setError('');

    try {
      await createUser(form);
      setForm(emptyForm);
      await loadUsers();
    } catch (saveError) {
      setError(saveError?.message || 'Failed to create user');
    } finally {
      setSaving(false);
    }
  }

  async function changeRole(user, role) {
    await runAction(async () => {
      await updateUser(user.id, { role });
      await loadUsers();
    });
  }

  async function toggleActive(user) {
    await runAction(async () => {
      if (user.is_active) {
        await deactivateUser(user.id);
      } else {
        await reactivateUser(user.id);
      }

      await loadUsers();
    });
  }

  async function submitPasswordReset(user) {
    const password = passwords[user.id] || '';

    if (password.length < 8) {
      setError('Reset password must be at least 8 characters.');
      return;
    }

    await runAction(async () => {
      await resetUserPassword(user.id, password);
      setPasswords((current) => ({ ...current, [user.id]: '' }));
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal text-ink">User Management</h1>
        <p className="mt-1 text-sm text-slate-500">Manage NYX access, roles, account status, and password resets.</p>
      </div>

      <form onSubmit={submitUser} className="grid gap-3 rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950 md:grid-cols-4">
        <div className="md:col-span-4">
          <h2 className="text-base font-semibold text-ink">Create User</h2>
          <p className="mt-1 text-sm text-slate-500">New users can sign in immediately when active.</p>
        </div>
        {error ? <p className="rounded-md bg-rose-50 p-3 text-sm font-medium text-rose-700 dark:bg-rose-950/40 dark:text-rose-200 md:col-span-4">{error}</p> : null}
        <label className="space-y-1">
          <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Name</span>
          <input value={form.name} onChange={(event) => updateForm('name', event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950" required />
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Email</span>
          <input type="email" value={form.email} onChange={(event) => updateForm('email', event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950" required />
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Temporary password</span>
          <input type="password" minLength={8} value={form.password} onChange={(event) => updateForm('password', event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950" required />
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Role</span>
          <select value={form.role} onChange={(event) => updateForm('role', event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950">
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        <div className="md:col-span-4">
          <button type="submit" disabled={saving} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300 dark:bg-blue-600 dark:hover:bg-blue-500">
            {saving ? 'Creating...' : 'Create user'}
          </button>
        </div>
      </form>

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div className="border-b border-slate-200 p-4 dark:border-slate-800">
          <h2 className="text-base font-semibold text-ink">Users</h2>
        </div>

        {loading ? <div className="p-8 text-center text-sm text-slate-500">Loading users...</div> : null}

        <div className="space-y-3 p-4 md:hidden">
          {users.map((user) => (
            <article key={user.id} className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-ink">{user.name}</p>
                  <p className="truncate text-sm text-slate-500">{user.email}</p>
                </div>
                <StatusBadge active={user.is_active} />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <RoleBadge role={user.role} />
                <span className="text-xs text-slate-500">Last login: {user.last_login_at || 'Never'}</span>
              </div>
              <div className="grid gap-2">
                <select value={user.role} onChange={(event) => changeRole(user, event.target.value)} className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950">
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
                <button type="button" onClick={() => toggleActive(user)} className="min-h-10 rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 dark:border-slate-800 dark:text-slate-200">
                  {user.is_active ? 'Deactivate' : 'Reactivate'}
                </button>
                <div className="flex gap-2">
                  <input type="password" minLength={8} placeholder="New password" value={passwords[user.id] || ''} onChange={(event) => setPasswords((current) => ({ ...current, [user.id]: event.target.value }))} className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950" />
                  <button type="button" onClick={() => submitPasswordReset(user)} className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white dark:bg-blue-600">Reset</button>
                </div>
              </div>
            </article>
          ))}
          {users.length === 0 && !loading ? (
            <div className="rounded-lg bg-slate-50 px-4 py-8 text-center text-sm text-slate-500 dark:bg-slate-950">No users found.</div>
          ) : null}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-normal text-slate-500 dark:bg-slate-900">
              <tr>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Last login</th>
                <th className="px-4 py-3">Reset password</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {users.map((user) => (
                <tr key={user.id} className="align-top">
                  <td className="px-4 py-3">
                    <p className="font-medium text-ink">{user.name}</p>
                    <p className="text-xs text-slate-500">{user.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <select value={user.role} onChange={(event) => changeRole(user, event.target.value)} className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-950">
                      <option value="user">User</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td className="px-4 py-3"><StatusBadge active={user.is_active} /></td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600 dark:text-slate-300">{user.last_login_at || 'Never'}</td>
                  <td className="px-4 py-3">
                    <div className="flex min-w-[16rem] gap-2">
                      <input type="password" minLength={8} placeholder="New password" value={passwords[user.id] || ''} onChange={(event) => setPasswords((current) => ({ ...current, [user.id]: event.target.value }))} className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-950" />
                      <button type="button" onClick={() => submitPasswordReset(user)} className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 dark:border-slate-800 dark:text-slate-200">Reset</button>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <button type="button" onClick={() => toggleActive(user)} className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 dark:border-slate-800 dark:text-slate-200">
                      {user.is_active ? 'Deactivate' : 'Reactivate'}
                    </button>
                  </td>
                </tr>
              ))}
              {users.length === 0 && !loading ? (
                <tr>
                  <td className="px-4 py-8 text-center text-slate-500" colSpan={6}>No users found.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
