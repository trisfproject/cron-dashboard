# NYX Active Development Tracker

Current Target:
Unreleased

Released History:
See Release History / Version Notes in the NYX About page for official shipped releases, including NYX v1.2.2.

---

## Done

### v1.3.0-beta — Governance & Authorization Evolution

* Added SUPER_ADMIN role support as the platform governance authority above operational ADMIN and visibility-focused USER access.
* Established the foundational USER / ADMIN / SUPER_ADMIN hierarchy for lightweight governance separation without introducing a dynamic RBAC engine.
* Added hierarchical RBAC inheritance so SUPER_ADMIN automatically inherits operational ADMIN governance capabilities.
* Normalized authorization checks through foundational RBAC helper abstractions for admin-or-higher and super-admin-only decisions.
* Repaired governance trust boundaries so ADMIN no longer implicitly acts as unrestricted platform root authority.
* Clarified operational versus platform governance separation, keeping ADMIN focused on operational governance while reserving platform-level authority for SUPER_ADMIN.
* Normalized route, middleware, navigation, and protected-action authorization so SUPER_ADMIN inherits ADMIN-protected operational workflows.
* Added privileged governance separation for role escalation, privileged administrator management, and platform-level user governance actions.
* Restricted privileged governance escalation so ADMIN cannot promote users to SUPER_ADMIN or bypass SUPER_ADMIN account boundaries.
* Protected SUPER_ADMIN governance boundaries around privileged account modification, destructive administrator lifecycle actions, and elevated user administration.

## Unreleased

### System Insights

* Operational intelligence summaries for current reliability posture, active risks, and recovery state.
* Anomaly interpretation for spikes, schedule drift, degraded cron behavior, and recovery patterns.
* Predictive observability signals that highlight emerging reliability concerns before incident escalation.

### Cron Detail Investigation Experience

* Reliability history views for individual cron jobs across outages, degradations, warnings, and recoveries.
* Heartbeat lifecycle history for delayed, unstable, missing, and recovering state transitions.
* Incident drilldown connecting cron executions, retries, failures, alerts, acknowledgements, and recovery events.
* Retry and failure pattern analysis for recurring operational instability.

### Timeline Intelligence Expansion

* Advanced contextual marker controls for richer anomaly and maintenance correlation.
* Expanded maintenance overlays that show active windows and lifecycle context inside timeline investigation flows.
* Anomaly intelligence that differentiates transient noise from sustained operational degradation across longer operational windows.
* Marker grouping and filtering controls for dense operational windows.

### Advanced Reliability Analytics

* SLA compliance reporting.
* Availability scoring.
* Predictive reliability insights and advanced anomaly correlation.
* Service-level reliability scoring and operational risk weighting.

### Advanced Reporting

* Export/report generation.
* Executive operational summaries.
* Advanced drilldowns.
* Deep operational analytics.

### RBAC & Governance

* Future migration path toward capability-based authorization architecture for scalable governance and infrastructure administration.
* Future RBAC expansion for environment-scoped administration, service-scoped governance, auditor/viewer roles, tenant/global governance isolation, infrastructure governance separation, and advanced operational policy isolation.
* Planned advanced audit governance for expanded privileged-event visibility, review workflows, and platform administration traceability.
* Planned dynamic policy architecture for scalable authorization management beyond the foundational hierarchical RBAC model.

### Data Lifecycle & Retention

* Historical aggregation optimization.
* Long-term retention policies.
* Archive management.
* Aggregated historical metrics.

### Future Integrations

* Slack integrations.
* Discord integrations.
* Generic webhook integrations.
* Scheduled operational summaries.
