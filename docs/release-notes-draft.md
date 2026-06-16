# Upcoming Release Notes Draft

This document is a draft for the next public release after `v0.26.3`.

It is intentionally written in release-note language rather than implementation language.

Start from `CHANGELOG.md` `## Unreleased`, then rewrite the user-visible changes into release-note language here.

## Suggested Release Title

`No.1 Markdown Editor v0.26.4`

## Short Summary

No.1 Markdown Editor v0.26.4 hardens Windows desktop file opening when a browser tab is frontmost. The native layer now reveals the editor surface before dispatching file-open events, the frontend re-drains queued open requests on focus, and the NSIS installer repairs stale generated Markdown associations from older installs.

## Suggested GitHub Release Body

### Highlights

- Reveal the main editor surface natively before single-instance file-open events are emitted.
- Re-drain queued desktop file-open requests when the window regains focus.
- Reclaim stale generated Markdown `*_auto_file` associations during NSIS install.
- Keep `.txt` generated associations untouched to avoid taking over another editor's user default.

### Why This Release Matters

Windows native browser child webviews paint above the main editor webview. If a browser tab is frontmost when Explorer sends a Markdown file to the running app, the frontend message pump can be throttled before it gets a chance to hide the browser view. This release moves the first reveal step into the native single-instance path and adds a focus-time pending queue drain as a second recovery path.

### User-Facing Improvements

#### Windows File Associations

- NSIS installs reclaim stale `md_auto_file`, `markdown_auto_file`, and `mdx_auto_file` ProgIds when they shadow the stable No.1 Markdown Editor association.
- Stale generated Markdown associations are repaired before the shell association cache is refreshed.
- `txt_auto_file` is deliberately not reclaimed, because that generated handler commonly belongs to another editor.

#### Browser And Markdown Tab Switching

- Opening a Markdown document from Explorer now hides frontmost native browser child webviews from the Rust single-instance handler before notifying the frontend.
- The main editor webview is refocused after the native reveal.
- The frontend drains pending launch paths again when the window regains focus, without double-opening documents.

### Developer-Facing Improvements

- Added regression coverage for native editor-surface reveal before single-instance events.
- Added regression coverage for focus-time pending queue drains.
- Added NSIS packaging coverage for stale generated Markdown association cleanup.

### Suggested Upgrade Notes Section

- Existing Markdown documents, AI settings, provider credentials, browser tabs, and local editor state are unchanged.
- This release does not change the Markdown file format.

### Suggested Who Should Update Section

This release is especially relevant for Windows users who open Markdown files from Explorer while browser tabs are open in the editor, or who upgraded from an install that left stale generated Markdown file associations behind.

## Packaging Checklist Before Release

- Confirm the final version in:
  - `package.json`
  - `src-tauri/tauri.conf.json`
  - `src-tauri/Cargo.toml`
- Run `npm run release:prepare -- 0.26.4 --date 2026-06-16` to sync the app version files and roll the current `## Unreleased` notes into a dated changelog section.
- Run `npm run release:validate -- 0.26.4` after the version bump so local metadata and scaffold-placeholder checks fail before CI does.
- Run `npm run release:notes:preview -- 0.26.4` to inspect the generated GitHub release body before pushing the tag.
- After the release is published, run `npm run release:draft:advance -- 0.26.4` to reset this file and refresh `CHANGELOG.md` `## Unreleased` for the next release cycle.
