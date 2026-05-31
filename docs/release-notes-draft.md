# Upcoming Release Notes Draft

This document is a draft for the next public release after `v0.25.0`.

It is intentionally written in release-note language rather than implementation language.

Start from `CHANGELOG.md` `## Unreleased`, then rewrite the user-visible changes into release-note language here.

## Suggested Release Title

`No.1 Markdown Editor v0.25.1`

## Short Summary

No.1 Markdown Editor v0.25.1 fixes browser-tab keyboard shortcuts. App-level shortcuts now keep working when an embedded browser page has focus, so writers can create, open, save, close, search, use AI, toggle layout, and adjust zoom without leaving the browser tab.

## Suggested GitHub Release Body

### Highlights

- Keep app-level keyboard shortcuts working while a Windows browser WebView has focus.
- Route browser WebView shortcuts through the same app command runner used by regular editor shortcuts.
- Disable native WebView zoom hotkeys so editor zoom remains consistent across editor, preview, and browser surfaces.
- Preserve repeat handling for close-tab shortcuts so holding the shortcut does not close multiple files unexpectedly.

### Why This Release Matters

Browser tabs should feel like part of the editor, not a separate app embedded inside it. This patch keeps core editor commands available even when focus is inside the web page, which makes browser-based research and writing flow more predictably.

### User-Facing Improvements

#### Browser Shortcut Handling

- Windows browser tabs now forward recognized app shortcuts from WebView2 to the editor shell.
- The editor handles forwarded browser shortcuts with the same command runner used by global keyboard shortcuts.
- Supported commands include file actions, browser tab creation, file switcher, command palette, AI, AI setup, keyboard shortcuts, appearance, image hosting, focus mode, sidebar, and zoom controls.

#### Shortcut Reliability

- Browser WebView native zoom hotkeys are disabled so `Ctrl/Cmd +`, `Ctrl/Cmd -`, and `Ctrl/Cmd 0` stay aligned with the editor zoom state.
- Repeated close-file shortcut events are ignored for browser-forwarded shortcuts, matching the existing document shortcut behavior.

#### Reliability

- Regression tests cover the shared app shortcut runner, the Windows browser accelerator bridge, disabled WebView native zoom hotkeys, and close-file repeat handling.

### Suggested Upgrade Notes Section

- Existing Markdown documents, browser tabs, AI settings, and image-hosting settings are unchanged.
- This patch changes shortcut routing only; page content and browser navigation behavior are unchanged.

### Suggested Who Should Update Section

This release is especially relevant for users who:

- use browser tabs while writing
- rely on keyboard shortcuts for file, AI, layout, or zoom actions
- work on Windows with embedded browser pages focused

## Packaging Checklist Before Release

- Confirm the final version in:
  - `package.json`
  - `src-tauri/tauri.conf.json`
  - `src-tauri/Cargo.toml`
- Run `npm run release:prepare -- 0.25.1 --date 2026-05-31` to sync the app version files and roll the current `## Unreleased` notes into a dated changelog section.
- Run `npm run release:validate -- 0.25.1` after the version bump so local metadata and scaffold-placeholder checks fail before CI does.
- Run `npm run release:notes:preview -- 0.25.1` to inspect the generated GitHub release body before pushing the tag.
- After the release is published, run `npm run release:draft:advance -- 0.25.1` to reset this file and refresh `CHANGELOG.md` `## Unreleased` for the next release cycle.
