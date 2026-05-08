# NYX User Lifecycle Management Enhancement

## Overview

Enhanced NYX User Management system with production-grade user lifecycle management, scalable operational UX, and enterprise-ready user deletion support.

**Date**: May 8, 2026  
**Version**: 2.0  
**Status**: Production-ready

## Key Features

### 1. User Edit Feature
- Edit user name, email, and role
- Inline role changes with session invalidation
- Audit logging of all modifications
- Modal-based UI for better UX

### 2. Soft Delete (Archive)
- Soft-delete users with `archived_at` timestamp
- Preserves complete audit history
- Archived users cannot login
- Archived users excluded from default user lists
- "Archived" status badge in UI

### 3. Permanent Delete
- Allowed only if user:
  - Has never logged in
  - Has no audit activity
- Otherwise falls back to soft delete (archive)
- Explicit confirmation dialog for destructive action
- Audit trail of deletion action

### 4. Scalable UI: "Manage" Dropdown
- Replaces horizontal action button rows
- Touch-friendly dropdown menu
- Actions include:
  - Edit user
  - Reset password
  - Force logout
  - Activate/Deactivate
  - Archive user
  - Delete user
- Fully responsive on mobile, tablet, desktop

### 5. Confirmation Dialogs
- All destructive actions require confirmation
- Deactivate/Reactivate user
- Archive user
- Delete user (permanent or soft)
- Force logout
- Clear, contextualized messages

### 6. Enhanced Status Badges
- **Active**: Green, user can login
- **Disabled**: Gray, user deactivated but not deleted
- **Archived**: Gray, user soft-deleted
- Visual distinction in tables and cards

### 7. Safety Guardrails
- Cannot delete/deactivate own account
- Last active admin cannot be deleted
- Prevent accidental self-deletion
- Session invalidation on critical changes

### 8. Audit Logging
- All user lifecycle actions logged
- Actions tracked:
  - `user_created`
  - `user_edited` (name/email changes)
  - `role_changed`
  - `user_deactivated`
  - `user_reactivated`
  - `user_archived`
  - `user_permanently_deleted`
  - `password_reset`
  - `session_forced_logout`
- Audit trail preserves operational traceability

## Database Schema

### Migration: 010_add_user_soft_delete.sql

Added to `users` table:
- `archived_at TIMESTAMP NULL` - Timestamp when user was archived
- Index on `(archived_at, is_active)` for efficient queries

Query active users (excludes archived):
```sql
SELECT * FROM users WHERE archived_at IS NULL
```

Query all users including archived:
```sql
SELECT * FROM users
```

## Backend API

### New/Enhanced Endpoints

#### Edit User
```
PUT /users/:id
Body: { name?, email?, role?, is_active? }
Response: { user }
```
- Triggers session invalidation if role or is_active changes
- Validates user cannot deactivate own account

#### Archive User
```
POST /users/:id/archive
Response: { archived: true, user }
```
- Soft-deletes user (sets archived_at, increments session_version)
- Prevents last active admin from being archived
- Logs audit event: `user_archived`

#### Delete User
```
POST /users/:id/delete
Body: { permanent?: boolean }
Response: { deleted: true } or { archived: true }
```
- If `permanent=true`: Permanently deletes (only if user never logged in + no audit history)
- If `permanent=false` or not provided: Archives user (soft delete)
- Prevents last active admin from being deleted
- Falls back to archive if permanent delete unavailable

#### Can Delete User (Info)
```
GET /users/:id/can-delete
Response: { canDelete: boolean, reason: string }
```
- Returns whether user can be permanently deleted
- Provides reason if cannot delete (audit history, login history, etc.)

### Updated Endpoints

#### List Users
```
GET /users
Response: { users: [...] }
```
- Now excludes archived users by default
- User object includes new `archived_at` field

## Frontend API

### New Functions (src/lib/api.js)

```javascript
export function archiveUser(id) - Archive a user (soft delete)
export function deleteUser(id, permanent = false) - Delete or archive user
export function canDeleteUser(id) - Check if user can be permanently deleted
```

## Frontend Components

### New Components

#### ActionDropdown (src/components/ActionDropdown.jsx)
- Dropdown menu for user actions
- Supports keyboard navigation
- Touch-friendly on mobile
- Conditional action visibility based on permissions
- Props: user, isCurrentUser, handlers

#### EditUserModal (src/components/EditUserModal.jsx)
- Modal form to edit user name, email, role
- Form validation
- Loading states
- Props: user, onSave, onCancel, isLoading

#### ResetPasswordModal (src/components/ResetPasswordModal.jsx)
- Modal form to reset user password
- Password validation (8+ chars)
- Clear user context
- Props: user, onSave, onCancel, isLoading

#### ConfirmationDialog (src/components/ConfirmationDialog.jsx)
- Generic confirmation dialog for all destructive actions
- Supports dangerous (red) and normal (blue) styling
- Customizable confirm/cancel text
- Props: open, title, description, confirmText, cancelText, onConfirm, onCancel, isLoading, isDangerous

### Updated Components

#### UsersPage (src/app/users/page.jsx)
- Complete redesign with new modals and dropdowns
- State management for edit, reset password, confirmations
- Responsive mobile/tablet/desktop layout
- Card-based mobile view, table-based desktop view
- Enhanced status badges
- Current user detection to prevent self-deletion
- Comprehensive error handling

## Responsive Design

### Mobile (< 768px)
- Card-based layout for user listings
- Full-width dropdown menus
- Properly spaced touch targets (min 44px height)
- Modals centered with safe padding
- No horizontal scroll

### Tablet (768px - 1024px)
- Table layout with dropdown menus
- Readable column widths
- Adequate spacing

### Desktop (> 1024px)
- Full table layout
- Dropdown menus aligned right
- Optimal readability and spacing

## User Flows

### Edit User
1. Click user row → "Manage" dropdown opens
2. Select "Edit user" → EditUserModal opens
3. Update name/email/role
4. Click "Save changes"
5. Confirmation → Page refreshes with updated user
6. Audit log entry created

### Archive User
1. Click user row → "Manage" dropdown opens
2. Select "Archive user" → ConfirmationDialog opens
3. Confirm deletion
4. User archived (archived_at set, session invalidated)
5. User removed from active list
6. Audit log entry created

### Delete User (Permanent)
1. Click user row → "Manage" dropdown opens
2. Select "Delete user" → ConfirmationDialog opens
3. If user can be permanently deleted:
   - Shows "Permanently delete" confirmation
   - On confirm: User permanently removed
   - Audit log: `user_permanently_deleted`
4. If user cannot be permanently deleted:
   - Shows archive confirmation instead
   - Message explains why (audit history, login history)
   - On confirm: User archived

### Force Logout
1. Click user row → "Manage" dropdown opens
2. Select "Force logout" → ConfirmationDialog opens
3. Confirm action
4. All sessions invalidated (session_version incremented)
5. User must re-authenticate on next request
6. Audit log entry created

## Safety Guardrails

### Self-Deletion Prevention
- Cannot deactivate own account via UI
- Cannot archive own account via dropdown
- Cannot delete own account via dropdown
- Backend validates all operations

### Last Admin Protection
- Last active admin cannot be deactivated
- Last active admin cannot be archived
- Last active admin cannot be deleted
- Check runs: `SELECT COUNT(*) WHERE role='admin' AND is_active=1 AND archived_at IS NULL`

### Session Invalidation
- Role changes → session_version++
- Status changes → session_version++
- Force logout → session_version++
- Password reset → session_version++
- Archive → session_version++
- User automatically logged out on next request

## Future-Ready Architecture

### Extensible for Multi-Environment
- `archived_at` field compatible with environment scoping
- Audit logs support environment context
- Session management supports per-environment invalidation

### Ready for Additional Roles
- Role field supports new enum values
- "read-only", "operator", "auditor" roles can be added
- RBAC checks already in place

### Audit Trail Completeness
- All user lifecycle events logged
- Metadata support for complex operations
- User action traceability for compliance

## Implementation Notes

### Database Migrations
- Migration 010 adds archived_at field
- Compatible with older user tables
- Uses schema-aware checks (no assumptions about existing schema)
- Adds index for efficient active user queries

### Performance
- Index on (archived_at, is_active) for fast user listing
- Archived users excluded by default (minimal result set)
- Dropdown menus optimized for touch (pointer events, keyboard nav)

### Accessibility
- Semantic HTML (role="menu", role="menuitem")
- Modal focus management
- Keyboard navigation support
- Clear aria labels

### Security
- All operations require admin role (except current user fetch)
- Self-deletion prevention enforced server-side
- Session version invalidation prevents stale sessions
- Audit logging for compliance

## Testing Checklist

- [ ] Create user with admin/user role
- [ ] Edit user (name, email, role change)
- [ ] View updated user in table
- [ ] Archive user (soft delete)
- [ ] Verify archived user hidden from active list
- [ ] Verify archived user appears with "Archived" badge
- [ ] Deactivate user (account disabled)
- [ ] Reactivate user
- [ ] Force logout user
- [ ] Reset password
- [ ] Delete user (if no audit history)
- [ ] Delete user (falls back to archive if audit history exists)
- [ ] Verify all actions logged in audit trail
- [ ] Test responsive design (mobile, tablet, desktop)
- [ ] Test dropdown menus on touch devices
- [ ] Test confirmation dialogs
- [ ] Verify cannot self-delete/archive
- [ ] Verify cannot delete last active admin
- [ ] Test dark/light theme with all modals
- [ ] Test keyboard navigation in dropdowns

## Deployment

### Prerequisites
- Backend requires Node.js with updated auth.js
- Frontend requires React 18+
- Database requires MySQL/MariaDB with migration applied
- No breaking changes to existing API

### Migration Steps
1. Deploy backend (auth.js, routes.js with new functions)
2. Run database migration 010_add_user_soft_delete.sql
3. Deploy frontend (new components, updated users page)
4. Verify all user operations work as expected
5. Monitor audit logs for user lifecycle events

### Rollback Plan
- Remove `archived_at` column if needed (sets NULL for archived users)
- No data loss as archived_at only used for filtering
- Existing audit logs are immutable

## Architecture Decisions

### Soft Delete Over Hard Delete
✅ Preserves audit history  
✅ Allows recovery/reactivation  
✅ Maintains referential integrity  
✅ GDPR compliant (with proper data retention policies)

### Dropdown Menu Over Horizontal Buttons
✅ Better mobile UX (no overflow)  
✅ Cleaner table layout  
✅ Scalable for future actions  
✅ Professional platform aesthetic

### Modal Forms Over Inline Editing
✅ Clear focus and intent  
✅ Better validation UX  
✅ Prevents accidental changes  
✅ Mobile-friendly

### Confirmation Dialogs for Destructive Actions
✅ Prevents accidental deletions  
✅ Clear consequences  
✅ Better compliance  
✅ Professional UX pattern

## Known Limitations & Future Enhancements

### Current Limitations
- Bulk user operations not yet supported
- User import/export not implemented
- User groups/teams not yet supported

### Planned Enhancements
- Environment-scoped users
- Read-only and operator roles
- Auditor role with audit log access only
- User groups and team management
- Bulk operations (archive, delete, role change)
- User search and filtering
- Export user list as CSV
- 2FA/MFA support
- OAuth/SSO integration

## Support & Troubleshooting

### Common Issues

**User cannot be deleted**
- Check if user has audit history
- Check if user has ever logged in
- Check if user is last active admin
- Solution: Archive user instead

**Session not invalidated after change**
- Verify session_version was incremented
- Check middleware validates version on each request
- Verify browser cleared old auth token

**Dropdown menu not closing**
- Check z-index conflicts with other modals
- Verify click-outside handler working
- Try refresh page

## References

- Backend routes: [src/routes.js](../../backend/src/routes.js)
- Backend auth: [src/auth.js](../../backend/src/auth.js)
- Frontend API: [src/lib/api.js](../../frontend/src/lib/api.js)
- Users page: [src/app/users/page.jsx](../app/users/page.jsx)
- Migration: [db/migrations/010_add_user_soft_delete.sql](../../backend/db/migrations/010_add_user_soft_delete.sql)

## Changelog

### Version 2.0 (May 8, 2026)
- ✨ Added user edit feature (name, email, role)
- ✨ Added soft delete (archive) with audit preservation
- ✨ Added conditional permanent delete
- ✨ Replaced horizontal buttons with "Manage" dropdown
- ✨ Added confirmation dialogs for destructive actions
- ✨ Enhanced status badges (Active/Disabled/Archived)
- ✨ Improved responsive design for mobile/tablet
- ✨ Added EditUserModal component
- ✨ Added ResetPasswordModal component
- ✨ Added ConfirmationDialog component
- ✨ Added ActionDropdown component
- 🔒 Added safety guardrails (self-delete prevention, last admin protection)
- 🔒 Enhanced audit logging
- 📊 Added archived_at field with index
- 📚 Complete documentation

### Version 1.0 (Previous)
- Basic user CRUD
- Role assignment
- Activate/deactivate
- Password reset
- Force logout
- Audit logging
