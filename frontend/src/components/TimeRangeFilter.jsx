'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, X } from 'lucide-react';

const RANGE_OPTIONS = [
  { value: 'today', label: 'Today', shortLabel: 'T' },
  { value: '7d', label: '7 Days', shortLabel: '7D' },
  { value: '30d', label: '30 Days', shortLabel: '30D' },
  { value: 'quarter', label: 'Quarter', shortLabel: 'Q' },
  { value: 'year', label: 'Year', shortLabel: 'Y' }
];

const MAX_DAYS = 365;
const DAY_MS = 24 * 60 * 60 * 1000;

function isDateOnly(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || '');
}

function daysBetween(start, end) {
  if (!isDateOnly(start) || !isDateOnly(end)) {
    return 0;
  }

  const startDate = new Date(`${start}T00:00:00.000+07:00`);
  const endDate = new Date(`${end}T00:00:00.000+07:00`);

  return Math.floor((endDate.getTime() - startDate.getTime()) / DAY_MS) + 1;
}

function validateRange(start, end) {
  if (!start || !end) {
    return 'Select both start and end dates.';
  }

  if (!isDateOnly(start) || !isDateOnly(end)) {
    return 'Use valid dates.';
  }

  const days = daysBetween(start, end);

  if (days <= 0) {
    return 'End date must be after start date.';
  }

  if (days > MAX_DAYS) {
    return 'Custom range cannot exceed 365 days.';
  }

  return null;
}

export function TimeRangeFilter({
  selectedRange = '7d',
  customRange,
  onRangeChange,
  onCustomRangeChange
}) {
  const [open, setOpen] = useState(false);
  const [draftStart, setDraftStart] = useState(customRange?.start || '');
  const [draftEnd, setDraftEnd] = useState(customRange?.end || '');
  const popoverRef = useRef(null);

  useEffect(() => {
    setDraftStart(customRange?.start || '');
    setDraftEnd(customRange?.end || '');
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

  const hasCustomRange = Boolean(customRange?.start && customRange?.end);
  const activeLabel = hasCustomRange ? `Custom: ${customRange.start} -> ${customRange.end}` : null;

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
    onRangeChange?.(selectedRange || '7d');
    setOpen(false);
  }

  return (
    <div className="relative flex flex-col items-start gap-2 sm:items-end" ref={popoverRef}>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className={`inline-flex h-9 w-9 items-center justify-center rounded-md border text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800 ${
            hasCustomRange ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950' : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'
          }`}
          title="Custom date range"
        >
          <Calendar className="h-4 w-4" aria-hidden="true" />
        </button>

        <div className="flex flex-wrap gap-1">
          {RANGE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onRangeChange?.(option.value)}
              className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                !hasCustomRange && selectedRange === option.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
              }`}
              title={option.label}
            >
              {option.shortLabel}
            </button>
          ))}
        </div>
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
        <div className="absolute right-0 top-12 z-20 w-[calc(100vw-2rem)] max-w-sm rounded-lg border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900">
          <div className="mb-3">
            <p className="text-sm font-semibold text-ink dark:text-slate-100">Custom range</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Up to 365 days. Custom dates override presets.</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
              Start
              <input
                type="date"
                value={draftStart}
                onChange={(event) => setDraftStart(event.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </label>

            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
              End
              <input
                type="date"
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
