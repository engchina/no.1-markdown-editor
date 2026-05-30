# Upcoming Release Notes Draft

This document is a draft for the next public release after `v0.24.0`.

It is intentionally written in release-note language rather than implementation language.

Start from `CHANGELOG.md` `## Unreleased`, then rewrite the user-visible changes into release-note language here.

## Suggested Release Title

`No.1 Markdown Editor v0.24.1`

## Short Summary

No.1 Markdown Editor v0.24.1 improves the embedded browser writing workflow. Browser agent actions now show localized labels, browser clips open in their own unsaved Markdown note, and new browser tabs start from `https://www.google.com/`.

## Suggested GitHub Release Body

### Highlights

- Show localized browser agent toolbar labels instead of raw action keys.
- Save browser clips into a new unsaved Markdown note by default.
- Open new browser tabs at `https://www.google.com/`.

### Why This Release Matters

Browser research should not unexpectedly rewrite an active note. This patch keeps captured web content separate by default and makes the browser toolbar easier to understand across English, Japanese, and Chinese.

### User-Facing Improvements

#### Browser Agent Actions

- Browser agent toolbar actions display translated labels.
- The clip action creates a separate Markdown draft note with the captured page content.
- Existing open notes are left unchanged when clipping from a browser tab.

#### Browser Defaults

- New browser tabs and browser creation commands now start at `https://www.google.com/`.

#### Reliability

- Regression tests cover browser agent localization, clip routing, and default browser URL wiring.

### Suggested Upgrade Notes Section

- Browser clips now create a new unsaved Markdown note instead of appending to an existing note.
- Existing Markdown documents and image-hosting settings are unchanged.

### Suggested Who Should Update Section

This release is especially relevant for users who:

- use browser tabs to collect Markdown references
- work in English, Japanese, or Chinese
- expect new browser pages to start from Google

## Packaging Checklist Before Release

- Confirm the final version in:
  - `package.json`
  - `src-tauri/tauri.conf.json`
  - `src-tauri/Cargo.toml`
- Run `npm run release:prepare -- 0.24.1 --date 2026-05-30` to sync the app version files and roll the current `## Unreleased` notes into a dated changelog section.
- Run `npm run release:validate -- 0.24.1` after the version bump so local metadata and scaffold-placeholder checks fail before CI does.
- Run `npm run release:notes:preview -- 0.24.1` to inspect the generated GitHub release body before pushing the tag.
- After the release is published, run `npm run release:draft:advance -- 0.24.1` to reset this file and refresh `CHANGELOG.md` `## Unreleased` for the next release cycle.
