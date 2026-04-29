# Upcoming Release Notes Draft

This document is a draft for the next public release after `v0.20.0`.

It is intentionally written in release-note language rather than implementation language.

Start from `CHANGELOG.md` `## Unreleased`, then rewrite the user-visible changes into release-note language here.

## Suggested Release Title

`No.1 Markdown Editor v0.20.1`

## Short Summary

No.1 Markdown Editor v0.20.1 fixes the update download dialog in compact, non-fullscreen windows so the release information and action buttons remain visible and reachable.

## Suggested GitHub Release Body

### Highlights

- Update download dialogs now stay within the editor's visible area in compact, non-fullscreen windows.
- The header, version cards, release notes, and download actions remain reachable even when the app is not maximized.
- Release notes scroll inside the dialog instead of pushing the main actions off-screen.

### Why This Release Matters

Update prompts need to be trustworthy and easy to complete from the window size users already have. This release keeps the download decision visible without requiring users to maximize the editor first.

### User-Facing Improvements

#### Updates

- The update dialog now respects the editor's safe vertical area instead of relying on a full-window layout.
- The release notes panel uses internal scrolling in constrained heights.
- Download, skip, and cancel actions remain visible in compact windows.

### Suggested "Upgrade Notes" Section

- No migration steps are required.
- Existing documents, file associations, and AI provider settings are unchanged.

### Suggested "Who Should Update" Section

This release is especially relevant for users who:

- run the editor in a snapped, tiled, or otherwise non-fullscreen window
- rely on automatic update prompts
- review release notes before downloading a new version

## Packaging Checklist Before Release

- Fill this draft using the current `CHANGELOG.md` `## Unreleased` section.
- Run `npm run release:prepare -- 0.20.1 --date 2026-04-29` to sync the app version files and roll the current `## Unreleased` notes into a dated changelog section.
- Confirm the final version in:
  - `package.json`
  - `src-tauri/tauri.conf.json`
  - `src-tauri/Cargo.toml`
- Run `npm run release:validate` after the version bump so local metadata checks, changelog checks, and scaffold-placeholder checks fail before CI does.
- Run `npm run release:notes:preview -- 0.20.1` if you want to inspect the generated GitHub release body before pushing the tag.
- Review the `0.20.1` release notes before tagging.
- Capture fresh screenshots for the product surfaces this release highlights.
- After the release is published, run `npm run release:draft:advance -- 0.20.1` to reset this file and refresh `CHANGELOG.md` `## Unreleased` for the next release cycle.
