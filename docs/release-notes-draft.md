# Upcoming Release Notes Draft

This document is a draft for the next public release after `v0.27.15`.

It is intentionally written in release-note language rather than implementation language.

Start from `CHANGELOG.md` `## Unreleased`, then rewrite the user-visible changes into release-note language here.

## Suggested Release Title

`No.1 Markdown Editor v0.27.16`

## Short Summary

No.1 Markdown Editor v0.27.16 keeps your place in more situations: while diagrams and embedded media render, when a file is reloaded or rewritten from outside the editor, and across sidebar panels.

## Suggested GitHub Release Body

### Highlights

- The editor stays put while Mermaid diagrams, videos, and other embedded content finish rendering.
- Reloading a file changed on disk, applying AI output, or rewriting image links after an upload keeps the cursor and view where they were.
- Each sidebar panel remembers its own scroll position.

### Why This Release Matters

v0.27.15 made switching files and modes return to the exact same place. A follow-up review found other ways the view could still jump or reset, and this release fixes them at the source.

### User-Facing Improvements

#### Fixes

- The WYSIWYG editor no longer jumps after Mermaid diagrams or other embedded content finish rendering, and already-rendered diagrams reappear instantly when you switch back to a file.
- External reloads, AI apply, and image-host link rewrites update only the changed text, so the cursor and view no longer reset to the top.
- The outline, files, search, and recent panels each keep their own scroll position.

### Suggested Upgrade Notes Section

- No settings or document migration is required.
- macOS users on `v0.27.11` or later can install this release through the in-app updater.

### Suggested Who Should Update Section

This release is recommended for everyone, especially anyone using Mermaid diagrams, editing files that change outside the app, or using image hosting.

## Packaging Checklist Before Release

- Confirm the final version in:
  - `package.json`
  - `src-tauri/tauri.conf.json`
  - `src-tauri/Cargo.toml`
- Run `npm run release:prepare -- 0.27.16`.
- Run `npm run release:validate -- 0.27.16` so local metadata and scaffold-placeholder checks fail before CI does.
- Run `npm run release:notes:preview -- 0.27.16`.
- After publication, run `npm run release:draft:advance -- 0.27.16`.
