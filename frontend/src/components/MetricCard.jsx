export function MetricCard({ icon: Icon, label, value, subtext }) {
  return (
    <div className="min-h-[7.25rem] rounded-lg border border-slate-200 bg-white p-3 shadow-sm sm:min-h-[9.25rem] sm:p-5">
      <div className="flex items-start justify-between gap-2 sm:gap-3">
        <div className="min-w-0">
          <p className="text-[0.7rem] font-medium uppercase leading-tight tracking-wide text-slate-500 sm:text-sm sm:normal-case sm:tracking-normal">{label}</p>
          <p className="mt-1 break-words text-xl font-semibold leading-tight tracking-normal text-ink sm:mt-2 sm:text-3xl">{value}</p>
        </div>
        {Icon ? (
          <div className="shrink-0 rounded-md bg-slate-100 p-1.5 text-slate-700 sm:p-2">
            <Icon className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
          </div>
        ) : null}
      </div>
      {subtext ? <p className="mt-2 text-xs leading-snug text-slate-500 sm:mt-3 sm:text-sm">{subtext}</p> : null}
    </div>
  );
}
