# Upcoming Release Notes Draft

This document is a draft for the next public release after `v0.20.4`.

It is intentionally written in release-note language rather than implementation language.

Start from `CHANGELOG.md` `## Unreleased`, then rewrite the user-visible changes into release-note language here.

## Suggested Release Title

`No.1 Markdown Editor v0.20.5`

## Short Summary

No.1 Markdown Editor v0.20.5 improves AI Composer workflow stability and keeps embedded CodePen previews quieter until users explicitly open them.

## Suggested GitHub Release Body

### Highlights

- Clicking outside the AI Composer floating panel no longer dismisses an active AI workflow.
- CodePen embeds now wait for an explicit click before loading third-party iframe content.
- Normal Markdown preview rendering stays cleaner by avoiding CodePen iframe permission warnings until the embed is opened.

### Why This Release Matters

Writers often click back into the document while reviewing or applying an AI result. This release keeps the AI Composer available during that workflow and makes external embeds less noisy during ordinary preview rendering.

### User-Facing Improvements

#### AI Writing

- AI Composer remains open when the user clicks outside the floating panel.
- Active AI workflows are less likely to be interrupted by incidental focus changes.

#### Markdown Preview

- CodePen embeds are click-to-load in Markdown preview.
- Third-party iframe permission warnings are kept out of normal document rendering until the embed is activated.

### Suggested "Upgrade Notes" Section

- No migration steps are required.
- Existing documents, AI provider settings, and Markdown content are unchanged.

### Suggested "Who Should Update" Section

This release is especially relevant for users who:

- work with AI Composer while editing or reviewing nearby document content
- include CodePen embeds in Markdown documents
- prefer preview rendering that stays quiet until external embeds are explicitly opened

## Packaging Checklist Before Release

- Fill this draft using the current `CHANGELOG.md` `## Unreleased` section.
- Run `npm run release:prepare -- 0.20.5 --date 2026-05-01` to sync the app version files and roll the current `## Unreleased` notes into a dated changelog section.
- Confirm the final version in:
  - `package.json`
  - `src-tauri/tauri.conf.json`
  - `src-tauri/Cargo.toml`
- Run `npm run release:validate` after the version bump so local metadata checks, changelog checks, and scaffold-placeholder checks fail before CI does.
- Run `npm run release:notes:preview -- 0.20.5` if you want to inspect the generated GitHub release body before pushing the tag.
- Review the `0.20.5` release notes before tagging.
- Capture fresh screenshots for the product surfaces this release highlights.
- After the release is published, run `npm run release:draft:advance -- 0.20.5` to reset this file and refresh `CHANGELOG.md` `## Unreleased` for the next release cycle.
