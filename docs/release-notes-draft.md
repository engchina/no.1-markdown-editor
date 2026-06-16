# Upcoming Release Notes Draft

This document is a draft for the next public release after `v0.26.1`.

It is intentionally written in release-note language rather than implementation language.

Start from `CHANGELOG.md` `## Unreleased`, then rewrite the user-visible changes into release-note language here.

## Suggested Release Title

`No.1 Markdown Editor v0.26.2`

## Short Summary

No.1 Markdown Editor v0.26.2 improves desktop reliability around Windows file associations and native browser webview visibility. Windows installers now register the app-level open handler, and browser content is hidden before Markdown tabs become active.

## Suggested GitHub Release Body

### Highlights

- Hide inactive native browser webviews when the active tab changes.
- Hide all browser webviews before a desktop Markdown document is opened.
- Register the Windows `Applications\no1-markdown-editor.exe` open handler in WiX and NSIS installers.
- Keep browser tabs available while ensuring Markdown tabs own the visible editing surface.

### Why This Release Matters

Opening files from the operating system and switching back to writing should both feel dependable. This release adds the Windows application-level file-open registration used by UserChoice associations, then hides inactive native browser child webviews whenever Markdown tabs need to own the visible editing surface.

### User-Facing Improvements

#### Windows File Associations

- WiX and NSIS installers register the executable application entry with supported Markdown and text extensions.
- The application open command passes the selected file path to the desktop app.
- A diagnostic PowerShell script can inspect UserChoice, open commands, and missing executable targets on Windows.

#### Browser And Markdown Tab Switching

- Markdown tabs regain the visible editor surface after switching away from a browser tab.
- Opening a Markdown document from the desktop hides browser webviews before the document tab is activated.
- Multiple browser tabs remain tracked so inactive browser views can be hidden consistently.

### Developer-Facing Improvements

- Added shared browser webview visibility helpers.
- Added WiX and NSIS packaging coverage for application-level file association registration.
- Added regression tests for browser webview labels, Markdown activation from browser tabs, and desktop document opens.

### Suggested Upgrade Notes Section

- Existing Markdown documents, AI settings, provider credentials, browser tabs, and local editor state are unchanged.
- This release does not change the Markdown file format.

### Suggested Who Should Update Section

This release is especially relevant for Windows users who open Markdown files through file associations and for users who keep browser tabs open while switching back to Markdown editing.

## Packaging Checklist Before Release

- Confirm the final version in:
  - `package.json`
  - `src-tauri/tauri.conf.json`
  - `src-tauri/Cargo.toml`
- Run `npm run release:prepare -- 0.26.2 --date 2026-06-16` to sync the app version files and roll the current `## Unreleased` notes into a dated changelog section.
- Run `npm run release:validate -- 0.26.2` after the version bump so local metadata and scaffold-placeholder checks fail before CI does.
- Run `npm run release:notes:preview -- 0.26.2` to inspect the generated GitHub release body before pushing the tag.
- After the release is published, run `npm run release:draft:advance -- 0.26.2` to reset this file and refresh `CHANGELOG.md` `## Unreleased` for the next release cycle.
