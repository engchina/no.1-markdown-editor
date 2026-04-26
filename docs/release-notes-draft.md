# Upcoming Release Notes Draft

This document is a draft for the next public release after `v0.18.4`.

It is intentionally written in release-note language rather than implementation language.

## Suggested Release Title

`No.1 Markdown Editor v0.18.5`

## Short Summary

This release tightens the desktop writing chrome around the editor. The toolbar is calmer, more keyboard-friendly, and clearer about the difference between formatting, command palette, outline, and WYSIWYG actions.

WYSIWYG table editing also gets more legible controls, replacing text glyphs with consistent icons for row, column, delete, and alignment operations.

## Suggested GitHub Release Body

### Highlights

- The main toolbar now keeps common writing actions visible while grouping lower-frequency formatting tools into one formatting menu.
- Toolbar menus now support proper menu semantics, arrow-key navigation, and Escape focus restoration.
- WYSIWYG table editing controls now use consistent SVG icons for row, column, delete, and alignment actions.
- Command palette and toolbar icons now better distinguish command, formatting, outline, and WYSIWYG actions.
- Alignment controls in WYSIWYG tables now expose pressed state only where it represents an active alignment choice.

### Why This Release Matters

Markdown editors are used in long sessions, so chrome that is slightly noisy or ambiguous adds friction quickly. This release reduces toolbar density, makes menu behavior more predictable from the keyboard, and gives table-editing controls clearer visual affordances.

The result is a calmer desktop writing surface that still keeps Markdown structure and formatting tools close at hand.

### User-Facing Improvements

#### Writing and Editing

- The toolbar now presents a more compact desktop layout with everyday actions visible and secondary formatting tools grouped together.
- WYSIWYG and focus mode controls now use labeled mode buttons so their state is easier to scan.
- WYSIWYG table row, column, delete, and alignment controls now use iconography that reads as table operations instead of symbolic text.

#### Markdown Workspace

- Command palette and outline iconography is clearer, reducing confusion between navigation, command execution, and visual editing modes.

#### Performance and Reliability

- Toolbar menus now behave more like desktop application menus with predictable arrow-key movement and Escape handling.
- Regression tests now cover toolbar accessibility semantics, quiet chrome styling, icon usage, localized labels, and table toolbar behavior.

#### AI and Writing Quality

- No AI workflow changes in this release; the focus is editor chrome, keyboard behavior, and WYSIWYG table controls.

### Recommended Screenshots For Release Page

- Main editor toolbar showing the compact formatting menu and labeled WYSIWYG/focus controls
- WYSIWYG table with the floating table toolbar visible
- Command palette showing the updated command iconography

### Suggested "Upgrade Notes" Section

- Users who rely on toolbar formatting should find the most common actions in the same immediate area, with less frequent actions under the formatting menu.
- Keyboard users can move through toolbar menus with arrow keys and close them with Escape while returning focus to the trigger.

### Suggested "Who Should Update" Section

This release is especially relevant for users who:

- write primarily from the desktop toolbar
- edit Markdown tables in WYSIWYG mode
- use keyboard navigation for menus and command palette workflows

## Packaging Checklist Before Release

- Run `npm run release:prepare -- 0.18.5` to sync the app version files and roll the current `## Unreleased` notes into a dated changelog section.
- Confirm the final version in:
  - `package.json`
  - `src-tauri/tauri.conf.json`
  - `src-tauri/Cargo.toml`
- Run `npm run release:validate` after the version bump so local metadata checks, changelog checks, and scaffold-placeholder checks fail before CI does.
- Run `npm run release:notes:preview -- 0.18.5` if you want to inspect the generated GitHub release body before pushing the tag.
- Capture fresh screenshots if the release page will highlight toolbar or table-editing changes.
- After the release is published, run `npm run release:draft:advance -- 0.18.5` to reset this file and refresh `CHANGELOG.md` `## Unreleased` for the next release cycle.
