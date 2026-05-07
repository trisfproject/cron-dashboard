export function AlertSeverityBadge({ severity }) {
  const className = {
    info: 'bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-950/50 dark:text-blue-200 dark:ring-blue-900',
    warning: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/50 dark:text-amber-200 dark:ring-amber-900',
    critical: 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/50 dark:text-rose-200 dark:ring-rose-900'
  }[severity] || 'bg-slate-50 text-slate-700 ring-slate-200 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-800';

  return (
    <span className={`rounded-md px-2 py-1 text-xs font-medium capitalize ring-1 ${className}`}>
      {severity || 'unknown'}
    </span>
  );
}

export function AlertStateBadge({ state }) {
  const className = {
    active: 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/50 dark:text-rose-200 dark:ring-rose-900',
    acknowledged: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/50 dark:text-amber-200 dark:ring-amber-900',
    resolved: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-200 dark:ring-emerald-900'
  }[state] || 'bg-slate-50 text-slate-700 ring-slate-200 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-800';

  return (
    <span className={`rounded-md px-2 py-1 text-xs font-medium capitalize ring-1 ${className}`}>
      {state || 'unknown'}
    </span>
  );
}
