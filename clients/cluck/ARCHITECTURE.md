# Cluck Design Architecture

## System Summary

Cluck Design is a brand and architectural portfolio platform deployed on WordPress with Elementor Pro, Anywhere Elementor Pro, and a custom theme stack housed under `cluck/wp-content/themes/cluck/`. The platform showcases high-density architectural case studies, spatial design photography, custom project taxonomies, and an integrated Mailchimp subscriber intake pipeline.

A local containerized development stack is provided via Docker Compose (`Dockerfile.local`, `compose.yaml`), which runs WordPress on PHP 7.4 with MariaDB 10.6 and automatic WP-CLI URL migration scripts.

## Top-Level Surfaces

### `cluck/`
- Active WordPress installation root.
- Custom theme resides in `wp-content/themes/cluck/`.
- Elementor Pro and Anywhere Elementor Pro plugins drive custom dynamic templates and post type layouts.
- Server-side Mailchimp integration handles audience subscription without exposing API keys to the client.

### `cluck/scripts/`
- Local development automation and WP-CLI environment initialization scripts.

### Docker Runtime Configuration
- `Dockerfile.local`: Custom PHP/Apache image for local development.
- `compose.yaml`: Multi-container topology orchestrating WordPress (`localhost:8080`), MariaDB (`db`), and a one-time WP-CLI setup runner (`setup`).

## Architectural Boundaries

- Theme custom styling and layout overrides belong in `wp-content/themes/cluck/`.
- Dynamic project showcase layouts are driven by Elementor template hooks; avoid hardcoding project content in PHP templates.
- Production database snapshots and sensitive credentials (`MAILCHIMP_API_KEY`, `MAILCHIMP_LIST_ID`) are managed via `.env` and kept strictly out of git.

## Working Model

1. Ensure Docker Desktop is running before starting the local container stack (`docker compose up -d --build`).
2. Make theme edits in `wp-content/themes/cluck/` and test against `http://localhost:8080`.
3. Check `wp-content/debug.log` for any legacy PHP warnings or notices.
4. For client-portal feature estimation and Pay-Per-Outcome milestones, coordinate through `sh_hub` at `http://localhost:3033/admin`.
