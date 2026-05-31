# Upcoming Release Notes Draft

This document is a draft for the next public release after `v0.25.1`.

It is intentionally written in release-note language rather than implementation language.

Start from `CHANGELOG.md` `## Unreleased`, then rewrite the user-visible changes into release-note language here.

## Suggested Release Title

`No.1 Markdown Editor v0.25.2`

## Short Summary

No.1 Markdown Editor v0.25.2 adds Markdown table of contents insertion from the Command Palette. Writers can generate H2-only navigation or nested H2/H3 navigation from the current document headings without hand-copying anchor links.

## Suggested GitHub Release Body

### Highlights

- Insert a Markdown table of contents through H2 headings from the Command Palette.
- Insert a nested Markdown table of contents through H3 headings from the Command Palette.
- Reuse the editor's stable heading anchor generation so links match preview anchors.
- Show localized guidance when a document has no eligible headings for a table of contents.

### Why This Release Matters

Long Markdown documents need reliable in-document navigation. This release makes table of contents generation a first-class editor command while preserving the same anchor rules used by outline and preview.

### User-Facing Improvements

#### Table of Contents

- The Command Palette now includes TOC actions for H2-only and H2/H3 table of contents generation.
- Generated entries are regular Markdown links, so the result stays editable and portable.
- Nested H3 entries are indented beneath their parent H2 headings.
- Link text escapes Markdown bracket characters while anchors stay aligned with the editor's heading slug rules.

#### Empty-State Guidance

- When no eligible headings exist, the editor shows localized guidance instead of inserting an empty block.
- Command labels, descriptions, and notices are available in English, Japanese, and Chinese.

#### Reliability

- Regression tests cover heading extraction, TOC Markdown generation, editor insertion behavior, command registration, palette ordering, and locale coverage.

### Suggested Upgrade Notes Section

- Existing Markdown documents, browser tabs, AI settings, and image-hosting settings are unchanged.
- Generated tables of contents are plain Markdown and can be edited after insertion.

### Suggested Who Should Update Section

This release is especially relevant for users who:

- maintain long Markdown documents
- publish notes that need in-document navigation
- prefer generated anchor links to manual heading link maintenance

## Packaging Checklist Before Release

- Confirm the final version in:
  - `package.json`
  - `src-tauri/tauri.conf.json`
  - `src-tauri/Cargo.toml`
- Run `npm run release:prepare -- 0.25.2 --date 2026-05-31` to sync the app version files and roll the current `## Unreleased` notes into a dated changelog section.
- Run `npm run release:validate -- 0.25.2` after the version bump so local metadata and scaffold-placeholder checks fail before CI does.
- Run `npm run release:notes:preview -- 0.25.2` to inspect the generated GitHub release body before pushing the tag.
- After the release is published, run `npm run release:draft:advance -- 0.25.2` to reset this file and refresh `CHANGELOG.md` `## Unreleased` for the next release cycle.
