# WCD Architecture

## System Summary

WCD is a single-site WordPress deployment housed under `wcd/`, with the active CMS installation in `wcd/wordpress/`. The repo also carries a `db/` folder for database-related reference material and a `wcdf_asset_stuff/` folder for asset storage. The source scan shows Kadence as the active theme platform in the WordPress theme tree, so most product-level work will likely happen through Kadence configuration, child-theme style overrides, plugin behavior, or admin-managed content rather than a custom application service.

## Top-Level Surfaces

### `wcd/wordpress/`

- Active WordPress installation.
- Primary runtime for theme, plugin, and CMS-managed behavior.
- Kadence is present as the active theme stack in `wp-content/themes/kadence/`.

### `wcd/db/`

- Database-related reference material or backups.
- Treat as supporting context, not the primary code-edit surface.

### `wcd/wcdf_asset_stuff/`

- Asset storage and design/supporting content.
- Useful for media or brand-asset work, not core application behavior.

## Architectural Boundaries

- WordPress is the runtime boundary; theme and plugin changes should stay inside the CMS tree.
- Kadence is the main theme surface; avoid editing WordPress core for theme-level behavior.
- `db/` and asset folders support the site but do not replace the CMS as the source of truth for live behavior.

## Working Model

1. Start in `wcd/wordpress/` for any live-site behavior change.
2. Check the active theme or relevant plugin before touching broader WordPress internals.
3. Use `db/` only when schema, content migration, or backup context is needed.
4. Use `wcdf_asset_stuff/` for asset references rather than implementation logic.