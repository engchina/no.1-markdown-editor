# Upcoming Release Notes Draft

This document is a draft for the next public release after `v0.20.11`.

It is intentionally written in release-note language rather than implementation language.

Start from `CHANGELOG.md` `## Unreleased`, then rewrite the user-visible changes into release-note language here.

## Suggested Release Title

`No.1 Markdown Editor v0.20.12`

## Short Summary

No.1 Markdown Editor v0.20.12 fixes split-view scroll synchronization: scrolling the preview no longer snaps the editor to the top, and the two panes stay aligned even after images load or math/code blocks finish typesetting.

## Suggested GitHub Release Body

### Highlights

- Split view scroll sync now stays aligned in both directions.
- Scrolling the preview no longer jumps the editor back to the top of the document.
- The sync continues to track correctly after images load and after KaTeX or Shiki finish rendering math and code blocks.

### Why This Release Matters

Long-form split-view writing depends on the editor and preview tracking each other reliably. v0.20.11 introduced split scroll sync, but the preview-to-editor direction could snap the editor to the top in some documents. v0.20.12 makes the sync robust by reworking how source-line positions are measured.

### User-Facing Improvements

#### Split View

- Preview-driven scrolling now moves the editor to the matching source line instead of snapping to the top.
- Editor-driven scrolling continues to move the preview to the matching rendered block.
- Scroll alignment survives content updates, image-load layout shifts, and async math/code typesetting.

### Suggested "Upgrade Notes" Section

- No configuration changes required. Split scroll sync remains enabled by default and can still be toggled from the Theme panel.
- Existing documents are unchanged.

### Suggested "Who Should Update" Section

This release is especially relevant for users who:

- write or review long Markdown documents in split view
- rely on preview-to-editor scroll tracking when navigating rendered output
- work with documents containing images, math blocks, or large fenced code blocks

## Packaging Checklist Before Release

- Confirm the final version in:
  - `package.json`
  - `src-tauri/tauri.conf.json`
  - `src-tauri/Cargo.toml`
- Run `npm run release:prepare -- 0.20.12 --date 2026-05-10` to sync the app version files and roll the current `## Unreleased` notes into a dated changelog section.
- Run `npm run release:validate -- 0.20.12` after the version bump so local metadata and scaffold-placeholder checks fail before CI does.
- Run `npm run release:notes:preview -- 0.20.12` to inspect the generated GitHub release body before pushing the tag.
- After the release is published, run `npm run release:draft:advance -- 0.20.12` to reset this file and refresh `CHANGELOG.md` `## Unreleased` for the next release cycle.
