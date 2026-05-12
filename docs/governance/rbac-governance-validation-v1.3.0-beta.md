# RBAC Governance Validation — v1.3.0-beta

This validation record covers the hierarchical RBAC stabilization surface for NYX v1.3.0-beta. It verifies operational visibility, operational governance, platform governance boundaries, and privileged auditability without introducing dynamic policy engines or scoped RBAC.

## Role Access Matrix

| Area | USER | ADMIN | SUPER_ADMIN | Validation notes |
| --- | --- | --- | --- | --- |
| Dashboard | Allow | Allow | Allow | Authenticated operational visibility remains available to all roles. |
| Alerts visibility | Allow | Allow | Allow | `/alerts` remains an operational visibility surface. |
| Alerts configuration | Deny | Allow | Allow | Frontend middleware protects `/alerts/config`; backend protects `/alert-rules`, `/alerts/evaluate`, and `/alerts/test-telegram` with ADMIN+. |
| Reports | Deny | Allow | Allow | Frontend middleware and backend `/reports` guards require ADMIN+. |
| Cron runtime visibility | Allow | Allow | Allow | `/cron`, cron details, logs, stats, alerts, incidents, scope options, and maintenance visibility remain authenticated operational visibility. |
| Cron governance | Deny | Allow | Allow | `/cron/inventory`, `/cron-inventory`, and `/cron-schedules` are ADMIN+. SUPER_ADMIN inherits through `isAdminOrHigher`. |
| User management visibility | Deny | Allow | Allow | `/users` UI/API require ADMIN+. Privileged governance actions require SUPER_ADMIN. |
| Audit visibility | Deny | Allow | Allow | `/audit` and `/audit-logs` require ADMIN+. |
| Maintenance governance | Deny | Allow | Allow | Maintenance create/delete routes use ADMIN+ guards; maintenance visibility remains available to authenticated users. |

## Privileged Governance Boundary

| Action | USER | ADMIN | SUPER_ADMIN | Audit expectation |
| --- | --- | --- | --- | --- |
| Create SUPER_ADMIN | Deny | Deny | Allow | ADMIN denial records `governance_escalation_denied`. |
| Promote user to SUPER_ADMIN | Deny | Deny | Allow | Successful assignment records `role_changed` and `super_admin_assigned`. |
| Modify SUPER_ADMIN account | Deny | Deny | Allow | ADMIN denial records `governance_authorization_denied`. |
| Archive/delete SUPER_ADMIN | Deny | Deny | Allow | Boundary preserves last active SUPER_ADMIN. |
| Deactivate/reactivate SUPER_ADMIN | Deny | Deny | Allow | Boundary preserves last active SUPER_ADMIN. |
| Reset SUPER_ADMIN credentials | Deny | Deny | Allow | Denials and successful resets include target role and governance scope metadata. |
| Force logout privileged account | Deny | Deny for privileged targets | Allow | Successful revocation records `session_forced_logout` with `session_revoked`. |

## Governance Audit Expectations

Governance-sensitive audit events should include actor identity, target identity where available, governance scope, target role when role-bearing, and session revocation metadata when the action invalidates sessions.

| Event family | Actions |
| --- | --- |
| Authorization failures | `privileged_authorization_denied`, `governance_authorization_denied`, `governance_escalation_denied` |
| Role governance | `role_changed`, `super_admin_assigned`, `user_created` |
| User lifecycle governance | `user_deactivated`, `user_reactivated`, `user_restored`, `user_archived`, `user_permanently_deleted`, `password_reset` |
| Session governance | `session_forced_logout`, `stale_session_rejected`, `privileged_stale_session_rejected` |
| Operational governance | `alert_rule_created`, `alert_rule_updated`, `heartbeat_schedule_created`, `heartbeat_schedule_updated`, `heartbeat_schedule_enabled`, `heartbeat_schedule_disabled`, `maintenance_enabled`, `maintenance_disabled` |

## Frontend And Backend Consistency

| Surface | Frontend control | Backend control | Status |
| --- | --- | --- | --- |
| Admin navigation | `AppShell` uses `isAdminOrHigher` for ADMIN+ items. | Route hooks and route pre-handlers use `requireAdmin`. | Consistent |
| Middleware route access | `/alerts/config`, `/reports`, `/users`, `/audit`, `/about` require ADMIN+. | Corresponding APIs require ADMIN+ where applicable. | Consistent |
| Alert governance | Config page redirects non-ADMIN+ users. | `/alert-rules`, `/alerts/evaluate`, and notification test routes require ADMIN+. | Consistent |
| Cron governance | Inventory page redirects non-ADMIN+ users. | `/cron-inventory` and `/cron-schedules` require ADMIN+. | Consistent |
| User governance | UI hides privileged actions from ADMIN for privileged targets. | Backend denies privileged target governance unless SUPER_ADMIN. | Consistent |
| Role escalation | Modal requires typed confirmation for privileged role changes. | Backend denies ADMIN role escalation and records governance denial. | Consistent |

## Responsive Governance UI Checklist

| Component | Mobile/tablet/desktop expectation |
| --- | --- |
| Role badges | Display role plus governance label without changing authorization semantics. |
| User action menus | Hide privileged target actions from ADMIN and preserve SUPER_ADMIN access. |
| Confirmation flows | Typed confirmation appears for sensitive lifecycle and privileged role changes. |
| Audit filters | Governance, session, maintenance, cron, alert, and user lifecycle events are selectable. |
| Account/session summary | Role display includes governance responsibility label. |

## Stabilization Review

The validation scan found no remaining hardcoded `role === 'admin'` authorization gates. Remaining matches are role classification or select-option preservation logic. SUPER_ADMIN inheritance flows through `isAdminOrHigher`, while privileged governance boundaries flow through `isSuperAdmin` and backend enforcement.

Runtime command validation could not be executed in this environment because `node`, `npm`, and `bun` are not available on PATH.

