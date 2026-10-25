# Upcoming Release Notes Draft

This document is a draft for the next public release after `v0.27.14`.

It is intentionally written in release-note language rather than implementation language.

Start from `CHANGELOG.md` `## Unreleased`, then rewrite the user-visible changes into release-note language here.

## Suggested Release Title

`No.1 Markdown Editor v0.27.15`

## Short Summary

No.1 Markdown Editor v0.27.15 returns you to exactly the same place when you switch files or view modes, even in documents with images, math, and diagrams.

## Suggested GitHub Release Body

### Highlights

- Switching files or between Source and Preview now lands on exactly the same line you left.
- Source and Preview share one reading position per file, so the preview opens where you were editing and vice versa.
- The WYSIWYG editor no longer jumps when it loses focus after images have loaded.

### Why This Release Matters

Earlier releases restored a pixel offset, which drifted as soon as images, math, or diagrams finished loading. Positions are now kept as source lines, the same approach Obsidian uses, so they stay put while content settles.

### User-Facing Improvements

#### Fixes

- Returning to a file restores the exact viewport in both the editor and the preview.
- Preview positions no longer drift after images, math, or diagrams finish loading.
- Clicking outside the WYSIWYG editor (for example on another tab) no longer scrolls it.

### Suggested Upgrade Notes Section

- No settings or document migration is required.
- macOS users on `v0.27.11` or later can install this release through the in-app updater.

### Suggested Who Should Update Section

This release is recommended for everyone, especially anyone writing long documents with images in WYSIWYG or Preview mode.

## Packaging Checklist Before Release

- Confirm the final version in:
  - `package.json`
  - `src-tauri/tauri.conf.json`
  - `src-tauri/Cargo.toml`
- Run `npm run release:prepare -- 0.27.15`.
- Run `npm run release:validate -- 0.27.15` so local metadata and scaffold-placeholder checks fail before CI does.
- Run `npm run release:notes:preview -- 0.27.15`.
- After publication, run `npm run release:draft:advance -- 0.27.15`.
