# Changelog

## Clean interface — 2026-11-20 v3

- Kept a pale pink outer page background and changed the header, main panels,
  dialogs, menus, effect cards and gallery cards to pure white.
- Made buttons, fields, borders and text neutral, with graphite primary actions
  and subtle pink accents limited to small selected controls and focus states.
- Kept model colours, geometry, exports, saved designs and desktop panel spacing
  unchanged.
- Moved the GitHub author link below the complete workspace on mobile, after
  the Form/Surface/Build controls and export panel; it remains beside the preview
  on desktop and moves correctly when resizing between layouts.
- Refreshed README screenshots to show the updated desktop and mobile styling.
- Kept this update in two additive static assets so existing installations can
  adopt the appearance without replacing their editor or renderer scripts.

## 1.2.0 — Public source package — 2026-11-18

- Prepared a standalone repository with source, bundled viewer, 24 rendered
  preset thumbnails, tests and installation documentation.
- Preserved the parametric form/profile editor, surface effects, image and
  paint masks, STL/recipe export, saved designs, undo and randomisation.
- Removed installation-specific defaults. Layer Library integration is
  optional and starts unconfigured.
- Made the printer build volume configurable through environment or CLI.
- Added a portable non-root Docker image and Compose configuration, with
  persistent storage and configurable host port.
- Added MIT licensing, bundled dependency notices, contribution guidance and
  GitHub Actions checks.

This public package uses the existing 1.2.0 feature version. It is a source
release; it is not a personal TrueNAS installer or an automatic updater.

