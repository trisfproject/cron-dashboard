export function MetricCard({ icon: Icon, label, value, subtext }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-2 break-words text-2xl font-semibold tracking-normal text-ink sm:text-3xl">{value}</p>
        </div>
        {Icon ? (
          <div className="rounded-md bg-slate-100 p-2 text-slate-700">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </div>
        ) : null}
      </div>
      {subtext ? <p className="mt-3 text-sm text-slate-500">{subtext}</p> : null}
    </div>
  );
}
