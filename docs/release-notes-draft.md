# Upcoming Release Notes Draft

This document is a draft for the next public release after `v0.26.4`.

It is intentionally written in release-note language rather than implementation language.

Start from `CHANGELOG.md` `## Unreleased`, then rewrite the user-visible changes into release-note language here.

## Suggested Release Title

`No.1 Markdown Editor v0.26.5`

## Short Summary

No.1 Markdown Editor v0.26.5 makes the macOS download far easier to launch. The macOS build is now ad-hoc signed, every release ships a one-double-click first-launch helper, and a permanent EN/JA/ZH first-launch note is embedded in every release page so the expected Gatekeeper prompt on unsigned builds is no longer a dead end.

## Suggested GitHub Release Body

### Highlights

- Ad-hoc sign the macOS universal build so Apple Silicon no longer reports it as "damaged".
- Ship `macOS-First-Launch-Helper.zip`: unzip and double-click to clear the Gatekeeper quarantine flag and launch the app — no Terminal command to memorize.
- Embed a permanent EN/JA/ZH macOS first-launch note in every release body.

### Why This Release Matters

The macOS build is not notarized by Apple, so Gatekeeper blocks the first launch and every launch right after an in-app update. That is expected behavior, not a real malware detection, but until now there was no in-product guidance for it. This release keeps the recovery steps in front of every macOS user on every release page and reduces the manual `xattr` step to a single double-click.

### User-Facing Improvements

#### macOS First Launch

- The universal macOS build is ad-hoc signed (`APPLE_SIGNING_IDENTITY: "-"`), which lets Apple Silicon run it without a "damaged" error. This is not Apple notarization and requires no developer certificate.
- Each release now includes `macOS-First-Launch-Helper.zip`. Unzip it and double-click `Open-No1-Markdown-Editor.command` to clear the quarantine flag and open the app. Repeat after each update.
- The manual fallback remains `xattr -dr com.apple.quarantine "/Applications/No.1 Markdown Editor.app"`.

### Developer-Facing Improvements

- The release workflow now ad-hoc signs the macOS build and uploads the first-launch helper as a release asset.
- `scripts/build-release-body.mjs` appends a permanent macOS first-launch note to every generated release body, with regression coverage.

### Suggested Upgrade Notes Section

- Existing Markdown documents, AI settings, provider credentials, browser tabs, and local editor state are unchanged.
- This release does not change the Markdown file format.
- Removing the Gatekeeper prompt entirely still requires full Apple Developer signing plus notarization.

### Suggested Who Should Update Section

This release is especially relevant for macOS users who saw a Gatekeeper "cannot be opened" prompt after downloading or updating the app.

## Packaging Checklist Before Release

- Confirm the final version in:
  - `package.json`
  - `src-tauri/tauri.conf.json`
  - `src-tauri/Cargo.toml`
- Run `npm run release:prepare -- 0.26.5 --date 2026-06-19` to sync the app version files and roll the current `## Unreleased` notes into a dated changelog section.
- Run `npm run release:validate -- 0.26.5` after the version bump so local metadata and scaffold-placeholder checks fail before CI does.
- Run `npm run release:notes:preview -- 0.26.5` to inspect the generated GitHub release body before pushing the tag.
- After the release is published, run `npm run release:draft:advance -- 0.26.5` to reset this file and refresh `CHANGELOG.md` `## Unreleased` for the next release cycle.
