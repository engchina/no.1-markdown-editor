# Upcoming Release Notes Draft

This document is a draft for the next public release after `v0.20.10`.

It is intentionally written in release-note language rather than implementation language.

Start from `CHANGELOG.md` `## Unreleased`, then rewrite the user-visible changes into release-note language here.

## Suggested Release Title

`No.1 Markdown Editor v0.20.11`

## Short Summary

No.1 Markdown Editor v0.20.11 improves split-view writing by keeping the source editor and rendered preview aligned while scrolling. It also keeps copied and exported HTML clean by removing preview-only source-line markers outside the live preview.

## Suggested GitHub Release Body

### Highlights

- Split view now keeps the editor and preview panes aligned while scrolling.
- A new Theme panel toggle lets users turn split scroll sync off when they want the panes to move independently.
- Preview source-line mapping now covers ordinary Markdown, raw HTML, and math blocks.
- Clipboard HTML and standalone exports strip preview-only source-line markers before content leaves the app.

### Why This Release Matters

Split view is most useful when the source and preview stay oriented around the same part of the document. This release makes long-form editing feel more predictable by keeping both panes in step while still preserving a user-controlled escape hatch for independent scrolling.

### User-Facing Improvements

#### Split View

- Scrolling the editor now moves the preview to the matching source line.
- Scrolling the preview now moves the editor to the corresponding Markdown line.
- The sync behavior can be disabled from the Theme panel.

#### Markdown Preview

- Source-line mapping works across headings, paragraphs, lists, blockquotes, fenced code, raw HTML, tables, and math blocks.
- Math display blocks keep reliable source-line anchors after KaTeX rendering.

#### Export and Clipboard

- Preview-only source-line markers are removed from copied HTML.
- Standalone HTML export output remains clean and free of internal sync metadata.

### Suggested "Upgrade Notes" Section

- Split scroll sync is enabled by default in split view.
- Users who prefer independent editor and preview scrolling can disable it from the Theme panel.
- Existing documents are unchanged.

### Suggested "Who Should Update" Section

This release is especially relevant for users who:

- write or review long Markdown documents in split view
- compare source Markdown with rendered preview output
- use math blocks, raw HTML, or complex Markdown structures
- copy rendered Markdown or export standalone HTML

## Packaging Checklist Before Release

- Confirm the final version in:
  - `package.json`
  - `src-tauri/tauri.conf.json`
  - `src-tauri/Cargo.toml`
- Run `npm run release:prepare -- 0.20.11 --date 2026-05-09` to sync the app version files and roll the current `## Unreleased` notes into a dated changelog section.
- Run `npm run release:validate -- 0.20.11` after the version bump so local metadata and changelog checks fail before CI does.
- Run `npm run release:notes:preview -- 0.20.11` to inspect the generated GitHub release body before pushing the tag.
- After the release is published, run `npm run release:draft:advance -- 0.20.11` to reset this file and refresh `CHANGELOG.md` `## Unreleased` for the next release cycle.
