# Upcoming Release Notes Draft

This document is a draft for the next public release after `v0.20.21`.

It is intentionally written in release-note language rather than implementation language.

Start from `CHANGELOG.md` `## Unreleased`, then rewrite the user-visible changes into release-note language here.

## Suggested Release Title

`No.1 Markdown Editor v0.21.0`

## Short Summary

No.1 Markdown Editor v0.21.0 adds GitHub-backed image hosting for local Markdown images. Writers can configure a repository target, store a personal access token securely, verify the connection, and replace local image paths with hosted URLs from the toolbar or command palette.

## Suggested GitHub Release Body

### Highlights

- Upload local Markdown images to a GitHub-backed hosting repository.
- Configure repository, branch, image path, and public URL settings in the editor.
- Verify the GitHub connection before uploading and replace local image paths in one action.

### Why This Release Matters

Markdown projects often need durable image URLs when notes are shared outside the local machine. This release adds an editor-native path from local image references to hosted URLs, reducing the need to leave the writing flow for manual asset upload and link replacement.

### User-Facing Improvements

#### Image Hosting

- A new image-hosting panel captures GitHub repository settings, branch, upload path, and public base URL.
- Personal access tokens can be stored and cleared through the desktop backend.
- Toolbar and command palette actions upload local images from the active document and replace Markdown image references with hosted URLs.

#### Reliability

- The hosting setup includes verification before upload.
- Regression tests cover URL generation, local image replacement, and Japanese, English, and Chinese copy completeness.

### Suggested Upgrade Notes Section

- Image hosting is opt-in and requires a GitHub repository target plus a personal access token.
- Existing documents are unchanged until the upload action is run.

### Suggested Who Should Update Section

This release is especially relevant for users who:

- share Markdown documents across machines or publishing surfaces
- keep local writing fast but need stable hosted image URLs
- maintain repositories where image assets should live beside Markdown content

## Packaging Checklist Before Release

- Confirm the final version in:
  - `package.json`
  - `src-tauri/tauri.conf.json`
  - `src-tauri/Cargo.toml`
- Run `npm run release:prepare -- 0.21.0 --date 2026-05-28` to sync the app version files and roll the current `## Unreleased` notes into a dated changelog section.
- Run `npm run release:validate -- 0.21.0` after the version bump so local metadata and scaffold-placeholder checks fail before CI does.
- Run `npm run release:notes:preview -- 0.21.0` to inspect the generated GitHub release body before pushing the tag.
- After the release is published, run `npm run release:draft:advance -- 0.21.0` to reset this file and refresh `CHANGELOG.md` `## Unreleased` for the next release cycle.
