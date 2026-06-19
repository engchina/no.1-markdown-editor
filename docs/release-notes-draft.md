# Upcoming Release Notes Draft

This document is a draft for the next public release after `v0.26.5`.

It is intentionally written in release-note language rather than implementation language.

Start from `CHANGELOG.md` `## Unreleased`, then rewrite the user-visible changes into release-note language here.

## Suggested Release Title

`No.1 Markdown Editor v0.26.6`

## Short Summary

No.1 Markdown Editor v0.26.6 fixes two input-method (IME) editing glitches. Shift+Space now reliably inserts a half-width space while a Japanese IME is active, and typing a digit now replaces the selected text while a Chinese IME is active.

## Suggested GitHub Release Body

### Highlights

- Shift+Space now inserts a half-width space on every press while a Japanese IME is active, instead of only landing on every other press.
- Typing a digit now replaces the active selection while a Chinese IME is active, instead of doing nothing.

### Why This Release Matters

Both issues only surfaced while writing with a Japanese or Chinese IME, so they were easy to miss but disruptive in everyday CJK writing. Shift+Space and digit-over-selection are common keystrokes, and the editor now handles them deterministically without interfering with IME candidate selection.

### User-Facing Improvements

#### Japanese IME

- Shift+Space inserts a half-width space on every press. Previously the IME's Shift+Space hand-off desynced with the editor, so the space only landed on alternating presses. The shortcut is now handled directly and stays out of the way while you are converting candidates.

#### Chinese IME

- Pressing a digit while text is selected replaces the selection. Previously the digit was delivered as a direct key event that the editor failed to apply over a selection, so the keypress appeared to do nothing. Selecting IME candidates by number is unaffected, and ordinary digit typing is unchanged.

### Suggested Upgrade Notes Section

- Existing Markdown documents, AI settings, provider credentials, browser tabs, and local editor state are unchanged.
- This release does not change the Markdown file format.

### Suggested Who Should Update Section

This release is especially relevant for anyone writing with a Japanese or Chinese input method.

## Packaging Checklist Before Release

- Confirm the final version in:
  - `package.json`
  - `src-tauri/tauri.conf.json`
  - `src-tauri/Cargo.toml`
- Run `npm run release:prepare -- 0.26.6 --date 2026-06-19` to sync the app version files and roll the current `## Unreleased` notes into a dated changelog section.
- Run `npm run release:validate -- 0.26.6` after the version bump so local metadata and scaffold-placeholder checks fail before CI does.
- Run `npm run release:notes:preview -- 0.26.6` to inspect the generated GitHub release body before pushing the tag.
- After the release is published, run `npm run release:draft:advance -- 0.26.6` to reset this file and refresh `CHANGELOG.md` `## Unreleased` for the next release cycle.
