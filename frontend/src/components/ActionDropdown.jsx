'use client';

import { useEffect, useRef, useState } from 'react';

export default function ActionDropdown({ user, onEdit, onResetPassword, onForceLogout, onToggleStatus, onArchive, onDelete, isCurrentUser }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);
  const buttonRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target) && !buttonRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }

    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [open]);

  const handleAction = (action) => {
    action();
    setOpen(false);
  };

  const canArchive = !isCurrentUser && user.role !== 'admin';
  const canDelete = !isCurrentUser;

  return (
    <div className="relative inline-block text-left">
      <button
        ref={buttonRef}
        onClick={() => setOpen(!open)}
        className="flex min-h-10 items-center gap-1 rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-900"
        aria-haspopup="true"
        aria-expanded={open}
        title="User actions menu"
      >
        Manage
        <span className="text-xs">▼</span>
      </button>

      {open ? (
        <div
          ref={menuRef}
          className="absolute right-0 z-50 mt-2 w-48 rounded-md border border-slate-200 bg-white shadow-lg dark:border-slate-800 dark:bg-slate-950"
          role="menu"
        >
          <div className="space-y-1 p-1">
            <button
              onClick={() => handleAction(() => onEdit(user))}
              className="w-full rounded px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-900"
              role="menuitem"
            >
              Edit user
            </button>

            <button
              onClick={() => handleAction(() => onResetPassword(user))}
              className="w-full rounded px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-900"
              role="menuitem"
            >
              Reset password
            </button>

            <button
              onClick={() => handleAction(() => onForceLogout(user))}
              className="w-full rounded px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-900"
              role="menuitem"
            >
              Force logout
            </button>

            {!isCurrentUser && (
              <button
                onClick={() => handleAction(() => onToggleStatus(user))}
                className="w-full rounded px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-900"
                role="menuitem"
              >
                {user.is_active ? 'Deactivate' : 'Reactivate'}
              </button>
            )}

            {canArchive && (
              <>
                <div className="my-1 border-t border-slate-200 dark:border-slate-800" />
                <button
                  onClick={() => handleAction(() => onArchive(user))}
                  className="w-full rounded px-3 py-2 text-left text-sm font-medium text-amber-700 hover:bg-amber-50 dark:text-amber-200 dark:hover:bg-amber-950/30"
                  role="menuitem"
                >
                  Archive user
                </button>
              </>
            )}

            {canDelete && (
              <button
                onClick={() => handleAction(() => onDelete(user))}
                className="w-full rounded px-3 py-2 text-left text-sm font-medium text-rose-700 hover:bg-rose-50 dark:text-rose-200 dark:hover:bg-rose-950/30"
                role="menuitem"
              >
                Delete user
              </button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
