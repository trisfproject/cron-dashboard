function normalizeEnvironment(value = '') {
  const env = String(value || '').trim().toLowerCase();

  if (['production', 'prod'].includes(env)) return { label: 'PROD', tone: 'prod' };
  if (['staging', 'stage', 'stg'].includes(env)) return { label: 'STG', tone: 'stg' };
  if (['development', 'develop', 'dev'].includes(env)) return { label: 'DEV', tone: 'dev' };

  return { label: value || 'ENV', tone: 'custom' };
}

const toneClasses = {
  prod: 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-200 dark:ring-rose-900',
  stg: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-900',
  dev: 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-950/40 dark:text-sky-200 dark:ring-sky-900',
  custom: 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800'
};

export function EnvironmentBadge({ env }) {
  const normalized = normalizeEnvironment(env);

  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[0.68rem] font-semibold uppercase leading-5 ring-1 ${toneClasses[normalized.tone]}`}>
      {normalized.label}
    </span>
  );
}

export function ServiceGroupBadge({ serviceGroup }) {
  if (!serviceGroup) {
    return null;
  }

  return (
    <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-[0.68rem] font-semibold leading-5 text-slate-600 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800">
      {serviceGroup}
    </span>
  );
}
