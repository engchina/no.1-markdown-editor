# Upcoming Release Notes Draft

This document is a draft for the next public release after `v0.26.0`.

It is intentionally written in release-note language rather than implementation language.

Start from `CHANGELOG.md` `## Unreleased`, then rewrite the user-visible changes into release-note language here.

## Suggested Release Title

`No.1 Markdown Editor v0.26.1`

## Short Summary

No.1 Markdown Editor v0.26.1 fixes a Windows file-association startup race. Double-clicking a Markdown file while the desktop app is starting now queues the file path before notifying the running window, so the document opens reliably.

## Suggested GitHub Release Body

### Highlights

- Make Windows file-association opens reliable during app startup.
- Queue single-instance launch paths before emitting the frontend open-files event.
- Drain queued launch paths when the running app receives a single-instance event.

### Why This Release Matters

Opening a Markdown file from Explorer should be dependable. During startup timing races, the file-open event could arrive before the frontend had drained pending launch paths, leaving the document unopened. This release preserves those paths in the backend queue before notifying the app window.

### User-Facing Improvements

#### Windows File Association

- Double-clicking a Markdown file on Windows opens the file directly even when the app is already starting.
- Single-instance file-open requests are queued before the frontend event is emitted.
- The frontend drains queued launch paths both at startup and when a single-instance open-files event arrives.

### Developer-Facing Improvements

- Added backend coverage for pending open path append/dedup/drain behavior.
- Added wiring tests that require single-instance launch paths to be queued before frontend notification.

### Suggested Upgrade Notes Section

- Existing Markdown documents, AI settings, provider credentials, browser tabs, and local editor state are unchanged.
- This release does not change the Markdown file format.

### Suggested Who Should Update Section

This release is especially relevant for Windows users who open Markdown files by double-clicking them in Explorer or from file associations.

## Packaging Checklist Before Release

- Confirm the final version in:
  - `package.json`
  - `src-tauri/tauri.conf.json`
  - `src-tauri/Cargo.toml`
- Run `npm run release:prepare -- 0.26.1 --date 2026-06-11` to sync the app version files and roll the current `## Unreleased` notes into a dated changelog section.
- Run `npm run release:validate -- 0.26.1` after the version bump so local metadata and scaffold-placeholder checks fail before CI does.
- Run `npm run release:notes:preview -- 0.26.1` to inspect the generated GitHub release body before pushing the tag.
- After the release is published, run `npm run release:draft:advance -- 0.26.1` to reset this file and refresh `CHANGELOG.md` `## Unreleased` for the next release cycle.
