# Upcoming Release Notes Draft

This document is a draft for the next public release after `v0.26.6`.

It is intentionally written in release-note language rather than implementation language.

Start from `CHANGELOG.md` `## Unreleased`, then rewrite the user-visible changes into release-note language here.

## Suggested Release Title

`No.1 Markdown Editor v0.26.7`

## Short Summary

No.1 Markdown Editor v0.26.7 focuses on cross-platform reliability on Windows and macOS: it preserves Windows (CRLF) line endings on save, strips a leading UTF-8 byte-order mark when opening files, restores edge/corner window resizing, broadens font fallbacks for Japanese and Chinese text, and fixes Windows file-tree path matching and a split-view scroll-sync jump.

## Suggested GitHub Release Body

### Highlights

- Windows files keep their CRLF line endings after editing instead of being silently rewritten to LF.
- Files that start with a UTF-8 byte-order mark open cleanly, with no invisible character breaking front matter or the first heading.
- The desktop window can again be resized from its edges and corners.

### Why This Release Matters

These issues mostly affected Windows and macOS users working with files from other tools or version control. Silent CRLF-to-LF rewrites produced noisy diffs, a stray byte-order mark broke front-matter and heading detection, and the custom title bar had lost native edge resizing. This release makes everyday file handling and window behavior match what users expect on each platform.

### User-Facing Improvements

#### Files and editing

- Saving a document preserves its original line-ending style; CRLF files stay CRLF.
- Opening a UTF-8 file with a byte-order mark no longer leaves an invisible character at the top of the document.

#### Windows

- The file tree no longer creates duplicate entries or fails to match an open file when the same path returns with different drive-letter casing or path separators.
- The window can be resized by dragging any edge or corner again.

#### Preview and typography

- In split view, a large preview jump (such as clicking the preview scrollbar track) scrolls the source editor to the matching line instead of leaving it behind.
- Interface and preview fonts fall back to platform and CJK typefaces (PingFang, Hiragino, Yu Gothic, Microsoft YaHei, Noto Sans CJK), so Japanese and Chinese text renders with a proper font on every OS.

### Suggested Upgrade Notes Section

- Existing Markdown documents, AI settings, provider credentials, browser tabs, and local editor state are unchanged.
- This release does not change the Markdown file format.

### Suggested Who Should Update Section

This release is especially relevant for Windows and macOS users, and for anyone writing in Japanese or Chinese.

## Packaging Checklist Before Release

- Confirm the final version in:
  - `package.json`
  - `src-tauri/tauri.conf.json`
  - `src-tauri/Cargo.toml`
- Run `npm run release:prepare -- 0.26.7` to sync the app version files and roll the current `## Unreleased` notes into a dated changelog section.
- Run `npm run release:validate -- 0.26.7` after the version bump so local metadata and scaffold-placeholder checks fail before CI does.
- Run `npm run release:notes:preview -- 0.26.7` to inspect the generated GitHub release body before pushing the tag.
- After the release is published, run `npm run release:draft:advance -- 0.26.7` to reset this file and refresh `CHANGELOG.md` `## Unreleased` for the next release cycle.
