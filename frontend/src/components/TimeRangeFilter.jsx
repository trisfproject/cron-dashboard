'use client';

import { Calendar } from 'lucide-react';

const RANGE_OPTIONS = [
  { value: 'today', label: 'Today', shortLabel: 'T' },
  { value: '7d', label: '7 Days', shortLabel: '7D' },
  { value: '30d', label: '30 Days', shortLabel: '30D' },
  { value: 'quarter', label: 'Quarter', shortLabel: 'Q' },
  { value: 'year', label: 'Year', shortLabel: 'Y' }
];

export function TimeRangeFilter({ selectedRange = '7d', onRangeChange }) {
  return (
    <div className="flex items-center gap-2">
      <Calendar className="h-4 w-4 text-slate-500" />
      <div className="flex gap-1">
        {RANGE_OPTIONS.map((option) => (
          <button
            key={option.value}
            onClick={() => onRangeChange(option.value)}
            className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
              selectedRange === option.value
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
            title={option.label}
          >
            {option.shortLabel}
          </button>
        ))}
      </div>
    </div>
  );
}
