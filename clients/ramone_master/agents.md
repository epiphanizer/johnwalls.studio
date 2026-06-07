# Ramone Master Agent Guide

## Overview

- This repo contains two separate WordPress installations: `node/` and `occ/`.
- Do not assume a change in one site belongs in the other.
- Most meaningful edits should happen in theme or plugin surfaces, not in WordPress core.

## Start Here

1. Read `ARCHITECTURE.md` first.
2. Identify whether the behavior belongs to `node/` or `occ/`.
3. Find the owning theme, template, or plugin surface inside that installation.
4. Only widen to the other installation if the task explicitly spans both sites.

## Repo Map

- `node/`: WordPress install using `superio` theme family.
- `occ/`: WordPress install using Kadence.

## Working Rules

- Prefer child-theme or theme-level changes over core edits.
- Treat theme assets, templates, and plugin hooks as the first debugging surface.
- If styling work touches `node/`, inspect the Sass/Compass-era theme asset flow before changing compiled assets blindly.
- Keep site-specific assumptions local to the owning installation.

## Validation

- Validate through the relevant WordPress installation.
- If a task changes templates or theme assets, note which site tree was changed.
- Avoid changing both installations in one pass unless the request clearly requires it.