# Upcoming Release Notes Draft

This document is a draft for the next public release after `v0.27.1`.

It is intentionally written in release-note language rather than implementation language.

Start from `CHANGELOG.md` `## Unreleased`, then rewrite the user-visible changes into release-note language here.

## Suggested Release Title

`No.1 Markdown Editor v0.27.2`

## Short Summary

No.1 Markdown Editor v0.27.2 adds lossless YAML Front Matter editing, optional OKF v0.1 workspace validation, and consistent internal document navigation across Preview and WYSIWYG modes.

## Suggested GitHub Release Body

### Highlights

- Edit rich YAML Front Matter without losing unknown fields, nested values, arrays, multiline text, or original line endings.
- Review metadata through compact, keyboard-accessible cards in Preview and WYSIWYG mode, with clear diagnostics when YAML is invalid.
- Enable OKF v0.1 per workspace, inspect errors and suggestions, and jump directly to the affected document and line.
- Follow workspace-root, relative, directory-index, and cross-document heading links consistently.

### Why This Release Matters

Knowledge documents often need structured metadata without sacrificing normal Markdown editing. This release keeps YAML source authoritative and untouched during ordinary saves, while adding an optional OKF layer only where a workspace requests it.

### User-Facing Improvements

#### YAML Front Matter

- Front Matter supports mappings, arrays, multiline values, CRLF files, duplicate-key diagnostics, and both generic Markdown closing markers.
- Type, tags, resource links, and other values share the same visual treatment in Preview and WYSIWYG mode.
- Invalid closed YAML remains editable and visible; unclosed blocks stay as source text.

#### OKF workspaces

- Root `index.md` files declaring `okf_version: "0.1"` enable OKF automatically, while each workspace can override the mode.
- Concept documents require only valid Front Matter and a non-empty `type`; title, description, and timestamp remain suggestions.
- Broken links, unknown types, unknown fields, and missing optional metadata never block opening or saving a document.

#### Navigation

- Workspace-root links such as `/tables/orders.md`, relative links, directory links, and heading anchors resolve through one shared navigation path.
- Broken internal links show a recoverable warning instead of navigating the WebView away from the document.

### Suggested Upgrade Notes Section

- Existing Markdown files remain unchanged unless edited by the user.
- OKF validation is disabled for ordinary workspaces unless explicitly enabled or declared by the root `index.md`.

### Suggested Who Should Update Section

This release is especially useful for teams maintaining Markdown knowledge catalogs, data documentation, or other metadata-rich workspaces.

## Packaging Checklist Before Release

- Confirm the final version in:
  - `package.json`
  - `src-tauri/tauri.conf.json`
  - `src-tauri/Cargo.toml`
- Run `npm run release:prepare -- 0.27.2`.
- Run `npm run release:validate -- 0.27.2` so local metadata and scaffold-placeholder checks fail before CI does.
- Run `npm run release:notes:preview -- 0.27.2`.
- After publication, run `npm run release:draft:advance -- 0.27.2`.
