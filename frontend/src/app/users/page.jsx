'use client';

import { useEffect, useState } from 'react';
import ActionDropdown from '@/components/ActionDropdown';
import ConfirmationDialog from '@/components/ConfirmationDialog';
import EditUserModal from '@/components/EditUserModal';
import ResetPasswordModal from '@/components/ResetPasswordModal';
import { archiveUser, canDeleteUser, createUser, deactivateUser, deleteUser, forceLogoutUser, getUsers, reactivateUser, resetUserPassword, updateUser } from '@/lib/api';

const emptyForm = {
  name: '',
  email: '',
  password: '',
  role: 'user'
};

function AccountStatusBadge({ user }) {
  const isArchived = user.archived_at;
  const isActive = user.is_active;

  let status = 'active';
  let styles = 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:ring-emerald-900';

  if (isArchived) {
    status = 'archived';
    styles = 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800';
  } else if (!isActive) {
    status = 'disabled';
    styles = 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800';
  }

  return (
    <span className={`w-fit rounded-md px-2 py-1 text-xs font-semibold capitalize ring-1 ${styles}`}>
      {status}
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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [currentUser, setCurrentUser] = useState(null);

  // Modal states
  const [editingUser, setEditingUser] = useState(null);
  const [resetPasswordUser, setResetPasswordUser] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState({
    open: false,
    action: null,
    user: null,
    title: '',
    description: ''
  });

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

  async function loadCurrentUser() {
    try {
      const response = await fetch('/api/auth/me');
      if (response.ok) {
        const data = await response.json();
        setCurrentUser(data.user);
      }
    } catch {
      // Silent fail
    }
  }

  useEffect(() => {
    loadUsers();
    loadCurrentUser();
  }, []);

  function updateForm(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
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

  async function handleEditUser(updatedData) {
    setSaving(true);
    setError('');

    try {
      await updateUser(editingUser.id, updatedData);
      setEditingUser(null);
      await loadUsers();
    } catch (updateError) {
      setError(updateError?.message || 'Failed to update user');
    } finally {
      setSaving(false);
    }
  }

  async function handleResetPassword(password) {
    setSaving(true);
    setError('');

    try {
      await resetUserPassword(resetPasswordUser.id, password);
      setResetPasswordUser(null);
      await loadUsers();
    } catch (resetError) {
      setError(resetError?.message || 'Failed to reset password');
    } finally {
      setSaving(false);
    }
  }

  async function handleForceLogout(user) {
    setConfirmDialog({
      open: true,
      action: async () => {
        setSaving(true);
        try {
          await forceLogoutUser(user.id);
          await loadUsers();
          setConfirmDialog({ ...confirmDialog, open: false });
        } catch (err) {
          setError(err?.message || 'Failed to force logout');
        } finally {
          setSaving(false);
        }
      },
      user,
      title: 'Force logout',
      description: `Invalidate all active sessions for ${user.email}?`
    });
  }

  async function handleToggleStatus(user) {
    const action = user.is_active ? 'deactivate' : 'reactivate';
    setConfirmDialog({
      open: true,
      action: async () => {
        setSaving(true);
        try {
          if (user.is_active) {
            await deactivateUser(user.id);
          } else {
            await reactivateUser(user.id);
          }
          await loadUsers();
          setConfirmDialog({ ...confirmDialog, open: false });
        } catch (err) {
          setError(err?.message || 'Failed to update user status');
        } finally {
          setSaving(false);
        }
      },
      user,
      title: `${action.charAt(0).toUpperCase() + action.slice(1)} user`,
      description: `${action.charAt(0).toUpperCase() + action.slice(1)} ${user.email}?`,
      isDangerous: true
    });
  }

  async function handleArchive(user) {
    setConfirmDialog({
      open: true,
      action: async () => {
        setSaving(true);
        try {
          await archiveUser(user.id);
          await loadUsers();
          setConfirmDialog({ ...confirmDialog, open: false });
        } catch (err) {
          setError(err?.message || 'Failed to archive user');
        } finally {
          setSaving(false);
        }
      },
      user,
      title: 'Archive user',
      description: `Archive ${user.email}? They will be unable to log in.`,
      isDangerous: true
    });
  }

  async function handleDelete(user) {
    const deletionInfo = await canDeleteUser(user.id).catch(() => ({ canDelete: false }));
    
    if (deletionInfo.canDelete) {
      setConfirmDialog({
        open: true,
        action: async () => {
          setSaving(true);
          try {
            await deleteUser(user.id, true);
            await loadUsers();
            setConfirmDialog({ ...confirmDialog, open: false });
          } catch (err) {
            setError(err?.message || 'Failed to delete user');
          } finally {
            setSaving(false);
          }
        },
        user,
        title: 'Permanently delete user',
        description: `Permanently delete ${user.email}? This action cannot be undone.`,
        confirmText: 'Delete permanently',
        isDangerous: true
      });
    } else {
      setConfirmDialog({
        open: true,
        action: async () => {
          setSaving(true);
          try {
            await deleteUser(user.id, false);
            await loadUsers();
            setConfirmDialog({ ...confirmDialog, open: false });
          } catch (err) {
            setError(err?.message || 'Failed to delete user');
          } finally {
            setSaving(false);
          }
        },
        user,
        title: 'Archive user',
        description: `${deletionInfo.reason}. The user will be archived instead.`,
        confirmText: 'Archive user',
        isDangerous: true
      });
    }
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
                <AccountStatusBadge user={user} />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <RoleBadge role={user.role} />
                <span className="text-xs text-slate-500">Last login: {user.last_login_at || 'Never'}</span>
              </div>
              <div>
                <ActionDropdown
                  user={user}
                  isCurrentUser={currentUser?.id === user.id}
                  onEdit={setEditingUser}
                  onResetPassword={setResetPasswordUser}
                  onForceLogout={handleForceLogout}
                  onToggleStatus={handleToggleStatus}
                  onArchive={handleArchive}
                  onDelete={handleDelete}
                />
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
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {users.map((user) => (
                <tr key={user.id} className="align-middle">
                  <td className="px-4 py-3">
                    <p className="font-medium text-ink">{user.name}</p>
                    <p className="text-xs text-slate-500">{user.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <RoleBadge role={user.role} />
                  </td>
                  <td className="px-4 py-3">
                    <AccountStatusBadge user={user} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600 dark:text-slate-300">{user.last_login_at || 'Never'}</td>
                  <td className="px-4 py-3">
                    <ActionDropdown
                      user={user}
                      isCurrentUser={currentUser?.id === user.id}
                      onEdit={setEditingUser}
                      onResetPassword={setResetPasswordUser}
                      onForceLogout={handleForceLogout}
                      onToggleStatus={handleToggleStatus}
                      onArchive={handleArchive}
                      onDelete={handleDelete}
                    />
                  </td>
                </tr>
              ))}
              {users.length === 0 && !loading ? (
                <tr>
                  <td className="px-4 py-8 text-center text-slate-500" colSpan={5}>No users found.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <EditUserModal
        user={editingUser}
        onSave={handleEditUser}
        onCancel={() => setEditingUser(null)}
        isLoading={saving}
      />

      <ResetPasswordModal
        user={resetPasswordUser}
        onSave={handleResetPassword}
        onCancel={() => setResetPasswordUser(null)}
        isLoading={saving}
      />

      <ConfirmationDialog
        open={confirmDialog.open}
        title={confirmDialog.title}
        description={confirmDialog.description}
        confirmText={confirmDialog.confirmText || 'Confirm'}
        onConfirm={confirmDialog.action}
        onCancel={() => setConfirmDialog({ ...confirmDialog, open: false })}
        isLoading={saving}
        isDangerous={confirmDialog.isDangerous}
      />
    </div>
  );
}

