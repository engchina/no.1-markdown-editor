# Upcoming Release Notes Draft

This document is a draft for the next public release after `v0.20.7`.

It is intentionally written in release-note language rather than implementation language.

Start from `CHANGELOG.md` `## Unreleased`, then rewrite the user-visible changes into release-note language here.

## Suggested Release Title

`No.1 Markdown Editor v0.20.8`

## Short Summary

No.1 Markdown Editor v0.20.8 improves startup responsiveness, preview stability, and Markdown worker reliability for larger documents and embedded content.

## Suggested GitHub Release Body

### Highlights

- Large restored documents in split view now keep preview rendering opt-in until preview is opened manually.
- Desktop file reads now run off the Tauri event loop, keeping the window more responsive while opening Markdown files.
- CodePen embeds with fallback inner content are now deferred before activation, avoiding noisy third-party iframe warnings in normal preview rendering.
- Markdown preview rendering now uses the worker whenever workers are available, with character reference decoding resolved to a worker-safe implementation.

### Why This Release Matters

Writers often restore large workspaces, open files from the desktop shell, and keep split preview visible while editing. This release reduces avoidable startup and file-open work while keeping preview rendering predictable across embedded content and worker-backed Markdown paths.

### User-Facing Improvements

#### Startup and File Opening

- Very large restored documents in split view now wait for an explicit preview open before preview rendering starts.
- Desktop file reads now run off the Tauri event loop so opening Markdown documents is less likely to block the app window.

#### Preview Reliability

- CodePen iframe embeds that include fallback inner content are now deferred before activation.
- Notification dismiss controls now keep a stable clickable icon target.

#### Markdown Rendering

- Markdown preview rendering now uses the worker whenever workers are available.
- Character reference decoding now resolves to the worker-safe implementation inside the Markdown rendering path.

### Suggested "Upgrade Notes" Section

- No migration steps are required.
- Existing documents are unchanged.

### Suggested "Who Should Update" Section

This release is especially relevant for users who:

- restore large documents or large workspaces
- open Markdown files from the desktop shell
- use split preview with embedded content
- rely on consistent Markdown preview rendering across development and packaged builds

## Packaging Checklist Before Release

- Fill this draft using the current `CHANGELOG.md` `## Unreleased` section.
- Run `npm run release:prepare -- 0.20.8 --date 2026-05-08` to sync the app version files and roll the current `## Unreleased` notes into a dated changelog section.
- Confirm the final version in:
  - `package.json`
  - `src-tauri/tauri.conf.json`
  - `src-tauri/Cargo.toml`
- Run `npm run release:validate` after the version bump so local metadata checks, changelog checks, and scaffold-placeholder checks fail before CI does.
- Run `npm run release:notes:preview -- 0.20.8` if you want to inspect the generated GitHub release body before pushing the tag.
- Review the `0.20.8` release notes before tagging.
- Capture fresh screenshots for the product surfaces this release highlights.
- After the release is published, run `npm run release:draft:advance -- 0.20.8` to reset this file and refresh `CHANGELOG.md` `## Unreleased` for the next release cycle.
