# Upcoming Release Notes Draft

This document is a draft for the next public release after `v0.20.2`.

It is intentionally written in release-note language rather than implementation language.

Start from `CHANGELOG.md` `## Unreleased`, then rewrite the user-visible changes into release-note language here.

## Suggested Release Title

`No.1 Markdown Editor v0.20.3`

## Short Summary

No.1 Markdown Editor v0.20.3 refines the AI writing flow around `/` commands, context handling, and the selection bubble so common writing actions stay available without making ordinary cursor placement noisy.

## Suggested GitHub Release Body

### Highlights

- Continue is now available from the `/` AI command flow alongside ask, rewrite, translate, summarize, and explain.
- `/` commands can use text before the slash as optional context through a clear `Use / context` switch.
- The AI floating action bubble now appears only when text is selected, not when the user merely places the cursor.

### Why This Release Matters

AI writing controls should be available when they help and quiet when they do not. This release keeps slash commands useful for drafting and transforming nearby text while removing a cursor-only floating surface that interrupted normal writing.

### User-Facing Improvements

#### AI Writing

- The `/` command menu now supports Continue as a first-class writing action.
- Text before `/` is treated as optional context by default, and AI Composer exposes a toggle to disable that context before sending.
- Empty slash context made only of whitespace or `<br />` line breaks is ignored and cannot be enabled.

#### Selection Actions

- The floating AI action bubble appears only after selecting text.
- Ask, rewrite, translate, summarize, and explain remain available from selected text without introducing a cursor-only popup.
- AI Composer no longer repeats a lower "No context attached" hint when the slash-context row already communicates the state.

### Suggested "Upgrade Notes" Section

- No migration steps are required.
- Existing documents and AI provider settings are unchanged.

### Suggested "Who Should Update" Section

This release is especially relevant for users who:

- draft or transform text through the `/` AI command menu
- want nearby text to be available as AI context without manually selecting it
- found cursor-only AI popups distracting during normal editing

## Packaging Checklist Before Release

- Fill this draft using the current `CHANGELOG.md` `## Unreleased` section.
- Run `npm run release:prepare -- 0.20.3 --date 2026-04-30` to sync the app version files and roll the current `## Unreleased` notes into a dated changelog section.
- Confirm the final version in:
  - `package.json`
  - `src-tauri/tauri.conf.json`
  - `src-tauri/Cargo.toml`
- Run `npm run release:validate` after the version bump so local metadata checks, changelog checks, and scaffold-placeholder checks fail before CI does.
- Run `npm run release:notes:preview -- 0.20.3` if you want to inspect the generated GitHub release body before pushing the tag.
- Review the `0.20.3` release notes before tagging.
- Capture fresh screenshots for the product surfaces this release highlights.
- After the release is published, run `npm run release:draft:advance -- 0.20.3` to reset this file and refresh `CHANGELOG.md` `## Unreleased` for the next release cycle.
