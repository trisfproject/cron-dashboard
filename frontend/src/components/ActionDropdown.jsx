'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { isPrivilegedRole } from '@/lib/rbac';

const VIEWPORT_MARGIN = 12;
const MENU_GAP = 8;
const MENU_WIDTH = 192;

export default function ActionDropdown({ user, onEdit, onResetPassword, onForceLogout, onToggleStatus, onArchive, onDelete, isCurrentUser, canManagePrivileged = false }) {
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0, width: MENU_WIDTH, maxHeight: 320, ready: false });
  const menuRef = useRef(null);
  const buttonRef = useRef(null);

  useEffect(() => {
    function updateMenuPosition() {
      const button = buttonRef.current;
      const menu = menuRef.current;

      if (!button || !menu) {
        return;
      }

      const buttonRect = button.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const safeWidth = Math.max(160, viewportWidth - VIEWPORT_MARGIN * 2);
      const width = Math.min(MENU_WIDTH, safeWidth);
      const measuredHeight = menu.scrollHeight || menu.offsetHeight;
      const spaceBelow = viewportHeight - buttonRect.bottom - MENU_GAP - VIEWPORT_MARGIN;
      const spaceAbove = buttonRect.top - MENU_GAP - VIEWPORT_MARGIN;
      const openAbove = measuredHeight > spaceBelow && spaceAbove > spaceBelow;
      const availableHeight = Math.max(120, Math.min(openAbove ? spaceAbove : spaceBelow, viewportHeight - VIEWPORT_MARGIN * 2));
      const maxHeight = Math.min(measuredHeight || availableHeight, availableHeight);
      const preferredLeft = buttonRect.right - width;
      const maxLeft = Math.max(VIEWPORT_MARGIN, viewportWidth - width - VIEWPORT_MARGIN);
      const left = Math.min(Math.max(preferredLeft, VIEWPORT_MARGIN), maxLeft);
      const preferredTop = openAbove ? buttonRect.top - MENU_GAP - maxHeight : buttonRect.bottom + MENU_GAP;
      const maxTop = Math.max(VIEWPORT_MARGIN, viewportHeight - maxHeight - VIEWPORT_MARGIN);
      const top = Math.min(Math.max(preferredTop, VIEWPORT_MARGIN), maxTop);

      setMenuPosition({ top, left, width, maxHeight, ready: true });
    }

    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target) && !buttonRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }

    if (open) {
      setMenuPosition((current) => ({ ...current, ready: false }));
      const animationFrame = window.requestAnimationFrame(updateMenuPosition);
      document.addEventListener('pointerdown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
      window.addEventListener('resize', updateMenuPosition);
      window.addEventListener('scroll', updateMenuPosition, true);

      return () => {
        window.cancelAnimationFrame(animationFrame);
        document.removeEventListener('pointerdown', handleClickOutside);
        document.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('resize', updateMenuPosition);
        window.removeEventListener('scroll', updateMenuPosition, true);
      };
    }
  }, [open]);

  const handleAction = (action) => {
    action();
    setOpen(false);
  };

  const isPrivilegedUser = isPrivilegedRole(user.role);
  const canManageUser = !isPrivilegedUser || canManagePrivileged;
  const canArchive = !isCurrentUser && canManageUser;
  const canDelete = !isCurrentUser && canManageUser;
  const menuItemClass = 'min-h-11 w-full rounded px-3 py-2 text-left text-sm font-medium md:min-h-10';

  const menu = open ? (
    <div
      ref={menuRef}
      className="fixed z-[80] rounded-md border border-slate-200 bg-white shadow-lg outline-none dark:border-slate-800 dark:bg-slate-950"
      style={{
        top: `${menuPosition.top}px`,
        left: `${menuPosition.left}px`,
        width: `${menuPosition.width}px`,
        maxHeight: `${menuPosition.maxHeight}px`,
        overflowY: 'auto',
        visibility: menuPosition.ready ? 'visible' : 'hidden'
      }}
      role="menu"
    >
      <div className="space-y-1 p-1">
        {canManageUser ? (
          <button
            onClick={() => handleAction(() => onEdit(user))}
            className={`${menuItemClass} text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-900`}
            role="menuitem"
          >
            Edit user
          </button>
        ) : null}

        {canManageUser ? (
          <button
            onClick={() => handleAction(() => onResetPassword(user))}
            className={`${menuItemClass} text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-900`}
            role="menuitem"
          >
            Reset password
          </button>
        ) : null}

        {canManageUser ? (
          <button
            onClick={() => handleAction(() => onForceLogout(user))}
            className={`${menuItemClass} text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-900`}
            role="menuitem"
          >
            Force logout
          </button>
        ) : null}

        {!isCurrentUser && canManageUser ? (
          <button
            onClick={() => handleAction(() => onToggleStatus(user))}
            className={`${menuItemClass} text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-900`}
            role="menuitem"
          >
            {user.is_active ? 'Deactivate' : 'Reactivate'}
          </button>
        ) : null}

        {canArchive && (
          <>
            <div className="my-1 border-t border-slate-200 dark:border-slate-800" />
            <button
              onClick={() => handleAction(() => onArchive(user))}
              className={`${menuItemClass} text-amber-700 hover:bg-amber-50 dark:text-amber-200 dark:hover:bg-amber-950/30`}
              role="menuitem"
            >
              Archive user
            </button>
          </>
        )}

        {canDelete && (
          <button
            onClick={() => handleAction(() => onDelete(user))}
            className={`${menuItemClass} text-rose-700 hover:bg-rose-50 dark:text-rose-200 dark:hover:bg-rose-950/30`}
            role="menuitem"
          >
            Delete user
          </button>
        )}

        {!canManageUser ? (
          <div className="px-3 py-2 text-xs font-medium text-slate-500 dark:text-slate-400" role="menuitem">
            Super admin required
          </div>
        ) : null}
      </div>
    </div>
  ) : null;

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

      {menu ? createPortal(menu, document.body) : null}
    </div>
  );
}
