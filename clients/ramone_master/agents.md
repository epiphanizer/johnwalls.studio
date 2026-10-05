# Ramone Master Agent Guide

## Overview

- `remote-job-guru/`: Dedicated, lightweight WordPress repo powering **https://ramone.creativesguide.us** (v1.2.0) with Kadence child theme and custom `ramone-remote-job-board` plugin.
- `occ/`: Historical OCC Consulting WordPress installation (`occ.consulting`), completely isolated with its own theme and database. Zero cross-linking.
- `node/`: Legacy WordPress installation using `superio` theme family.
- Most meaningful edits for Ramone Remote Jobs happen in `remote-job-guru/wp-content/plugins/ramone-remote-job-board/` or `remote-job-guru/wp-content/themes/kadence-remote-jobs/`.

## Start Here

1. Read `ARCHITECTURE.md` and `remote-job-guru/README.md`.
2. Identify whether the behavior belongs to `remote-job-guru/` (live Ramone site) or legacy `occ/` / `node/`.
3. Find the owning theme, template, or plugin surface inside that installation.
4. Deploy updates to `ramone.creativesguide.us` via `remote-job-guru/deploy/deploy-to-cgu.sh`.

## Repo Map

- `remote-job-guru/`: Active live site for Ramone Smith (`ramone.creativesguide.us`). Kadence child theme + Remote Job Guru Engine plugin (v1.2.0).
- `occ/`: Historical OCC Consulting site (`occ.consulting`).
- `node/`: Legacy WordPress install using `superio` theme family.

## Running Change Log
- 2026-10-05 (v1.2.0): Released Remote Job Guru 1.2.0 on `ramone.creativesguide.us`. Removed AI Remote Job Ingestion Engine badge; restored `occ.consulting` independent routing; eliminated all cross-links from Post a Job and Contact to legacy OCC templates; introduced native AJAX/REST submission endpoints (`/wp-json/ramone-jobs/v1/submit-job`); built Ramone Smith verified Amazon Author books showcase (`Proven Over Credentialed`, `Bootcamp to Software Engineer`) with 2x2 grid layout; automated Remotive jobstream pipeline. Deployed to production (`cgu`).

## Working Rules

- Prefer child-theme or theme-level changes over core edits.
- Treat theme assets, templates, and plugin hooks as the first debugging surface.
- If styling work touches `node/`, inspect the Sass/Compass-era theme asset flow before changing compiled assets blindly.
- Keep site-specific assumptions local to the owning installation.

## Validation

- Validate through the relevant WordPress installation.
- If a task changes templates or theme assets, note which site tree was changed.
- Avoid changing both installations in one pass unless the request clearly requires it.