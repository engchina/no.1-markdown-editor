import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { chromium } from '@playwright/test'

const DIST_DIR = resolve('dist')
const HOST = '127.0.0.1'
const LOCAL_STORAGE_KEY = 'editor-settings'
const SOURCE_SMOKE_TAB_ID = 'source-smoke-tab'
const FAILURE_SCREENSHOT_PATH = resolve('output/playwright/source-interaction-smoke-failure.png')
const SOURCE_SMOKE_LINES = Array.from({ length: 90 }, (_unused, index) => `line ${String(index + 1).padStart(3, '0')}`)
const SOURCE_SMOKE_MARKDOWN = SOURCE_SMOKE_LINES.join('\n')
const TARGET_LINE_NUMBER = 72
const TARGET_LINE_TEXT = SOURCE_SMOKE_LINES[TARGET_LINE_NUMBER - 1]
const TERMINAL_BLANK_LINE_MARKDOWN = '# terminal heading\nplain tail'
const TERMINAL_BLANK_LINE_LAST_LINE = 'plain tail'
const TERMINAL_TABLE_MARKDOWN = ['| Left | Right |', '| --- | ---: |', '| tail | done |'].join('\n')
const TABLE_KEYBOARD_MARKDOWN = [
  '| Left | Right |',
  '| --- | ---: |',
  '| alpha | beta |',
  '| gamma | delta |',
  'after table',
].join('\n')
const TABLE_BACKSPACE_MARKDOWN = [
  '| Left | Right |',
  '| --- | ---: |',
  '| alpha |  |',
  '| gamma | delta |',
  'after table',
].join('\n')
const TABLE_FIRST_CELL_BACKSPACE_MARKDOWN = [
  '|  | Right |',
  '| --- | ---: |',
  '| alpha | beta |',
  'after table',
].join('\n')
const TABLE_DELETE_MARKDOWN = [
  '| Left | Right |',
  '| --- | ---: |',
  '|  | beta |',
  '| gamma | delta |',
  'after table',
].join('\n')
const ORDINARY_INSERTION = ' ordinary smoke'
const PASTE_INSERTION = ' paste smoke'
const AI_INSERTION = ' ai smoke'

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

function buildPersistedEditorState(options = {}) {
  const {
    content = SOURCE_SMOKE_MARKDOWN,
    name = 'SourceInteractionSmoke.md',
    wysiwygMode = false,
    extraTabs = [],
  } = options

  return {
    state: {
      viewMode: 'source',
      sidebarWidth: 220,
      sidebarOpen: true,
      sidebarTab: 'outline',
      editorRatio: 0.5,
      lineNumbers: true,
      wordWrap: true,
      fontSize: 14,
      typewriterMode: false,
      wysiwygMode,
      activeThemeId: 'default-light',
      tabs: [
        {
          id: SOURCE_SMOKE_TAB_ID,
          path: null,
          name,
          content,
          savedContent: content,
          isDirty: false,
        },
        ...extraTabs,
      ],
      activeTabId: SOURCE_SMOKE_TAB_ID,
    },
    version: 0,
  }
}

function isWithinRoot(rootDir, candidatePath) {
  const normalizedRoot = normalize(rootDir.endsWith(sep) ? rootDir : `${rootDir}${sep}`)
  const normalizedCandidate = normalize(candidatePath)
  return normalizedCandidate.startsWith(normalizedRoot) || normalizedCandidate === normalize(rootDir)
}

async function createStaticDistServer(rootDir) {
  await stat(join(rootDir, 'index.html'))

  const server = createServer(async (request, response) => {
    try {
      const requestedPath = decodeURIComponent((request.url ?? '/').split('?')[0] || '/')
      const relativePath = requestedPath === '/' ? 'index.html' : requestedPath.replace(/^\/+/u, '')
      const absolutePath = resolve(rootDir, relativePath)

      if (!isWithinRoot(rootDir, absolutePath)) {
        response.writeHead(403).end('Forbidden')
        return
      }

      const fileInfo = await stat(absolutePath)
      const finalPath = fileInfo.isDirectory() ? join(absolutePath, 'index.html') : absolutePath
      const body = await readFile(finalPath)
      const contentType = MIME_TYPES[extname(finalPath)] ?? 'application/octet-stream'

      response.writeHead(200, {
        'Cache-Control': 'no-store',
        'Content-Type': contentType,
      })
      response.end(body)
    } catch {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      response.end('Not found')
    }
  })

  await new Promise((resolveServer, rejectServer) => {
    server.once('error', rejectServer)
    server.listen(0, HOST, () => resolveServer())
  })

  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('Source interaction smoke server did not expose a usable TCP port')
  }

  return {
    close: () =>
      new Promise((resolveClose, rejectClose) => {
        server.close((error) => {
          if (error) rejectClose(error)
          else resolveClose()
        })
      }),
    origin: `http://${HOST}:${address.port}`,
  }
}

async function launchSmokeBrowser() {
  const launchAttempts = [
    { label: 'bundled Chromium', options: { headless: true } },
    ...(process.platform === 'win32' ? [{ label: 'Microsoft Edge', options: { channel: 'msedge', headless: true } }] : []),
    { label: 'Google Chrome', options: { channel: 'chrome', headless: true } },
    ...(process.platform !== 'win32' ? [{ label: 'Microsoft Edge', options: { channel: 'msedge', headless: true } }] : []),
  ]

  const failures = []
  for (const attempt of launchAttempts) {
    try {
      const browser = await chromium.launch(attempt.options)
      return { browser, browserLabel: attempt.label }
    } catch (error) {
      failures.push(`${attempt.label}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  throw new Error(
    [
      'Unable to launch a browser for the source interaction smoke test.',
      ...failures.map((failure) => `- ${failure}`),
      'Install Playwright Chromium or ensure a Chrome/Edge channel is available.',
    ].join('\n')
  )
}

async function waitForCondition(predicate, description, timeoutMs = 15000, stepMs = 50) {
  const start = Date.now()

  while (Date.now() - start < timeoutMs) {
    if (await predicate()) return
    await new Promise((resolveWait) => setTimeout(resolveWait, stepMs))
  }

  throw new Error(`Timed out waiting for ${description}`)
}

async function saveFailureArtifacts(page, error, consoleMessages, pageErrors, diagnostics = {}) {
  await mkdir(resolve('output/playwright'), { recursive: true })

  if (page) {
    try {
      await page.screenshot({ path: FAILURE_SCREENSHOT_PATH, fullPage: true })
    } catch {
      // Ignore secondary failures while persisting failure context.
    }
  }

  const diagnosticText = [
    `Error: ${error instanceof Error ? error.stack ?? error.message : String(error)}`,
    '',
    'Console errors:',
    ...(consoleMessages.length > 0 ? consoleMessages : ['(none)']),
    '',
    'Page errors:',
    ...(pageErrors.length > 0 ? pageErrors : ['(none)']),
    '',
    'Diagnostics:',
    JSON.stringify(diagnostics, null, 2),
  ].join('\n')

  await writeFile(resolve('output/playwright/source-interaction-smoke-failure.txt'), diagnosticText, 'utf8')
}

async function resetEditor(page, options = {}) {
  // Seed via addInitScript instead of evaluate-before-reload: the init script
  // runs after the old page (and its debounced persistence flush) is gone and
  // before any app code, so the seeded state can never be clobbered by writes
  // from the outgoing page. Scripts accumulate across resets and run in
  // registration order, so the latest seed wins.
  await page.addInitScript(({ persistedState, storageKey }) => {
    localStorage.clear()
    localStorage.setItem(storageKey, JSON.stringify(persistedState))
    localStorage.setItem('language', 'en')
  }, {
    persistedState: buildPersistedEditorState(options),
    storageKey: LOCAL_STORAGE_KEY,
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.cm-content')
}

async function readEditorSnapshot(page) {
  return page.evaluate(() => {
    const content = document.querySelector('.cm-content')
    const view = content?.cmTile?.root?.view
    if (!view) return null

    const selection = view.state.selection.main
    const line = view.state.doc.lineAt(selection.head)
    const lineBlock = view.lineBlockAt(selection.head)
    const scroller = view.scrollDOM
    const editor = document.querySelector('.cm-editor')
    const activeElement = document.activeElement
    const activeTableInput =
      activeElement instanceof HTMLTextAreaElement &&
        activeElement.classList.contains('cm-wysiwyg-table__input')
        ? activeElement
        : null

    return {
      docText: view.state.doc.toString(),
      lineCount: view.state.doc.lines,
      lineNumber: line.number,
      lineText: line.text,
      column: selection.head - line.from + 1,
      selectionHead: selection.head,
      lastLineText: view.state.doc.line(view.state.doc.lines).text,
      scrollTop: scroller.scrollTop,
      scrollLeft: scroller.scrollLeft,
      scrollHeight: scroller.scrollHeight,
      clientHeight: scroller.clientHeight,
      defaultLineHeight: view.defaultLineHeight,
      bottomGap: scroller.scrollTop + scroller.clientHeight - lineBlock.bottom,
      activeTagName: activeElement?.tagName ?? '',
      activeClassName: activeElement instanceof Element ? activeElement.className : '',
      activeIsInEditor: !!(activeElement && editor instanceof HTMLElement && editor.contains(activeElement)),
      hasWysiwygHeading: document.querySelector('.cm-wysiwyg-h1') !== null,
      hasWysiwygTable: document.querySelector('.cm-wysiwyg-table') !== null,
      hasTableInputFocus: activeTableInput !== null,
      activeTableSection: activeTableInput?.dataset.tableSection ?? null,
      activeTableRowIndex: activeTableInput ? Number(activeTableInput.dataset.tableRowIndex) : null,
      activeTableColumnIndex: activeTableInput ? Number(activeTableInput.dataset.tableColumnIndex) : null,
      activeTableValue: activeTableInput?.value ?? null,
      activeTableSelectionStart: activeTableInput?.selectionStart ?? null,
      activeTableSelectionEnd: activeTableInput?.selectionEnd ?? null,
    }
  })
}

async function readActiveElementSnapshot(page) {
  return page.evaluate(() => {
    const activeElement = document.activeElement
    const editor = document.querySelector('.cm-editor')

    return {
      tagName: activeElement?.tagName ?? '',
      isInEditor: !!(activeElement && editor instanceof HTMLElement && editor.contains(activeElement)),
    }
  })
}

async function placeCursorAtLineEnd(page, targetLineText) {
  await page.evaluate(({ lineText }) => {
    const content = document.querySelector('.cm-content')
    const view = content?.cmTile?.root?.view
    if (!view) throw new Error('Unable to resolve the CodeMirror editor view from the DOM')

    const docText = view.state.doc.toString()
    const lineIndex = docText.indexOf(lineText)
    if (lineIndex < 0) {
      throw new Error(`Unable to find target line in the editor document: ${lineText}`)
    }

    const anchor = lineIndex + lineText.length
    view.focus()
    const scrollIntoView = view.constructor?.scrollIntoView
    view.dispatch({
      selection: { anchor },
      effects:
        typeof scrollIntoView === 'function'
          ? scrollIntoView(anchor, { y: 'center' })
          : undefined,
    })
  }, { lineText: targetLineText })

  await waitForCondition(
    async () => (await readActiveElementSnapshot(page))?.isInEditor === true,
    'editor focus after moving the CodeMirror cursor'
  )

  await waitForCondition(
    async () => (await readEditorSnapshot(page))?.lineText === targetLineText,
    'editor cursor to land on the target line'
  )

  await waitForCondition(async () => {
    const snapshot = await readEditorSnapshot(page)
    if (!snapshot) return false
    const minimumMeaningfulScroll = Math.max(snapshot.defaultLineHeight * 8, 80)
    return snapshot.scrollTop >= minimumMeaningfulScroll
  }, 'editor viewport to settle around the moved cursor')
}

async function placeCursorAtDocumentEnd(page) {
  await page.evaluate(() => {
    const content = document.querySelector('.cm-content')
    const view = content?.cmTile?.root?.view
    if (!view) throw new Error('Unable to resolve the CodeMirror editor view from the DOM')

    const anchor = view.state.doc.length
    view.focus()
    const scrollIntoView = view.constructor?.scrollIntoView
    view.dispatch({
      selection: { anchor },
      effects:
        typeof scrollIntoView === 'function'
          ? scrollIntoView(anchor, { y: 'end', yMargin: Math.round(view.defaultLineHeight * 2) })
          : undefined,
    })
  })

  await waitForCondition(
    async () => (await readActiveElementSnapshot(page))?.isInEditor === true,
    'editor focus after moving the CodeMirror cursor to EOF'
  )

  await waitForCondition(async () => {
    const snapshot = await readEditorSnapshot(page)
    return !!snapshot && snapshot.selectionHead === snapshot.docText.length
  }, 'editor cursor to land on EOF')
}

async function waitForWysiwygHeading(page, description) {
  await waitForCondition(async () => {
    const snapshot = await readEditorSnapshot(page)
    return snapshot?.hasWysiwygHeading === true
  }, description)
}

async function resolveBelowDocumentEndClickPoint(page) {
  return page.evaluate(() => {
    const content = document.querySelector('.cm-content')
    const view = content?.cmTile?.root?.view
    if (!view) throw new Error('Unable to resolve the CodeMirror editor view from the DOM')

    const endCoords = view.coordsAtPos(view.state.doc.length)
    if (!endCoords) {
      throw new Error('Unable to resolve EOF coordinates from the CodeMirror editor view')
    }

    const scrollerRect = view.scrollDOM.getBoundingClientRect()
    const lineHeight = Math.max(view.defaultLineHeight, 18)
    const clickY = Math.min(scrollerRect.bottom - 4, endCoords.bottom + Math.round(lineHeight * 1.35))
    const clickX = Math.round(
      Math.max(scrollerRect.left + 96, Math.min(endCoords.left + 12, scrollerRect.right - 40))
    )

    return {
      x: clickX,
      y: Math.round(clickY),
      documentEndBottom: endCoords.bottom,
      scrollerBottom: scrollerRect.bottom,
    }
  })
}

async function seedClipboardWithText(page, text) {
  await page.evaluate(async (clipboardText) => {
    await navigator.clipboard.writeText(clipboardText)
  }, text)
}

async function dispatchPlainTextPaste(page, text) {
  await page.evaluate((clipboardText) => {
    const content = document.querySelector('.cm-content')
    if (!(content instanceof HTMLElement)) {
      throw new Error('Unable to resolve the CodeMirror content DOM for the paste scenario')
    }

    const data = new DataTransfer()
    data.setData('text/plain', clipboardText)

    const pasteEvent = new Event('paste', {
      bubbles: true,
      cancelable: true,
    })
    Object.defineProperty(pasteEvent, 'clipboardData', {
      configurable: true,
      value: data,
    })

    content.dispatchEvent(pasteEvent)
  }, text)
}

async function dispatchAIApplyAtCursor(page, text) {
  await page.evaluate(({ insertionText, tabId }) => {
    const content = document.querySelector('.cm-content')
    const view = content?.cmTile?.root?.view
    if (!view) throw new Error('Unable to resolve the CodeMirror editor view from the DOM')

    const selection = view.state.selection.main
    const docText = view.state.doc.toString()
    const anchorOffset = selection.head

    document.dispatchEvent(
      new CustomEvent('editor:ai-apply', {
        detail: {
          tabId,
          outputTarget: 'at-cursor',
          text: insertionText,
          snapshot: {
            tabId,
            selectionFrom: selection.from,
            selectionTo: selection.to,
            anchorOffset,
            blockFrom: anchorOffset,
            blockTo: anchorOffset,
            docText,
          },
        },
      })
    )
  }, { insertionText: text, tabId: SOURCE_SMOKE_TAB_ID })
}

function assertViewportStayedNearCursor(before, after, label) {
  const minimumMeaningfulScroll = Math.max(before.defaultLineHeight * 8, 80)
  assert.ok(
    before.scrollTop >= minimumMeaningfulScroll,
    `${label} precondition should start away from the top (before: ${JSON.stringify(before)})`
  )
  assert.ok(
    after.scrollTop >= minimumMeaningfulScroll,
    `${label} should not jump back to the top (after: ${JSON.stringify(after)})`
  )
  assert.ok(
    after.scrollTop >= before.scrollTop - before.defaultLineHeight * 4,
    `${label} should stay near the previous viewport (before: ${JSON.stringify(before)}, after: ${JSON.stringify(after)})`
  )
  assert.ok(
    Math.abs(after.scrollLeft - before.scrollLeft) <= 2,
    `${label} should not shift horizontally (before: ${JSON.stringify(before)}, after: ${JSON.stringify(after)})`
  )
}

function assertCursorBottomGap(snapshot, label) {
  const minimumBottomGap = snapshot.defaultLineHeight * 3 - 8
  assert.ok(
    snapshot.bottomGap >= minimumBottomGap,
    `${label} should keep about three lines below the cursor (snapshot: ${JSON.stringify(snapshot)})`
  )
}

function isViewportStable(before, snapshot, options = {}) {
  const { requireBottomGap = false } = options
  const minimumMeaningfulScroll = Math.max(before.defaultLineHeight * 8, 80)
  const minimumBottomGap = snapshot.defaultLineHeight * 3 - 8

  return (
    snapshot.scrollTop >= minimumMeaningfulScroll &&
    snapshot.scrollTop >= before.scrollTop - before.defaultLineHeight * 4 &&
    Math.abs(snapshot.scrollLeft - before.scrollLeft) <= 2 &&
    (!requireBottomGap || snapshot.bottomGap >= minimumBottomGap)
  )
}

async function waitForViewportStability(page, expectedLineText, before, label, options = {}) {
  await waitForCondition(async () => {
    const snapshot = await readEditorSnapshot(page)
    if (!snapshot || snapshot.lineText !== expectedLineText) return false

    return isViewportStable(before, snapshot, options)
  }, `${label} viewport stability`)
}

function assertTerminalBlankLineInserted(snapshot, expectedDocText, label) {
  assert.ok(snapshot, `${label} should produce an editor snapshot`)
  assert.equal(snapshot.docText, expectedDocText, `${label} should append exactly one trailing newline`)
  assert.equal(snapshot.lineText, '', `${label} should land on the new blank line`)
  assert.equal(snapshot.lastLineText, '', `${label} should expose a terminal blank line`)
  assert.equal(snapshot.lineNumber, snapshot.lineCount, `${label} should land on the final line`)
  assert.equal(snapshot.column, 1, `${label} should place the caret at column 1 of the blank line`)
  assert.equal(snapshot.selectionHead, expectedDocText.length, `${label} should keep the caret at EOF`)
  assert.equal(snapshot.activeIsInEditor, true, `${label} should keep focus inside the editor`)
}

async function waitForTerminalBlankLineState(page, expectedDocText, label) {
  await waitForCondition(async () => {
    const snapshot = await readEditorSnapshot(page)
    return (
      !!snapshot &&
      snapshot.docText === expectedDocText &&
      snapshot.lineText === '' &&
      snapshot.lastLineText === '' &&
      snapshot.column === 1 &&
      snapshot.lineNumber === snapshot.lineCount &&
      snapshot.selectionHead === expectedDocText.length &&
      snapshot.activeIsInEditor === true
    )
  }, `${label} terminal blank line state`)
}

async function waitForTableInput(page, description) {
  await waitForCondition(async () => {
    const snapshot = await readEditorSnapshot(page)
    return snapshot?.hasTableInputFocus === true
  }, description)
}

function buildRenderedTableCellSelector(options) {
  const {
    section = 'body',
    rowIndex,
    columnIndex,
  } = options

  const baseClass = section === 'head' ? '.cm-wysiwyg-table__head-cell' : '.cm-wysiwyg-table__cell'
  return `${baseClass}[data-table-section="${section}"][data-table-row-index="${rowIndex}"][data-table-column-index="${columnIndex}"]`
}

async function activateTableCell(page, options) {
  const selector = buildRenderedTableCellSelector(options)
  await page.locator(selector).click()
  await waitForCondition(async () => {
    const snapshot = await readEditorSnapshot(page)
    return (
      snapshot?.hasTableInputFocus === true &&
      snapshot.activeTableSection === (options.section ?? 'body') &&
      snapshot.activeTableRowIndex === options.rowIndex &&
      snapshot.activeTableColumnIndex === options.columnIndex
    )
  }, `${selector} inline table input`)
}

async function waitForActiveTableInputState(page, expected, description) {
  await waitForCondition(async () => {
    const snapshot = await readEditorSnapshot(page)
    if (!snapshot || snapshot.hasTableInputFocus !== true) return false
    if (expected.section !== undefined && snapshot.activeTableSection !== expected.section) return false
    if (expected.rowIndex !== undefined && snapshot.activeTableRowIndex !== expected.rowIndex) return false
    if (expected.columnIndex !== undefined && snapshot.activeTableColumnIndex !== expected.columnIndex) return false
    if (expected.value !== undefined && snapshot.activeTableValue !== expected.value) return false
    if (expected.selectionStart !== undefined && snapshot.activeTableSelectionStart !== expected.selectionStart) return false
    if (expected.selectionEnd !== undefined && snapshot.activeTableSelectionEnd !== expected.selectionEnd) return false
    return true
  }, description)
}

async function readRenderedTableCellHtml(page, options) {
  const selector = buildRenderedTableCellSelector(options)
  return page.evaluate((query) => {
    const cell = document.querySelector(query)
    return cell?.innerHTML ?? null
  }, selector)
}

async function waitForRestoredViewport(page, before, label) {
  await waitForCondition(async () => {
    const snapshot = await readEditorSnapshot(page)
    return (
      snapshot?.lineText === before.lineText &&
      snapshot.selectionHead === before.selectionHead &&
      Math.abs(snapshot.scrollTop - before.scrollTop) <= snapshot.defaultLineHeight * 2
    )
  }, `${label} to restore the editor cursor and viewport`)
}

async function runRemountViewportRestoreScenario(page, diagnostics) {
  // Both tabs are long so a viewport leaking between files is detectable.
  const otherLines = Array.from({ length: 90 }, (_unused, index) => `other ${String(index + 1).padStart(3, '0')}`)
  const otherContent = otherLines.join('\n')
  await resetEditor(page, {
    extraTabs: [
      {
        id: 'source-smoke-other-tab',
        path: null,
        name: 'OtherTab.md',
        content: otherContent,
        savedContent: otherContent,
        isDirty: false,
      },
    ],
  })
  await placeCursorAtLineEnd(page, TARGET_LINE_TEXT)
  const before = await readEditorSnapshot(page)
  diagnostics.remountRestoreBefore = before

  await page.click('[role="tab"][title="OtherTab.md"]')
  await waitForCondition(
    async () => (await readEditorSnapshot(page))?.docText === otherContent,
    'the other tab to become active'
  )
  // Give any late scroll restoration a chance to leak in before asserting.
  await page.waitForTimeout(300)
  const otherFirstVisit = await readEditorSnapshot(page)
  diagnostics.remountRestoreOtherFirstVisit = otherFirstVisit
  assert.ok(
    otherFirstVisit.scrollTop < otherFirstVisit.defaultLineHeight,
    `A never-visited tab should open at the top, got scrollTop=${otherFirstVisit.scrollTop}`
  )

  await placeCursorAtLineEnd(page, otherLines[39])
  const otherBefore = await readEditorSnapshot(page)

  await page.click('[role="tab"][title="SourceInteractionSmoke.md"]')
  await waitForRestoredViewport(page, before, 'tab switch')
  diagnostics.remountRestoreAfterTab = await readEditorSnapshot(page)

  await page.click('[role="tab"][title="OtherTab.md"]')
  await waitForRestoredViewport(page, otherBefore, 'switching back to the other tab')
  await page.click('[role="tab"][title="SourceInteractionSmoke.md"]')
  await waitForRestoredViewport(page, before, 'second tab switch')

  for (const mode of ['preview', 'split']) {
    await page.click(`button:has([data-view-mode="${mode}"])`)
    if (mode === 'preview') {
      await waitForCondition(
        async () => (await page.locator('.cm-content').count()) === 0,
        'preview mode to unmount the editor'
      )
    }
    await page.click('button:has([data-view-mode="source"])')
    await page.waitForSelector('.cm-content')
    await waitForRestoredViewport(page, before, `${mode} -> source switch`)
  }
}

async function runPreviewPerTabScrollScenario(page) {
  const paragraphs = (prefix) =>
    Array.from({ length: 120 }, (_unused, index) => `${prefix} paragraph ${index + 1}`).join('\n\n')
  const firstContent = paragraphs('first')
  const otherContent = paragraphs('other')
  await resetEditor(page, {
    content: firstContent,
    extraTabs: [
      {
        id: 'source-smoke-preview-other-tab',
        path: null,
        name: 'OtherTab.md',
        content: otherContent,
        savedContent: otherContent,
        isDirty: false,
      },
    ],
  })
  await page.click('button:has([data-view-mode="preview"])')

  const readPreview = () =>
    page.evaluate(() => {
      const preview = document.querySelector('.markdown-preview')
      return preview ? { text: preview.textContent ?? '', scrollTop: preview.scrollTop } : null
    })
  const setPreviewScrollTop = (top) =>
    page.evaluate((value) => {
      document.querySelector('.markdown-preview').scrollTop = value
    }, top)
  const waitForPreview = async (marker, scrollTop, label) => {
    await waitForCondition(async () => {
      const preview = await readPreview()
      return !!preview && preview.text.includes(marker) && Math.abs(preview.scrollTop - scrollTop) <= 2
    }, label)
  }

  await waitForPreview('first paragraph 120', 0, 'the first tab preview to render')
  await setPreviewScrollTop(1200)

  await page.click('[role="tab"][title="OtherTab.md"]')
  await waitForPreview('other paragraph 120', 0, 'a never-visited tab preview to open at the top')
  await page.waitForTimeout(300)
  assert.ok((await readPreview()).scrollTop <= 2, 'Preview scroll leaked from the previous tab')
  await setPreviewScrollTop(600)

  await page.click('[role="tab"][title="SourceInteractionSmoke.md"]')
  await waitForPreview('first paragraph 120', 1200, 'the first tab preview to restore its own scroll')
  await page.click('[role="tab"][title="OtherTab.md"]')
  await waitForPreview('other paragraph 120', 600, 'the other tab preview to restore its own scroll')

  await page.click('button:has([data-view-mode="source"])')
  await page.waitForSelector('.cm-content')
  await page.click('button:has([data-view-mode="preview"])')
  await waitForPreview('other paragraph 120', 600, 'the preview to restore scroll after a mode switch')
}

async function readEditorTopElement(page) {
  return page.evaluate(() => {
    const view = document.querySelector('.cm-content')?.cmTile?.root?.view
    if (!view) return null
    const viewportTop = view.scrollDOM.getBoundingClientRect().top
    for (const element of view.contentDOM.children) {
      const rect = element.getBoundingClientRect()
      if (rect.height > 0 && rect.bottom > viewportTop) {
        return { pos: view.posAtDOM(element), offset: rect.top - viewportTop }
      }
    }
    return null
  })
}

async function waitForEditorTopElement(page, expected, label) {
  await waitForCondition(async () => {
    const actual = await readEditorTopElement(page)
    return actual?.pos === expected.pos && Math.abs(actual.offset - expected.offset) <= 2
  }, `${label} to keep the exact editor viewport`)
}

// After a remount CodeMirror only knows estimated heights for lines it has not
// rendered yet. When its measure replaces those estimates (images, wrapped
// paragraphs) it compensates scrollTop on its own, without resizing anything
// the pin observes. The restored viewport must absorb such scrolls.
async function runRestoredViewportCompensationScenario(page) {
  const content = Array.from({ length: 120 }, (_unused, index) =>
    [`## section ${index + 1}`, '', `paragraph ${index + 1} ${'wrapped text '.repeat(40)}`, ''].join('\n')
  ).join('\n')
  const otherContent = 'other tab\n\nshort content'
  await resetEditor(page, {
    content,
    extraTabs: [
      {
        id: 'source-smoke-compensation-other-tab',
        path: null,
        name: 'OtherTab.md',
        content: otherContent,
        savedContent: otherContent,
        isDirty: false,
      },
    ],
  })

  const box = await page.locator('.cm-scroller').boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  for (let index = 0; index < 8; index += 1) {
    await page.mouse.wheel(0, 400)
    await page.waitForTimeout(30)
  }
  await page.waitForTimeout(500)
  const expected = await readEditorTopElement(page)

  await page.click('[role="tab"][title="OtherTab.md"]')
  await waitForCondition(
    async () => (await readEditorSnapshot(page))?.docText === otherContent,
    'the other tab to become active'
  )
  await page.click('[role="tab"][title="SourceInteractionSmoke.md"]')
  await waitForEditorTopElement(page, expected, 'returning to the long tab')

  // What CodeMirror's measure does after replacing height estimates.
  await page.evaluate(() => {
    document.querySelector('.cm-scroller').scrollTop += 400
  })
  await waitForEditorTopElement(page, expected, 'a non-user scroll right after the restore')
}

// WYSIWYG renders images and Mermaid diagrams after the view is built; they grow
// their lines once loaded. The view must stay put on blur and come back to the exact same spot after remounts.
async function runWysiwygImageViewportScenario(page) {
  await page.route('**/viewport-smoke-images/**', async (route) => {
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 400))
    await route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="#8ac"/></svg>',
    })
  })
  // Slow the Mermaid chunks so diagrams land after CodeMirror's last measure.
  await page.route('**/assets/mermaid.core-*.js', async (route) => {
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 800))
    await route.continue()
  })
  const origin = new URL(page.url()).origin
  const sections = Array.from({ length: 40 }, (_unused, index) => [
    `## section ${index + 1}`,
    `paragraph ${index + 1}`,
    '```js',
    `const value = ${index + 1}`,
    '```',
    `![pic ${index + 1}](${origin}/viewport-smoke-images/${index + 1}.svg)`,
    '',
    // Mermaid renders asynchronously and grows its widget without a load event.
    '```mermaid',
    `graph TD; A${index}-->B${index}; B${index}-->C${index}; C${index}-->D${index}`,
    '```',
    '',
  ].join('\n'))
  const content = sections.join('\n')
  const otherContent = 'other tab\n\nshort content'
  await resetEditor(page, {
    content,
    wysiwygMode: true,
    extraTabs: [
      {
        id: 'source-smoke-wysiwyg-other-tab',
        path: null,
        name: 'OtherTab.md',
        content: otherContent,
        savedContent: otherContent,
        isDirty: false,
      },
    ],
  })
  await page.evaluate(() => {
    const view = document.querySelector('.cm-content')?.cmTile?.root?.view
    const anchor = view.state.doc.toString().indexOf('paragraph 25')
    view.focus()
    view.dispatch({ selection: { anchor }, effects: view.constructor.scrollIntoView(anchor, { y: 'center' }) })
  })
  // Let every image and diagram in and around the viewport finish rendering.
  await waitForCondition(
    () => page.evaluate(() => document.querySelector('.cm-wysiwyg-mermaid[data-mermaid-state="loading"]') === null),
    'WYSIWYG Mermaid diagrams to render'
  )
  await page.waitForTimeout(800)
  const before = await readEditorTopElement(page)
  assert.ok(before, 'Expected a visible editor line before switching')

  await page.evaluate(() => document.activeElement?.blur())
  await page.waitForTimeout(300)
  await waitForEditorTopElement(page, before, 'blurring the WYSIWYG editor')

  await page.click('[role="tab"][title="OtherTab.md"]')
  await waitForCondition(
    async () => (await readEditorSnapshot(page))?.docText === otherContent,
    'the other tab to become active'
  )
  await page.click('[role="tab"][title="SourceInteractionSmoke.md"]')
  await waitForEditorTopElement(page, before, 'switching back to the WYSIWYG tab')

  await page.click('button:has([data-view-mode="preview"])')
  await waitForCondition(async () => (await page.locator('.cm-content').count()) === 0, 'preview mode')
  await page.click('button:has([data-view-mode="source"])')
  await page.waitForSelector('.cm-content')
  await waitForEditorTopElement(page, before, 'switching back from preview mode')
  await page.unroute('**/viewport-smoke-images/**')
  await page.unroute('**/assets/mermaid.core-*.js')
}

// External content updates (disk reload, AI apply, image-host link rewrite)
// reach the editor through the store. Drive one through the editor's own
// `onChange` prop (EditorPane -> updateTabContent) and make sure the cursor and
// viewport stay on the same text instead of collapsing to the document top.
async function runExternalContentUpdateScenario(page) {
  await resetEditor(page)
  await placeCursorAtLineEnd(page, TARGET_LINE_TEXT)
  const before = await readEditorSnapshot(page)
  const topBefore = await readEditorTopElement(page)

  await page.evaluate(() => {
    const container = document.querySelector('.cm-editor')?.parentElement
    const fiberKey = Object.keys(container).find((key) => key.startsWith('__reactFiber$'))
    let fiber = container[fiberKey]
    while (fiber && !(typeof fiber.memoizedProps?.onChange === 'function' && 'content' in fiber.memoizedProps)) {
      fiber = fiber.return
    }
    if (!fiber) throw new Error('Unable to find the CodeMirrorEditor props')
    const { content, onChange } = fiber.memoizedProps
    onChange(content.replace('line 005', 'line 005 changed outside the editor'))
  })

  await waitForCondition(
    async () => (await readEditorSnapshot(page))?.docText.includes('line 005 changed outside the editor'),
    'the external content update to reach the editor'
  )
  await page.waitForTimeout(200)
  const after = await readEditorSnapshot(page)
  const topAfter = await readEditorTopElement(page)
  assert.equal(after.lineText, before.lineText, 'External updates must keep the cursor on its line')
  assert.equal(after.column, before.column, 'External updates must keep the cursor column')
  assert.ok(
    topAfter && Math.abs(topAfter.offset - topBefore.offset) <= 2 && Math.abs(after.scrollTop - before.scrollTop) <= 2,
    `External updates must keep the viewport (before ${JSON.stringify(topBefore)}, after ${JSON.stringify(topAfter)})`
  )
}

// The sidebar panels share one scroll container: each panel must keep its own
// position instead of inheriting (and clamping away) another panel's offset.
async function runSidebarPanelScrollScenario(page) {
  const headings = Array.from({ length: 150 }, (_unused, index) => `## heading ${index + 1}\n\ntext`).join('\n\n')
  await resetEditor(page, { content: headings })
  const sidebarScroll = page.locator('.sidebar-surface__scroll')
  await page.click('[data-sidebar-tab="outline"]')
  await waitForCondition(
    async () => (await sidebarScroll.evaluate((element) => element.scrollHeight - element.clientHeight)) > 1000,
    'the outline panel to become scrollable'
  )
  await sidebarScroll.evaluate((element) => {
    element.scrollTop = 800
  })
  await page.waitForTimeout(100)

  await page.click('[data-sidebar-tab="recent"]')
  await waitForCondition(
    async () => (await sidebarScroll.evaluate((element) => element.scrollTop)) === 0,
    'the recent panel to open at its own (top) position'
  )
  await page.click('[data-sidebar-tab="outline"]')
  await waitForCondition(
    async () => Math.abs((await sidebarScroll.evaluate((element) => element.scrollTop)) - 800) <= 1,
    'the outline panel to restore its own scroll position'
  )
}

async function runOrdinaryInputScenario(page, diagnostics) {
  await resetEditor(page)
  await placeCursorAtLineEnd(page, TARGET_LINE_TEXT)

  const before = await readEditorSnapshot(page)
  diagnostics.ordinaryBefore = before

  await page.keyboard.type(ORDINARY_INSERTION)

  await waitForViewportStability(page, `${TARGET_LINE_TEXT}${ORDINARY_INSERTION}`, before, 'ordinary typing')

  const after = await readEditorSnapshot(page)
  diagnostics.ordinaryAfter = after

  assert.equal(after?.lineText, `${TARGET_LINE_TEXT}${ORDINARY_INSERTION}`)
  assertViewportStayedNearCursor(before, after, 'Ordinary typing')
}

async function runDeleteKeyScenario(page, diagnostics) {
  await resetEditor(page)
  await placeCursorAtLineEnd(page, TARGET_LINE_TEXT)
  await page.keyboard.press('ArrowLeft')

  await waitForCondition(async () => {
    const snapshot = await readEditorSnapshot(page)
    return !!snapshot && snapshot.lineText === TARGET_LINE_TEXT && snapshot.column === TARGET_LINE_TEXT.length
  }, 'Delete key cursor reposition')

  const before = await readEditorSnapshot(page)
  diagnostics.deleteKeyBefore = before

  const expectedLineText = TARGET_LINE_TEXT.slice(0, -1)
  await page.keyboard.press('Delete')

  await waitForViewportStability(page, expectedLineText, before, 'Delete key')

  const after = await readEditorSnapshot(page)
  diagnostics.deleteKeyAfter = after

  assert.equal(after?.lineText, expectedLineText)
  assert.equal(after?.column, before?.column, 'Delete key should keep the caret in place after removing the next character')
  assertViewportStayedNearCursor(before, after, 'Delete key')
}

async function runEnterKeyScenario(page, diagnostics) {
  await resetEditor(page)
  await placeCursorAtLineEnd(page, TARGET_LINE_TEXT)

  const before = await readEditorSnapshot(page)
  diagnostics.enterKeyBefore = before

  await page.keyboard.press('Enter')

  await waitForCondition(async () => {
    const snapshot = await readEditorSnapshot(page)
    return (
      !!snapshot &&
      snapshot.lineNumber === TARGET_LINE_NUMBER + 1 &&
      snapshot.lineText === '' &&
      snapshot.column === 1 &&
      isViewportStable(before, snapshot)
    )
  }, 'Enter key viewport stability')

  const after = await readEditorSnapshot(page)
  diagnostics.enterKeyAfter = after

  assert.equal(after?.lineNumber, TARGET_LINE_NUMBER + 1)
  assert.equal(after?.lineText, '')
  assert.equal(after?.column, 1)
  assertViewportStayedNearCursor(before, after, 'Enter key')
}

async function runPasteScenario(page, diagnostics) {
  await resetEditor(page)
  await placeCursorAtLineEnd(page, TARGET_LINE_TEXT)

  const before = await readEditorSnapshot(page)
  diagnostics.pasteBefore = before
  await dispatchPlainTextPaste(page, PASTE_INSERTION)

  await waitForViewportStability(page, `${TARGET_LINE_TEXT}${PASTE_INSERTION}`, before, 'paste', {
    requireBottomGap: true,
  })

  const after = await readEditorSnapshot(page)
  diagnostics.pasteAfter = after

  assert.equal(after?.lineText, `${TARGET_LINE_TEXT}${PASTE_INSERTION}`)
  assertViewportStayedNearCursor(before, after, 'Paste')
  assertCursorBottomGap(after, 'Paste')
}

async function runAIApplyScenario(page, diagnostics) {
  await resetEditor(page)
  await placeCursorAtLineEnd(page, TARGET_LINE_TEXT)

  const before = await readEditorSnapshot(page)
  diagnostics.aiBefore = before

  await dispatchAIApplyAtCursor(page, AI_INSERTION)

  await waitForViewportStability(page, `${TARGET_LINE_TEXT}${AI_INSERTION}`, before, 'AI Apply', {
    requireBottomGap: true,
  })

  const after = await readEditorSnapshot(page)
  diagnostics.aiAfter = after

  assert.equal(after?.lineText, `${TARGET_LINE_TEXT}${AI_INSERTION}`)
  assertViewportStayedNearCursor(before, after, 'AI Apply')
  assertCursorBottomGap(after, 'AI Apply')
}

async function runTerminalBlankLineArrowScenario(page, diagnostics, options) {
  const { wysiwygMode } = options
  const scenarioName = wysiwygMode ? 'WYSIWYG ArrowDown' : 'Source ArrowDown'
  const diagnosticPrefix = wysiwygMode ? 'wysiwygArrowTerminalBlankLine' : 'sourceArrowTerminalBlankLine'
  const expectedDocText = `${TERMINAL_BLANK_LINE_MARKDOWN}\n`

  await resetEditor(page, {
    content: TERMINAL_BLANK_LINE_MARKDOWN,
    name: `${diagnosticPrefix}.md`,
    wysiwygMode,
  })
  await placeCursorAtDocumentEnd(page)

  if (wysiwygMode) {
    await waitForWysiwygHeading(page, `${scenarioName} heading decoration`)
  }

  const before = await readEditorSnapshot(page)
  diagnostics[`${diagnosticPrefix}Before`] = before

  assert.equal(before?.docText, TERMINAL_BLANK_LINE_MARKDOWN)
  assert.equal(before?.lineText, TERMINAL_BLANK_LINE_LAST_LINE)
  assert.equal(before?.lastLineText, TERMINAL_BLANK_LINE_LAST_LINE)
  assert.equal(before?.selectionHead, TERMINAL_BLANK_LINE_MARKDOWN.length)
  assert.equal(before?.lineNumber, 2)
  assert.equal(before?.column, TERMINAL_BLANK_LINE_LAST_LINE.length + 1)
  if (wysiwygMode) {
    assert.equal(before?.hasWysiwygHeading, true, `${scenarioName} should run with WYSIWYG decorations enabled`)
  }

  await page.keyboard.press('ArrowDown')
  await waitForTerminalBlankLineState(page, expectedDocText, scenarioName)

  const after = await readEditorSnapshot(page)
  diagnostics[`${diagnosticPrefix}After`] = after
  assertTerminalBlankLineInserted(after, expectedDocText, scenarioName)
  if (wysiwygMode) {
    assert.equal(after?.hasWysiwygHeading, true, `${scenarioName} should preserve WYSIWYG decorations`)
  }

  await page.keyboard.press('ArrowDown')
  await waitForCondition(async () => {
    const snapshot = await readEditorSnapshot(page)
    return !!snapshot && snapshot.docText === expectedDocText
  }, `${scenarioName} duplicate newline guard`)

  const afterSecondArrow = await readEditorSnapshot(page)
  diagnostics[`${diagnosticPrefix}AfterSecondArrow`] = afterSecondArrow

  assert.equal(
    afterSecondArrow?.docText,
    expectedDocText,
    `${scenarioName} should not append a second trailing newline`
  )
}

async function runTerminalBlankLineClickScenario(page, diagnostics, options) {
  const { wysiwygMode } = options
  const scenarioName = wysiwygMode ? 'WYSIWYG below-EOF click' : 'Source below-EOF click'
  const diagnosticPrefix = wysiwygMode ? 'wysiwygClickTerminalBlankLine' : 'sourceClickTerminalBlankLine'
  const expectedDocText = `${TERMINAL_BLANK_LINE_MARKDOWN}\n`

  await resetEditor(page, {
    content: TERMINAL_BLANK_LINE_MARKDOWN,
    name: `${diagnosticPrefix}.md`,
    wysiwygMode,
  })
  await placeCursorAtDocumentEnd(page)

  if (wysiwygMode) {
    await waitForWysiwygHeading(page, `${scenarioName} heading decoration`)
  }

  const before = await readEditorSnapshot(page)
  const clickPoint = await resolveBelowDocumentEndClickPoint(page)
  diagnostics[`${diagnosticPrefix}Before`] = before
  diagnostics[`${diagnosticPrefix}ClickPoint`] = clickPoint

  assert.ok(
    clickPoint.y > clickPoint.documentEndBottom + 1,
    `${scenarioName} should click below the rendered document end`
  )
  assert.ok(
    clickPoint.y < clickPoint.scrollerBottom,
    `${scenarioName} click should stay inside the scrollable editor area`
  )

  await page.mouse.click(clickPoint.x, clickPoint.y)
  await waitForTerminalBlankLineState(page, expectedDocText, scenarioName)

  const after = await readEditorSnapshot(page)
  diagnostics[`${diagnosticPrefix}After`] = after
  assertTerminalBlankLineInserted(after, expectedDocText, scenarioName)
  if (wysiwygMode) {
    assert.equal(after?.hasWysiwygHeading, true, `${scenarioName} should preserve WYSIWYG decorations`)
  }
}

async function runWysiwygTerminalBlankLineTableScenario(page, diagnostics) {
  const scenarioName = 'WYSIWYG table EOF ArrowDown'
  const expectedDocText = `${TERMINAL_TABLE_MARKDOWN}\n`

  await resetEditor(page, {
    content: TERMINAL_TABLE_MARKDOWN,
    name: 'wysiwyg-table-terminal-blank-line.md',
    wysiwygMode: true,
  })

  await waitForCondition(
    async () => (await readEditorSnapshot(page))?.hasWysiwygTable === true,
    `${scenarioName} rendered table`
  )

  await page.locator('.cm-wysiwyg-table__cell[data-table-section="body"][data-table-row-index="0"][data-table-column-index="0"]').click()
  await waitForTableInput(page, `${scenarioName} inline table input`)

  const before = await readEditorSnapshot(page)
  diagnostics.wysiwygTableTerminalBlankLineBefore = before

  assert.equal(before?.docText, TERMINAL_TABLE_MARKDOWN)
  assert.equal(before?.hasTableInputFocus, true, `${scenarioName} should start from the active table input`)

  await page.keyboard.press('ArrowDown')
  await waitForCondition(async () => {
    const snapshot = await readEditorSnapshot(page)
    return (
      !!snapshot &&
      snapshot.docText === expectedDocText &&
      snapshot.lineText === '' &&
      snapshot.lastLineText === '' &&
      snapshot.column === 1 &&
      snapshot.activeIsInEditor === true &&
      snapshot.hasTableInputFocus === false
    )
  }, `${scenarioName} table exit`)

  const after = await readEditorSnapshot(page)
  const activeElement = await readActiveElementSnapshot(page)
  diagnostics.wysiwygTableTerminalBlankLineAfter = after
  diagnostics.wysiwygTableTerminalBlankLineActiveElement = activeElement

  assertTerminalBlankLineInserted(after, expectedDocText, scenarioName)
  assert.equal(after?.hasTableInputFocus, false, `${scenarioName} should leave table input focus behind`)
  assert.equal(activeElement?.tagName, 'DIV', `${scenarioName} should restore focus to the editor surface`)
  assert.equal(activeElement?.isInEditor, true, `${scenarioName} should keep focus inside the editor`)
}

async function runWysiwygTerminalBlankLineTableEnterScenario(page, diagnostics, options) {
  const { keyPress, diagnosticPrefix } = options
  const scenarioName = `WYSIWYG table EOF ${keyPress}`
  const expectedDocText = `${TERMINAL_TABLE_MARKDOWN}\n`

  await resetEditor(page, {
    content: TERMINAL_TABLE_MARKDOWN,
    name: `${diagnosticPrefix}.md`,
    wysiwygMode: true,
  })

  await waitForCondition(
    async () => (await readEditorSnapshot(page))?.hasWysiwygTable === true,
    `${scenarioName} rendered table`
  )

  await activateTableCell(page, { section: 'body', rowIndex: 0, columnIndex: 0 })

  const before = await readEditorSnapshot(page)
  diagnostics[`${diagnosticPrefix}Before`] = before

  await page.keyboard.press(keyPress)
  await waitForCondition(async () => {
    const snapshot = await readEditorSnapshot(page)
    return (
      !!snapshot &&
      snapshot.docText === expectedDocText &&
      snapshot.lineText === '' &&
      snapshot.lastLineText === '' &&
      snapshot.column === 1 &&
      snapshot.activeIsInEditor === true &&
      snapshot.hasTableInputFocus === false
    )
  }, `${scenarioName} table exit`)

  const after = await readEditorSnapshot(page)
  diagnostics[`${diagnosticPrefix}After`] = after

  assertTerminalBlankLineInserted(after, expectedDocText, scenarioName)
  assert.equal(after?.hasTableInputFocus, false, `${scenarioName} should leave table input focus behind`)
}

async function runWysiwygTableKeyboardScenario(page, diagnostics) {
  await resetEditor(page, {
    content: TABLE_KEYBOARD_MARKDOWN,
    name: 'wysiwyg-table-keyboard.md',
    wysiwygMode: true,
  })

  await waitForCondition(
    async () => (await readEditorSnapshot(page))?.hasWysiwygTable === true,
    'WYSIWYG table keyboard rendered table'
  )

  await activateTableCell(page, { section: 'body', rowIndex: 0, columnIndex: 0 })
  await page.keyboard.press('Enter')
  await waitForActiveTableInputState(page, {
    section: 'body',
    rowIndex: 1,
    columnIndex: 0,
    value: 'gamma',
    selectionStart: 5,
    selectionEnd: 5,
  }, 'WYSIWYG table Enter same-column navigation')
  diagnostics.wysiwygTableEnterNavigation = await readEditorSnapshot(page)

  await resetEditor(page, {
    content: TABLE_KEYBOARD_MARKDOWN,
    name: 'wysiwyg-table-alt-enter.md',
    wysiwygMode: true,
  })
  await waitForCondition(
    async () => (await readEditorSnapshot(page))?.hasWysiwygTable === true,
    'WYSIWYG table Alt+Enter rendered table'
  )

  await activateTableCell(page, { section: 'body', rowIndex: 0, columnIndex: 1 })
  await page.keyboard.press('Alt+Enter')
  await waitForActiveTableInputState(page, {
    section: 'body',
    rowIndex: 1,
    columnIndex: 1,
    value: 'delta',
    selectionStart: 5,
    selectionEnd: 5,
  }, 'WYSIWYG table Alt+Enter same-column navigation')
  diagnostics.wysiwygTableAltEnterNavigation = await readEditorSnapshot(page)

  await resetEditor(page, {
    content: TABLE_KEYBOARD_MARKDOWN,
    name: 'wysiwyg-table-enter-exit.md',
    wysiwygMode: true,
  })
  await waitForCondition(
    async () => (await readEditorSnapshot(page))?.hasWysiwygTable === true,
    'WYSIWYG table Enter exit rendered table'
  )

  await activateTableCell(page, { section: 'body', rowIndex: 1, columnIndex: 0 })
  await page.keyboard.press('Enter')
  await waitForCondition(async () => {
    const snapshot = await readEditorSnapshot(page)
    return (
      !!snapshot &&
      snapshot.docText === TABLE_KEYBOARD_MARKDOWN &&
      snapshot.lineText === 'after table' &&
      snapshot.column === 1 &&
      snapshot.hasTableInputFocus === false &&
      snapshot.activeIsInEditor === true
    )
  }, 'WYSIWYG table Enter should exit to the next physical line')
  diagnostics.wysiwygTableEnterExit = await readEditorSnapshot(page)

  await resetEditor(page, {
    content: TABLE_KEYBOARD_MARKDOWN,
    name: 'wysiwyg-table-alt-enter-exit.md',
    wysiwygMode: true,
  })
  await waitForCondition(
    async () => (await readEditorSnapshot(page))?.hasWysiwygTable === true,
    'WYSIWYG table Alt+Enter exit rendered table'
  )

  await activateTableCell(page, { section: 'body', rowIndex: 1, columnIndex: 1 })
  await page.keyboard.press('Alt+Enter')
  await waitForCondition(async () => {
    const snapshot = await readEditorSnapshot(page)
    return (
      !!snapshot &&
      snapshot.docText === TABLE_KEYBOARD_MARKDOWN &&
      snapshot.lineText === 'after table' &&
      snapshot.column === 1 &&
      snapshot.hasTableInputFocus === false &&
      snapshot.activeIsInEditor === true
    )
  }, 'WYSIWYG table Alt+Enter should exit to the next physical line')
  diagnostics.wysiwygTableAltEnterExit = await readEditorSnapshot(page)

  await resetEditor(page, {
    content: TABLE_KEYBOARD_MARKDOWN,
    name: 'wysiwyg-table-tab.md',
    wysiwygMode: true,
  })
  await waitForCondition(
    async () => (await readEditorSnapshot(page))?.hasWysiwygTable === true,
    'WYSIWYG table Tab rendered table'
  )

  await activateTableCell(page, { section: 'body', rowIndex: 0, columnIndex: 0 })
  await page.keyboard.press('Tab')
  await waitForActiveTableInputState(page, {
    section: 'body',
    rowIndex: 0,
    columnIndex: 1,
  }, 'WYSIWYG table Tab grid navigation')
  diagnostics.wysiwygTableTabNavigation = await readEditorSnapshot(page)

  await resetEditor(page, {
    content: TABLE_BACKSPACE_MARKDOWN,
    name: 'wysiwyg-table-backspace.md',
    wysiwygMode: true,
  })
  await waitForCondition(
    async () => (await readEditorSnapshot(page))?.hasWysiwygTable === true,
    'WYSIWYG table Backspace rendered table'
  )

  await activateTableCell(page, { section: 'body', rowIndex: 0, columnIndex: 1 })
  await page.keyboard.press('Backspace')
  await waitForActiveTableInputState(page, {
    section: 'body',
    rowIndex: 0,
    columnIndex: 0,
    value: 'alpha',
    selectionStart: 5,
    selectionEnd: 5,
  }, 'WYSIWYG table Backspace empty-cell navigation')
  diagnostics.wysiwygTableBackspaceNavigation = await readEditorSnapshot(page)
  assert.equal(diagnostics.wysiwygTableBackspaceNavigation?.docText, TABLE_BACKSPACE_MARKDOWN)

  await resetEditor(page, {
    content: TABLE_FIRST_CELL_BACKSPACE_MARKDOWN,
    name: 'wysiwyg-table-backspace-first-cell.md',
    wysiwygMode: true,
  })
  await waitForCondition(
    async () => (await readEditorSnapshot(page))?.hasWysiwygTable === true,
    'WYSIWYG table first-cell Backspace rendered table'
  )

  await activateTableCell(page, { section: 'head', rowIndex: 0, columnIndex: 0 })
  await page.keyboard.press('Backspace')
  await waitForActiveTableInputState(page, {
    section: 'head',
    rowIndex: 0,
    columnIndex: 0,
    value: '',
    selectionStart: 0,
    selectionEnd: 0,
  }, 'WYSIWYG table Backspace first-cell noop')
  diagnostics.wysiwygTableBackspaceFirstCell = await readEditorSnapshot(page)
  assert.equal(diagnostics.wysiwygTableBackspaceFirstCell?.docText, TABLE_FIRST_CELL_BACKSPACE_MARKDOWN)

  await resetEditor(page, {
    content: TABLE_KEYBOARD_MARKDOWN,
    name: 'wysiwyg-table-arrow-right.md',
    wysiwygMode: true,
  })
  await waitForCondition(
    async () => (await readEditorSnapshot(page))?.hasWysiwygTable === true,
    'WYSIWYG table ArrowRight rendered table'
  )

  await activateTableCell(page, { section: 'body', rowIndex: 0, columnIndex: 1 })
  await waitForActiveTableInputState(page, {
    section: 'body',
    rowIndex: 0,
    columnIndex: 1,
    value: 'beta',
    selectionStart: 4,
    selectionEnd: 4,
  }, 'WYSIWYG table ArrowRight line-end positioning')
  await page.keyboard.press('ArrowRight')
  await waitForActiveTableInputState(page, {
    section: 'body',
    rowIndex: 1,
    columnIndex: 0,
    value: 'gamma',
    selectionStart: 0,
    selectionEnd: 0,
  }, 'WYSIWYG table ArrowRight boundary navigation')
  diagnostics.wysiwygTableArrowRightNavigation = await readEditorSnapshot(page)
  assert.equal(diagnostics.wysiwygTableArrowRightNavigation?.docText, TABLE_KEYBOARD_MARKDOWN)

  await resetEditor(page, {
    content: TABLE_DELETE_MARKDOWN,
    name: 'wysiwyg-table-delete.md',
    wysiwygMode: true,
  })
  await waitForCondition(
    async () => (await readEditorSnapshot(page))?.hasWysiwygTable === true,
    'WYSIWYG table Delete rendered table'
  )

  await activateTableCell(page, { section: 'body', rowIndex: 0, columnIndex: 0 })
  await waitForActiveTableInputState(page, {
    section: 'body',
    rowIndex: 0,
    columnIndex: 0,
    value: '',
    selectionStart: 0,
    selectionEnd: 0,
  }, 'WYSIWYG table Delete empty-cell positioning')
  await page.keyboard.press('Delete')
  await waitForActiveTableInputState(page, {
    section: 'body',
    rowIndex: 0,
    columnIndex: 1,
    value: 'beta',
    selectionStart: 0,
    selectionEnd: 0,
  }, 'WYSIWYG table Delete empty-cell navigation')
  diagnostics.wysiwygTableDeleteNavigation = await readEditorSnapshot(page)
  assert.equal(diagnostics.wysiwygTableDeleteNavigation?.docText, TABLE_DELETE_MARKDOWN)

  await resetEditor(page, {
    content: TABLE_KEYBOARD_MARKDOWN,
    name: 'wysiwyg-table-tab-insert-row.md',
    wysiwygMode: true,
  })
  await waitForCondition(
    async () => (await readEditorSnapshot(page))?.hasWysiwygTable === true,
    'WYSIWYG table Tab row insertion rendered table'
  )

  await activateTableCell(page, { section: 'body', rowIndex: 1, columnIndex: 1 })
  await page.keyboard.press('Tab')
  await waitForActiveTableInputState(page, {
    section: 'body',
    rowIndex: 2,
    columnIndex: 0,
    value: '',
    selectionStart: 0,
    selectionEnd: 0,
  }, 'WYSIWYG table Tab row insertion')
  diagnostics.wysiwygTableTabInsertRow = await readEditorSnapshot(page)
  assert.equal(
    diagnostics.wysiwygTableTabInsertRow?.docText,
    [
      '| Left | Right |',
      '| --- | ---: |',
      '| alpha | beta |',
      '| gamma | delta |',
      '|  |  |',
      'after table',
    ].join('\n')
  )

  await resetEditor(page, {
    content: TABLE_KEYBOARD_MARKDOWN,
    name: 'wysiwyg-table-shift-tab-exit-before.md',
    wysiwygMode: true,
  })
  await waitForCondition(
    async () => (await readEditorSnapshot(page))?.hasWysiwygTable === true,
    'WYSIWYG table Shift+Tab exit-before rendered table'
  )

  await activateTableCell(page, { section: 'head', rowIndex: 0, columnIndex: 0 })
  await page.keyboard.press('Shift+Tab')
  await waitForCondition(async () => {
    const snapshot = await readEditorSnapshot(page)
    return (
      !!snapshot &&
      snapshot.docText === `\n${TABLE_KEYBOARD_MARKDOWN}` &&
      snapshot.lineNumber === 1 &&
      snapshot.lineText === '' &&
      snapshot.column === 1 &&
      snapshot.hasTableInputFocus === false &&
      snapshot.activeIsInEditor === true
    )
  }, 'WYSIWYG table Shift+Tab exit before table')
  diagnostics.wysiwygTableShiftTabExitBefore = await readEditorSnapshot(page)
  assert.equal(
    diagnostics.wysiwygTableShiftTabExitBefore?.docText,
    `\n${TABLE_KEYBOARD_MARKDOWN}`
  )

  await resetEditor(page, {
    content: TABLE_KEYBOARD_MARKDOWN,
    name: 'wysiwyg-table-ctrl-enter.md',
    wysiwygMode: true,
  })
  await waitForCondition(
    async () => (await readEditorSnapshot(page))?.hasWysiwygTable === true,
    'WYSIWYG table Ctrl+Enter rendered table'
  )

  await activateTableCell(page, { section: 'body', rowIndex: 0, columnIndex: 1 })
  await page.keyboard.press('Control+Enter')
  await waitForActiveTableInputState(page, {
    section: 'body',
    rowIndex: 1,
    columnIndex: 0,
    value: '',
    selectionStart: 0,
    selectionEnd: 0,
  }, 'WYSIWYG table Ctrl+Enter row insertion')
  diagnostics.wysiwygTableCtrlEnterInsertRow = await readEditorSnapshot(page)
  assert.equal(
    diagnostics.wysiwygTableCtrlEnterInsertRow?.docText,
    [
      '| Left | Right |',
      '| --- | ---: |',
      '| alpha | beta |',
      '|  |  |',
      '| gamma | delta |',
      'after table',
    ].join('\n')
  )

  await resetEditor(page, {
    content: TABLE_KEYBOARD_MARKDOWN,
    name: 'wysiwyg-table-shift-enter.md',
    wysiwygMode: true,
  })
  await waitForCondition(
    async () => (await readEditorSnapshot(page))?.hasWysiwygTable === true,
    'WYSIWYG table Shift+Enter rendered table'
  )

  await activateTableCell(page, { section: 'body', rowIndex: 0, columnIndex: 0 })
  await page.keyboard.press('Shift+Enter')
  await waitForActiveTableInputState(page, {
    section: 'body',
    rowIndex: 0,
    columnIndex: 0,
    value: 'alpha\n',
    selectionStart: 6,
    selectionEnd: 6,
  }, 'WYSIWYG table Shift+Enter inline break')
  diagnostics.wysiwygTableShiftEnter = await readEditorSnapshot(page)
  assert.equal(
    diagnostics.wysiwygTableShiftEnter?.docText,
    [
      '| Left | Right |',
      '| --- | ---: |',
      '| alpha<br /> | beta |',
      '| gamma | delta |',
      'after table',
    ].join('\n')
  )

  await activateTableCell(page, { section: 'body', rowIndex: 0, columnIndex: 1 })
  const renderedHtml = await readRenderedTableCellHtml(page, { section: 'body', rowIndex: 0, columnIndex: 0 })
  diagnostics.wysiwygTableShiftEnterRenderedHtml = renderedHtml
  assert.match(
    renderedHtml ?? '',
    /alpha<span class="cm-wysiwyg-table__line-break-marker">&lt;br \/&gt;<\/span>/u,
    'WYSIWYG table Shift+Enter should render a visible line-break placeholder'
  )

  await resetEditor(page, {
    content: TABLE_KEYBOARD_MARKDOWN,
    name: 'wysiwyg-table-escape.md',
    wysiwygMode: true,
  })
  await waitForCondition(
    async () => (await readEditorSnapshot(page))?.hasWysiwygTable === true,
    'WYSIWYG table Escape rendered table'
  )

  await activateTableCell(page, { section: 'body', rowIndex: 0, columnIndex: 0 })
  await page.keyboard.press('Escape')
  await waitForCondition(async () => {
    const snapshot = await readEditorSnapshot(page)
    return (
      !!snapshot &&
      snapshot.docText === TABLE_KEYBOARD_MARKDOWN &&
      snapshot.lineText === 'after table' &&
      snapshot.column === 1 &&
      snapshot.hasTableInputFocus === false &&
      snapshot.activeIsInEditor === true
    )
  }, 'WYSIWYG table Escape should exit to the next physical line')
  diagnostics.wysiwygTableEscapeExit = await readEditorSnapshot(page)
}

async function main() {
  const staticServer = await createStaticDistServer(DIST_DIR)
  let browser
  let context
  let page
  const consoleErrors = []
  const pageErrors = []
  const diagnostics = {}

  try {
    const launchResult = await launchSmokeBrowser()
    browser = launchResult.browser
    console.log(`Source interaction smoke browser: ${launchResult.browserLabel}`)

    context = await browser.newContext()
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: staticServer.origin })

    page = await context.newPage()
    page.on('console', (message) => {
      if (message.type() === 'error') {
        consoleErrors.push(message.text())
      }
    })
    page.on('pageerror', (error) => {
      pageErrors.push(error.stack ?? error.message)
    })

    await page.goto(staticServer.origin, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.cm-content')

    await runRemountViewportRestoreScenario(page, diagnostics)
    await runPreviewPerTabScrollScenario(page)
    await runWysiwygImageViewportScenario(page)
    await runRestoredViewportCompensationScenario(page)
    await runExternalContentUpdateScenario(page)
    await runSidebarPanelScrollScenario(page)
    await runOrdinaryInputScenario(page, diagnostics)
    await runDeleteKeyScenario(page, diagnostics)
    await runEnterKeyScenario(page, diagnostics)
    await runAIApplyScenario(page, diagnostics)
    await runPasteScenario(page, diagnostics)
    await runTerminalBlankLineArrowScenario(page, diagnostics, { wysiwygMode: false })
    await runTerminalBlankLineClickScenario(page, diagnostics, { wysiwygMode: false })
    await runTerminalBlankLineArrowScenario(page, diagnostics, { wysiwygMode: true })
    await runTerminalBlankLineClickScenario(page, diagnostics, { wysiwygMode: true })
    await runWysiwygTerminalBlankLineTableScenario(page, diagnostics)
    await runWysiwygTerminalBlankLineTableEnterScenario(page, diagnostics, {
      keyPress: 'Enter',
      diagnosticPrefix: 'wysiwygTableTerminalBlankLineEnter',
    })
    await runWysiwygTerminalBlankLineTableEnterScenario(page, diagnostics, {
      keyPress: 'Alt+Enter',
      diagnosticPrefix: 'wysiwygTableTerminalBlankLineAltEnter',
    })
    await runWysiwygTableKeyboardScenario(page, diagnostics)

    assert.equal(pageErrors.length, 0, `Unexpected page errors:\n${pageErrors.join('\n')}`)
    console.log('Source interaction smoke test passed.')
  } catch (error) {
    diagnostics.lastUrl = page?.url() ?? ''
    diagnostics.failureSnapshot = page ? await readEditorSnapshot(page).catch(() => null) : null
    await saveFailureArtifacts(page, error, consoleErrors, pageErrors, diagnostics)
    throw error
  } finally {
    await context?.close()
    await browser?.close()
    await staticServer.close()
  }
}

await main()
