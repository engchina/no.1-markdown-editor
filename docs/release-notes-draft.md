# Upcoming Release Notes Draft

This document is a draft for the next public release after `v0.27.4`.

It is intentionally written in release-note language rather than implementation language.

Start from `CHANGELOG.md` `## Unreleased`, then rewrite the user-visible changes into release-note language here.

## Suggested Release Title

`No.1 Markdown Editor v0.27.5`

## Short Summary

No.1 Markdown Editor v0.27.5 restores Linux release packaging for the screenshot-enabled desktop build.

## Suggested GitHub Release Body

### Highlights

- Restore Ubuntu runner builds by pinning xcap to the PipeWire-compatible 0.8.0 release.
- Keep the screenshot capture and annotation experience introduced in v0.27.3 and refined in v0.27.4 unchanged.
- Preserve the existing Windows and macOS release paths.

### Why This Release Matters

The first screenshot-enabled Linux release exposed a PipeWire header mismatch in the GitHub Ubuntu build environment. This patch restores the Linux packages without changing the user-facing capture workflow.

### User-Facing Improvements

#### Linux packaging compatibility

- xcap 0.8.0 resolves through pipewire-rs and libspa 0.8.0 instead of the incompatible 0.9.2 bindings.
- The dependency remains explicitly pinned so future lockfile updates cannot silently reintroduce the Ubuntu build failure.
- Linux system capture still uses xcap on X11 and the XDG screenshot portal on Wayland.

#### Existing experience preserved

- `Alt+A`, the camera button, and the command palette continue to open the same capture flow.
- Crop, arrow, rectangle, text, mosaic, undo, redo, cancel, and insert remain keyboard accessible.
- Final images continue to use the existing saved-document and draft-image persistence paths.

### Suggested Upgrade Notes Section

- No migration, permission, or settings change is required.
- Windows and macOS users receive the same application behavior as v0.27.4.

### Suggested Who Should Update Section

This release is especially important for Linux users and for distributors consuming the Linux release assets.

## Packaging Checklist Before Release

- Confirm the final version in:
  - `package.json`
  - `src-tauri/tauri.conf.json`
  - `src-tauri/Cargo.toml`
- Run `npm run release:prepare -- 0.27.5`.
- Run `npm run release:validate -- 0.27.5` so local metadata and scaffold-placeholder checks fail before CI does.
- Run `npm run release:notes:preview -- 0.27.5`.
- After publication, run `npm run release:draft:advance -- 0.27.5`.
