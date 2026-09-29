# Cluck Design Agent Guide

## Overview

- Client: Cluck Design
- Repository: `clients/cluck/cluck`
- Tech Stack: WordPress 6.6, PHP 7.4, MariaDB 10.6, Elementor Pro, Custom Cluck Theme
- Orchestration Hub: Registered in `sh_hub` as project `cluck-brand-site`

## Start Here

1. Read `ARCHITECTURE.md` and `cluck/LOCAL_DEVELOPMENT.md`.
2. Inspect `cluck/wp-content/themes/cluck/` for theme functions, templates, and styles.
3. Review `cluck/compose.yaml` and `cluck/Dockerfile.local` when modifying environment configuration.

## Key Rules

- Never commit sensitive keys or database dumps containing customer emails.
- Keep Mailchimp server-side credentials in `.env` (ignored by git).
- Do not edit WordPress core files; restrict modifications to theme templates, custom scripts, or child assets.
- Coordinate client deliverables and milestone estimates through `sh_hub` (`http://localhost:3033/admin`).
