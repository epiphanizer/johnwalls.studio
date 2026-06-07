# WCD Agent Guide

## Overview

- This repo is primarily a WordPress site under `wcd/wordpress/`.
- Kadence is the active theme platform present in the theme tree.
- `db/` and `wcdf_asset_stuff/` are support surfaces, not the default implementation target.

## Start Here

1. Read `ARCHITECTURE.md` first.
2. Route to `wcd/wordpress/` for live behavior.
3. Find the owning theme, plugin, or admin-configured surface.
4. Only use `db/` or asset folders when the task explicitly needs them.

## Repo Map

- `wcd/wordpress/`: active WordPress installation.
- `wcd/db/`: database reference or backup material.
- `wcd/wcdf_asset_stuff/`: asset support folder.

## Rules

- Prefer theme or plugin changes over WordPress core edits.
- Treat Kadence configuration and theme hooks as the first place to look for presentation and layout behavior.
- Avoid assuming `db/` files are the active runtime contract without verifying the task requires them.

## Validation

- Validate through the WordPress surface that owns the behavior.
- If a change affects templates, styling, or plugin behavior, note the exact WordPress path changed in handoff notes.