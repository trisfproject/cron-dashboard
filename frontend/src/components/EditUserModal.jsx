'use client';

import { useEffect, useState } from 'react';
import { isPrivilegedRole } from '@/lib/rbac';

export default function EditUserModal({ user, onSave, onCancel, isLoading, canManagePrivileged = false }) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    role: 'user'
  });

  useEffect(() => {
    if (user) {
      setFormData({
        name: user.name || '',
        email: user.email || '',
        role: user.role || 'user'
      });
    }
  }, [user]);

  function handleChange(field, value) {
    setFormData((current) => ({ ...current, [field]: value }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    onSave(formData);
  }

  if (!user) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 dark:bg-black/70">
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-800 dark:bg-slate-950">
        <div className="border-b border-slate-200 px-6 py-4 dark:border-slate-800">
          <h2 className="text-lg font-semibold text-ink">Edit user</h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-6">
          <label className="space-y-1">
            <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Name</span>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950"
              required
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Email</span>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => handleChange('email', e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950"
              required
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Role</span>
            <select
              value={formData.role}
              onChange={(e) => handleChange('role', e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950"
              disabled={!canManagePrivileged && (isPrivilegedRole(user.role) || isPrivilegedRole(formData.role))}
            >
              <option value="user">User</option>
              {canManagePrivileged || formData.role === 'admin' ? <option value="admin">Admin</option> : null}
              {canManagePrivileged || formData.role === 'super_admin' ? <option value="super_admin">Super Admin</option> : null}
            </select>
          </label>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onCancel}
              disabled={isLoading}
              className="flex-1 rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-900"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-500"
            >
              {isLoading ? 'Saving...' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
