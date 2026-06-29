# Upcoming Release Notes Draft

This document is a draft for the next public release after `v0.27.2`.

It is intentionally written in release-note language rather than implementation language.

Start from `CHANGELOG.md` `## Unreleased`, then rewrite the user-visible changes into release-note language here.

## Suggested Release Title

`No.1 Markdown Editor v0.27.3`

## Short Summary

No.1 Markdown Editor v0.27.3 adds fast desktop screenshot capture, lightweight annotation, and direct Markdown image insertion without leaving the editor.

## Suggested GitHub Release Body

### Highlights

- Start a screen-region capture with global `Alt+A`, the toolbar camera button, or the command palette.
- Annotate immediately with crop, arrow, rectangle, text, and mosaic tools, then insert a flattened PNG at the remembered cursor position.
- Keep saved-document images beside the document and unsaved-document images in the existing draft asset workflow.
- Cancel the complete capture session immediately with `Esc`.

### Why This Release Matters

Screenshots are a common part of technical writing. This release removes the need to switch to a separate capture tool for the core capture, annotate, and insert workflow while preserving the editor's existing image storage behavior.

### User-Facing Improvements

#### Capture and annotation

- Windows, macOS, and Linux X11 use the same region-selection overlay; Linux Wayland uses the system screenshot portal before opening the shared annotation interface.
- Selection, crop, arrow, rectangle, single-line text, and mosaic tools are available as direct icon actions without an intermediate annotation step.
- Annotation objects can be selected, moved, resized, deleted, undone, and redone with mouse or keyboard controls.

#### Fast and reliable interaction

- Capture overlays are prepared before the editor is hidden and preview pixels are transferred without PNG compression, reducing visible flashing and startup delay.
- Text annotation starts after pointer release, receives focus immediately, and is no longer blocked by existing annotation hit areas.
- Permission denial, capture failure, shortcut conflicts, and cancellation return safely to the editor without writing an asset.

#### Markdown insertion

- The final image reuses the existing saved-document and draft-image persistence paths.
- If the document changed during capture, insertion preserves the new text and uses the nearest safe position to the original cursor.
- Source, Split, WYSIWYG, and Preview continue to render the same Markdown image reference.

### Suggested Upgrade Notes Section

- Global `Alt+A` remains fixed for this release; if another application owns it, the toolbar and command-palette entries remain available.
- Captured annotations are flattened into PNG and cannot be edited after insertion.

### Suggested Who Should Update Section

This release is especially useful for technical writers, developers, support teams, and anyone who regularly inserts annotated screenshots into Markdown documents.

## Packaging Checklist Before Release

- Confirm the final version in:
  - `package.json`
  - `src-tauri/tauri.conf.json`
  - `src-tauri/Cargo.toml`
- Run `npm run release:prepare -- 0.27.3`.
- Run `npm run release:validate -- 0.27.3` so local metadata and scaffold-placeholder checks fail before CI does.
- Run `npm run release:notes:preview -- 0.27.3`.
- After publication, run `npm run release:draft:advance -- 0.27.3`.
