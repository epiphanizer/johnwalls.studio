# Ramone Master Architecture

## System Summary

Ramone Master is a dual-WordPress repo with two separate installations under `node/` and `occ/`. Both surfaces are PHP-based CMS deployments with their own theme stacks, content/admin surfaces, and WordPress runtime boundaries. The `node/` installation appears to center on a job marketplace or recruiting workflow using the `superio` theme family, while `occ/` is a separate WordPress installation built on Kadence.

This is a theme-and-content oriented architecture rather than an application code monolith. Most behavior will be driven by theme templates, WordPress configuration, plugins, and admin-managed content.

## Top-Level Surfaces

### `node/`

- Independent WordPress installation.
- Uses the `superio` and `superio-child` theme structure under `wp-content/themes/`.
- Theme assets indicate Sass/Compass-era styling workflow via `config.rb`.
- Likely owns the richer recruiting or job-board behavior in this repo.

### `occ/`

- Separate WordPress installation.
- Uses the Kadence theme stack under `wp-content/themes/`.
- Likely serves a distinct brand, business unit, or parallel site experience.

## Architectural Boundaries

- `node/` and `occ/` should be treated as separate WordPress applications unless a task explicitly spans both.
- Theme customizations are more likely to be the correct edit surface than WordPress core files.
- Plugin and content behavior may be shared conceptually, but the code and runtime live in separate site trees.

## Working Model

1. Identify which WordPress installation owns the requested behavior before reading broadly.
2. Prefer child-theme or theme-level changes over core WordPress edits.
3. Inspect plugin, template, and asset boundaries within the selected installation.
4. Treat the two site trees as independent unless the task explicitly requires coordination.