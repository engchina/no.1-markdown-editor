# Upcoming Release Notes Draft

This document is a draft for the next public release after `v0.19.1`.

It is intentionally written in release-note language rather than implementation language.

Start from `CHANGELOG.md` `## Unreleased`, then rewrite the user-visible changes into release-note language here.

## Suggested Release Title

`No.1 Markdown Editor v0.19.2`

## Short Summary

No.1 Markdown Editor v0.19.2 improves the AI Composer flow for compact editor layouts, setup recovery, and slash-command privacy. It is a focused patch for writers using AI-assisted editing who need the composer to stay inside the writing surface, keep actions reachable, avoid accidental hidden context, and move directly to provider setup when the desktop AI bridge is required.

## Suggested GitHub Release Body

### Highlights

- The AI Composer now stays vertically bounded inside the source editor surface.
- Compact and mobile-width composer result actions now wrap without horizontal overflow.
- Desktop-only AI fallback messaging now includes a direct Open AI Setup action.
- Keyboard focus now remains contained inside the AI Composer while the modal is open.
- Slash-command AI entry now sends only the typed instruction unless explicit editor context is attached.

### Why This Release Matters

AI-assisted editing should feel like part of the writing surface rather than an overlay that escapes it. This release keeps the composer aligned with the editor, makes action rows more resilient in tight windows, and removes hidden slash-prefix context so users can see what the AI will receive.

### User-Facing Improvements

#### Writing and Editing

- The AI Composer frame now respects the source editor's vertical bounds.
- Result actions such as retry, copy, replace, insert, and new note remain usable on compact viewports.
- Tab and Shift+Tab navigation stay within the AI Composer until the dialog is closed.
- Slash commands now act as command triggers only; text before the `/` trigger is no longer attached as hidden request context.

#### Markdown Workspace

- No Markdown workspace file-model changes in this patch release.

#### Performance and Reliability

- Web-mode AI fallback now points directly to AI Setup, keeping provider configuration easier to find.
- AI smoke coverage now checks source-bounded layout, focus containment, mobile overflow, setup-panel routing, and prompt-only slash-command behavior.

#### AI and Writing Quality

- AI setup copy is updated across English, Japanese, and Chinese locales.

### Recommended Screenshots For Release Page

- AI Composer open in a short editor window, visibly bounded inside the source editor.
- AI Composer result actions on a mobile-width viewport.
- Desktop-only fallback message with the Open AI Setup action.
- Slash-command AI Composer showing the prompt-only context hint.

### Suggested "Upgrade Notes" Section

- No migration steps are required.
- Existing AI provider settings and editor documents are unchanged.

### Suggested "Who Should Update" Section

This release is especially relevant for users who:

- use AI Composer in split-screen, short-window, or mobile-width layouts
- configure AI providers from the desktop app
- rely on keyboard navigation inside modal workflows
- prefer visible, explicit AI context over hidden slash-prefix carryover

## Packaging Checklist Before Release

- Fill this draft using the current `CHANGELOG.md` `## Unreleased` section.
- Run `npm run release:prepare -- 0.19.2` to sync the app version files and roll the current `## Unreleased` notes into a dated changelog section.
- Confirm the final version in:
  - `package.json`
  - `src-tauri/tauri.conf.json`
  - `src-tauri/Cargo.toml`
- Run `npm run release:validate` after the version bump so local metadata checks, changelog checks, and scaffold-placeholder checks fail before CI does.
- Run `npm run release:notes:preview -- 0.19.2` if you want to inspect the generated GitHub release body before pushing the tag.
- Review the `0.19.2` release notes before tagging.
- Capture fresh screenshots for the product surfaces this release highlights.
- After the release is published, run `npm run release:draft:advance -- 0.19.2` to reset this file and refresh `CHANGELOG.md` `## Unreleased` for the next release cycle.
