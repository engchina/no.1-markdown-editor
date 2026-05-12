# Upcoming Release Notes Draft

This document is a draft for the next public release after `v0.20.16`.

It is intentionally written in release-note language rather than implementation language.

Start from `CHANGELOG.md` `## Unreleased`, then rewrite the user-visible changes into release-note language here.

## Suggested Release Title

`No.1 Markdown Editor v0.20.17`

## Short Summary

No.1 Markdown Editor v0.20.17 streamlines the AI Composer result view. Retrieval details remain available in their dedicated disclosure panel, while duplicate source badges and header controls are removed so the answer and actions stay easier to scan.

## Suggested GitHub Release Body

### Highlights

- AI Composer result headers are cleaner and less crowded.
- Retrieval details stay grouped in the disclosure panel below the answer.
- Structured SQL previews focus on the generated SQL and execution actions without repeating source labels.

### Why This Release Matters

AI-assisted writing works best when the result is visually calm and the next action is obvious. This release removes repeated source chrome from the result header while preserving access to retrieval details, making the composer feel closer to a focused writing tool than a dashboard.

### User-Facing Improvements

#### AI Composer

- The answer area no longer repeats retrieval source summaries in the header.
- The "Query & Search Results" disclosure remains the single place for inspecting retrieval context.
- SQL draft previews no longer repeat the composer source label beside the execution controls.

### Suggested Upgrade Notes Section

- No configuration changes required.
- Existing AI provider settings and history are unchanged.

### Suggested Who Should Update Section

This release is especially relevant for users who:

- use AI Composer with retrieval-backed answers
- review structured SQL drafts before execution
- prefer a quieter answer-first AI panel

## Packaging Checklist Before Release

- Confirm the final version in:
  - `package.json`
  - `src-tauri/tauri.conf.json`
  - `src-tauri/Cargo.toml`
- Run `npm run release:prepare -- 0.20.17 --date 2026-05-12` to sync the app version files and roll the current `## Unreleased` notes into a dated changelog section.
- Run `npm run release:validate -- 0.20.17` after the version bump so local metadata and scaffold-placeholder checks fail before CI does.
- Run `npm run release:notes:preview -- 0.20.17` to inspect the generated GitHub release body before pushing the tag.
- After the release is published, run `npm run release:draft:advance -- 0.20.17` to reset this file and refresh `CHANGELOG.md` `## Unreleased` for the next release cycle.
