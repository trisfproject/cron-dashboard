# NYX Upcoming Release Notes

Current Target:
v1.2.0

---

## Done

### Heartbeat Monitoring

* Schedule-aware cron heartbeat monitoring
* Missing cron detection
* Grace-period handling
* Recovery/resolved notifications
* Reminder cooldown improvements
* Heartbeat lifecycle tracking
* Compact schedule formatting improvements
* Next expected heartbeat calculation improvements
* Rich heartbeat state classification for healthy, delayed, unstable, missing, recovering, and invalid schedules
* Predictive heartbeat risk visibility for late-but-not-yet-missing schedules
* Heartbeat lag and state-reason metadata exposed to dashboard and cron-list views
* Recovery stabilization visibility after missing-cron incidents resolve

### Incident Lifecycle & Timeline

* Incident event recording
* Incident lifecycle persistence
* Missing/recovery visibility
* Incremental timeline loading
* Incident retrieval APIs
* Incident history foundation
* Configured-rule alert lifecycle events unified into the incident event stream
* Triggered and resolved configured-rule alerts backfilled into `incident_events`
* `alert_events.resolved_at` lifecycle support added for resolved alert tracking
* Incident start, resolution, downtime seconds, and downtime minutes persisted for reliability analytics
* Cron detail timelines expanded with downtime and schedule context for alert and heartbeat lifecycle events

### Maintenance Mode

* Maintenance window management
* Temporary alert silencing
* Notification suppression controls
* Maintenance duration handling
* Maintenance reason input support

### Incident Acknowledgement

* Incident acknowledgement workflow
* Ownership tracking
* User acknowledgement visibility
* Incident notes/comments support

### Reliability Reports

* Reports section foundation
* Reliability overview cards
* Incident visibility metrics
* Operational reporting foundation
* Most problematic cron reporting
* Custom date range support
* API-backed report aggregation
* Semantic incident metrics split outage, degraded, informational, and recovery activity
* Downtime, MTTR, MTBF, and availability calculations refined to outage-class incidents only
* Incident trend chart redesigned with daily outage, degraded, and recovery comparisons
* Most problematic cron ranking supports incident-count and downtime sorting
* Cron Health Overview and slowest cron analytics added to reports
* Responsive report filters, summary cards, trend chart, and operational tables improved for smaller screens

### Alerting Improvements

* Telegram lifecycle improvements
* Configured Rules alert stabilization
* Recovery notification handling
* Duplicate reminder mitigation
* Improved notification logging
* Improved alert parsing/filtering
* Configured-rule recovery persistence records resolved state and downtime duration
* Alert event queries expose resolved timestamps and downtime fields
* Alert lifecycle events now feed shared incident reporting and cron timeline history

### Frontend Stability & Polling

* Enhanced polling mechanism
* Visibility-aware polling handling
* Retry logic improvements
* Reduced transient dashboard failures
* Improved dashboard resiliency
* Better graceful recovery handling
* Timeline controls gained explicit live/pause mode, custom range panning, and reset zoom behavior

### Operational Visibility

* Cron detail enhancements
* Environment filtering
* Service-group filtering
* Server-aware monitoring
* Heartbeat dashboard integration
* Improved operational table clarity
* Dashboard Active Alerts grouped by outage, degraded, and informational reliability classes
* Reliability-aware alert counters and section styling added for faster incident scanning
* Informational alert events reduced in visual weight to lower operator noise
* Dashboard observability flow reordered into Metrics, Timeline, Heartbeat Monitoring, then Active Alerts
* Dashboard Timeline enhanced with contextual operational markers for failure spikes, warning surges, recoveries, and maintenance lifecycle events
* Timeline tooltips now correlate execution activity with semantic incident and operational event overlays
* Cron page mobile cards now have stronger spacing, boundaries, and metadata grouping for faster operational scanning
* Operational Activity widget removed from the dashboard to reduce duplicated operational noise
* Audit page simplified back to focused, filterable Audit Events history after removing duplicate activity summaries
* Heartbeat Monitoring evolved from healthy/missing display into schedule-state operational scanning
* Timeline, Heartbeat Monitoring, and Active Alerts now form a realtime operational monitoring cluster

### Backend & Infrastructure Improvements

* Incident persistence improvements
* Improved MySQL compatibility handling
* Incident event storage foundation
* Lifecycle logging improvements
* Heartbeat evaluator lifecycle controls
* `impact_type` classification added to incident events
* `reliability_class` semantics added for outage, degraded, and informational incident classification
* Lifecycle-only events classified as informational to avoid inheriting false outage semantics
* Reliability classification priority refined to distinguish root incident class from lifecycle event impact
* Incident impact/reliability backfills hardened for MySQL collation and charset compatibility
* Incident impact and reliability time indexes added for report filtering and aggregation

### RBAC & Session Improvements

* Heartbeat visibility for non-admin users
* Admin-only heartbeat configuration management
* Improved session fallback handling
* Improved authentication/session parsing
* Non-admin log visibility tightened while preserving scoped operational summaries

---

## Upcoming

### Advanced Reliability Analytics

* SLA compliance reporting
* Availability scoring
* Failure heatmaps
* Predictive reliability insights

### Data Lifecycle & Retention

* Historical aggregation optimization
* Long-term retention policies
* Archive management
* Aggregated historical metrics

### Future Integrations

* Slack integrations
* Discord integrations
* Generic webhook integrations
* Scheduled operational summaries

### Advanced Reporting

* Export/report generation
* Executive operational summaries
* Advanced drilldowns
* Deep operational analytics
