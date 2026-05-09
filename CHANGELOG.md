# NYX Upcoming Release Notes

Current Target:
v1.2.0

---

## Done

### Heartbeat Monitoring

* Added schedule-aware cron heartbeat monitoring
* Added missing cron detection
* Added heartbeat recovery/resolved notifications
* Added heartbeat reminder cooldown handling
* Added configurable grace-period support
* Added heartbeat visibility for non-admin users
* Added heartbeat configuration controls for admins
* Added heartbeat status integration into cron overview/dashboard

### Incident Lifecycle Improvements

* Added alert trigger lifecycle handling
* Added reminder notification lifecycle
* Added recovery/resolved lifecycle support
* Improved duplicate reminder mitigation
* Improved resolved alert synchronization behavior
* Added incident transition stabilization improvements

### Incident Timeline

* Added incident timeline/history foundation
* Added missing/recovery event visibility
* Added timeline pagination/load-more support
* Added incident event persistence structure
* Added incident history API foundation

### Alerting Improvements

* Improved Telegram notification lifecycle handling
* Improved Configured Rules alert stability
* Added resolved notification handling improvements
* Added heartbeat recovery notification support
* Improved alert delivery observability/logging

### Operational Visibility

* Added enhanced cron detail visibility
* Added environment filtering
* Added service-group filtering
* Added server-aware monitoring support
* Improved heartbeat visibility in operational tables

### Frontend Stability Improvements

* Improved polling resiliency strategy
* Improved retry handling approach
* Reduced transient dashboard failure impact
* Improved partial recovery handling behavior
* Added groundwork for hidden-tab polling optimization

### RBAC / Access Improvements

* Non-admin users can now view Heartbeat Monitoring
* Heartbeat configuration remains admin-only
* Added improved session fallback handling for role detection

### Infrastructure / Backend Improvements

* Improved incident lifecycle persistence groundwork
* Improved MySQL compatibility for incident timeline schema
* Added incident event storage foundation
* Improved backend lifecycle logging

---

## Upcoming

### Reports

* Reliability overview dashboard
* MTTR / MTBF visibility
* Downtime analytics
* Most problematic cron insights
* Incident trend reporting
* SLA-style operational reporting

### Maintenance Mode

* Silence alerts temporarily
* Maintenance windows
* Notification suppression controls
* Maintenance timeline visibility

### Incident Acknowledgement

* Incident ownership workflow
* Acknowledged incident state
* Incident notes/comments
* Operational handling visibility

### Reliability & Analytics

* Failure heatmaps
* Availability tracking
* Reliability scoring
* Historical aggregation improvements

### Data Retention

* Retention policies
* Historical log archiving
* Aggregated historical metrics
* Long-term operational storage improvements

### Frontend Enhancements

* Hidden-tab polling pause
* Additional polling optimization
* Improved graceful degradation UX
* Additional transient failure handling

### Future Integrations

* Slack/Discord/webhook notification support
* Export/report generation
* Scheduled operational summaries
* Advanced operational analytics
