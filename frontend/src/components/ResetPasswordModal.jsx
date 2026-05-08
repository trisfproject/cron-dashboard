'use client';

import { useEffect, useState } from 'react';
import { passwordPolicyChecks, PasswordPolicyChecklist } from '@/components/PasswordPolicyChecklist';
import { formatApiError } from '@/lib/api';

export default function ResetPasswordModal({ user, onSave, onCancel, isLoading }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const passwordValid = passwordPolicyChecks(password).every((check) => check.valid);

  useEffect(() => {
    setPassword('');
    setError('');
  }, [user?.id]);

  if (!user) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    try {
      await onSave(password);
      setPassword('');
    } catch (saveError) {
      setError(formatApiError(saveError, 'Failed to reset password'));
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 dark:bg-black/70">
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-800 dark:bg-slate-950">
        <div className="border-b border-slate-200 px-6 py-4 dark:border-slate-800">
          <h2 className="text-lg font-semibold text-ink">Reset password</h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-6">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Enter a new password for <span className="font-medium">{user.email}</span>
          </p>

          <label className="space-y-1">
            <span className="text-sm font-medium text-slate-600 dark:text-slate-300">New password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError('');
              }}
              minLength={8}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950"
              required
              autoFocus
            />
          </label>
          <PasswordPolicyChecklist password={password} />
          {error ? <p className="whitespace-pre-line rounded-md bg-rose-50 p-3 text-sm font-medium text-rose-700 dark:bg-rose-950/40 dark:text-rose-200">{error}</p> : null}

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
              disabled={isLoading || !passwordValid}
              className="flex-1 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-500"
            >
              {isLoading ? 'Resetting...' : 'Reset password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
