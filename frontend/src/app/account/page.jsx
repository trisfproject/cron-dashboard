'use client';

import { useEffect, useState } from 'react';
import { Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { changePassword, getAuthActivity, getCurrentUser } from '@/lib/api';

const initialPasswordForm = {
  current_password: '',
  new_password: '',
  confirm_password: ''
};

function passwordPolicyChecks(password) {
  const value = String(password || '');

  return [
    { key: 'length', label: 'At least 8 characters', valid: value.length >= 8 },
    { key: 'uppercase', label: 'Uppercase letter', valid: /[A-Z]/.test(value) },
    { key: 'lowercase', label: 'Lowercase letter', valid: /[a-z]/.test(value) },
    { key: 'number', label: 'Number', valid: /[0-9]/.test(value) },
    { key: 'special', label: 'Special character', valid: /[^A-Za-z0-9]/.test(value) }
  ];
}

function PasswordField({ id, label, value, onChange, visible, onToggle, autoComplete }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-slate-600 dark:text-slate-300">{label}</span>
      <span className="flex min-h-11 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100 dark:border-slate-800 dark:bg-slate-950 dark:focus-within:border-blue-400 dark:focus-within:ring-blue-950">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="min-w-0 flex-1 bg-transparent text-ink outline-none"
          required
        />
        <button
          type="button"
          onClick={onToggle}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-slate-500 transition hover:bg-slate-100 hover:text-ink dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-white"
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
        >
          {visible ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
        </button>
      </span>
    </label>
  );
}

export default function AccountPage() {
  const [user, setUser] = useState(null);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [passwordForm, setPasswordForm] = useState(initialPasswordForm);
  const [visibleFields, setVisibleFields] = useState({});
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');

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

  const policyChecks = passwordPolicyChecks(passwordForm.new_password);
  const policyValid = policyChecks.every((check) => check.valid);
  const confirmationMatches = passwordForm.confirm_password
    ? passwordForm.new_password === passwordForm.confirm_password
    : true;
  const reusedPassword = Boolean(passwordForm.current_password && passwordForm.new_password && passwordForm.current_password === passwordForm.new_password);
  const passwordSubmitDisabled = passwordLoading
    || !passwordForm.current_password
    || !passwordForm.new_password
    || !passwordForm.confirm_password
    || !policyValid
    || !confirmationMatches
    || reusedPassword;

  function updatePasswordField(field, value) {
    setPasswordForm((current) => ({ ...current, [field]: value }));
    setPasswordError('');
    setPasswordSuccess('');
  }

  function toggleVisibleField(field) {
    setVisibleFields((current) => ({ ...current, [field]: !current[field] }));
  }

  async function handlePasswordSubmit(event) {
    event.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    if (passwordForm.new_password !== passwordForm.confirm_password) {
      setPasswordError('New password confirmation does not match.');
      return;
    }

    if (!policyValid) {
      setPasswordError('Password must meet all security requirements.');
      return;
    }

    if (reusedPassword) {
      setPasswordError('New password must be different from your current password.');
      return;
    }

    setPasswordLoading(true);

    try {
      await changePassword(passwordForm);
      setPasswordForm(initialPasswordForm);
      setVisibleFields({});
      setPasswordSuccess('Password changed. Other active sessions have been invalidated.');
      const activityData = await getAuthActivity();
      setActivity(Array.isArray(activityData?.activity) ? activityData.activity : []);
    } catch (changeError) {
      setPasswordError(changeError?.message?.replace(/^API request failed: \d+ [^:]+:?\s*/, '') || 'Unable to change password.');
    } finally {
      setPasswordLoading(false);
    }
  }

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

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <form onSubmit={handlePasswordSubmit} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950 sm:p-5">
          <div className="mb-5 flex items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-700 ring-1 ring-blue-200 dark:bg-blue-950/40 dark:text-blue-200 dark:ring-blue-900">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-ink">Change Password</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Update your NYX password and invalidate other active sessions.</p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <PasswordField
                id="current-password"
                label="Current password"
                autoComplete="current-password"
                value={passwordForm.current_password}
                onChange={(value) => updatePasswordField('current_password', value)}
                visible={Boolean(visibleFields.current_password)}
                onToggle={() => toggleVisibleField('current_password')}
              />
            </div>
            <PasswordField
              id="new-password"
              label="New password"
              autoComplete="new-password"
              value={passwordForm.new_password}
              onChange={(value) => updatePasswordField('new_password', value)}
              visible={Boolean(visibleFields.new_password)}
              onToggle={() => toggleVisibleField('new_password')}
            />
            <PasswordField
              id="confirm-password"
              label="Confirm new password"
              autoComplete="new-password"
              value={passwordForm.confirm_password}
              onChange={(value) => updatePasswordField('confirm_password', value)}
              visible={Boolean(visibleFields.confirm_password)}
              onToggle={() => toggleVisibleField('confirm_password')}
            />
          </div>

          {!confirmationMatches ? (
            <p className="mt-3 rounded-md bg-amber-50 p-3 text-sm font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-200">New password confirmation does not match.</p>
          ) : null}
          {reusedPassword ? (
            <p className="mt-3 rounded-md bg-amber-50 p-3 text-sm font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-200">New password must be different from your current password.</p>
          ) : null}
          {passwordError ? (
            <p className="mt-3 rounded-md bg-rose-50 p-3 text-sm font-medium text-rose-700 dark:bg-rose-950/40 dark:text-rose-200">{passwordError}</p>
          ) : null}
          {passwordSuccess ? (
            <p className="mt-3 rounded-md bg-emerald-50 p-3 text-sm font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200">{passwordSuccess}</p>
          ) : null}

          <button
            type="submit"
            disabled={passwordSubmitDisabled}
            className="mt-5 flex min-h-11 w-full items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300 dark:bg-blue-600 dark:hover:bg-blue-500 dark:disabled:bg-slate-800 sm:w-auto"
          >
            {passwordLoading ? 'Changing password...' : 'Change password'}
          </button>
        </form>

        <aside className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <h3 className="text-sm font-semibold text-ink">Password Policy</h3>
          <div className="mt-3 space-y-2">
            {policyChecks.map((check) => (
              <div key={check.key} className="flex items-center gap-2 text-sm">
                <span className={`h-2.5 w-2.5 rounded-full ${check.valid ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'}`} aria-hidden="true" />
                <span className={check.valid ? 'text-slate-700 dark:text-slate-200' : 'text-slate-500 dark:text-slate-400'}>{check.label}</span>
              </div>
            ))}
          </div>
          <p className="mt-4 text-sm leading-6 text-slate-500 dark:text-slate-400">
            Changing your password updates your security stamp. Existing sessions on other devices will be rejected on their next request.
          </p>
        </aside>
      </section>

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
