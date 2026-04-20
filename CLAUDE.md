# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

用中文回复

## Mission and Product Principles

See `AGENTS.md` for the non-negotiable product principles. Key rules:

- Must support Windows, macOS, Linux and Japanese, English, Chinese.
- Study Typora, Obsidian, VS Code Markdown, Bear, iA Writer, Notion — adapt, don't copy. `Typora Markdown Reference` is the primary reference for Markdown behavior.
- `references/` contains competitor reference material. Study but never copy/modify directly.
- When code or product behavior changes, update the corresponding tests in the same change.

## Commands

Dev servers (run `npm install` separately in each OS environment — `@tauri-apps/cli` uses platform-specific optional deps and `node_modules` is not portable across Windows/WSL/macOS):

- `npm run dev` — desktop app via Tauri dev (frontend hot-reloads; `src-tauri` changes restart Rust). Uses `scripts/run-tauri.mjs`, which auto-detects the right `@tauri-apps/cli-*` binary and locks dev port 1420.
- `npm run dev:web` — browser-only Vite preview (no Tauri host; `window.__TAURI_INTERNALS__` gating in `App.tsx` degrades fs features gracefully).
- `npm run build` — `tsc && vite build`. Playwright smoke scripts depend on this output.

Tests — `npm test` runs `scripts/run-tests.mjs`, which collects every `tests/**/*.test.ts` and runs them under `node --experimental-strip-types --test` (Node's built-in runner on TypeScript, no Jest/Vitest).

- Run a single test file: `node --experimental-strip-types --test tests/<name>.test.ts`
- Filter by test name within a file: append `--test-name-pattern "<regex>"`

Playwright smoke suites (each builds first, then drives the built preview):

- `npm run test:ai:smoke` — full AI flow: command palette, sidebar entry, selection bubble, inline ghost text, provenance markers, fallback, cancellation, Apply/New Note, undo, compatibility across Source/Split/Preview/Focus/WYSIWYG modes.
- `npm run test:ai:integration:smoke` — AI smoke + keyboard-only smoke in one pass.
- `npm run test:ai:i18n:smoke` — AI UI labels/layout in EN/JA/ZH.
- `npm run test:ai:keyboard:smoke` — keyboard-only `Ctrl/Cmd+J → Run → Apply`, streamed draft isolation, focus return.
- `npm run test:ai:manual:qa:capture` — regenerate locale/mode QA artifacts under `output/playwright/ai-manual-qa/`.
- `npm run test:copy:smoke` / `test:paste:smoke` — clipboard flows.
- `npm run test:source:smoke` — source-editor typing / plain paste / AI Apply keep viewport near active cursor (no snap-to-top).

Packaging — `npm run package:win` (Windows, cmd) / `npm run package:mac` (bash).

## Architecture

Tauri v2 desktop shell + Vite/React 18 frontend. Single source of truth for Markdown lives in the frontend; `src-tauri` provides file I/O, image loading (with size limits in `src-tauri/src/lib.rs`: 12 MB remote / 24 MB local), AI proxying (`src-tauri/src/ai.rs`), updates (`update.rs`), and a `single-instance-open-files` event for OS-level "open with" integration.

### Frontend layout (`src/`)

- `components/` — React UI broken out by surface: `Editor/` (CodeMirror 6 host with WYSIWYG decorations), `Preview/` (unified/remark/rehype renderer + scroll-spy), `AI/` (composer, selection bubble, history), `CommandPalette/`, `Sidebar/`, `DocumentTabs/`, `Toolbar/`, `StatusBar/`, `TitleBar/`, `Notifications/`, `ExternalFileConflicts/`, `Updates/`, `ErrorBoundary/`, `Layout/`, `Search/`, `ThemePanel/`, `Icons/`. Large components (`EditorPane`, `MarkdownPreview`, `CommandPalette`, `AIComposer`) are `React.lazy`-loaded in `App.tsx`.
- `store/` — Zustand stores: `editor.ts` (active tab, documents, mode, split state), `ai.ts`, `fileTree.ts`, `notifications.ts`, `recentFiles.ts`, `update.ts`. Prefer stores over prop drilling; components hook in via `useEditorStore`, `useActiveTab`, etc.
- `lib/` — headless logic (no React). Pattern: keep pure utilities here, unit-test them in `tests/`. Notable clusters:
  - Markdown pipeline: `markdown.ts`, `markdownHtml.ts`, `markdownHtmlRender.ts`, `markdownMath*.ts`, `markdownShared.ts`, `markdownWorker*.ts` — the preview renders via a Web Worker (`src/workers/`) using unified → remark-parse → remark-gfm/math/softBreaks → remark-rehype → rehype-raw/sanitize/slug/katex/highlight/shiki → rehype-stringify. Custom rehype plugins: `rehypeHeadingIds`, `rehypeHighlightMarkers`, `rehypeNormalizeImageSources`, `rehypeSuperscriptMarkers`.
  - Editor state: `editorHistory.ts`, `editorInsertion.ts`, `editorScroll.ts`, `editorStateCache.ts`, `editorStats.ts`, `editorTerminalBlankLine.ts`, `focusWidth.ts`.
  - File/workspace: `documentPersistence.ts`, `draftRecovery.ts`, `externalFileChanges.ts`, `fileTreeNavigation.ts`, `fileTreePaths.ts`, `fsAccess.ts`, `desktopFileOpen.ts`, `workspaceSearch.ts`.
  - Preview/clipboard: `preview*.ts`, `clipboard.ts`, `clipboardHtml.ts`, `pasteHtml.ts`, `previewClipboard.ts`, `previewScrollSpy.ts`.
  - `ai/` — large, structured subsystem (see below).
  - `update.ts` / `updateActions.ts` — in-app update flow against GitHub releases.
- `hooks/` — React glue: `useAutoSave`, `useDocumentDrop`, `useExternalFileChanges`, `useFileOps`.
- `i18n/` — i18next with JA/EN/ZH resources. AI and Update surfaces have dedicated i18n completeness tests (`ai-i18n-completeness.test.ts`, `update-i18n-completeness.test.ts`) — every user-facing string must exist in all three locales or those tests fail.
- `themes/` — theme tokens applied via CSS custom properties (`--editor-bg`, `--preview-bg`, etc.).
- `workers/` — Web Workers for off-main-thread markdown rendering and heavy parsing.
- `generated/` — build-time generated assets (e.g. inlined KaTeX CSS from `scripts/generate-katex-inline-css.mjs`).

### AI subsystem (`src/lib/ai/`)

Independent of the editor core, wired in via events (`events.ts`, `dispatchEditorAIOpen`) and the `useAIStore`. Flow:

1. `opening.ts` / `selectionBubble.ts` / `slashCommands.ts` / `quickActions.ts` determine entry and output target.
2. `context.ts` + `contextChips.ts` + `mentions.ts` + `retrievalMetadata.ts` build the context packet (selection, current block, workspace mentions, retrieval metadata).
3. `prompt.ts` + `templateLibrary.ts` compose the prompt; `provider.ts` + `client.ts` call the model (proxied through `src-tauri/src/ai.rs` when in Tauri).
4. Streaming results flow through `thread.ts` → `resultViews.ts` / `ghostText.ts` / `diffPresentation.ts`.
5. `apply.ts` + `provenance.ts` apply output back into the document with undo-safe history markers.
6. `history*.ts` + `providerHistory*.ts` + `workspaceExecution.ts` persist and audit runs; `historyArchiveFile.ts` and `historyWorkspaceHandoff.ts` cover cross-workspace handoff.

Anything touching AI flows almost certainly needs matching updates to tests in `tests/ai-*.test.ts` — there are ~35 of them and they enforce wiring, prompt shape, apply paths, history retrieval, i18n, and UI contracts.

### Tauri shell (`src-tauri/src/`)

- `main.rs` — entry; delegates to `lib.rs`.
- `lib.rs` — Tauri commands for file read/write (text and binary), copy, remote/local image loading with size caps, and emitting `single-instance-open-files` to the frontend.
- `ai.rs` — AI provider HTTP proxy so API keys never touch the renderer.
- `update.rs` — update check/download.

Versioning is triple-pinned: keep `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml` in sync. Release is tag-driven via `.github/workflows/release.yml` — pushing `vX.Y.Z` builds Win x64, universal macOS (unsigned, `--target universal-apple-darwin --no-sign`), and Linux x64, and the workflow fails fast if the tag does not match the app version.

### Testing conventions

- Pure logic goes in `src/lib/` and gets a `tests/<name>.test.ts` sibling using the built-in `node:test` API (no test framework import — uses `--experimental-strip-types`).
- Playwright smokes are separate (`scripts/run-*-smoke.mjs`) and always build first; they exercise the built `dist/` via `vite preview`.
- When adding UI state or stores, prefer a `*-wiring.test.ts` that asserts the event/store contract rather than a component render test.
