# Upcoming Release Notes Draft

This document is a draft for the next public release after `v0.24.1`.

It is intentionally written in release-note language rather than implementation language.

Start from `CHANGELOG.md` `## Unreleased`, then rewrite the user-visible changes into release-note language here.

## Suggested Release Title

`No.1 Markdown Editor v0.25.0`

## Short Summary

No.1 Markdown Editor v0.25.0 strengthens browser-assisted AI writing. Browser page context is now passed to AI as explicit untrusted source material, clipped pages preserve readable Markdown with normalized source links, and browser controls are localized across English, Japanese, and Chinese.

## Suggested GitHub Release Body

### Highlights

- Pass attached notes, searches, and browser pages into AI requests as explicit untrusted source context.
- Open `http` and `https` Markdown links in a new in-editor Browser tab.
- Preserve readable Markdown and normalized page-relative links when clipping or asking about a browser page.
- Improve browser page capture with article, selection, visible-content, and list extraction modes.
- Localize browser navigation controls, the address field, and the desktop-only browser placeholder.
- Keep OCI Responses routing active even when the optional Project field is blank.

### Why This Release Matters

Browser research only works if the model sees the right page content and the editor keeps that content safe. This release makes attached context visible to AI as source material, hardens page capture, and keeps browser UI text understandable across English, Japanese, and Chinese.

### User-Facing Improvements

#### Browser AI Context

- Attached notes, workspace search results, and browser pages are included in AI prompts as clearly bounded source context.
- Attached context is marked untrusted so instructions embedded inside pages or search results are not treated as commands.
- Browser webpage attachments identify Markdown as the content format and retain source URL provenance.

#### Markdown Link Opening

- `http` and `https` links opened from the editor or preview now create a Browser tab inside the app.
- Non-web protocols such as `mailto:` and `tel:` continue to use the external opener path.

#### Browser Capture

- Browser clips and AI webpage attachments prefer readable Markdown over raw page text.
- Relative links and images captured from pages are normalized against the current page URL.
- Browser page capture can now use article, selection, visible-content, and list extraction modes.
- Capture diagnostics report the selected extraction source, root, content length, Markdown length, and filtered elements.
- The browser title-channel fallback now validates request ids, chunk sizes, and pending requests before accepting page content.

#### Browser Localization

- Browser navigation buttons now use localized accessible labels.
- The address field placeholder and desktop-only browser placeholder now render in English, Japanese, and Chinese.

#### AI Provider Routing

- OCI Responses configuration no longer falls back to OpenAI-compatible chat routing only because the Project field is blank.

#### Reliability

- Regression tests cover attached AI context, browser clip Markdown fidelity, browser bridge URL normalization, browser localization wiring, OCI routing, and browser title-channel validation.
- Regression tests cover routing Markdown web links into internal Browser tabs while keeping non-web protocols on the external-opener path.

### Suggested Upgrade Notes Section

- Existing Markdown documents and image-hosting settings are unchanged.
- OCI users can leave the Project field blank without changing away from the Responses route.

### Suggested Who Should Update Section

This release is especially relevant for users who:

- use browser tabs to collect Markdown references
- ask AI questions about the current browser page
- prefer web research to stay inside the editor instead of switching to an external browser
- use OCI Responses-compatible AI configuration
- work in English, Japanese, or Chinese

## Packaging Checklist Before Release

- Confirm the final version in:
  - `package.json`
  - `src-tauri/tauri.conf.json`
  - `src-tauri/Cargo.toml`
- Run `npm run release:prepare -- 0.25.0 --date 2026-05-31` to sync the app version files and roll the current `## Unreleased` notes into a dated changelog section.
- Run `npm run release:validate -- 0.25.0` after the version bump so local metadata and scaffold-placeholder checks fail before CI does.
- Run `npm run release:notes:preview -- 0.25.0` to inspect the generated GitHub release body before pushing the tag.
- After the release is published, run `npm run release:draft:advance -- 0.25.0` to reset this file and refresh `CHANGELOG.md` `## Unreleased` for the next release cycle.
