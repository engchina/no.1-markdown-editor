# Upcoming Release Notes Draft

This document is a draft for the next public release after `v0.20.1`.

It is intentionally written in release-note language rather than implementation language.

Start from `CHANGELOG.md` `## Unreleased`, then rewrite the user-visible changes into release-note language here.

## Suggested Release Title

`No.1 Markdown Editor v0.20.2`

## Short Summary

No.1 Markdown Editor v0.20.2 fixes OS-level file opening so Markdown documents launched from Explorer, Finder, or a Linux file manager open cleanly without a misleading batch-open error.

## Suggested GitHub Release Body

### Highlights

- Markdown documents opened from the operating system no longer show a false "some files couldn't be opened" warning.
- Extra launch arguments from desktop shells are filtered before they reach the editor.
- The fix applies to Windows, macOS, and Linux file association paths.

### Why This Release Matters

Opening a document from the operating system should feel direct and quiet. This release removes a confusing warning that could appear even after the requested Markdown file had already opened successfully.

### User-Facing Improvements

#### File Opening

- Desktop launch handling now accepts only supported Markdown-like document types: `.md`, `.markdown`, `.mdx`, and `.txt`.
- Non-document arguments, including app executable paths passed by some launchers, are ignored before the frontend opens files.
- Batch-open failure notices now represent actual document failures instead of launcher noise.

### Suggested "Upgrade Notes" Section

- No migration steps are required.
- Existing documents, file associations, and AI provider settings are unchanged.

### Suggested "Who Should Update" Section

This release is especially relevant for users who:

- open Markdown files by double-clicking them in the operating system
- use file associations on Windows, macOS, or Linux
- want launch-time warnings to reflect real file-open failures only

## Packaging Checklist Before Release

- Fill this draft using the current `CHANGELOG.md` `## Unreleased` section.
- Run `npm run release:prepare -- 0.20.2 --date 2026-04-29` to sync the app version files and roll the current `## Unreleased` notes into a dated changelog section.
- Confirm the final version in:
  - `package.json`
  - `src-tauri/tauri.conf.json`
  - `src-tauri/Cargo.toml`
- Run `npm run release:validate` after the version bump so local metadata checks, changelog checks, and scaffold-placeholder checks fail before CI does.
- Run `npm run release:notes:preview -- 0.20.2` if you want to inspect the generated GitHub release body before pushing the tag.
- Review the `0.20.2` release notes before tagging.
- Capture fresh screenshots for the product surfaces this release highlights.
- After the release is published, run `npm run release:draft:advance -- 0.20.2` to reset this file and refresh `CHANGELOG.md` `## Unreleased` for the next release cycle.
