# Upcoming Release Notes Draft

This document is a draft for the next public release after `v0.27.10`.

It is intentionally written in release-note language rather than implementation language.

Start from `CHANGELOG.md` `## Unreleased`, then rewrite the user-visible changes into release-note language here.

## Suggested Release Title

`No.1 Markdown Editor v0.27.11`

## Short Summary

No.1 Markdown Editor v0.27.11 adds signature-verified, in-app updates on macOS so future upgrades no longer require downloading a new DMG or approving every version in Privacy & Security.

## Suggested GitHub Release Body

### Highlights

- macOS updates can now be downloaded, signature-verified, installed, and restarted directly inside the app.
- After the one-time migration to this release, future macOS updates no longer open a browser or require a new DMG.

### Why This Release Matters

Unsigned public macOS apps cannot eliminate Gatekeeper checks for the initial installation, but they should not force users through the same manual approval flow for every update. This release introduces a separately signed Tauri update channel while keeping the existing ad-hoc app signature and avoiding any silent security bypass.

### User-Facing Improvements

#### Fixes

- The macOS update dialog now installs the verified update and restarts the app instead of opening the GitHub download page.
- The update action is disabled while installation is running, with clear progress and error feedback.
- Windows and Linux continue to use the existing browser-download flow.

### Suggested Upgrade Notes Section

- Users upgrading from `v0.27.10` or an older release must install this version manually and may need to approve it in Privacy & Security one final time.
- The initial installation remains subject to macOS Gatekeeper because the app is not signed with an Apple Developer ID or notarized.
- Updates from this version onward are installed inside the app after signature verification.

### Suggested Who Should Update Section

This release is recommended for every macOS user, especially anyone who was repeatedly asked to approve each downloaded version.

## Packaging Checklist Before Release

- Confirm the final version in:
  - `package.json`
  - `src-tauri/tauri.conf.json`
  - `src-tauri/Cargo.toml`
- Run `npm run release:prepare -- 0.27.11`.
- Run `npm run release:validate -- 0.27.11` so local metadata and scaffold-placeholder checks fail before CI does.
- Run `npm run release:notes:preview -- 0.27.11`.
- After publication, run `npm run release:draft:advance -- 0.27.11`.
