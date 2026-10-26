# Upcoming Release Notes Draft

This document is a draft for the next public release after `v0.27.16`.

It is intentionally written in release-note language rather than implementation language.

Start from `CHANGELOG.md` `## Unreleased`, then rewrite the user-visible changes into release-note language here.

## Suggested Release Title

`No.1 Markdown Editor v0.27.17`

## Short Summary

No.1 Markdown Editor v0.27.17 makes switching between files return to the exact place you left, including in long documents with images and wrapped paragraphs.

## Suggested GitHub Release Body

### Highlights

- Switching back to a file now reliably lands exactly where you left it.

### Why This Release Matters

In v0.27.16, coming back to a long file could sometimes land at the top or a few lines away from where you left it, especially in documents with images or long wrapped paragraphs. This release fixes the cause, so the position holds while the document finishes laying out.

### User-Facing Improvements

#### Fixes

- Switching back to a long file with images or wrapped paragraphs no longer sometimes lands at the top or a few lines away from where you left it.

### Suggested Upgrade Notes Section

- No settings or document migration is required.
- macOS users on `v0.27.11` or later can install this release through the in-app updater.

### Suggested Who Should Update Section

This release is recommended for everyone who keeps several files open and switches between them.

## Packaging Checklist Before Release

- Confirm the final version in:
  - `package.json`
  - `src-tauri/tauri.conf.json`
  - `src-tauri/Cargo.toml`
- Run `npm run release:prepare -- 0.27.17`.
- Run `npm run release:validate -- 0.27.17` so local metadata and scaffold-placeholder checks fail before CI does.
- Run `npm run release:notes:preview -- 0.27.17`.
- After publication, run `npm run release:draft:advance -- 0.27.17`.
