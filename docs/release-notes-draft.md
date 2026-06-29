# Upcoming Release Notes Draft

This document is a draft for the next public release after `v0.27.6`.

It is intentionally written in release-note language rather than implementation language.

Start from `CHANGELOG.md` `## Unreleased`, then rewrite the user-visible changes into release-note language here.

## Suggested Release Title

`No.1 Markdown Editor v0.27.7`

## Short Summary

No.1 Markdown Editor v0.27.7 makes screenshot capture feel instant, adds a pixel-accurate magnifier and quick copy/save, and fixes large-image copy performance.

## Suggested GitHub Release Body

### Highlights

- Capturing a screenshot is now near-instant — the selection overlay is pre-warmed and reused instead of cold-booting a webview every time.
- A pixel-accurate magnifier loupe with live coordinate and RGB/HEX readout, plus full-screen crosshair guides, makes aiming precise.
- Hover a window to highlight it and click to grab exactly that window's region.
- Copy the finished screenshot to the clipboard or save it to a PNG straight from the annotation toolbar.
- Copying large screenshots is no longer seconds-slow.

### Why This Release Matters

Screenshot capture should feel as fast and precise as a dedicated tool. This release removes the per-capture cold start and the artificial pre-capture delay, adds professional aiming and quick-output actions, and routes image data over an efficient channel so even large captures copy in well under a second.

### User-Facing Improvements

#### Instant, smoother capture

- The selection overlay is built once per monitor layout and reused, so pressing the shortcut or the toolbar button responds immediately instead of flashing and stalling.
- Region dragging is throttled to the display refresh, so the selection box tracks the cursor smoothly.

#### Precise selection tools

- A magnifier loupe follows the cursor with a zoomed, pixel-exact view, the current coordinate, and the colour under the cursor in RGB/HEX.
- Full-screen crosshair guides and a refreshed selection frame (dim mask, accent border, corner marks, rule-of-thirds) make framing easier.
- Hovering a window highlights it; clicking grabs that window's exact bounds.

#### Quick output

- `Enter` inserts the screenshot into the current note.
- The copy action places the annotated image on the system clipboard and dismisses the capture without pulling the editor to the foreground, so you can paste elsewhere.
- A save action writes the annotated screenshot to a PNG file.
- A refreshed annotation toolbar adds preset colour swatches and a thickness preview.

#### Performance and fixes

- Large screenshots copy quickly: image bytes travel over Tauri's raw IPC channel instead of being serialised into a number array.
- The annotation toolbar no longer clips its icons when the selection sits near the screen edge.
- On Windows, dismissing after copy no longer flashes the editor window before it minimises.

### Suggested Upgrade Notes Section

- No migration, permission, or settings change is required.
- `Enter` inserts into the note; use the copy button (or `Ctrl`/`Cmd`+`C`) to copy to the clipboard.

### Suggested Who Should Update Section

This release is recommended for everyone who uses the built-in screenshot capture, especially on high-resolution displays.

## Packaging Checklist Before Release

- Confirm the final version in:
  - `package.json`
  - `src-tauri/tauri.conf.json`
  - `src-tauri/Cargo.toml`
- Run `npm run release:prepare -- 0.27.7`.
- Run `npm run release:validate -- 0.27.7` so local metadata and scaffold-placeholder checks fail before CI does.
- Run `npm run release:notes:preview -- 0.27.7`.
- After publication, run `npm run release:draft:advance -- 0.27.7`.
