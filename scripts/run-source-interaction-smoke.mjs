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

function buildPersistedEditorState() {
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
      wysiwygMode: false,
      activeThemeId: 'default-light',
      tabs: [
        {
          id: SOURCE_SMOKE_TAB_ID,
          path: null,
          name: 'SourceInteractionSmoke.md',
          content: SOURCE_SMOKE_MARKDOWN,
          savedContent: SOURCE_SMOKE_MARKDOWN,
          isDirty: false,
        },
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

async function resetEditor(page) {
  await page.evaluate(({ persistedState, storageKey }) => {
    localStorage.clear()
    localStorage.setItem(storageKey, JSON.stringify(persistedState))
    localStorage.setItem('language', 'en')
  }, { persistedState: buildPersistedEditorState(), storageKey: LOCAL_STORAGE_KEY })
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

    return {
      docText: view.state.doc.toString(),
      lineNumber: line.number,
      lineText: line.text,
      column: selection.head - line.from + 1,
      selectionHead: selection.head,
      scrollTop: scroller.scrollTop,
      scrollLeft: scroller.scrollLeft,
      scrollHeight: scroller.scrollHeight,
      clientHeight: scroller.clientHeight,
      defaultLineHeight: view.defaultLineHeight,
      bottomGap: scroller.scrollTop + scroller.clientHeight - lineBlock.bottom,
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

async function waitForViewportStability(page, expectedLineText, before, label) {
  await waitForCondition(async () => {
    const snapshot = await readEditorSnapshot(page)
    if (!snapshot || snapshot.lineText !== expectedLineText) return false

    const minimumMeaningfulScroll = Math.max(before.defaultLineHeight * 8, 80)
    const minimumBottomGap = snapshot.defaultLineHeight * 3 - 8

    return (
      snapshot.scrollTop >= minimumMeaningfulScroll &&
      snapshot.scrollTop >= before.scrollTop - before.defaultLineHeight * 4 &&
      Math.abs(snapshot.scrollLeft - before.scrollLeft) <= 2 &&
      snapshot.bottomGap >= minimumBottomGap
    )
  }, `${label} viewport stability`)
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
  assertCursorBottomGap(after, 'Ordinary typing')
}

async function runPasteScenario(page, diagnostics) {
  await resetEditor(page)
  await placeCursorAtLineEnd(page, TARGET_LINE_TEXT)

  const before = await readEditorSnapshot(page)
  diagnostics.pasteBefore = before
  await dispatchPlainTextPaste(page, PASTE_INSERTION)

  await waitForViewportStability(page, `${TARGET_LINE_TEXT}${PASTE_INSERTION}`, before, 'paste')

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

  await waitForViewportStability(page, `${TARGET_LINE_TEXT}${AI_INSERTION}`, before, 'AI Apply')

  const after = await readEditorSnapshot(page)
  diagnostics.aiAfter = after

  assert.equal(after?.lineText, `${TARGET_LINE_TEXT}${AI_INSERTION}`)
  assertViewportStayedNearCursor(before, after, 'AI Apply')
  assertCursorBottomGap(after, 'AI Apply')
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

    await page.addInitScript(({ persistedState, storageKey }) => {
      localStorage.clear()
      localStorage.setItem(storageKey, JSON.stringify(persistedState))
      localStorage.setItem('language', 'en')
    }, { persistedState: buildPersistedEditorState(), storageKey: LOCAL_STORAGE_KEY })

    await page.goto(staticServer.origin, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.cm-content')

    await runOrdinaryInputScenario(page, diagnostics)
    await runAIApplyScenario(page, diagnostics)
    await runPasteScenario(page, diagnostics)

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
