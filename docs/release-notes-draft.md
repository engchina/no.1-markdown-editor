# Upcoming Release Notes Draft

This document is a draft for the next public release after `v0.27.0`.

It is intentionally written in release-note language rather than implementation language.

Start from `CHANGELOG.md` `## Unreleased`, then rewrite the user-visible changes into release-note language here.

## Suggested Release Title

`No.1 Markdown Editor v0.27.1`

## Short Summary

No.1 Markdown Editor v0.27.1 fixes macOS shortcut handling for users writing with Japanese IME on JIS keyboards, so zoom, undo/redo, and command shortcuts keep working while composition is active.

## Suggested GitHub Release Body

### Highlights

- macOS zoom shortcuts now work reliably on JIS keyboards, including the physical `+`, `-`, and `0` keys.
- Undo/redo and command shortcuts no longer get swallowed when a Japanese IME reports active composition.
- The fix keeps the `0.27.0` macOS zoom rendering improvement intact.

### Why This Release Matters

JIS keyboard layouts report zoom keys differently from US layouts, and macOS WebKit can mark primary-modifier shortcuts as composing while Japanese IME is active. That combination made common app shortcuts feel randomly broken for Japanese writers. This release routes those shortcuts by physical key where needed and keeps primary-modifier shortcuts available during IME composition.

### User-Facing Improvements

#### macOS and Japanese input

- `Cmd` zoom shortcuts are detected from `event.code`, covering JIS-specific key positions that do not map cleanly through `event.key`.
- `Cmd+Z`, `Cmd+Shift+Z`, command palette, and other primary shortcuts keep working even when Japanese IME composition is active.

### Suggested Upgrade Notes Section

- Existing Markdown documents, AI settings, provider credentials, browser tabs, and local editor state are unchanged.
- This release does not change the Markdown file format.

### Suggested Who Should Update Section

This release is especially relevant for macOS users typing Japanese with a JIS keyboard or CJK IME.

## Packaging Checklist Before Release

- Confirm the final version in:
  - `package.json`
  - `src-tauri/tauri.conf.json`
  - `src-tauri/Cargo.toml`
- Run `npm run release:prepare -- 0.27.1` to sync the app version files and roll the current `## Unreleased` notes into a dated changelog section.
- Run `npm run release:validate -- 0.27.1` after the version bump so local metadata and scaffold-placeholder checks fail before CI does.
- Run `npm run release:notes:preview -- 0.27.1` to inspect the generated GitHub release body before pushing the tag.
- After the release is published, run `npm run release:draft:advance -- 0.27.1` to reset this file and refresh `CHANGELOG.md` `## Unreleased` for the next release cycle.
