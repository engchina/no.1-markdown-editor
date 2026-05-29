# Upcoming Release Notes Draft

This document is a draft for the next public release after `v0.21.0`.

It is intentionally written in release-note language rather than implementation language.

Start from `CHANGELOG.md` `## Unreleased`, then rewrite the user-visible changes into release-note language here.

## Suggested Release Title

`No.1 Markdown Editor v0.23.0`

## Short Summary

No.1 Markdown Editor v0.23.0 adds embedded browser tabs and faster access to core editor panels. Writers can keep web references beside Markdown documents, create Markdown or browser tabs from the tab strip and toolbar, and reach appearance, AI setup, image hosting, and About panels from the command palette or shortcuts.

## Suggested GitHub Release Body

### Highlights

- Open embedded browser tabs beside Markdown files.
- Create Markdown and browser tabs directly from the tab strip, toolbar, command palette, or keyboard.
- Open appearance, AI setup, image hosting, and About panels from command palette entries and shortcuts.
- Keep browser tabs visually aligned with editor zoom.

### Why This Release Matters

Markdown work often depends on nearby references: documentation, issue trackers, preview pages, and publishing surfaces. This release keeps that context inside the editor while tightening the tab and command surfaces around everyday writing actions.

### User-Facing Improvements

#### Browser Tabs

- Embedded browser tabs can be opened from the toolbar, tab strip, command palette, or primary shortcut.
- Browser webviews follow the editor zoom setting.
- Browser webviews are hidden while app dialogs and large overlay panels are open, keeping native web content from covering editor controls.

#### Faster Navigation

- The tab strip now has adjacent new Markdown and new Browser actions.
- Double-clicking empty tab-strip space creates a new Markdown document.
- Command palette entries now cover appearance, AI setup, image hosting, and About panels.

#### Reliability

- Regression tests cover tab-strip layout, browser zoom wiring, command palette shortcuts, and dirty-tab close behavior.

### Suggested Upgrade Notes Section

- Browser tabs are created on demand and do not change existing Markdown documents.
- Existing image-hosting settings and Markdown files are preserved.

### Suggested Who Should Update Section

This release is especially relevant for users who:

- write with online references beside their Markdown files
- frequently switch between editor settings, AI setup, and image-hosting tools
- use zoom controls across both Markdown and embedded web content

## Packaging Checklist Before Release

- Confirm the final version in:
  - `package.json`
  - `src-tauri/tauri.conf.json`
  - `src-tauri/Cargo.toml`
- Run `npm run release:prepare -- 0.23.0 --date 2026-05-29` to sync the app version files and roll the current `## Unreleased` notes into a dated changelog section.
- Run `npm run release:validate -- 0.23.0` after the version bump so local metadata and scaffold-placeholder checks fail before CI does.
- Run `npm run release:notes:preview -- 0.23.0` to inspect the generated GitHub release body before pushing the tag.
- After the release is published, run `npm run release:draft:advance -- 0.23.0` to reset this file and refresh `CHANGELOG.md` `## Unreleased` for the next release cycle.
