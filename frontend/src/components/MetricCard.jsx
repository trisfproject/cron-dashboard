export function MetricCard({ icon: Icon, label, value, subtext, compact = false, valueClassName = '' }) {
  const cardClass = compact
    ? 'min-h-[5.75rem] rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm sm:min-h-[6.25rem] sm:p-3 lg:min-h-[9.25rem] lg:p-5'
    : 'min-h-[7.25rem] rounded-lg border border-slate-200 bg-white p-3 shadow-sm sm:min-h-[9.25rem] sm:p-5';
  const headerGapClass = compact ? 'gap-2 lg:gap-3' : 'gap-2 sm:gap-3';
  const labelClass = compact
    ? 'text-[0.68rem] font-medium uppercase leading-tight tracking-wide text-slate-500 lg:text-sm lg:normal-case lg:tracking-normal'
    : 'text-[0.7rem] font-medium uppercase leading-tight tracking-wide text-slate-500 sm:text-sm sm:normal-case sm:tracking-normal';
  const compactValueSizeClass = valueClassName || 'text-lg sm:text-xl lg:text-3xl';
  const regularValueSizeClass = valueClassName || 'text-xl sm:text-3xl';
  const valueClass = compact
    ? `mt-1 break-words font-semibold leading-tight tracking-normal text-ink lg:mt-2 ${compactValueSizeClass}`
    : `mt-1 break-words font-semibold leading-tight tracking-normal text-ink sm:mt-2 ${regularValueSizeClass}`;
  const iconWrapperClass = compact
    ? 'shrink-0 rounded-md bg-slate-100 p-1.5 text-slate-700 lg:p-2'
    : 'shrink-0 rounded-md bg-slate-100 p-1.5 text-slate-700 sm:p-2';
  const iconClass = compact ? 'h-4 w-4 lg:h-5 lg:w-5' : 'h-4 w-4 sm:h-5 sm:w-5';
  const subtextClass = compact
    ? 'mt-1.5 text-[0.7rem] leading-snug text-slate-500 lg:mt-3 lg:text-sm'
    : 'mt-2 text-xs leading-snug text-slate-500 sm:mt-3 sm:text-sm';

  return (
    <div className={cardClass}>
      <div className={`flex items-start justify-between ${headerGapClass}`}>
        <div className="min-w-0">
          <p className={labelClass}>{label}</p>
          <p className={valueClass}>{value}</p>
        </div>
        {Icon ? (
          <div className={iconWrapperClass}>
            <Icon className={iconClass} aria-hidden="true" />
          </div>
        ) : null}
      </div>
      {subtext ? <p className={subtextClass}>{subtext}</p> : null}
    </div>
  );
}
