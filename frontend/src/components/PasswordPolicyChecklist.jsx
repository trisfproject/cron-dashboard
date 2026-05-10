'use client';

import { Check, X } from 'lucide-react';

export function passwordPolicyChecks(password) {
  const value = String(password || '');

  return [
    { key: 'uppercase', label: 'Uppercase letter', valid: /[A-Z]/.test(value) },
    { key: 'lowercase', label: 'Lowercase letter', valid: /[a-z]/.test(value) },
    { key: 'number', label: 'Number', valid: /[0-9]/.test(value) },
    { key: 'special', label: 'Special character', valid: /[^A-Za-z0-9]/.test(value) },
    { key: 'length', label: 'Minimum 8 characters', valid: value.length >= 8 }
  ];
}

export function passwordStrength(password) {
  const passed = passwordPolicyChecks(password).filter((check) => check.valid).length;

  if (!password) return { label: 'Not started', tone: 'empty', passed };
  if (passed <= 2) return { label: 'Weak', tone: 'weak', passed };
  if (passed <= 4) return { label: 'Medium', tone: 'medium', passed };
  return { label: 'Strong', tone: 'strong', passed };
}

const strengthToneClasses = {
  empty: 'bg-slate-200 dark:bg-slate-800',
  weak: 'bg-rose-500',
  medium: 'bg-amber-500',
  strong: 'bg-emerald-500'
};

const strengthTextClasses = {
  empty: 'text-slate-500 dark:text-slate-400',
  weak: 'text-rose-700 dark:text-rose-300',
  medium: 'text-amber-700 dark:text-amber-300',
  strong: 'text-emerald-700 dark:text-emerald-300'
};

export function PasswordPolicyChecklist({ password, className = '', compact = false }) {
  const checks = passwordPolicyChecks(password);
  const strength = passwordStrength(password);
  const barSpacing = compact ? 'mt-1.5 lg:mt-2' : 'mt-2';
  const checkGridClass = compact ? 'mt-2 grid gap-1.5 text-xs sm:grid-cols-2 lg:mt-3 lg:gap-2 lg:text-sm' : 'mt-3 grid gap-2 text-sm sm:grid-cols-2';
  const checkItemClass = compact ? 'flex items-center gap-1.5 lg:gap-2' : 'flex items-center gap-2';
  const iconClass = compact ? 'h-3.5 w-3.5 shrink-0 lg:h-4 lg:w-4' : 'h-4 w-4 shrink-0';

  return (
    <div className={`rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/60 ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Password strength</p>
        <p className={`text-xs font-semibold ${strengthTextClasses[strength.tone]}`}>{strength.label}</p>
      </div>
      <div className={`${barSpacing} grid grid-cols-5 gap-1`} aria-hidden="true">
        {checks.map((check, index) => (
          <span
            key={check.key}
            className={`h-1.5 rounded-full ${index < strength.passed ? strengthToneClasses[strength.tone] : 'bg-slate-200 dark:bg-slate-800'}`}
          />
        ))}
      </div>
      <div className={checkGridClass}>
        {checks.map((check) => {
          const Icon = check.valid ? Check : X;

          return (
            <div key={check.key} className={check.valid ? `${checkItemClass} text-emerald-700 dark:text-emerald-300` : `${checkItemClass} text-slate-500 dark:text-slate-400`}>
              <Icon className={iconClass} aria-hidden="true" />
              <span>{check.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
