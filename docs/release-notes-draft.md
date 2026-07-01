# Upcoming Release Notes Draft

This document is a draft for the next public release after `v0.27.11`.

It is intentionally written in release-note language rather than implementation language.

Start from `CHANGELOG.md` `## Unreleased`, then rewrite the user-visible changes into release-note language here.

## Suggested Release Title

`No.1 Markdown Editor v0.27.12`

## Short Summary

No.1 Markdown Editor v0.27.12 makes the macOS installation guidance explicit: the helper is only for an initial installation or one-time migration, never for normal in-app updates.

## Suggested GitHub Release Body

### Highlights

- The macOS help section is now titled "Initial Install or One-Time Migration" in English, Japanese, and Chinese.
- The helper instructions now explicitly say not to use the helper for normal in-app updates.

### Why This Release Matters

Initial installation and routine updates have different security paths. Clear wording prevents users from repeating the Gatekeeper recovery step after every release when the signed in-app updater already handles normal updates.

### User-Facing Improvements

#### Changes

- The release note, README, and helper now consistently limit the helper to initial installation or migration from `v0.27.10` or earlier.
- The instructions state that updates from `v0.27.11` onward are verified and installed inside the app without downloading another DMG or approving every version in Privacy & Security.

### Suggested Upgrade Notes Section

- No settings or document migration is required.
- Users already running `v0.27.11` should install this release through the in-app updater.
- The helper remains available only when macOS blocks an initial installation or migration from `v0.27.10` or earlier.

### Suggested Who Should Update Section

This release is recommended for macOS users and provides the first public follow-up release that can be installed through the signed in-app updater introduced in `v0.27.11`.

## Packaging Checklist Before Release

- Confirm the final version in:
  - `package.json`
  - `src-tauri/tauri.conf.json`
  - `src-tauri/Cargo.toml`
- Run `npm run release:prepare -- 0.27.12`.
- Run `npm run release:validate -- 0.27.12` so local metadata and scaffold-placeholder checks fail before CI does.
- Run `npm run release:notes:preview -- 0.27.12`.
- After publication, run `npm run release:draft:advance -- 0.27.12`.
