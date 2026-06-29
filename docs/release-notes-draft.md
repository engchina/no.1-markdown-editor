# Upcoming Release Notes Draft

This document is a draft for the next public release after `v0.27.5`.

It is intentionally written in release-note language rather than implementation language.

Start from `CHANGELOG.md` `## Unreleased`, then rewrite the user-visible changes into release-note language here.

## Suggested Release Title

`No.1 Markdown Editor v0.27.6`

## Short Summary

No.1 Markdown Editor v0.27.6 streamlines keyboard confirmation and restores Linux release packaging with a native X11 capture backend.

## Suggested GitHub Release Body

### Highlights

- Press `Enter` on the annotation canvas to confirm and insert immediately.
- Press `Space` to create or edit the active annotation while toolbar buttons retain normal keyboard activation.
- Capture Linux X11 screens through x11rb without compiling unused PipeWire recording dependencies.
- Keep Linux Wayland capture on the XDG Screenshot Portal and Windows/macOS capture on xcap.

### Why This Release Matters

Screenshot confirmation should be quick without sacrificing complete keyboard access. This release provides the direct `Enter` action, preserves accessible toolbar navigation, and removes the dependency conflict that blocked Linux release assets.

### User-Facing Improvements

#### Faster keyboard confirmation

- `Enter` confirms only when focus is on the annotation canvas or dialog surface.
- Buttons, color controls, and the size slider keep their native `Enter` and `Space` behavior.
- `Space` creates an annotation for the active tool or reopens the selected text annotation, preserving the full keyboard workflow.

#### Linux capture backend

- Linux X11 uses x11rb for monitor discovery and pixel capture.
- Linux Wayland continues to use the system screenshot portal.
- Windows and macOS continue to use xcap, with no capture behavior change.

### Suggested Upgrade Notes Section

- No migration, permission, or settings change is required.
- The insert-button shortcut shown in the toolbar is now `Enter`.

### Suggested Who Should Update Section

This release is recommended for keyboard-focused screenshot users and everyone consuming Linux release assets.

## Packaging Checklist Before Release

- Confirm the final version in:
  - `package.json`
  - `src-tauri/tauri.conf.json`
  - `src-tauri/Cargo.toml`
- Run `npm run release:prepare -- 0.27.6`.
- Run `npm run release:validate -- 0.27.6` so local metadata and scaffold-placeholder checks fail before CI does.
- Run `npm run release:notes:preview -- 0.27.6`.
- After publication, run `npm run release:draft:advance -- 0.27.6`.
