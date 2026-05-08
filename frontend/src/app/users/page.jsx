'use client';

import { useEffect, useState } from 'react';
import ActionDropdown from '@/components/ActionDropdown';
import ConfirmationDialog from '@/components/ConfirmationDialog';
import EditUserModal from '@/components/EditUserModal';
import { passwordPolicyChecks, PasswordPolicyChecklist } from '@/components/PasswordPolicyChecklist';
import ResetPasswordModal from '@/components/ResetPasswordModal';
import { archiveUser, canDeleteUser, createUser, deactivateUser, deleteUser, forceLogoutUser, formatApiError, getCurrentUser, getUsers, reactivateUser, resetUserPassword, restoreUser, updateUser } from '@/lib/api';

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

function lifecycleConflictCopy(conflict) {
  return {
    USER_ACTIVE: {
      title: 'Active user already exists',
      message: 'This email belongs to an active user. Use the existing account instead of creating a duplicate identity.'
    },
    USER_DISABLED: {
      title: 'Disabled user already exists',
      message: 'This email belongs to a disabled user. You can reactivate the account and optionally reset the password.'
    },
    USER_ARCHIVED: {
      title: 'Archived user already exists',
      message: 'This email belongs to an archived user. Restore the account to preserve audit and login history.'
    }
  }[conflict?.code] || {
    title: 'User already exists',
    message: conflict?.message || 'This email is already attached to an existing NYX account.'
  };
}

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [lifecycleConflict, setLifecycleConflict] = useState(null);
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
  const passwordValid = passwordPolicyChecks(form.password).every((check) => check.valid);

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
      const data = await getCurrentUser();
      setCurrentUser(data?.user || null);
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
    setError('');
    setLifecycleConflict(null);
  }

  async function submitUser(event) {
    event.preventDefault();
    setSaving(true);
    setError('');

    try {
      await createUser(form);
      setForm(emptyForm);
      setLifecycleConflict(null);
      await loadUsers();
    } catch (saveError) {
      if (saveError?.status === 409 && saveError?.code?.startsWith('USER_')) {
        setLifecycleConflict({
          code: saveError.code,
          message: saveError.userMessage || saveError.message,
          userId: saveError.userId,
          email: saveError.email,
          lifecycle_state: saveError.lifecycle_state,
          available_actions: saveError.available_actions || []
        });
      } else {
        setError(formatApiError(saveError, 'Failed to create user'));
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleLifecycleRecover(action) {
    if (!lifecycleConflict?.userId) {
      return;
    }

    setSaving(true);
    setError('');

    try {
      if (action === 'restore') {
        await restoreUser(lifecycleConflict.userId);
      }

      if (action === 'reactivate') {
        await reactivateUser(lifecycleConflict.userId);
      }

      setLifecycleConflict(null);
      await loadUsers();

      if (action === 'reset_password') {
        setResetPasswordUser({
          id: lifecycleConflict.userId,
          email: lifecycleConflict.email,
          name: lifecycleConflict.email
        });
      }
    } catch (recoverError) {
      setError(formatApiError(recoverError, 'Failed to recover user'));
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
      setError(formatApiError(updateError, 'Failed to update user'));
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
      throw resetError;
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
        {error ? <p className="whitespace-pre-line rounded-md bg-rose-50 p-3 text-sm font-medium text-rose-700 dark:bg-rose-950/40 dark:text-rose-200 md:col-span-4">{error}</p> : null}
        {lifecycleConflict ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-100 md:col-span-4">
            <p className="font-semibold">{lifecycleConflictCopy(lifecycleConflict).title}</p>
            <p className="mt-1">{lifecycleConflictCopy(lifecycleConflict).message}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {lifecycleConflict.available_actions?.includes('restore') ? (
                <button type="button" disabled={saving} onClick={() => handleLifecycleRecover('restore')} className="rounded-md bg-amber-700 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-amber-500 dark:text-slate-950 dark:hover:bg-amber-400">
                  Restore account
                </button>
              ) : null}
              {lifecycleConflict.available_actions?.includes('reactivate') ? (
                <button type="button" disabled={saving} onClick={() => handleLifecycleRecover('reactivate')} className="rounded-md bg-amber-700 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-amber-500 dark:text-slate-950 dark:hover:bg-amber-400">
                  Reactivate account
                </button>
              ) : null}
              {lifecycleConflict.available_actions?.includes('reset_password') ? (
                <button type="button" disabled={saving} onClick={() => handleLifecycleRecover('reset_password')} className="rounded-md border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-amber-800 dark:bg-slate-950 dark:text-amber-100 dark:hover:bg-amber-950">
                  Reset password
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
        <label className="space-y-1">
          <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Name</span>
          <input value={form.name} onChange={(event) => updateForm('name', event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950" required />
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Email</span>
          <input type="email" value={form.email} onChange={(event) => updateForm('email', event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950" required />
        </label>
        <label className="space-y-1 md:col-span-2">
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
          <PasswordPolicyChecklist password={form.password} />
        </div>
        <div className="md:col-span-4">
          <button type="submit" disabled={saving || !passwordValid} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300 dark:bg-blue-600 dark:hover:bg-blue-500 dark:disabled:bg-slate-800">
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
