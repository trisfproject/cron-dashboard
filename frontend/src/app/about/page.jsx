'use client';

import { useMemo, useState } from 'react';
import { Activity, CalendarDays, CheckCircle2, ChevronDown, Clock3, GitBranch, History, LockKeyhole, Server, ShieldCheck } from 'lucide-react';
import { BrandMark } from '@/components/BrandMark';
import { appMetadata } from '@/lib/appMetadata';

const RELEASES = [
  {
    version: '1.2.2',
    label: 'Current release',
    title: 'Operational Governance & Reliability Analytics',
    summary: 'Expanded NYX operational intelligence with richer historical reliability analytics, cleaner investigative report interactions, stronger governance workflows, and more compact responsive operational dashboards.',
    sections: [
      {
        title: 'Reports & Reliability Analytics',
        items: [
          'Added Reliability Distribution and Incident Classification Breakdown sections to clarify operational health composition before trend investigation.',
          'Introduced Reliability Heatmap analytics for service-group operational density, degradation concentration, and historical hotspot analysis.',
          'Refined Reliability Activity semantics, tooltips, summary language, and visual interpretation around reliability pressure and recovery behavior.',
          'Improved report filtering, responsive density, toolbar grouping, and analytical section sequencing across desktop, tablet, and mobile layouts.'
        ]
      },
      {
        title: 'Cron Inventory & Governance',
        items: [
          'Expanded cron inventory governance for unmanaged cron discovery, heartbeat onboarding, and operational registry coverage.',
          'Refined runtime versus configuration separation so `/cron` remains realtime telemetry while `/cron/inventory` focuses on control-plane management.',
          'Improved operational ownership mapping, monitoring policy visibility, inventory filtering, and heartbeat governance semantics.',
          'Enhanced cron inventory visibility for managed, unmanaged, historical, and runtime-discovered cron jobs.'
        ]
      },
      {
        title: 'Alerts',
        items: [
          'Refined alert toolbar grouping so lifecycle states and scoped filters remain visually distinct.',
          'Improved responsive alert filtering controls for desktop, tablet, and mobile operational workflows.',
          'Enhanced operational alert lifecycle presentation with clearer filtering density and scanning behavior.',
          'Reduced toolbar ambiguity across active, acknowledged, resolved, and all-alert review modes.'
        ]
      },
      {
        title: 'Account & Security',
        items: [
          'Refined the account and session security dashboard for more compact mobile and tablet operational review.',
          'Added compact operational metadata tile behavior for Current User, Role, Session, Last Login, and Password Age summaries.',
          'Improved Change Password form responsiveness, password policy density, and mobile/tablet spacing while preserving security semantics.',
          'Enhanced account-security layout consistency with NYX operational dashboard patterns.'
        ]
      },
      {
        title: 'Reliability Activity',
        items: [
          'Added direct investigative chart interactions including drag-to-zoom, wheel zoom, post-zoom panning, double-click reset, and touch-friendly navigation.',
          'Removed the legacy bottom navigator slider so reliability investigation uses direct chart manipulation instead of BI-style controls.',
          'Restored inside-only zoom and pan mechanics after navigator removal, including touchpad and pinch gesture support where available.',
          'Improved chart wording and operational interpretation so transient reliability activity no longer reads like ticket backlog growth.'
        ]
      },
      {
        title: 'UI & Responsiveness',
        items: [
          'Improved responsive operational density across Reports, Alerts, Cron, and Account pages.',
          'Rebuilt and refined custom range popover positioning with viewport-safe, trigger-aware behavior for desktop, tablet, and mobile screens.',
          'Enhanced tablet breakpoint handling for operational dashboard toolbars, filters, metadata cards, and report investigation surfaces.',
          'Improved compact mobile and tablet layouts while preserving touch-friendly controls, dark/light theme compatibility, and enterprise observability styling.'
        ]
      },
      {
        title: 'Upcoming',
        items: [
          'System Insights: operational intelligence summaries, anomaly interpretation, and predictive observability.',
          'Cron Detail Investigation Experience: reliability history, heartbeat lifecycle history, incident drilldown, and retry/failure pattern analysis.',
          'Timeline Intelligence Expansion: richer contextual operational markers, maintenance overlays, and anomaly intelligence.',
          'RBAC & Governance: planned SUPER_ADMIN role support, multi-tier administration, tenant/global governance control, elevated audit visibility, and advanced administrative isolation.'
        ]
      }
    ]
  },
  {
    version: '1.2.1',
    label: 'Previous release',
    title: 'Operational Governance & Cron Inventory',
    summary: 'Expanded NYX operational governance with dedicated cron inventory management, runtime and configuration separation, unmanaged cron discovery, and enterprise-style heartbeat onboarding workflows.',
    sections: [
      {
        title: 'Cron Inventory & Governance',
        items: [
          'Introduced dedicated `/cron/inventory` operational registry for schedule governance and heartbeat onboarding workflows.',
          'Expanded inventory visibility to include managed, unmanaged, historical, and runtime-discovered cron jobs.',
          'Added operational lifecycle states including unmanaged, delayed, missing, recovering, waiting, and disabled monitoring states.',
          'Enabled heartbeat enrollment, monitoring configuration, pause controls, and execution visibility through inventory governance actions.'
        ]
      },
      {
        title: 'Runtime & Configuration Separation',
        items: [
          'Separated realtime runtime observability from operational configuration management between `/cron` and `/cron/inventory`.',
          'Refined inventory semantics to focus on governance, onboarding, and operational ownership instead of runtime telemetry.',
          'Removed telemetry-heavy execution context from inventory views to improve operational clarity and scalability.',
          'Improved runtime activity messaging to distinguish observed execution activity from expected operational schedules.'
        ]
      },
      {
        title: 'Operational UX Improvements',
        items: [
          'Improved cron onboarding readability and operational scanning efficiency across inventory and runtime views.',
          'Enhanced mobile cron layout spacing, grouping, and visual separation for responsive operational workflows.',
          'Refined realtime timeline anomaly rendering and tooltip synchronization for cleaner operational investigation.',
          'Improved operational messaging consistency across dashboard, reports, inventory, and alert management surfaces.'
        ]
      },
      {
        title: 'Monitoring Architecture',
        items: [
          'Improved inventory normalization and cron discovery architecture for expanded operational coverage.',
          'Refined monitoring lifecycle semantics for cleaner heartbeat governance and operational ownership boundaries.',
          'Reduced runtime and configuration overlap to support scalable enterprise operational workflows.',
          'Expanded operational control-plane capabilities for future governance and SLA-aware monitoring enhancements.'
        ]
      }
    ]
  },
  {
    version: '1.2.0',
    label: 'Previous release',
    title: 'Semantic Observability & Operational Intelligence',
    summary: 'Evolved NYX from cron monitoring into a semantic operational observability platform with reliability-aware incidents, lifecycle persistence, predictive heartbeat states, and cleaner realtime operational correlation.',
    sections: [
      {
        title: 'Semantic Incident Architecture',
        items: [
          'Introduced reliability-aware incident semantics that distinguish outage, degraded, and informational operational activity.',
          'Added incident lifecycle awareness so alert triggers, recoveries, acknowledgements, notes, reminders, and maintenance events carry clearer operational meaning.',
          'Separated root incident reliability from lifecycle event impact so informational events no longer inflate outage or degradation semantics.',
          'Unified missing-cron, configured-rule, and lifecycle events into a more consistent semantic incident model.'
        ]
      },
      {
        title: 'Unified Incident Lifecycle Persistence',
        items: [
          'Backfilled configured-rule alert triggers and resolutions into the shared `incident_events` persistence path.',
          'Added `alert_events.resolved_at` support for resolved alert tracking and lifecycle-aware alert history.',
          'Persisted incident start, resolution, `downtime_seconds`, and `downtime_minutes` for recovery and reliability analytics.',
          'Expanded incident storage with lifecycle-aware metadata for resolved incidents, heartbeat recovery, and configured-rule recovery events.'
        ]
      },
      {
        title: 'Dashboard Improvements',
        items: [
          'Redesigned the dashboard flow into a progressive operational drilldown from executive metrics to Timeline, Heartbeat Monitoring, and Active Alerts.',
          'Positioned live execution activity, schedule continuity, and active incidents as a cohesive realtime operational monitoring cluster.',
          'Added live/pause mode, custom range panning, and reset zoom behavior to improve realtime timeline investigation.',
          'Removed duplicate Operational Activity surfaces from the dashboard so operators can focus on the primary observability path.'
        ]
      },
      {
        title: 'Semantic Active Alerts',
        items: [
          'Grouped active alerts by outage, degraded, and informational reliability class instead of presenting all alerts as a flat stream.',
          'Added reliability-aware counters and section styling so availability-impacting incidents receive the highest visual priority.',
          'Reduced visual weight for informational lifecycle events to preserve access without competing with active operational incidents.',
          'Improved alert scanning by preserving owner, state, timestamp, environment, service, and history context inside a semantic incident view.'
        ]
      },
      {
        title: 'Enhanced Heartbeat Monitoring',
        items: [
          'Expanded heartbeat state semantics beyond healthy and missing into Healthy, Delayed, Unstable, Missing, Recovering, and Invalid schedules.',
          'Added predictive visibility for late-but-not-yet-missing cron schedules before they escalate into missing heartbeat incidents.',
          'Exposed heartbeat lag and state-reason metadata in dashboard and cron-list views for clearer schedule continuity analysis.',
          'Added recovery-state monitoring after missing cron incidents resolve so operators can observe stabilization after restoration.'
        ]
      },
      {
        title: 'Timeline Improvements',
        items: [
          'Added contextual operational overlays for failure spikes, warning surges, recoveries, and maintenance lifecycle events.',
          'Enriched timeline tooltips with semantic operational context while preserving the existing execution activity chart behavior.',
          'Refined marker rendering so overlays synchronize with visible plotted datapoints and avoid detached incident-only noise.',
          'Reduced low-signal anomaly visualization so timeline markers remain trustworthy and operationally meaningful.'
        ]
      },
      {
        title: 'Reports Enhancements',
        items: [
          'Added semantic reliability reporting that separates outage, degraded, informational, and recovery activity.',
          'Refined downtime, availability, MTTR, and MTBF calculations to use outage-class incidents for more accurate reliability interpretation.',
          'Redesigned incident trends to compare daily outages, degradations, and recoveries in WIB.',
          'Improved report responsiveness, filtering, summary cards, problematic cron ranking, Cron Health Overview, and slowest cron analytics.'
        ]
      },
      {
        title: 'Cron Monitoring Improvements',
        items: [
          'Improved mobile Cron page readability with stronger card separation, spacing, subtle borders, and metadata grouping.',
          'Added reliability-aware heartbeat badges for delayed, unstable, missing, recovering, invalid, disabled, and not-configured schedules.',
          'Preserved dense desktop cron tables while making mobile cron entries feel like independent operational cards.',
          'Improved operator scanning for cron name, status, heartbeat state, freshness, success rate, run count, and average duration.'
        ]
      },
      {
        title: 'Audit Simplification',
        items: [
          'Removed redundant Operational Activity duplication from audit and dashboard-adjacent workflows.',
          'Simplified audit review back to focused, filterable Audit Events history with pagination.',
          'Preserved operational traceability while reducing repeated activity summaries across observability surfaces.'
        ]
      },
      {
        title: 'Reliability & Operational Semantics',
        items: [
          'Added `reliability_class` semantics for outage, degraded, and informational incident classification.',
          'Added `impact_type` classification to separate event impact from root incident reliability.',
          'Improved downtime accuracy and operator trust by preventing lifecycle-only events from inheriting outage semantics.',
          'Strengthened incident analytics with clearer outage/degradation distinctions across reports, dashboards, and timelines.'
        ]
      },
      {
        title: 'Backend & Database',
        items: [
          'Added semantic lifecycle migrations for configured-rule incident unification, impact classification, and reliability refinement.',
          'Added incident lifecycle indexes for impact and reliability time aggregation.',
          'Hardened reliability classification backfills for MySQL collation and charset compatibility.',
          'Improved operational persistence for alert resolution, downtime duration, heartbeat recovery, and maintenance lifecycle events.'
        ]
      }
    ]
  },
  {
    version: '1.1.0',
    label: 'Previous release',
    title: 'Operational Lifecycle, Security & Alerting',
    summary: 'Expanded NYX into a governed internal operations center with scoped observability, alert lifecycle management, auditability, and stronger account security controls.',
    sections: [
      {
        title: 'Core Platform',
        items: [
          'Added environment and service-group scoping across dashboard metrics, cron lists, logs, alerts, and alert rules.',
          'Refined time-window analysis with custom WIB ranges, chart zoom, pan, reset, and live refresh controls.',
          'Added scoped option discovery for environments and services so filters reflect ingested operational data.',
          'Expanded dashboard operations with scoped health context, ingest freshness, throughput, problematic cron ranking, and slowest cron analytics.'
        ]
      },
      {
        title: 'Authentication & Security',
        items: [
          'Added session-version validation so role changes, status changes, password resets, password changes, archive, restore, and force logout invalidate stale sessions.',
          'Introduced password policy enforcement, password-age tracking, expiration metadata, reminder banners, and audited password reminder visibility.',
          'Added self-service password changes with current-password verification, reuse prevention, confirmation checks, and other-session invalidation.',
          'Improved login protection with failed-login auditing, temporary lockout tracking, secure HttpOnly session cookies, and authenticated session bootstrap handling.'
        ]
      },
      {
        title: 'User Management',
        items: [
          'Added admin user creation, profile editing, role assignment, activation, deactivation, password reset, and force logout controls.',
          'Introduced soft-delete lifecycle support with archive and restore flows that preserve audit history.',
          'Added duplicate-user recovery guidance for active, disabled, and archived accounts with contextual restore, reactivate, and reset-password actions.',
          'Protected operators from self-deactivation, self-archive, and last-active-admin removal while allowing permanent deletion only for users without login or audit history.'
        ]
      },
      {
        title: 'Alerting',
        items: [
          'Enhanced alert configuration with monitoring profiles, cron behavior context, scoped rule targeting, and quieter runtime defaults for staging and development.',
          'Added alert history pagination, load-more behavior, scoped filtering, manual evaluation refresh, and acknowledgement UX refinements.',
          'Added notification delivery tracking with cooldown-aware delivery counts, last notification status, and error visibility.',
          'Added Telegram test delivery and severity-specific forum-topic routing while keeping notification secrets in backend environment variables.'
        ]
      },
      {
        title: 'Audit & Operations',
        items: [
          'Expanded audit coverage for password resets, user lifecycle changes, archive and restore actions, forced logout, and password reminder visibility.',
          'Expanded session security views with account-level authentication activity for recent security event review.',
          'Added audit filtering by action, user, start date, and end date with load-more pagination for operational investigations.',
          'Added dashboard activity feed for recent administrative and incident-management events.'
        ]
      },
      {
        title: 'UI/UX',
        items: [
          'Refined responsive navigation with desktop links, mobile drawer navigation, safe-area spacing, account identity, role badges, theme controls, and logout actions.',
          'Added mobile/tablet card layouts for alerts, audit logs, users, cron jobs, health insights, slowest jobs, and execution history while preserving dense desktop tables.',
          'Added execution output inspection with detected issue type, stdout, stderr, warnings, exceptions, retry logs, timeout details, copy actions, and full-output expansion.',
          'Refined dark and light mode polish, scoped badges, compact controls, loading states, empty states, and footer version metadata.'
        ]
      },
      {
        title: 'Reliability & Stability',
        items: [
          'Hardened migrations with schema-aware column and index checks for partial deployments and older MySQL or MariaDB compatibility.',
          'Added post-ingest and scheduled alert evaluation with throttled failure logging so alert engine errors do not disrupt cron ingest.',
          'Added pagination and duplicate merging for dashboard logs, cron lists, alert history, and audit logs.',
          'Improved query performance with indexes for time ranges, status, server, environment, service group, alert scope, audit queries, and archived users.'
        ]
      },
      {
        title: 'Infrastructure',
        items: [
          'Updated Docker Compose for health-gated MySQL, backend, and frontend startup with restart policies, local MySQL storage, logging limits, and a dedicated Docker bridge network.',
          'Added backend alert evaluation interval configuration, bootstrap admin environment variables, session TTL configuration, and production build metadata wiring.',
          'Hardened NGINX reverse proxy configs with security headers, request size limits, proxy timeouts, Cloudflare-ready host routing, and private CIDR restrictions for cron ingest.',
          'Documented deployment, networking, backup, environment-file handling, and service verification guidance for production operations.'
        ]
      }
    ]
  },
  {
    version: '1.0.0',
    label: 'Foundation release',
    title: 'Foundational Monitoring Platform',
    summary: 'Established the core NYX Monitoring Platform with authenticated access, durable ingest storage, operational metrics, and production deployment scaffolding.',
    sections: [
      {
        title: 'Core Platform',
        items: [
          'Delivered the cron ingest API with API-key authentication, request validation, timestamp normalization, SHA-256 deduplication, and duplicate-safe responses.',
          'Created durable MySQL storage for cron name, command, server, environment, status, duration, timestamp, hash, and ingest timestamps.',
          'Added the primary dashboard for total jobs, total runs, success rate, failure count, warning count, average duration, time-range filtering, and timeline trends.',
          'Added cron list and cron detail views for moving from fleet-level status into job-level execution history.'
        ]
      },
      {
        title: 'Authentication & Security',
        items: [
          'Introduced NYX application users, admin/user roles, authenticated dashboard sessions, and middleware route protection.',
          'Added bootstrap admin support through environment variables for first-run operational access.',
          'Protected ingest traffic with API-key verification and reverse-proxy allow rules for internal cron producers.',
          'Added server-side API proxy behavior that redirects expired or missing sessions back to login.'
        ]
      },
      {
        title: 'User Management',
        items: [
          'Added the initial admin-only user table for managing names, emails, roles, account status, and last-login visibility.',
          'Added user creation and basic role management with immediate sign-in availability for active users.'
        ]
      },
      {
        title: 'Alerting',
        items: [
          'Introduced the alert engine with rules for failed thresholds, warning thresholds, success-rate degradation, duration anomalies, retry storms, and cron silence.',
          'Added alert lifecycle events for active, acknowledged, and resolved alerts with admin-only history and configuration pages.',
          'Established Telegram, Discord, and Slack notification channel support with webhook secrets kept in backend environment variables.'
        ]
      },
      {
        title: 'Audit & Operations',
        items: [
          'Added the audit log foundation for login, logout, failed login, alert rule changes, alert acknowledgements, role changes, and user administration.',
          'Added health-check endpoints and operational deployment documentation for local service verification.',
          'Established the dashboard as the primary place to review live cron execution status and operational health.'
        ]
      },
      {
        title: 'UI/UX',
        items: [
          'Established NYX branding, app shell navigation, responsive layout foundations, and clean enterprise dashboard typography.',
          'Added dark and light theme support with persistent theme controls.',
          'Added reusable status badges, metric cards, timeline charts, log tables, and formatting utilities.',
          'Added responsive login and dashboard layouts suitable for desktop, tablet, and mobile monitoring.'
        ]
      },
      {
        title: 'Reliability & Stability',
        items: [
          'Added database indexes for cron name, timestamp, status, cron/server/timestamp lookup, and unique ingest hashes.',
          'Added backend database wait logic and graceful shutdown handling for containerized production operation.',
          'Added bounded API query limits for logs and cron lists to keep operational views predictable.'
        ]
      },
      {
        title: 'Infrastructure',
        items: [
          'Shipped Dockerfiles and Docker Compose services for MySQL, Fastify backend, and Next.js frontend.',
          'Added NGINX reverse proxy templates for API and frontend hosts with proxy headers and security headers.',
          'Added environment templates, deployment documentation, networking notes, and cron ingest examples for production rollout.'
        ]
      }
    ]
  }
];

const currentVersion = String(appMetadata.version || RELEASES[0].version).replace(/^v/i, '');
const selectedInitialVersion = RELEASES.some((release) => release.version === currentVersion) ? currentVersion : RELEASES[0].version;

function MetadataPill({ icon: Icon, label, value }) {
  return (
    <div className="min-w-0 rounded-md border border-slate-200 bg-white/85 p-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>{label}</span>
      </div>
      <p className="mt-2 truncate text-sm font-semibold text-ink">{value}</p>
    </div>
  );
}

function ReleaseDetail({ release }) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="border-b border-slate-200 p-4 dark:border-slate-800 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">
              <GitBranch className="h-4 w-4" aria-hidden="true" />
              v{release.version}
            </p>
            <h2 className="mt-2 text-lg font-semibold tracking-normal text-ink">{release.title}</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500 dark:text-slate-400">{release.summary}</p>
          </div>
          <span className="inline-flex w-fit items-center gap-2 rounded-md bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800">
            <CalendarDays className="h-4 w-4" aria-hidden="true" />
            {release.label}
          </span>
        </div>
      </div>
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {release.sections.map((section) => (
          <section key={section.title} className="grid gap-3 p-4 sm:p-5 md:grid-cols-[13rem_minmax(0,1fr)]">
            <h3 className="text-sm font-semibold text-ink">{section.title}</h3>
            <ul className="space-y-2.5">
              {section.items.map((item) => (
                <li key={item} className="flex gap-2.5 text-sm leading-6 text-slate-600 dark:text-slate-300">
                  <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-300" aria-hidden="true" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </article>
  );
}

export default function AboutPage() {
  const [selectedVersion, setSelectedVersion] = useState(selectedInitialVersion);
  const selectedRelease = useMemo(
    () => RELEASES.find((release) => release.version === selectedVersion) || RELEASES[0],
    [selectedVersion]
  );

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-5 dark:border-slate-800 dark:bg-slate-900/50 sm:px-6 lg:px-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 space-y-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <span className="flex min-h-16 w-fit max-w-full shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
                  <BrandMark />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">About NYX</p>
                  <h1 className="mt-2 text-2xl font-semibold tracking-normal text-ink sm:text-3xl">NYX Monitoring Platform</h1>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300 sm:text-base">
                    Enterprise monitoring for operational observability, alert response, and cron reliability across internal platform teams.
                  </p>
                </div>
              </div>
              <div className="inline-flex w-fit items-center gap-2 rounded-md bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 ring-1 ring-blue-200 dark:bg-blue-950/40 dark:text-blue-200 dark:ring-blue-900">
                <Activity className="h-4 w-4" aria-hidden="true" />
                Current Version: v{currentVersion}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:w-[26rem]">
              <MetadataPill icon={Server} label="Platform" value="Monitoring platform" />
              <MetadataPill icon={ShieldCheck} label="Visibility" value="Admin only" />
              <MetadataPill icon={LockKeyhole} label="Access" value="Authenticated session" />
              <MetadataPill icon={Clock3} label="Runtime" value={appMetadata.environment || 'Internal'} />
            </div>
          </div>
        </div>
        <div className="grid gap-3 px-4 py-4 text-sm text-slate-600 dark:text-slate-300 sm:grid-cols-3 sm:px-6 lg:px-7">
          <div>
            <p className="font-semibold text-ink">Operational Center</p>
            <p className="mt-1 leading-6">Cron health, alerts, audit activity, and release context in one admin surface.</p>
          </div>
          <div>
            <p className="font-semibold text-ink">Enterprise Controls</p>
            <p className="mt-1 leading-6">Role-gated visibility, session controls, lifecycle governance, and traceable changes.</p>
          </div>
          <div>
            <p className="font-semibold text-ink">Build Metadata</p>
            <p className="mt-1 leading-6">{appMetadata.gitHash ? `Commit ${appMetadata.gitHash}` : 'Build details are sourced from the deployed NYX metadata.'}</p>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950 sm:flex-row sm:items-end sm:justify-between sm:p-5">
          <div>
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              <History className="h-4 w-4" aria-hidden="true" />
              Release History
            </p>
            <h2 className="mt-2 text-lg font-semibold text-ink">Version Notes</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Select a platform version to review its operational changes.</p>
          </div>
          <label className="w-full space-y-1 sm:w-64">
            <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Version</span>
            <span className="relative block">
              <select
                value={selectedVersion}
                onChange={(event) => setSelectedVersion(event.target.value)}
                className="min-h-11 w-full appearance-none rounded-md border border-slate-300 bg-white px-3 py-2 pr-10 text-sm font-semibold text-ink shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:border-slate-800 dark:bg-slate-950 dark:focus:border-blue-400 dark:focus:ring-blue-950"
              >
                {RELEASES.map((release) => (
                  <option key={release.version} value={release.version}>v{release.version}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
            </span>
          </label>
        </div>

        <ReleaseDetail release={selectedRelease} />
      </section>
    </div>
  );
}
