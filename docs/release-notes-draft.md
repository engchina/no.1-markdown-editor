# Upcoming Release Notes Draft

This document is a draft for the next public release after `v0.18.2`.

It is intentionally written in release-note language rather than implementation language.

## Suggested Release Title

`No.1 Markdown Editor vNext`

## Short Summary

This release makes quoted writing feel more predictable across preview, WYSIWYG, and exported HTML.

The headline change is structural fidelity: nested blockquotes now keep their visual rhythm while users edit active quote lines, review quoted prose in preview, or export documents for sharing.

## Suggested GitHub Release Body

### Highlights

- Active WYSIWYG blockquote lines now keep the quote rail visible while leaving the `>` syntax directly editable.
- Preview and standalone HTML blockquotes now use tighter nested spacing so quoted sections read more like the editor surface.
- Visual soft line breaks no longer flatten blockquote handling in preview, reducing layout drift for quoted prose.
- Added regression coverage for blockquote spacing, active-line editing, and preview line-break interactions.

### Why This Release Matters

Quoted text is a common Markdown structure for notes, reviews, and long-form writing. When the active editing line, preview rendering, and exported document disagree about spacing or quote depth, users lose confidence in what the document really looks like.

This release reduces that drift so blockquotes keep the same structural cues while users switch between writing, reviewing, and exporting.

### User-Facing Improvements

#### Writing and Editing

- WYSIWYG keeps nested quote structure visible on the active line instead of collapsing the quote rail while the source markers remain editable.
- Quoted continuation lines stay easier to scan when moving through nested blockquotes.

#### Markdown Workspace

- Preview blockquotes now follow the same tighter nesting rhythm as the editing surface, so quoted notes feel more consistent while reviewing a document.

#### Performance and Reliability

- Standalone and exported HTML now use the same compact nested quote spacing, reducing mismatches between in-app reading and shared output.
- Additional regression tests protect blockquote spacing and preview soft-break behavior from drifting again.

#### AI and Writing Quality

- No AI workflow changes in this release; the focus is Markdown reading and editing fidelity.

### Recommended Screenshots For Release Page

- Nested blockquote shown on the active WYSIWYG line with visible quote rails
- The same quoted passage in preview with matching nesting rhythm
- Exported or shared HTML view of the same note

### Suggested “Upgrade Notes” Section

- This is a Markdown fidelity release focused on quoted text rather than new workspace features.
- If you write heavily with references, replies, meeting notes, or literature notes, blockquotes should now feel more stable across surfaces.

### Suggested “Who Should Update” Section

This release is especially relevant for users who:

- edit long quoted passages directly in WYSIWYG
- rely on preview to review nested quoted notes before publishing or sharing
- want Markdown structure to stay visually stable across editor and export surfaces

## Packaging Checklist Before Release

- Run `npm run release:prepare -- 0.18.3` to sync the app version files and roll the current `## Unreleased` notes into a dated changelog section.
- Confirm the final version in:
  - `package.json`
  - `src-tauri/tauri.conf.json`
  - `src-tauri/Cargo.toml`
- Run `npm run release:validate` after the version bump so local metadata and changelog checks fail before CI does.
- Run `npm run release:notes:preview -- 0.18.3` if you want to inspect the generated GitHub release body before pushing the tag.
- Replace `vNext` in release copy with the real version tag.
- Capture fresh screenshots if the release page will highlight typography parity or task-list presentation.
- After the release is published, run `npm run release:draft:advance -- 0.18.3` to reset this file and refresh `CHANGELOG.md` `## Unreleased` for the next release cycle.
