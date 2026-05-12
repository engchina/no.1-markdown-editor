# Upcoming Release Notes Draft

This document is a draft for the next public release after `v0.20.15`.

It is intentionally written in release-note language rather than implementation language.

Start from `CHANGELOG.md` `## Unreleased`, then rewrite the user-visible changes into release-note language here.

## Suggested Release Title

`No.1 Markdown Editor v0.20.16`

## Short Summary

No.1 Markdown Editor v0.20.16 makes external links easier to follow while writing. Users can Ctrl-click on Windows/Linux or Cmd-click on macOS from either Source or WYSIWYG mode, while normal clicks still keep editing behavior predictable.

## Suggested GitHub Release Body

### Highlights

- Ctrl/Cmd-click now opens external Markdown links directly from the editor.
- The behavior works in both Source and WYSIWYG modes.
- The editor shows a pointer cursor only while the primary modifier is held over a supported external link.

### Why This Release Matters

Markdown writers often move between source text and referenced material. This release makes that workflow faster without turning ordinary editing clicks into navigation, which keeps the editor predictable for long-form writing and review.

### User-Facing Improvements

#### Writing and Editing

- Ctrl/Cmd-click opens supported external links with the system default browser or app.
- Supported links include Markdown inline links, angle-bracket autolinks, HTML anchors, and bare `http`, `https`, `mailto`, or `tel` URLs.
- Relative links, fragments, and unsafe protocols are ignored by the editor link opener.
- The pointer cursor appears only when a link can be followed, so users get feedback before opening it.

### Suggested Upgrade Notes Section

- No configuration changes required.
- Normal click and selection behavior is unchanged.

### Suggested Who Should Update Section

This release is especially relevant for users who:

- write documents with many external references
- switch between Source and WYSIWYG editing modes
- want desktop-style Markdown link navigation without losing editor-first click behavior

## Packaging Checklist Before Release

- Confirm the final version in:
  - `package.json`
  - `src-tauri/tauri.conf.json`
  - `src-tauri/Cargo.toml`
- Run `npm run release:prepare -- 0.20.16 --date 2026-05-12` to sync the app version files and roll the current `## Unreleased` notes into a dated changelog section.
- Run `npm run release:validate -- 0.20.16` after the version bump so local metadata and scaffold-placeholder checks fail before CI does.
- Run `npm run release:notes:preview -- 0.20.16` to inspect the generated GitHub release body before pushing the tag.
- After the release is published, run `npm run release:draft:advance -- 0.20.16` to reset this file and refresh `CHANGELOG.md` `## Unreleased` for the next release cycle.
