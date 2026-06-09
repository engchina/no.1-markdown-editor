# Upcoming Release Notes Draft

This document is a draft for the next public release after `v0.25.2`.

It is intentionally written in release-note language rather than implementation language.

Start from `CHANGELOG.md` `## Unreleased`, then rewrite the user-visible changes into release-note language here.

## Suggested Release Title

`No.1 Markdown Editor v0.25.3`

## Short Summary

No.1 Markdown Editor v0.25.3 improves split-view scroll stability. Preview-side layout changes from pasted images, embeds, and other asynchronous content no longer pull the source editor away from the writer's current position.

## Suggested GitHub Release Body

### Highlights

- Keep the source editor steady when preview content reflows after asynchronous loads.
- Preserve normal editor-to-preview sync for navigation, AI apply, and source editing workflows.
- Continue supporting intentional preview scrolling through wheel, touch, keyboard, and scrollbar interactions.

### Why This Release Matters

Split view is most useful when the source and preview stay connected without fighting the writer. This release makes preview-to-editor sync respond to deliberate user scrolling instead of incidental browser reflow events.

### User-Facing Improvements

#### Split View Scroll Sync

- Pasted images that finish loading after insertion no longer yank the source editor viewport.
- Mermaid diagrams, embeds, and other delayed preview content can reflow without being treated as user preview scrolling.
- Users can still scroll the preview intentionally and have the editor follow the matching source position.

#### Reliability

- Scroll intent tracking distinguishes real preview interactions from reflow-driven scroll events.
- Regression tests cover the scroll intent window, reflow expiry, event wiring, and the existing cooldown loop guard.

### Suggested Upgrade Notes Section

- Existing Markdown documents, browser tabs, AI settings, and image-hosting settings are unchanged.
- This release changes split-view scroll behavior only when preview scroll events are caused by layout reflow rather than user input.

### Suggested Who Should Update Section

This release is especially relevant for users who:

- write in split view while pasting local or remote images
- work with documents containing Mermaid diagrams, embeds, or delayed-loading assets
- rely on stable source-editor position during long editing sessions

## Packaging Checklist Before Release

- Confirm the final version in:
  - `package.json`
  - `src-tauri/tauri.conf.json`
  - `src-tauri/Cargo.toml`
- Run `npm run release:prepare -- 0.25.3 --date 2026-06-10` to sync the app version files and roll the current `## Unreleased` notes into a dated changelog section.
- Run `npm run release:validate -- 0.25.3` after the version bump so local metadata and scaffold-placeholder checks fail before CI does.
- Run `npm run release:notes:preview -- 0.25.3` to inspect the generated GitHub release body before pushing the tag.
- After the release is published, run `npm run release:draft:advance -- 0.25.3` to reset this file and refresh `CHANGELOG.md` `## Unreleased` for the next release cycle.
