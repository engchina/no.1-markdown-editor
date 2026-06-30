# Upcoming Release Notes Draft

This document is a draft for the next public release after `v0.27.9`.

It is intentionally written in release-note language rather than implementation language.

Start from `CHANGELOG.md` `## Unreleased`, then rewrite the user-visible changes into release-note language here.

## Suggested Release Title

`No.1 Markdown Editor v0.27.10`

## Short Summary

No.1 Markdown Editor v0.27.10 makes `Esc` a reliable exit from screenshot capture, including while a region drag is still active.

## Suggested GitHub Release Body

### Highlights

- `Esc` now cancels screenshot capture before, during, or after region selection.
- Cancelling an active drag safely releases pointer capture and returns to the editor without inserting an image.

### Why This Release Matters

Screenshot capture should always have a predictable escape route. This release makes cancellation consistent across the complete region-selection flow, including the previously unreliable mouse-drag state.

### User-Facing Improvements

#### Fixes

- Pressing `Esc` before starting a selection immediately closes screenshot capture.
- Pressing `Esc` while holding the mouse and dragging a region now cancels the entire capture instead of leaving the overlay open.
- Pressing `Esc` after completing the region continues to close the annotation editor without inserting an image.

### Suggested Upgrade Notes Section

- No migration, permission, or settings change is required.

### Suggested Who Should Update Section

This release is recommended for everyone who uses the built-in screenshot capture.

## Packaging Checklist Before Release

- Confirm the final version in:
  - `package.json`
  - `src-tauri/tauri.conf.json`
  - `src-tauri/Cargo.toml`
- Run `npm run release:prepare -- 0.27.10`.
- Run `npm run release:validate -- 0.27.10` so local metadata and scaffold-placeholder checks fail before CI does.
- Run `npm run release:notes:preview -- 0.27.10`.
- After publication, run `npm run release:draft:advance -- 0.27.10`.
