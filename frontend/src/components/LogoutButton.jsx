'use client';

import { LogOut } from 'lucide-react';
import { logout } from '@/lib/api';

export function LogoutButton() {
  async function handleLogout() {
    try {
      await logout();
    } finally {
      window.location.assign('/login');
    }
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      className="flex min-h-10 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900"
      title="Sign out"
    >
      <LogOut className="h-4 w-4" aria-hidden="true" />
      Logout
    </button>
  );
}
