# TBM Platform Architecture

## System Summary

TBM is a dual-surface platform composed of a WordPress commerce and scheduling system plus a Node.js live-session service called Connect. The WordPress side owns products, purchases, assessments, practitioner and customer dashboards, and attunement lifecycle records. Connect owns room validation, live video and chat orchestration, telemetry, and room-completion callbacks.

The two surfaces should be treated as one product system. Most feature work is either:

- WordPress-led: commerce, scheduling, assessments, dashboards, practitioner workflows.
- Connect-led: room joins, session state, sockets, PeerJS/WebRTC, telemetry, room admin tooling.
- Cross-system: session validation, completion callbacks, shared API keys, redirect behavior, and telemetry correlation.

## Core Subsystems

### 1. WordPress Site

Path: `tbm/wordpress`

Responsibilities:

- WooCommerce order processing and attunement provisioning
- Scheduling and appointment lifecycle
- Assessment creation, completion, and gating
- Customer and practitioner dashboards
- Operational logging via `attune_log()`

Primary architecture anchors:

- `tbm/wordpress/wp-content/themes/tbm/functions/attune.php`
- `tbm/wordpress/wp-content/themes/tbm/classes/class-attunement.php`
- `tbm/wordpress/wp-content/themes/tbm/classes/class-assessment.php`
- `tbm/wordpress/wp-content/themes/tbm/pages/`
- `tbm/wordpress/wp-content/themes/tbm/inc/`

Key behavior:

1. WooCommerce order completion triggers attunement provisioning.
2. Attunement and assessment records are created and updated through theme hooks and stored procedure wrappers.
3. Assessment completion moves the session toward a ready state for Connect.
4. WordPress remains the source of truth for session eligibility and lifecycle state.

### 2. Connect Live Session Service

Path: `connect`

Responsibilities:

- Room access validation
- Live video and chat room orchestration
- Socket-based state synchronization
- PeerJS/WebRTC session bootstrap
- Telemetry capture and room event inspection

Primary architecture anchors:

- `connect/server.js`
- `connect/server/roomManager.js`
- `connect/server/sessionValidation.js`
- `connect/server/telemetry.js`
- `connect/public/socket/socket.js`

Key behavior:

1. Connect validates room joins against WordPress first, then falls back to the in-memory allowlist when configured.
2. Socket events coordinate join, start, pause, resume, end, and leave behavior.
3. Telemetry is written to JSONL logs and exposed through admin inspection endpoints.
4. Connect notifies WordPress when sessions complete.

## Shared Contracts

### Session Validation

- WordPress exposes the validation surface used by Connect.
- Connect consumes WordPress validation before rendering or admitting the room.
- Allowlist fallback exists in Connect for degraded or staged operation.

Primary contract points:

- WordPress AJAX `tbm_validate_session`
- Connect `GET /api/session/validate`
- Connect room entry `GET /:room`

### Session Completion

- Connect posts room-completion events back into the WordPress lifecycle.
- WordPress updates attunement state when the room ends.

Primary contract points:

- WordPress REST `/wp-json/tbm/v1/session-complete`
- Connect `/integrations/wordpress/session-complete`

### Shared Secrets and Redirects

- `x-api-key` is shared across both systems and must be rotated in tandem.
- Assessment redirect behavior depends on Connect and WordPress staying aligned on redirect bases and incomplete-session handling.

## Operational Model

### Logs and Observability

- WordPress log file: `tbm/wordpress/wp-content/attune.log`
- Connect telemetry logs: `connect/logs/telemetry-YYYY-MM-DD.log`
- Connect admin telemetry routes support room and event inspection.

### Time and Identity Rules

- GUID is the stable cross-system join key for attunements, assessments, and room access.
- Server-side timestamps should remain UTC-backed with timezone identifiers propagated alongside user-facing scheduling data.
- Do not regenerate downstream identifiers once WordPress issues them.

## Directory Map

- `agents.md`: root TBM map and cross-system contracts
- `connect/agents.md`: Connect runtime architecture and safe-change checklist
- `tbm/wordpress/wp-content/themes/tbm/agents.md`: WordPress/theme architecture and execution paths
- `tbm/wordpress/wp-content/themes/tbm/SCHEDULING_SYSTEM_ARCHITECTURE_AND_BEST_PRACTICES.md`: deep scheduling and stored-procedure guidance

## Guided Scan Inputs For Estimates

Any guided estimate scan for TBM should read these in order before making architectural claims:

1. This file
2. `agents.md`
3. `connect/agents.md`
4. `tbm/wordpress/wp-content/themes/tbm/agents.md`
5. `tbm/wordpress/wp-content/themes/tbm/SCHEDULING_SYSTEM_ARCHITECTURE_AND_BEST_PRACTICES.md` when the request touches scheduling, assessments, or practitioner workflows

After the document pass, scans should inspect only the relevant code slice and use these signals:

- key entrypoints and integration endpoints
- environment and shared-secret surfaces
- git activity density in affected paths
- socket event or hook density in the touched subsystem
- stored-procedure dependency when WordPress data workflows are involved

Scans should explain impact in system terms, such as whether a request affects the WordPress commerce and scheduling path, the Connect live-session path, or the cross-system contract between them.