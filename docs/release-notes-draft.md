# Upcoming Release Notes Draft

This document is a draft for the next public release after `v0.27.13`.

It is intentionally written in release-note language rather than implementation language.

Start from `CHANGELOG.md` `## Unreleased`, then rewrite the user-visible changes into release-note language here.

## Suggested Release Title

`No.1 Markdown Editor v0.27.14`

## Short Summary

No.1 Markdown Editor v0.27.14 makes the preview remember where you were in each file, so switching files no longer carries one file's scroll position over to another.

## Suggested GitHub Release Body

### Highlights

- The preview keeps a separate scroll position for every open file.
- A file you open for the first time starts at the top of the preview.

### Why This Release Matters

v0.27.13 kept the editor in place across file switches, but the preview still shared a single scroll position between files. Each file now keeps its own place in both the editor and the preview.

### User-Facing Improvements

#### Fixes

- Switching files in Preview or Split mode restores each file's own preview position instead of reusing the previous file's position.

### Suggested Upgrade Notes Section

- No settings or document migration is required.
- macOS users on `v0.27.11` or later can install this release through the in-app updater.

### Suggested Who Should Update Section

This release is recommended for everyone who reads or edits several files in Preview or Split mode.

## Packaging Checklist Before Release

- Confirm the final version in:
  - `package.json`
  - `src-tauri/tauri.conf.json`
  - `src-tauri/Cargo.toml`
- Run `npm run release:prepare -- 0.27.14`.
- Run `npm run release:validate -- 0.27.14` so local metadata and scaffold-placeholder checks fail before CI does.
- Run `npm run release:notes:preview -- 0.27.14`.
- After publication, run `npm run release:draft:advance -- 0.27.14`.
