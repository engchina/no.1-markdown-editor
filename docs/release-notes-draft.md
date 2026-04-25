# Upcoming Release Notes Draft

This document is a draft for the next public release after `v0.18.1`.

It is intentionally written in release-note language rather than implementation language.

## Suggested Release Title

`No.1 Markdown Editor vNext`

## Short Summary

This release tightens typography parity between preview and WYSIWYG so Markdown feels like one coherent writing surface instead of two related renderers.

The headline change is consistency: headings, links, code spans, blockquotes, footnotes, thematic breaks, and task lists now read more similarly no matter which editing surface users are in.

## Suggested GitHub Release Body

### Highlights

- Shared typography tokens across preview and WYSIWYG for headings, inline formatting, links, blockquotes, thematic breaks, and footnotes.
- Cleaner task list presentation with aligned markers, checkbox sizing, and completed-item treatment across both surfaces.
- WYSIWYG completed tasks stay readable instead of being aggressively crossed out.
- Additional regression coverage to keep preview and WYSIWYG presentation from drifting apart again.

### Why This Release Matters

Markdown editing quality is not only about features. It is also about trust in how the document reads while users move between editing modes.

Small presentation mismatches add friction:

- headings look slightly different
- task completion feels heavier in one mode than the other
- footnotes and blockquotes carry different visual emphasis depending on surface
- inline code and links do not always feel like part of the same typographic system

This release reduces that drift so preview and WYSIWYG feel like two views of the same Markdown document, not two separate styling stacks.

### User-Facing Improvements

#### Shared Typography

- Headings now follow the same tokenized size scale across preview and WYSIWYG.
- Links, inline code, highlights, subscript, and superscript now follow shared presentation tokens more closely.
- Blockquotes, footnotes, and thematic breaks now use the same visual system more consistently.

#### Better Task Lists

- Task list markers and checkbox spacing now align more closely between preview and WYSIWYG.
- Completed tasks stay visually softened without becoming harder to read.

#### Safer Presentation Maintenance

- Added regression tests around the presentation details that are easy to accidentally desynchronize between preview and WYSIWYG.

### Recommended Screenshots For Release Page

- Same note shown in preview and WYSIWYG with matching heading rhythm
- Task list with checked and unchecked items in both surfaces
- Footnotes and blockquotes in a document that exercises the shared typography tokens

### Suggested “Upgrade Notes” Section

- This is a polish-focused release rather than a workflow expansion release.
- The goal is stronger visual consistency across existing Markdown editing surfaces, not more interface chrome.

### Suggested “Who Should Update” Section

This release is especially relevant for users who:

- switch frequently between preview and WYSIWYG while writing
- care about typographic consistency in Markdown documents
- review task-heavy notes, references, and long-form prose inside the editor

## Packaging Checklist Before Release

- Run `npm run release:prepare -- 0.18.2` to sync the app version files and roll the current `## Unreleased` notes into a dated changelog section.
- Confirm the final version in:
  - `package.json`
  - `src-tauri/tauri.conf.json`
  - `src-tauri/Cargo.toml`
- Run `npm run release:validate` after the version bump so local metadata and changelog checks fail before CI does.
- Run `npm run release:notes:preview -- 0.18.2` if you want to inspect the generated GitHub release body before pushing the tag.
- Replace `vNext` in release copy with the real version tag.
- Capture fresh screenshots if the release page will highlight typography parity or task-list presentation.
- After the release is published, run `npm run release:draft:advance -- 0.18.2` to reset this file and refresh `CHANGELOG.md` `## Unreleased` for the next release cycle.
