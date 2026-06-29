# Upcoming Release Notes Draft

This document is a draft for the next public release after `v0.27.3`.

It is intentionally written in release-note language rather than implementation language.

Start from `CHANGELOG.md` `## Unreleased`, then rewrite the user-visible changes into release-note language here.

## Suggested Release Title

`No.1 Markdown Editor v0.27.4`

## Short Summary

No.1 Markdown Editor v0.27.4 makes screenshot capture feel more immediate and refines the annotation controls for faster visual scanning.

## Suggested GitHub Release Body

### Highlights

- Keep the editor visible until the prepared selection overlay is already on screen, removing the remaining desktop flash.
- Use a compact dark floating toolbar with stronger active-tool contrast.
- Read crop dimensions and selection handles more clearly over varied screenshot content.
- Draw cleaner filled arrowheads while ignoring accidental near-zero-length arrows.

### Why This Release Matters

Fast capture is as much about transition quality as raw speed. This release removes the last visible handoff between the editor and selection overlay and makes the most-used annotation controls easier to recognize at a glance.

### User-Facing Improvements

#### Seamless capture handoff

- The main editor window is hidden only after the prepared overlay has been shown.
- Screen pixels are still captured before the overlay appears, so the editor remains part of the selectable desktop image.
- Cancellation and error paths continue to restore and focus the editor safely.

#### Annotation clarity

- The floating toolbar uses a neutral dark surface, compact icon buttons, and a clear blue active state.
- Crop handles have stronger separation from the captured background, and the dimension badge is easier to read.
- Arrow annotations use a solid indented head that remains legible at different line widths.

#### Existing workflow preserved

- `Alt+A`, the camera button, and the command palette continue to open the same capture flow.
- Crop, arrow, rectangle, text, mosaic, undo, redo, cancel, and insert remain keyboard accessible.
- Final images continue to use the existing saved-document and draft-image persistence paths.

### Suggested Upgrade Notes Section

- No migration or settings change is required.
- Global `Alt+A` remains fixed; the toolbar and command-palette entries remain available if another application owns it.

### Suggested Who Should Update Section

This release is recommended for everyone using the screenshot workflow introduced in v0.27.3.

## Packaging Checklist Before Release

- Confirm the final version in:
  - `package.json`
  - `src-tauri/tauri.conf.json`
  - `src-tauri/Cargo.toml`
- Run `npm run release:prepare -- 0.27.4`.
- Run `npm run release:validate -- 0.27.4` so local metadata and scaffold-placeholder checks fail before CI does.
- Run `npm run release:notes:preview -- 0.27.4`.
- After publication, run `npm run release:draft:advance -- 0.27.4`.
