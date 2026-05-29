# Upcoming Release Notes Draft

This document is a draft for the next public release after `v0.23.0`.

It is intentionally written in release-note language rather than implementation language.

Start from `CHANGELOG.md` `## Unreleased`, then rewrite the user-visible changes into release-note language here.

## Suggested Release Title

`No.1 Markdown Editor v0.23.1`

## Short Summary

No.1 Markdown Editor v0.23.1 tightens embedded browser tab behavior. Browser tabs now preserve page state while the editor layout changes, keep the address field and tab title synchronized after navigation, and avoid hiding native web content unless an overlay actually covers the browser viewport.

## Suggested GitHub Release Body

### Highlights

- Keep browser tab URLs and titles synchronized after in-page navigation.
- Preserve browser page state while resizing or opening editor panels.
- Hide native browser webviews only when an overlay overlaps the browser viewport.

### Why This Release Matters

Browser tabs are most useful when they behave like stable writing context instead of disposable previews. This patch focuses on keeping web references steady while users resize the editor, switch panels, or navigate inside a page.

### User-Facing Improvements

#### Browser Tab Reliability

- The browser address field updates when the native webview navigates.
- Browser tab URLs and titles are persisted back into editor tab state.
- Browser webviews are repositioned without being recreated during layout changes.

#### Overlay Handling

- Dialogs and large panels hide browser webviews only when they overlap the browser viewport.
- Non-overlapping editor surfaces no longer unnecessarily hide browser tabs.

#### Reliability

- Regression tests cover browser tab URL and title updates in the editor store.

### Suggested Upgrade Notes Section

- Browser tabs keep their current URL and derived title as users navigate.
- Existing Markdown documents and image-hosting settings are unchanged.

### Suggested Who Should Update Section

This release is especially relevant for users who:

- keep browser references open while writing
- use editor panels alongside browser tabs
- rely on tab titles to identify current browser pages

## Packaging Checklist Before Release

- Confirm the final version in:
  - `package.json`
  - `src-tauri/tauri.conf.json`
  - `src-tauri/Cargo.toml`
- Run `npm run release:prepare -- 0.23.1 --date 2026-05-30` to sync the app version files and roll the current `## Unreleased` notes into a dated changelog section.
- Run `npm run release:validate -- 0.23.1` after the version bump so local metadata and scaffold-placeholder checks fail before CI does.
- Run `npm run release:notes:preview -- 0.23.1` to inspect the generated GitHub release body before pushing the tag.
- After the release is published, run `npm run release:draft:advance -- 0.23.1` to reset this file and refresh `CHANGELOG.md` `## Unreleased` for the next release cycle.
