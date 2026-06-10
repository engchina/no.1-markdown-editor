# Upcoming Release Notes Draft

This document is a draft for the next public release after `v0.25.3`.

It is intentionally written in release-note language rather than implementation language.

Start from `CHANGELOG.md` `## Unreleased`, then rewrite the user-visible changes into release-note language here.

## Suggested Release Title

`No.1 Markdown Editor v0.25.4`

## Short Summary

No.1 Markdown Editor v0.25.4 improves WYSIWYG table paste behavior and preview/source synchronization fidelity. Spreadsheet-style clipboard content converts more consistently into Markdown tables, front-matter documents keep accurate preview source-line mapping, and split-view cleanup avoids stale preview containers.

## Suggested GitHub Release Body

### Highlights

- Convert spreadsheet-style clipboard data into Markdown tables through the editor-level paste path in WYSIWYG mode.
- Keep copy, cut, and paste inside active WYSIWYG table cells so decoded cell text and sanitized Markdown stay aligned.
- Preserve full-document preview source-line markers when a document starts with front matter.
- Avoid stale preview container references when split preview unmounts.

### Why This Release Matters

WYSIWYG editing should feel direct without weakening Markdown fidelity. This release closes several edge cases where table clipboard handling, front matter, and split preview lifecycle behavior could drift away from the source document.

### User-Facing Improvements

#### WYSIWYG Table Clipboard Handling

- Spreadsheet-style TSV or HTML table content now inserts as a Markdown table when pasted into the WYSIWYG document surface.
- Clipboard events inside an active WYSIWYG table cell stay with the cell editor, preserving decoded text for copy/cut while still sanitizing pasted cell content before writing Markdown.
- Table paste behavior now uses one shared planner for document-level paste handling and WYSIWYG plugin handling.

#### Preview Source-Line Fidelity

- Preview anchors and scroll-sync source markers now account for stripped front matter, so rendered headings, paragraphs, raw HTML, and math blocks map back to their true document lines.
- Worker and non-worker preview rendering paths now share the same source-line offset behavior.
- Scroll lookup no longer assumes preview markers are strictly ordered by document line.

#### Split View Stability

- Preview container registration now clears detached nodes on unmount, keeping split-scroll wiring attached only to the live preview.

#### Performance

- WYSIWYG structural analysis is cached per CodeMirror document version, reducing repeated full-document scans across editor plugins, gutter classes, and table decorations.

### Suggested Upgrade Notes Section

- Existing Markdown documents, AI settings, browser tabs, and image-hosting settings are unchanged.
- This release only changes clipboard handling in WYSIWYG table workflows and preview/source synchronization metadata.

### Suggested Who Should Update Section

This release is especially relevant for users who:

- paste spreadsheet data into Markdown tables
- edit table cells in WYSIWYG mode
- use front matter in long Markdown documents
- rely on split-view scroll sync between source and preview

## Packaging Checklist Before Release

- Confirm the final version in:
  - `package.json`
  - `src-tauri/tauri.conf.json`
  - `src-tauri/Cargo.toml`
- Run `npm run release:prepare -- 0.25.4 --date 2026-06-10` to sync the app version files and roll the current `## Unreleased` notes into a dated changelog section.
- Run `npm run release:validate -- 0.25.4` after the version bump so local metadata and scaffold-placeholder checks fail before CI does.
- Run `npm run release:notes:preview -- 0.25.4` to inspect the generated GitHub release body before pushing the tag.
- After the release is published, run `npm run release:draft:advance -- 0.25.4` to reset this file and refresh `CHANGELOG.md` `## Unreleased` for the next release cycle.
