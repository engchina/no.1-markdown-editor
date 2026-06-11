# Upcoming Release Notes Draft

This document is a draft for the next public release after `v0.25.6`.

It is intentionally written in release-note language rather than implementation language.

Start from `CHANGELOG.md` `## Unreleased`, then rewrite the user-visible changes into release-note language here.

## Suggested Release Title

`No.1 Markdown Editor v0.26.0`

## Short Summary

No.1 Markdown Editor v0.26.0 fixes a disruptive paste scrolling issue in the editor. Clipboard paste now stays anchored around the inserted content instead of jumping the viewport away from the line the user just edited.

## Suggested GitHub Release Body

### Highlights

- Keep the editor viewport near the pasted line after real clipboard paste.
- Rely on CodeMirror's own scroll effects for post-insertion visibility instead of manual scrollTop adjustment.
- Preserve the existing off-screen insertion scroll behavior without forcing a bottom-gap scroll pass.

### Why This Release Matters

Pasting should feel stable. The previous manual bottom-gap scroll pass could read layout estimates before CodeMirror had settled after a paste, which made the editor jump away from the user's insertion point. This release removes that extra scroll path and keeps paste navigation predictable.

### User-Facing Improvements

#### Paste Scroll Stability

- Pasting Markdown, plain text, tables, or persisted image Markdown no longer runs the manual bottom-gap scroll adjustment after insertion.
- The editor now uses the same CodeMirror scroll effect path for paste visibility that it already uses for normal inserted Markdown.
- The viewport stays focused around the paste target instead of jumping away after clipboard insertion.

### Developer-Facing Improvements

- Removed the manual cursor bottom-gap helper from `editorScroll.ts`.
- Updated scroll wiring tests so paste insertion must stay on CodeMirror scroll effects and must not reintroduce `keepEditorCursorBottomGap`.

### Suggested Upgrade Notes Section

- Existing Markdown documents, AI settings, provider credentials, browser tabs, and local editor state are unchanged.
- This release does not change the Markdown file format.

### Suggested Who Should Update Section

This release is especially relevant for users who paste tables, images, or multi-line Markdown into long documents.

## Packaging Checklist Before Release

- Confirm the final version in:
  - `package.json`
  - `src-tauri/tauri.conf.json`
  - `src-tauri/Cargo.toml`
- Run `npm run release:prepare -- 0.26.0 --date 2026-06-11` to sync the app version files and roll the current `## Unreleased` notes into a dated changelog section.
- Run `npm run release:validate -- 0.26.0` after the version bump so local metadata and scaffold-placeholder checks fail before CI does.
- Run `npm run release:notes:preview -- 0.26.0` to inspect the generated GitHub release body before pushing the tag.
- After the release is published, run `npm run release:draft:advance -- 0.26.0` to reset this file and refresh `CHANGELOG.md` `## Unreleased` for the next release cycle.
