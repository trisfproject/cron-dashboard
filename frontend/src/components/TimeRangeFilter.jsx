'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, RefreshCw, X } from 'lucide-react';

const OPTIONS = [
  { type: 'window', value: '5m', label: '5m' },
  { type: 'window', value: '15m', label: '15m' },
  { type: 'window', value: '30m', label: '30m' },
  { type: 'window', value: '1h', label: '1H' },
  { type: 'window', value: '4h', label: '4H' },
  { type: 'range', value: 'today', label: 'Today' },
  { type: 'range', value: '7d', label: '7D' },
  { type: 'range', value: '30d', label: '30D' }
];

const REFRESH_OPTIONS = [
  { value: 0, label: 'Off' },
  { value: 10000, label: '10s' },
  { value: 30000, label: '30s' },
  { value: 60000, label: '1m' }
];

const MAX_DAYS = 365;
const DAY_MS = 24 * 60 * 60 * 1000;
const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000;

function parseJakartaDateTime(value) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value || '')) {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}([+-]\d{2}:\d{2}|Z)$/.test(value || '')) {
      return null;
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(`${value}:00.000+07:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toJakartaInputValue(value) {
  const date = parseJakartaDateTime(value);

  if (!date) {
    return '';
  }

  const jakartaDate = new Date(date.getTime() + JAKARTA_OFFSET_MS);
  const pad = (part) => String(part).padStart(2, '0');

  return `${jakartaDate.getUTCFullYear()}-${pad(jakartaDate.getUTCMonth() + 1)}-${pad(jakartaDate.getUTCDate())}T${pad(jakartaDate.getUTCHours())}:${pad(jakartaDate.getUTCMinutes())}`;
}

function toDisplayValue(value) {
  const inputValue = toJakartaInputValue(value);
  return inputValue ? inputValue.replace('T', ' ') : value;
}

function validateRange(start, end) {
  const startDate = parseJakartaDateTime(start);
  const endDate = parseJakartaDateTime(end);

  if (!start || !end) {
    return 'Select start and end time.';
  }

  if (!startDate || !endDate) {
    return 'Use valid WIB date and time values.';
  }

  const duration = endDate.getTime() - startDate.getTime();

  if (duration <= 0) {
    return 'End time must be after start time.';
  }

  if (duration > MAX_DAYS * DAY_MS) {
    return 'Custom range cannot exceed 365 days.';
  }

  return null;
}

export function TimeRangeFilter({
  selectedFilter = { type: 'window', value: '30m' },
  customRange,
  refreshInterval = 0,
  options = OPTIONS,
  showRefreshControl = true,
  defaultFilter = { type: 'window', value: '30m' },
  customDescription = 'Select start and end in WIB. Custom ranges override live windows.',
  onFilterChange,
  onCustomRangeChange,
  onRefreshIntervalChange
}) {
  const [open, setOpen] = useState(false);
  const [draftStart, setDraftStart] = useState(toJakartaInputValue(customRange?.start));
  const [draftEnd, setDraftEnd] = useState(toJakartaInputValue(customRange?.end));
  const popoverRef = useRef(null);

  useEffect(() => {
    setDraftStart(toJakartaInputValue(customRange?.start));
    setDraftEnd(toJakartaInputValue(customRange?.end));
  }, [customRange?.start, customRange?.end]);

  useEffect(() => {
    function onPointerDown(event) {
      if (popoverRef.current && !popoverRef.current.contains(event.target)) {
        setOpen(false);
      }
    }

    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, []);

  const error = useMemo(() => {
    if (!draftStart && !draftEnd) {
      return null;
    }

    return validateRange(draftStart, draftEnd);
  }, [draftStart, draftEnd]);

  const isCustom = selectedFilter?.type === 'custom';
  const activeLabel = isCustom && customRange?.start && customRange?.end
    ? `Custom: ${toDisplayValue(customRange.start)} → ${toDisplayValue(customRange.end)} WIB`
    : null;

  function applyCustomRange() {
    const validationError = validateRange(draftStart, draftEnd);

    if (validationError) {
      return;
    }

    onCustomRangeChange?.({ start: draftStart, end: draftEnd });
    setOpen(false);
  }

  function clearCustomRange() {
    setDraftStart('');
    setDraftEnd('');
    onFilterChange?.(defaultFilter);
    setOpen(false);
  }

  return (
    <div className="relative flex w-full min-w-0 flex-col items-start gap-2 sm:w-auto sm:items-end" ref={popoverRef}>
      <div className="flex w-full min-w-0 items-center gap-2 overflow-x-auto pb-1 sm:w-auto sm:overflow-visible sm:pb-0">
        <div className="flex shrink-0 gap-1 rounded-md bg-slate-100 p-1 dark:bg-slate-800/70">
          {options.map((option) => {
            const active = !isCustom && selectedFilter?.type === option.type && selectedFilter?.value === option.value;

            return (
              <button
                key={`${option.type}-${option.value}`}
                type="button"
                onClick={() => onFilterChange?.({ type: option.type, value: option.value })}
                className={`compact-control shrink-0 rounded px-2.5 py-1 text-xs font-medium transition-colors sm:min-h-10 sm:px-3 sm:py-1.5 sm:text-sm ${
                  active
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-700 hover:bg-white dark:text-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {option.label}
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className={`compact-control inline-flex shrink-0 items-center gap-1 rounded px-2.5 py-1 text-xs font-medium transition-colors sm:min-h-10 sm:px-3 sm:py-1.5 sm:text-sm ${
              isCustom
                ? 'bg-blue-600 text-white'
                : 'text-slate-700 hover:bg-white dark:text-slate-200 dark:hover:bg-slate-700'
            }`}
            title="Custom date and time range"
          >
            <Calendar className="h-4 w-4" aria-hidden="true" />
            Custom
          </button>
        </div>

        {showRefreshControl ? (
          <label className="compact-control inline-flex shrink-0 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 sm:min-h-10 sm:gap-2 sm:py-1.5 sm:text-sm">
            <RefreshCw className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden="true" />
            <select
              value={refreshInterval}
              onChange={(event) => onRefreshIntervalChange?.(Number(event.target.value))}
              className="bg-transparent text-xs outline-none sm:text-sm"
            >
              {REFRESH_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {activeLabel ? (
        <div className="inline-flex max-w-full items-center gap-2 rounded-md bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 ring-1 ring-blue-200 dark:bg-blue-950 dark:text-blue-200 dark:ring-blue-800">
          <span className="truncate">{activeLabel}</span>
          <button type="button" onClick={clearCustomRange} className="rounded p-0.5 hover:bg-blue-100 dark:hover:bg-blue-900" title="Clear custom range">
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      ) : null}

      {open ? (
        <div className="absolute left-0 right-auto top-full z-20 mt-2 w-[calc(100vw-2rem)] max-w-md rounded-lg border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900 sm:left-auto sm:right-0">
          <div className="mb-3">
            <p className="text-sm font-semibold text-ink dark:text-slate-100">Custom window</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{customDescription}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
              Start
              <input
                type="datetime-local"
                value={draftStart}
                onChange={(event) => setDraftStart(event.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </label>

            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
              End
              <input
                type="datetime-local"
                value={draftEnd}
                min={draftStart || undefined}
                onChange={(event) => setDraftEnd(event.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </label>
          </div>

          {error ? <p className="mt-3 text-xs font-medium text-rose-600 dark:text-rose-300">{error}</p> : null}

          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!draftStart || !draftEnd || Boolean(error)}
              onClick={applyCustomRange}
              className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              Apply
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
