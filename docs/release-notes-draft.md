# Upcoming Release Notes Draft

This document is a draft for the next public release after `v0.27.7`.

It is intentionally written in release-note language rather than implementation language.

Start from `CHANGELOG.md` `## Unreleased`, then rewrite the user-visible changes into release-note language here.

## Suggested Release Title

`No.1 Markdown Editor v0.27.8`

## Short Summary

No.1 Markdown Editor v0.27.8 fixes the screenshot annotation editor briefly shrinking the captured frame after you finish selecting a region.

## Suggested GitHub Release Body

### Highlights

- Finishing a screenshot region selection no longer makes the whole frame visibly shrink for a moment.

### Why This Release Matters

The transition from the selection overlay to the annotation editor should be seamless. The annotation editor now shows the capture edge-to-edge, exactly matching the selection overlay, so there is no size jump when you finish a selection.

### User-Facing Improvements

#### Fixes

- The screenshot annotation editor no longer momentarily shrinks the captured frame after you finish selecting a region — it now fills the screen edge-to-edge like the selection overlay, so there is no size jump.

### Suggested Upgrade Notes Section

- No migration, permission, or settings change is required.

### Suggested Who Should Update Section

This release is recommended for everyone who uses the built-in screenshot capture.

## Packaging Checklist Before Release

- Confirm the final version in:
  - `package.json`
  - `src-tauri/tauri.conf.json`
  - `src-tauri/Cargo.toml`
- Run `npm run release:prepare -- 0.27.8`.
- Run `npm run release:validate -- 0.27.8` so local metadata and scaffold-placeholder checks fail before CI does.
- Run `npm run release:notes:preview -- 0.27.8`.
- After publication, run `npm run release:draft:advance -- 0.27.8`.
