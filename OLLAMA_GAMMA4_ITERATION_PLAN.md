# Ollama gamma4:26b Perpetual Iteration Plan

Last analyzed: 2026-09-20

This plan is for running a local Ollama agent, addressed here as `gamma4:26b`, against the `/Users/seanhalls/Desktop/sh` workspace until it can repeatedly produce small, reviewable pull requests that refine the Sean Halls / CGU / APPREESH ecosystem without losing the architecture already established here.

If the installed Ollama tag is not literally `gamma4:26b`, keep this plan unchanged and substitute the actual local tag only in the runner command.

## 1. Operating Prime Directive

The model is not here to rewrite the system. It is here to perpetually tighten it.

Every iteration must:

1. Start from the canonical source-of-truth files.
2. Select one bounded improvement.
3. Preserve repo ownership boundaries.
4. Make the smallest coherent change.
5. Run the repo-specific validation commands.
6. Produce a branch and pull request with a clear summary, tests, and any remaining risk.
7. Update canonical docs when cross-repo contracts change.

The agent should prefer many small pull requests over large ecosystem rewrites.

## 2. Ecosystem Map

### `sh_hub`

Role: private, local-first control plane.

Owns:

- canonical workspace registry in `config/workspace.json`
- connector permissions in `connectors/catalog.json`
- clients, project slugs, repo paths, billing terms, token pricing, timekeeping, token usage, prepared invoice drafts, mirror sync, hub handoff APIs, and operations endpoints
- canonical cross-repo architecture record in `docs/MASTER_STATE.md`

Current state:

- live control plane
- SQLite-backed local persistence in `.hub-data`
- mirror path into SeanHalls Firestore
- fixed orchestration tasks plus planned declarative workflow engine

Validation:

- `npm test`
- `npm run build`
- `npm run typecheck` when TypeScript contracts change

Do not:

- move canonical clients, projects, invoices, estimates, billing prep, token usage, or timekeeping into a public app
- execute arbitrary shell commands through public routes
- treat example workflow YAML as executable until an engine exists

### `seanhalls_online`

Role: public SeanHalls portfolio plus Firebase-backed admin, CRM, invoice review, client portal shell, and outbound review/send layer.

Owns:

- `/admin` human review UI
- Firebase Auth and `adminUsers/{uid}` access gate
- opportunities/intake records
- invoice review state after `sh_hub` mirrors prepared drafts
- public portfolio browsing
- TBM client portal browser shell
- direct read-only CGU lead visibility through a second Firebase app

Current state:

- live admin and intake surface
- optional server-to-server handoff to `sh_hub`
- generated work data comes from `cgu_master`

Validation:

- `npm run build`
- `node --check functions/index.js` for function edits
- targeted smoke scripts when intake/handoff changes:
  - `npm run verify:hub-handoff`
  - `npm run verify:submitInquiry:emulator`
  - `npm run smoke:intake`

Do not:

- recreate canonical registry, invoice preparation, pricing, or billing ownership here
- hand-edit `src/data/cgu-work-module.json` unless explicitly repairing a broken sync
- reintroduce public `/agents` or agent-forward marketing copy

### `cgu_master`

Role: Creatives Guide Us public world, hidden Firebase admin, launch operations, route-aware guided intake, release planning, booking sync, and source work module.

Owns:

- live Walls/Devine public world
- Bong Tour preview/protected treatment posture
- Appreesh preview lane inside CGU
- hidden admin and release operations
- CGU `ecosystemLeads`
- source `data/work/module.json` that syndicates into SeanHalls
- Firestore contracts for CGU public/admin content

Current state:

- live public/admin surface
- branch currently observed as `feature/epic-baseline`
- Next.js 16 / React 19 app
- no generic `npm test` script in package metadata

Validation:

- `npm run build`
- route-specific Playwright screenshot scripts for launch-sensitive UI:
  - `npm run screenshots:launch`
  - phase variants when comparing before/after visuals

Do not:

- route pre-window Appreesh public traffic outward to `appreesh.org` unless the launch-state contract changes
- imply mature DAO/token sale/on-chain fulfillment where the verified integration is only staged
- edit hidden admin, work, Walls/Devine, or Bong Tour routes without reading the paired `agents.md` and `style-guide.md`

### `appreesh_master/appreesh/web`

Role: APPREESH public web app, marketing pages, tribute client, wallet integration, heat metrics, and ledger display.

Owns:

- Next.js web surface on port 3002
- wallet-connected tribute flow
- public informational pages
- lightweight API routes for heat and ledger views

Current state:

- partial ecosystem runtime from the CGU perspective
- web app has `npm run build` and `npm test`
- APIs use in-memory display state for heat and ledger additions

Validation:

- `npm run build`
- `npm test`

Do not:

- treat in-memory heat or ledger state as durable
- make public claims about live on-chain capabilities without verifying against APPREESH docs and program behavior
- add custody or transfer assumptions to APIs; wallet signing remains client-side

### `appreesh_master/appreesh/appreesh`

Role: Anchor/Solana workspace for APPREESH programs.

Owns:

- `appreesh`
- `appreesh_hook`
- `appreesh_vault`
- scripts for hook/config/tribute operations
- e2e tests for hook and vault behavior

Current state:

- partial but real on-chain core
- localnet default in `Anchor.toml`
- devnet/mainnet facts documented under `appreesh/docs`
- bootstrap/init scripts still have scaffolded paths

Validation:

- `npm test` for TS/Anchor tests when the local Solana/Anchor environment is available
- `npm run lint` for script formatting checks
- `anchor test` only when the local toolchain and validator are available

Do not:

- commit private keys or wallet files
- rely on devnet airdrops for repeatable CI
- change program authority or custody assumptions without updating security docs and `sh_hub/docs/MASTER_STATE.md`

### `seanhalls_master`

Role: internal control-room projection scaffold.

Owns:

- control-room UI projection
- `/api/control-room`
- derived view of `sh_hub/docs/MASTER_STATE.md` plus hub route evidence

Current state:

- scaffold, not deployment owner
- useful as a map, not source of truth

Validation:

- `npm run build`
- `npm run lint`

Do not:

- treat this repo as the live public site, live admin console, or canonical owner of clients/projects/invoices/pricing

### `clients/*`

Role: bounded client delivery contexts.

Current state:

- discovered and governed through `sh_hub/config/workspace.json` and `sh_hub/connectors/catalog.json`
- not all client folders are canonical registry entries

Do not:

- reference clients by freeform names when canonical IDs/project slugs exist
- run prohibited connector commands such as destructive resets, deploys, or prune commands

## 3. Canonical Reading Order For Every Iteration

Before changing code, read these in order:

1. `/Users/seanhalls/Desktop/sh/sh_hub/docs/MASTER_STATE.md`
2. `/Users/seanhalls/Desktop/sh/sh_hub/docs/source-of-truth-map.md`
3. `/Users/seanhalls/Desktop/sh/sh_hub/config/workspace.json`
4. `/Users/seanhalls/Desktop/sh/sh_hub/connectors/catalog.json`
5. The target repo README and agent notes:
   - `README.md`
   - `agents.md` or `AGENTS.md`
   - route-specific `agents.md` and `style-guide.md` when present
6. The files touched by the intended change.

If the task changes shared ownership, mirror behavior, Firebase contracts, intake routing, billing semantics, wallet/reward integration, or public launch truth, update `sh_hub/docs/MASTER_STATE.md` in the same branch.

## 4. Perpetual Iteration Loop

Run this loop forever until there are no safe, bounded improvements left.

### Phase A: Observe

1. Capture git status for every active repo.
2. Identify user changes already present.
3. Do not revert unrelated work.
4. Build a short inventory:
   - repo
   - current branch
   - dirty files
   - relevant scripts
   - likely next improvement

### Phase B: Choose One Slice

Select exactly one bounded slice using this priority order:

1. Broken validation or type/build failure.
2. Drift between `MASTER_STATE.md` and code.
3. Source-of-truth boundary leaks.
4. Missing tests around live contracts.
5. Small UX/admin refinements that support existing workflows.
6. Documentation that unblocks future automation.

Reject slices that require secrets, production deploys, destructive git operations, new production dependencies, or ambiguous launch/business decisions.

### Phase C: Branch

Use one branch per repo per pull request.

Branch naming:

- `codex/sh-hub-<short-slice>`
- `codex/seanhalls-online-<short-slice>`
- `codex/cgu-<short-slice>`
- `codex/appreesh-web-<short-slice>`
- `codex/appreesh-anchor-<short-slice>`
- `codex/seanhalls-master-<short-slice>`

If a change spans multiple repos, prefer separate PRs with explicit dependency order. Only create a multi-repo change when the contract is impossible to verify otherwise.

### Phase D: Edit

Rules:

- preserve current repo patterns
- keep changes small
- update tests before or alongside behavior when the slice affects a contract
- update docs only where they are canonical or directly useful
- do not add production dependencies without human confirmation
- prefer `pnpm` only when installing dependencies, but do not install unless necessary

### Phase E: Validate

Run the validation matrix for the repo touched.

Minimums:

- JavaScript changed anywhere: run that repo's `npm test` when a test script exists, per workspace rule.
- `sh_hub`: `npm test` and `npm run build`.
- `seanhalls_online`: `npm run build`; add function checks or smoke scripts when relevant.
- `cgu_master`: `npm run build`; visual screenshot scripts when route visuals change.
- `appreesh/web`: `npm test` and `npm run build`.
- `appreesh/appreesh`: `npm test` when Anchor/local dependencies are available; otherwise record the blocker clearly.
- `seanhalls_master`: `npm run build` and `npm run lint`.

Never hide failed validation. Fix it or state the exact blocker in the PR.

### Phase F: Commit

Commit only files that belong to the selected slice.

Commit message format:

```text
<repo>: <imperative summary>
```

Examples:

- `sh_hub: add dry-run workflow validation`
- `seanhalls_online: tighten invoice mirror adapters`
- `cgu_master: preserve routed intake metadata`
- `appreesh-web: verify airdrop signup config`

### Phase G: Pull Request

Open the PR from the branch to the repo's current base branch.

PR body must include:

```markdown
## Summary
- ...

## Validation
- [x] command
- [ ] command not run: reason

## Ecosystem Impact
- Source of truth:
- Cross-repo docs:
- Mirror/Firebase contracts:
- Public launch claims:
- Wallet/reward assumptions:

## Follow-up
- ...
```

If GitHub CLI is unavailable, leave the branch pushed and print the exact compare URL.

### Phase H: Log And Repeat

After a PR is opened:

1. Record the PR URL, branch, repo, validation results, and follow-up slice.
2. Return to Phase A.

## 5. Recommended First PR Queue

These slices are good first candidates because they align with current docs and avoid speculative rewrites.

1. `sh_hub`: add a machine-readable ecosystem inventory endpoint or script that summarizes repo status from `workspace.json`, connector policy, and `MASTER_STATE.md`.
2. `sh_hub`: turn `workflows/examples/*.yml` into a validated dry-run parser without executing shell commands.
3. `sh_hub`: add tests proving prepared invoice drafts persist in SQLite and mirror review fields are preserved.
4. `seanhalls_online`: split large admin-console concerns into typed adapters or smaller view modules while preserving Firestore behavior.
5. `seanhalls_online`: add targeted tests around CGU read-only lead rendering and mixed `projects` mirror roles.
6. `cgu_master`: add route-level regression checks for routed contact intake metadata.
7. `cgu_master`: document or test the launch-state gates for Walls/Devine, Bong Tour, and Appreesh preview traffic.
8. `appreesh/web`: verify public copy against `appreesh/docs/mainnet-deployment.md` and reduce claims that exceed implementation.
9. `appreesh/web`: replace in-memory-only API assumptions in docs with explicit non-durable labels in UI/API comments.
10. `appreesh/appreesh`: harden scaffolded bootstrap/init scripts so unsafe placeholder paths fail loudly.
11. `seanhalls_master`: reduce any remaining manual control-room claims that can be derived from `MASTER_STATE.md` or hub routes.

## 6. System Prompt For The Local Ollama Runner

Use this as the local model's standing instruction:

```text
You are running inside /Users/seanhalls/Desktop/sh as the local gamma4:26b iteration agent.

Your job is to perpetually create small, reviewable pull requests that refine the Sean Halls / CGU / APPREESH ecosystem.

Before every change, read:
1. sh_hub/docs/MASTER_STATE.md
2. sh_hub/docs/source-of-truth-map.md
3. sh_hub/config/workspace.json
4. sh_hub/connectors/catalog.json
5. the target repo README and agents.md or AGENTS.md

Respect this ownership model:
- sh_hub owns canonical project/client/commercial/orchestration truth.
- seanhalls_online owns public SeanHalls presentation, Firebase admin review, CRM, invoice review, and client portal shell.
- cgu_master owns Creatives Guide Us public/admin/release experiences and the source work module.
- appreesh_master owns APPREESH web and Anchor/Solana program work.
- seanhalls_master is a projection scaffold, not canonical runtime ownership.

Pick one bounded improvement at a time. Prefer fixes to validation failures, source-of-truth drift, missing tests around live contracts, and small contract-preserving refactors.

Do not revert user changes. Do not run destructive git commands. Do not deploy production. Do not add production dependencies without human confirmation. Do not commit secrets, wallet files, or private keys.

For every slice:
1. create a codex/<repo>-<slice> branch
2. make the smallest coherent edit
3. run the repo validation commands
4. update MASTER_STATE.md if shared contracts changed
5. commit
6. push
7. open a pull request or print the compare URL
8. log validation and the next suggested slice

If blocked by missing secrets, unavailable toolchains, or ambiguous business decisions, stop that slice and choose a safer one.
```

## 7. Suggested Shell Harness

Use this only as a simple starting wrapper. It does not replace careful repo-specific validation.

```bash
cd /Users/seanhalls/Desktop/sh
ollama run gamma4:26b < OLLAMA_GAMMA4_ITERATION_PLAN.md
```

For an automated loop, wrap the model with a controller that:

- passes the standing prompt plus the latest git status
- requires the model to emit a proposed slice before editing
- gives the model shell access only through an approval-aware runner
- stops after one PR per cycle
- saves a run log outside tracked source or in a private operations log

## 8. Hard Stop Conditions

The local model must stop and ask for human review when:

- a production deploy is required
- a new production dependency is needed
- a secret, wallet, private key, Firebase service account, or paid API key is missing
- an operation would change custody, token distribution, or program authority
- a public launch date, eligibility rule, price, invoice, or contract term is ambiguous
- validation fails in a way that requires broad refactoring outside the selected slice
- a repo has unrelated dirty changes in the exact files needed for the slice and the safe merge path is unclear

## 9. Success Definition

This system is succeeding when:

- `MASTER_STATE.md` remains true after every cross-repo change
- pull requests are small enough to review quickly
- validation results are consistently recorded
- canonical ownership does not leak from `sh_hub` into public apps
- CGU and Appreesh public claims stay aligned with verified runtime state
- the hub increasingly automates dry-run-safe workflows, mirrors, invoice prep, and agent telemetry
- the model can keep finding useful slices without widening blast radius

