# Upcoming Release Notes Draft

This document is a draft for the next public release after `v0.18.5`.

It is intentionally written in release-note language rather than implementation language.

## Suggested Release Title

`No.1 Markdown Editor v0.18.6`

## Short Summary

This release makes WYSIWYG mode more faithful for rich Markdown structures. Mermaid diagrams and HTML `<details>` blocks now behave more like preview while still keeping the source easy to reach.

Clipboard fidelity also improves for copied disclosure blocks and Qiita link cards, reducing the amount of source cleanup needed after pasting from documentation pages.

## Suggested GitHub Release Body

### Highlights

- WYSIWYG mode now renders inactive Mermaid fences as inline diagrams while keeping the Mermaid source one click or keypress away.
- WYSIWYG mode now renders block-level HTML `<details>` disclosures as preview-like collapsible blocks.
- Preview copying now preserves collapsed `<details>` bodies by expanding the copied range around the full disclosure.
- Pasting browser-copied collapsed `<details>` blocks now warns when the browser only supplied the summary.
- HTML paste now recovers Qiita link-card iframe targets as Markdown links.

### Why This Release Matters

Markdown documents increasingly mix plain prose with diagrams, disclosure blocks, generated documentation snippets, and pasted web content. This release narrows the gap between writing in WYSIWYG, checking preview, and preserving the original Markdown source.

The result is a smoother cleanup workflow: diagrams stay readable inline, details blocks keep their structure visible, and pasted documentation keeps more of the information users expected to copy.

### User-Facing Improvements

#### Writing and Editing

- Mermaid code fences render as centered WYSIWYG diagrams when inactive, then reveal the original source when activated.
- HTML `<details>` blocks render as collapsible WYSIWYG disclosures with Markdown body rendering for lists, tables, and code.
- WYSIWYG gutter behavior now hides the source-only lines used by rendered Mermaid and details blocks without disturbing the editable source when selected.

#### Markdown Workspace

- Pasted Qiita link-card iframes now become normal Markdown autolinks so documentation references remain usable after paste.
- Copying collapsed details from preview now keeps the hidden body instead of producing a summary-only fragment.

#### Performance and Reliability

- Mermaid rendering now reuses the shared renderer for preview, export, and WYSIWYG surfaces.
- Mermaid SVGs stay within the editor width and scroll horizontally for oversized diagrams.
- The editor warns when a browser clipboard payload omitted the body of a collapsed details block.
- i18n initialization now works in the Node test runtime without browser storage.

#### AI and Writing Quality

- No AI workflow changes in this release; the focus is Markdown rendering fidelity and clipboard reliability.

### Recommended Screenshots For Release Page

- WYSIWYG Mermaid diagram rendered inline beside equivalent preview output
- WYSIWYG `<details>` disclosure opened and collapsed
- Preview copy/paste flow for a documentation page with collapsed details and a Qiita link card

### Suggested "Upgrade Notes" Section

- Users who write Mermaid diagrams in WYSIWYG mode should now see rendered diagrams without switching to preview.
- Users copying from documentation pages should see fewer missing disclosure bodies and dropped link cards.

### Suggested "Who Should Update" Section

This release is especially relevant for users who:

- write Mermaid-heavy Markdown documents
- paste technical documentation from web pages
- rely on WYSIWYG and preview staying visually consistent
- use HTML `<details>` blocks in Markdown notes

## Packaging Checklist Before Release

- Run `npm run release:prepare -- 0.18.6` to sync the app version files and roll the current `## Unreleased` notes into a dated changelog section.
- Confirm the final version in:
  - `package.json`
  - `src-tauri/tauri.conf.json`
  - `src-tauri/Cargo.toml`
- Run `npm run release:validate` after the version bump so local metadata checks, changelog checks, and scaffold-placeholder checks fail before CI does.
- Run `npm run release:notes:preview -- 0.18.6` if you want to inspect the generated GitHub release body before pushing the tag.
- Capture fresh screenshots if the release page will highlight WYSIWYG Mermaid diagrams or details blocks.
- After the release is published, run `npm run release:draft:advance -- 0.18.6` to reset this file and refresh `CHANGELOG.md` `## Unreleased` for the next release cycle.
