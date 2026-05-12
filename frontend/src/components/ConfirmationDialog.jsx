'use client';

import { useEffect, useState } from 'react';

export default function ConfirmationDialog({
  open,
  title,
  description,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
  isLoading,
  isDangerous = false,
  confirmationText = ''
}) {
  const [confirmationValue, setConfirmationValue] = useState('');

  useEffect(() => {
    if (open) {
      setConfirmationValue('');
    }
  }, [open]);

  if (!open) return null;

  const confirmationRequired = confirmationText.trim().length > 0;
  const confirmationMatches = confirmationValue.trim() === confirmationText.trim();
  const confirmDisabled = isLoading || (confirmationRequired && !confirmationMatches);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 dark:bg-black/70">
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-800 dark:bg-slate-950">
        <div className="border-b border-slate-200 px-6 py-4 dark:border-slate-800">
          <h2 className="text-lg font-semibold text-ink">{title}</h2>
        </div>

        <div className="px-6 py-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">{description}</p>
          {confirmationRequired ? (
            <label className="mt-4 block space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Type {confirmationText} to confirm</span>
              <input
                value={confirmationValue}
                onChange={(event) => setConfirmationValue(event.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-ink dark:border-slate-800 dark:bg-slate-950"
                autoComplete="off"
              />
            </label>
          ) : null}
        </div>

        <div className="border-t border-slate-200 px-6 py-4 dark:border-slate-800">
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              disabled={isLoading}
              className="flex-1 rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-900"
            >
              {cancelText}
            </button>
            <button
              onClick={onConfirm}
              disabled={confirmDisabled}
              className={`flex-1 rounded-md px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 ${
                isDangerous
                  ? 'bg-rose-600 hover:bg-rose-700 dark:bg-rose-700 dark:hover:bg-rose-600'
                  : 'bg-slate-900 hover:bg-slate-700 dark:bg-blue-600 dark:hover:bg-blue-500'
              }`}
            >
              {isLoading ? 'Processing...' : confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
