# NYX Active Development Tracker

Current Target:
Unreleased

Released History:
See Release History / Version Notes in the NYX About page for official shipped releases, including NYX v1.2.1.

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
* Improved `/cron` mobile filter responsiveness with compact operational grouping for search, server, window, environment, service, status, and apply controls.

### Timeline Intelligence Expansion

* Expanded contextual operational markers for richer anomaly and maintenance correlation.
* Maintenance overlays that show active windows and lifecycle context inside timeline investigation flows.
* Anomaly intelligence that differentiates transient noise from sustained operational degradation.
* Marker grouping and filtering controls for dense operational windows.
* Refined Alerts toolbar grouping with clearer lifecycle/filter separation and compact responsive alert filtering controls.

### Reports Reliability Activity

* Refined Incident Trend semantics into operational reliability activity wording.
* Improved report summary labels to describe reliability pressure and recovery behavior instead of accumulated ticket work.
* Enhanced report tooltip interpretation with triggered events, recovered events, reliability balance, and operational context.
* Added investigative report chart interactions with drag-to-zoom, wheel zoom, post-zoom panning, and double-click reset.
* Restored inside-only Reliability Activity navigation after slider removal, preserving wheel zoom, focused panning, and touch pinch behavior without the legacy navigator UI.
* Enhanced operational timeline navigation for focused reliability activity investigation windows.
* Streamlined Reliability Activity chart interaction by removing the legacy bottom slider navigator in favor of direct chart manipulation.
* Fixed custom report range popover boundary handling with viewport-aware positioning and responsive collision behavior.
* Refined adaptive custom window popover alignment with trigger-aware sizing, anchored positioning, and dashboard/report filter consistency.
* Rebuilt custom window positioning with trigger-anchored desktop/tablet popovers and mobile-safe viewport filter dialogs.
* Improved Reports mobile responsiveness with compact operational filters, tighter metric cards, and denser mobile/tablet observability spacing.
* Improved Reliability Activity mobile responsiveness with refined chart height, compact legend wrapping, and tighter tablet/mobile chart spacing.
* Removed ambiguous global report sorting control to simplify operational analytics filtering and reduce pseudo-analytical toolbar complexity.
* Refined Reports toolbar grouping with dedicated time controls, a unified operational filter cluster, and compact responsive filter alignment.
* Refined Reports analytical hierarchy with reliability distribution, incident classification context, and clearer historical observability storytelling before trend analysis.
* Added historical Reliability Heatmap analytics for service-group operational density, hotspot visualization, and reliability pattern analysis.
* Reduced misleading visual severity by aligning chart language and legend copy with transient reliability activity.

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
