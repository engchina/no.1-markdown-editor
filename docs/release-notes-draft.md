# Upcoming Release Notes Draft

This document is a draft for the next public release after `v0.20.5`.

It is intentionally written in release-note language rather than implementation language.

Start from `CHANGELOG.md` `## Unreleased`, then rewrite the user-visible changes into release-note language here.

## Suggested Release Title

`No.1 Markdown Editor v0.20.6`

## Short Summary

No.1 Markdown Editor v0.20.6 makes Enter behavior in Markdown editing more predictable when ordinary paragraphs begin with spaces.

## Suggested GitHub Release Body

### Highlights

- Pressing Enter after a normal paragraph that starts with one to three spaces no longer carries those spaces onto the next line.
- Markdown structures still behave as expected: lists, blockquotes, and code blocks keep their continuation behavior.
- The source editor now avoids surprising `3 spaces -> 2 spaces` normalization in ordinary paragraph writing.

### Why This Release Matters

Markdown writers often use temporary leading spaces while drafting, aligning text, or reproducing source snippets. This release keeps ordinary paragraph input predictable without weakening Markdown-aware continuation for structural blocks.

### User-Facing Improvements

#### Markdown Editing

- Ordinary paragraphs with one to three leading spaces now create a clean next line on Enter.
- Whitespace-only lines still preserve their existing spaces when the user splits them directly.
- Structural Markdown lines continue to defer to the editor's Markdown continuation logic.

#### Markdown Fidelity

- Four-space indented code and fenced code blocks are protected from the non-semantic indentation shortcut.
- Lists and blockquotes continue to use their expected Markdown prefixes after Enter.

### Suggested "Upgrade Notes" Section

- No migration steps are required.
- Existing documents are unchanged.

### Suggested "Who Should Update" Section

This release is especially relevant for users who:

- write Markdown in source or WYSIWYG editing modes
- start ordinary paragraph lines with spaces during drafting
- expect lists, blockquotes, and code blocks to keep Markdown-compatible continuation behavior

## Packaging Checklist Before Release

- Fill this draft using the current `CHANGELOG.md` `## Unreleased` section.
- Run `npm run release:prepare -- 0.20.6 --date 2026-05-05` to sync the app version files and roll the current `## Unreleased` notes into a dated changelog section.
- Confirm the final version in:
  - `package.json`
  - `src-tauri/tauri.conf.json`
  - `src-tauri/Cargo.toml`
- Run `npm run release:validate` after the version bump so local metadata checks, changelog checks, and scaffold-placeholder checks fail before CI does.
- Run `npm run release:notes:preview -- 0.20.6` if you want to inspect the generated GitHub release body before pushing the tag.
- Review the `0.20.6` release notes before tagging.
- Capture fresh screenshots for the product surfaces this release highlights.
- After the release is published, run `npm run release:draft:advance -- 0.20.6` to reset this file and refresh `CHANGELOG.md` `## Unreleased` for the next release cycle.
