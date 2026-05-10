# NYX Active Development Tracker

Current Target:
Unreleased

Released History:
See Release History / Version Notes in the NYX About page for official shipped releases, including NYX v1.2.0.

---

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

### Cron Visibility Semantics

* Clearer operational distinction between realtime Cron page execution windows and Reports historical analytics.
* Cron activity context messaging for jobs with no executions in the selected operational window.
* Reduced operator ambiguity when historical report rows do not appear in current Cron page visibility.
* Cron Inventory architecture separating registered expected schedules from observed runtime execution activity.
* Expectation-aware heartbeat monitoring grounded in registered cron entities and schedule-aware operational semantics.
* Dedicated admin-only Cron Inventory page separating operational control-plane management from runtime telemetry.
* Inventory access flow refined through a Configure Inventory action from the Cron Runtime Activity page.
* Cron Inventory expanded into a full known-cron registry using historical runtime discovery alongside heartbeat configurations.
* Unmanaged cron onboarding semantics added so discovered-but-unmonitored jobs can be enrolled into heartbeat monitoring.
* Inventory UX simplified into operational governance and configuration management, reducing runtime telemetry noise.

### Timeline Intelligence Expansion

* Expanded contextual operational markers for richer anomaly and maintenance correlation.
* Maintenance overlays that show active windows and lifecycle context inside timeline investigation flows.
* Anomaly intelligence that differentiates transient noise from sustained operational degradation.
* Marker grouping and filtering controls for dense operational windows.

### Advanced Reliability Analytics

* SLA compliance reporting.
* Availability scoring.
* Failure heatmaps.
* Predictive reliability insights.

### Advanced Reporting

* Export/report generation.
* Executive operational summaries.
* Advanced drilldowns.
* Deep operational analytics.

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
