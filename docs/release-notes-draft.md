# Upcoming Release Notes Draft

This document is a draft for the next public release after `v0.27.8`.

It is intentionally written in release-note language rather than implementation language.

Start from `CHANGELOG.md` `## Unreleased`, then rewrite the user-visible changes into release-note language here.

## Suggested Release Title

`No.1 Markdown Editor v0.27.9`

## Short Summary

No.1 Markdown Editor v0.27.9 fixes clipped PDF code blocks and screenshot smart selection boxes that could target covered background windows.

## Suggested GitHub Release Body

### Highlights

- Long code and manifest paths now wrap cleanly in PDF exports without horizontal scrollbars or missing content.
- Screenshot smart selection now highlights the visible foreground window and can refine the selection to real Windows UI controls.

### Why This Release Matters

Exported documents should preserve every line of technical content, and screenshot selection should never highlight an unrelated hidden window. This release makes both workflows reliable while retaining manual drag selection as the universal fallback.

### User-Facing Improvements

#### Fixes

- PDF code blocks now wrap long lines, split across pages, avoid print-only scrollbars, and use high-contrast text.
- Screenshot smart selection now respects native window stacking order instead of preferring the smallest overlapping background window.
- On Windows, accessible buttons, inputs, lists, and other controls can be selected directly; unsupported applications safely fall back to the foreground window.

### Suggested Upgrade Notes Section

- No migration, permission, or settings change is required.

### Suggested Who Should Update Section

This release is recommended for everyone who exports technical documents to PDF or uses the built-in screenshot capture.

## Packaging Checklist Before Release

- Confirm the final version in:
  - `package.json`
  - `src-tauri/tauri.conf.json`
  - `src-tauri/Cargo.toml`
- Run `npm run release:prepare -- 0.27.9`.
- Run `npm run release:validate -- 0.27.9` so local metadata and scaffold-placeholder checks fail before CI does.
- Run `npm run release:notes:preview -- 0.27.9`.
- After publication, run `npm run release:draft:advance -- 0.27.9`.
