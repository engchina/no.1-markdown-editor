# Upcoming Release Notes Draft

This document is a draft for the next public release after `v0.27.13`.

It is intentionally written in release-note language rather than implementation language.

Start from `CHANGELOG.md` `## Unreleased`, then rewrite the user-visible changes into release-note language here.

## Suggested Release Title

`No.1 Markdown Editor v0.27.13`

## Short Summary

No.1 Markdown Editor v0.27.13 keeps your place in a document: switching files or view modes no longer sends the editor back to the top.

## Suggested GitHub Release Body

### Highlights

- Returning to a file restores the cursor and scroll position you left it at.
- Switching between Source, Split, and Preview modes keeps the editor where it was.

### Why This Release Matters

Losing your place every time you glance at another file or check the preview breaks writing flow, especially in long documents.

### User-Facing Improvements

#### Fixes

- Switching to another file and back keeps the editor cursor and scroll position instead of jumping to the top.
- Switching between Source, Split, and Preview modes keeps the editor cursor and scroll position.

### Suggested Upgrade Notes Section

- No settings or document migration is required.
- macOS users on `v0.27.11` or later can install this release through the in-app updater.

### Suggested Who Should Update Section

This release is recommended for everyone who works across multiple files or switches view modes while writing.

## Packaging Checklist Before Release

- Confirm the final version in:
  - `package.json`
  - `src-tauri/tauri.conf.json`
  - `src-tauri/Cargo.toml`
- Run `npm run release:prepare -- 0.27.13`.
- Run `npm run release:validate -- 0.27.13` so local metadata and scaffold-placeholder checks fail before CI does.
- Run `npm run release:notes:preview -- 0.27.13`.
- After publication, run `npm run release:draft:advance -- 0.27.13`.
