# TBM Platform Master Agent Guide

## 1. How to Use This Handbook
- Start here whenever you load both WordPress ("Site") and Connect worktrees into a single workspace.
- Skim Section 2 to pick the correct repo before making changes; then open the repo-level guide for deeper details.
- Read `ARCHITECTURE.md` first when you need a maintained whole-system summary or when a client-portal or estimate workflow needs to speak about TBM at the product-architecture level.
- Keep this file up to date when cross-service contracts, environment defaults, or shared tooling change.

## 2. Repo Map and Entry Points
| Folder | Surface | Primary Tech | Key Entry Files |
| --- | --- | --- | --- |
| wordpress/ | TBM Site: WooCommerce, scheduling, portals | WordPress + WooCommerce + custom theme | wp-content/themes/tbm/functions/attune.php, wp-content/themes/tbm/classes/ |
| connect/ | TBM Connect: live session lobby & telemetry | Node.js (Express, Socket.IO, PeerJS) | server.js, server/roomManager.js, views/room.ejs |

See [wordpress/agents.md](wordpress/agents.md) and [connect/agents.md](connect/agents.md) for repo-deep instructions.

## 3. Quick Decision Checklist
- Changing commerce, scheduling, assessments, or dashboards → work in wordpress/.
- Touching live room orchestration, sockets, or telemetry → work in connect/.
- New cross-service contract (API key rotation, session lifecycle, telemetry schema) → coordinate changes in both repos and update Section 5.
- Unsure? Trace the trigger: WooCommerce hook or WordPress dashboard usually means wordpress/; anything emitted during a live session usually means connect/.

## 4. Core Data & Control Flow
1. Customer purchases attunement product on Site.
2. WordPress theme responds (woocommerce_order_status_completed), provisions attunement + assessment, logs via attune_log().
3. Connect validates join requests against WordPress (tbm_validate_session AJAX / WP_VALIDATE_URL REST), runs the lobby, and posts completion to WP_API_URL.
4. Both repos write telemetry: wordpress/wp-content/attune.log and connect/logs/telemetry-YYYY-MM-DD.log.

Maintain UTC timestamps server-side and propagate timezone IDs alongside user inputs. Never store wall-clock strings without timezone context.

## 5. Shared Contracts & Secrets
- API key: x-api-key header shared by both services; rotate in tandem (WordPress constant TBM_API_KEY or option tbm_api_key, Connect env WP_API_KEY/ADMIN_API_KEY).
- Session lifecycle: tbm_validate_session (AJAX) and REST tbm/v1/session-complete coordinate room state. Connect fires /integrations/wordpress/session-complete when rooms end.
- Assessment redirects: Connect uses WP_ASSESS_REDIRECT_BASE/{roomId} when WordPress reports incomplete assessments.
- Telemetry schema: Ensure any new fields are redacted appropriately before logging (see connect/server/telemetry.js and WordPress attune_log helpers).

## 6. Build & Test Matrix
| Task | Location | Command |
| --- | --- | --- |
| Install PHP deps | wordpress/wp-content/themes/tbm | php ./composer.phar install |
| Run PHP unit tests | wordpress/wp-content/themes/tbm | php ./composer.phar test |
| Install JS deps | connect/ | npm install |
| Run Connect tests | connect/ | npm test |
| Build Connect assets | connect/ | npm run build |
| Build theme assets | wordpress/wp-content/themes/tbm | npm run build |
| Full stack smoke | connect/ | npm run test:all (runs Jest + WordPress PHPUnit) |

## 7. Operational Notes & Runbooks
- Logs: WordPress → wordpress/wp-content/attune.log; Connect → connect/logs/telemetry-*.log and console output.
- Health checks: WordPress REST → /wp-json/tbm/v1/health; WordPress theme → /attune/assessments; Connect → /health and /admin/telemetry (requires x-api-key).
- Allowlist fallback: connect/server/sessionValidation.js maintains in-memory allowlist; seed via POST /admin/sessions/data-source with x-api-key.
- Socket transports stay in polling mode unless tests are updated; respect NODE_ENV=test disabling PeerJS mounts.
- When modifying stored procedure contracts (WordPress), sync with DBA-maintained scripts and document changes in the repo guides above.

## 8. Agent Workflow
1. Identify surface (Section 3).
2. Read `ARCHITECTURE.md` if the task spans both surfaces or needs a confident system summary.
3. Open the matching repo-level guide for deep mechanics.
4. Trace call graph from trigger to persistence or socket boundary.
5. Preserve security guards (nonces in WordPress, API key headers in Connect).
6. Update tests in the same layer you touch (PHPUnit, Jest, integration) and run them before handing work off.
7. Document noteworthy decisions here if they impact both repos.

_Last updated: 2026-06-07_