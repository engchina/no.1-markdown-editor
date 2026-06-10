# Upcoming Release Notes Draft

This document is a draft for the next public release after `v0.25.4`.

It is intentionally written in release-note language rather than implementation language.

Start from `CHANGELOG.md` `## Unreleased`, then rewrite the user-visible changes into release-note language here.

## Suggested Release Title

`No.1 Markdown Editor v0.25.5`

## Short Summary

No.1 Markdown Editor v0.25.5 strengthens save reliability and local state persistence. Auto-save now respects unresolved external file conflicts, failed saves retry with a bounded backoff, desktop saves replace Markdown files atomically, and editor settings persistence batches rapid writes during active typing.

## Suggested GitHub Release Body

### Highlights

- Keep unsaved edits dirty when the user keeps typing while a save is still in flight.
- Replace desktop Markdown files atomically during save to avoid truncated files after interrupted writes.
- Pause auto-save while an external file conflict is unresolved, then resume after the document state changes.
- Batch editor settings persistence so large drafts do not trigger synchronous localStorage work on every keystroke.
- Match Windows watcher path aliases back to the correct open tab.

### Why This Release Matters

Saving must be boring and trustworthy. This release tightens the editor's save path around the cases most likely to lose confidence: concurrent edits during disk writes, external file conflicts, interrupted writes, large image payloads, and noisy local persistence during sustained typing.

### User-Facing Improvements

#### Save Reliability

- Save completion now records the exact content written to disk. If the document changed while that write was running, the tab stays dirty instead of being marked saved incorrectly.
- Desktop saves now write through a temporary sibling file and rename over the target, reducing the chance of a partially written Markdown file.
- Auto-save skips tabs with unresolved external file conflicts so it does not overwrite another app's changes.
- Transient auto-save failures retry a limited number of times before waiting for the next edit.

#### External File Changes

- File watcher events with Windows verbatim paths, different separators, or different drive-letter casing now resolve back to the matching open tab.
- Missing-file and conflict bookkeeping stays keyed to the tab's canonical path.

#### Local Persistence And Large Files

- Editor settings persistence is debounced and flushed before unload or when the page becomes hidden.
- Draft image persistence writes raw bytes through the filesystem plugin path instead of serializing large byte arrays through JSON IPC.

#### Browser Tabs

- Browser tab titles now remove only a leading `www.` prefix, keeping hostnames such as `mywww.example.com` intact.

### Suggested Upgrade Notes Section

- Existing Markdown documents, AI settings, browser tabs, and image-hosting settings are unchanged.
- This release changes save bookkeeping and local persistence behavior but does not change the Markdown file format.

### Suggested Who Should Update Section

This release is especially relevant for users who:

- edit while auto-save is active
- keep notes open while the same files may change in another app
- paste or persist large local images
- work with Markdown files on Windows paths or network shares

## Packaging Checklist Before Release

- Confirm the final version in:
  - `package.json`
  - `src-tauri/tauri.conf.json`
  - `src-tauri/Cargo.toml`
- Run `npm run release:prepare -- 0.25.5 --date 2026-06-10` to sync the app version files and roll the current `## Unreleased` notes into a dated changelog section.
- Run `npm run release:validate -- 0.25.5` after the version bump so local metadata and scaffold-placeholder checks fail before CI does.
- Run `npm run release:notes:preview -- 0.25.5` to inspect the generated GitHub release body before pushing the tag.
- After the release is published, run `npm run release:draft:advance -- 0.25.5` to reset this file and refresh `CHANGELOG.md` `## Unreleased` for the next release cycle.
