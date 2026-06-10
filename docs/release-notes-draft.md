# Upcoming Release Notes Draft

This document is a draft for the next public release after `v0.25.5`.

It is intentionally written in release-note language rather than implementation language.

Start from `CHANGELOG.md` `## Unreleased`, then rewrite the user-visible changes into release-note language here.

## Suggested Release Title

`No.1 Markdown Editor v0.25.6`

## Short Summary

No.1 Markdown Editor v0.25.6 adds direct keyboard shortcuts for heading levels and includes a maintenance refactor of the desktop AI backend. Writers can now use `Ctrl+1` through `Ctrl+6` on Windows/Linux or `Cmd+1` through `Cmd+6` on macOS for H1-H6, while the Rust AI implementation is split into focused modules without changing the existing command surface.

## Suggested GitHub Release Body

### Highlights

- Apply H1-H6 directly with `Ctrl+1` through `Ctrl+6` on Windows/Linux and `Cmd+1` through `Cmd+6` on macOS.
- Show heading shortcut labels in the heading menu and command palette.
- Organize the Rust AI backend into smaller modules for safer maintenance.
- Update AI wiring tests so they cover the new module tree instead of the previous single-file backend.

### Why This Release Matters

Fast heading changes are part of everyday Markdown writing. This release makes heading levels reachable from the keyboard and visible in command surfaces, while also reducing AI backend maintenance risk by moving related Rust code into dedicated modules.

### User-Facing Improvements

#### Heading Shortcuts

- Heading levels now have direct keyboard shortcuts: `Ctrl+1` through `Ctrl+6` on Windows/Linux and `Cmd+1` through `Cmd+6` on macOS.
- The heading dropdown and command palette now display shortcut labels for H1-H6.
- `Ctrl+5` maps to H5 while `Ctrl+Shift+5` remains strikethrough.

### Developer-Facing Improvements

- AI provider state, secrets, hosted-agent OAuth, OCI Responses, MCP execution, response parsing, and streaming logic now live in focused Rust modules under `src-tauri/src/ai/`.
- Tauri command registration now targets `ai::commands::*`, keeping the public command surface explicit.
- AI tests that inspect backend behavior now read all Rust files in the AI module directory.

### Suggested Upgrade Notes Section

- Existing Markdown documents, AI settings, provider credentials, browser tabs, and local editor state are unchanged.
- This release does not change the Markdown file format or the AI configuration file format.

### Suggested Who Should Update Section

This release is useful for writers who frequently restructure headings from the keyboard and for maintainers who want the latest desktop build with the refactored AI backend packaging.

## Packaging Checklist Before Release

- Confirm the final version in:
  - `package.json`
  - `src-tauri/tauri.conf.json`
  - `src-tauri/Cargo.toml`
- Run `npm run release:prepare -- 0.25.6 --date 2026-06-11` to sync the app version files and roll the current `## Unreleased` notes into a dated changelog section.
- Run `npm run release:validate -- 0.25.6` after the version bump so local metadata and scaffold-placeholder checks fail before CI does.
- Run `npm run release:notes:preview -- 0.25.6` to inspect the generated GitHub release body before pushing the tag.
- After the release is published, run `npm run release:draft:advance -- 0.25.6` to reset this file and refresh `CHANGELOG.md` `## Unreleased` for the next release cycle.
