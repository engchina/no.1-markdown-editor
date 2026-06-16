# Upcoming Release Notes Draft

This document is a draft for the next public release after `v0.26.2`.

It is intentionally written in release-note language rather than implementation language.

Start from `CHANGELOG.md` `## Unreleased`, then rewrite the user-visible changes into release-note language here.

## Suggested Release Title

`No.1 Markdown Editor v0.26.3`

## Short Summary

No.1 Markdown Editor v0.26.3 strengthens Windows file association registration and tightens native browser webview visibility. Installers now advertise stable document ProgIds through Windows Default Apps, and browser webviews only show while their own tab remains active.

## Suggested GitHub Release Body

### Highlights

- Register stable `No1MarkdownEditor.<ext>` document ProgIds for Markdown, MDX, and text files.
- Advertise file associations through Windows Default Apps capabilities and App Paths.
- Keep native browser webviews hidden if their tab becomes inactive during async webview creation.
- Expand diagnostics for Windows UserChoice and Default Apps registration.

### Why This Release Matters

Windows file association behavior depends on several registry surfaces, including Default Apps capabilities and protected UserChoice records. This release registers stable document ProgIds for supported file types and adds diagnostics for the Windows state that can override installer defaults. It also closes a native browser webview timing gap where an inactive browser tab could become visible again after an async create or reposition call.

### User-Facing Improvements

#### Windows File Associations

- WiX and NSIS installers register stable `No1MarkdownEditor.md`, `No1MarkdownEditor.markdown`, `No1MarkdownEditor.mdx`, and `No1MarkdownEditor.txt` ProgIds.
- Installers advertise supported file types through Windows Default Apps capabilities.
- App Paths entries point Windows at the installed desktop executable.
- The diagnostic PowerShell script now reports UserChoice, extension defaults, Default Apps capabilities, and stale association warnings.

#### Browser And Markdown Tab Switching

- Markdown tabs regain the visible editor surface after switching away from a browser tab.
- Opening a Markdown document from the desktop hides browser webviews before the document tab is activated.
- Browser webviews check that their tab is still active before showing, and hide again if the active tab changes during async setup.

### Developer-Facing Improvements

- Expanded WiX and NSIS packaging coverage for stable ProgIds, Default Apps capabilities, and App Paths.
- Added regression tests for active-tab browser webview show guards.
- Expanded Windows file association diagnostic coverage.

### Suggested Upgrade Notes Section

- Existing Markdown documents, AI settings, provider credentials, browser tabs, and local editor state are unchanged.
- This release does not change the Markdown file format.

### Suggested Who Should Update Section

This release is especially relevant for Windows users who open Markdown files through file associations and for users who switch rapidly between browser and Markdown tabs.

## Packaging Checklist Before Release

- Confirm the final version in:
  - `package.json`
  - `src-tauri/tauri.conf.json`
  - `src-tauri/Cargo.toml`
- Run `npm run release:prepare -- 0.26.3 --date 2026-06-16` to sync the app version files and roll the current `## Unreleased` notes into a dated changelog section.
- Run `npm run release:validate -- 0.26.3` after the version bump so local metadata and scaffold-placeholder checks fail before CI does.
- Run `npm run release:notes:preview -- 0.26.3` to inspect the generated GitHub release body before pushing the tag.
- After the release is published, run `npm run release:draft:advance -- 0.26.3` to reset this file and refresh `CHANGELOG.md` `## Unreleased` for the next release cycle.
