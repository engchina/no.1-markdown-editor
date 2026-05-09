import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { chromium } from '@playwright/test'

const DIST_DIR = resolve('dist')
const HOST = '127.0.0.1'
const LOCAL_STORAGE_KEY = 'editor-settings'
const TAB_ID = 'split-scroll-sync-smoke-tab'
const FAILURE_DIR = resolve('output/playwright')
const FAILURE_SCREENSHOT_PATH = resolve('output/playwright/split-scroll-sync-smoke-failure.png')
const FAILURE_DIAGNOSTICS_PATH = resolve('output/playwright/split-scroll-sync-smoke-failure.txt')

// Build a 200-line markdown doc with annotated landmark headings.
const SAMPLE_LINES = []
for (let block = 0; block < 20; block += 1) {
  SAMPLE_LINES.push(`## Section ${block + 1}`)
  SAMPLE_LINES.push('')
  for (let row = 0; row < 7; row += 1) {
    SAMPLE_LINES.push(`paragraph ${block + 1}.${row + 1} — keep enough text here to add visible height across the rendered preview block.`)
  }
  SAMPLE_LINES.push('')
}
const SAMPLE_MARKDOWN = SAMPLE_LINES.join('\n')

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

function buildPersistedEditorState({ splitScrollSyncEnabled }) {
  return {
    state: {
      viewMode: 'split',
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
      splitScrollSyncEnabled,
      tabs: [
        {
          id: TAB_ID,
          path: null,
          name: 'SplitScrollSyncSmoke.md',
          content: SAMPLE_MARKDOWN,
          savedContent: SAMPLE_MARKDOWN,
          isDirty: false,
        },
      ],
      activeTabId: TAB_ID,
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
    throw new Error('Smoke server did not expose a usable TCP port')
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
      'Unable to launch a browser for the split scroll sync smoke test.',
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
  await mkdir(FAILURE_DIR, { recursive: true })
  if (page) {
    try {
      await page.screenshot({ path: FAILURE_SCREENSHOT_PATH, fullPage: true })
    } catch {
      // ignore
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
  await writeFile(FAILURE_DIAGNOSTICS_PATH, diagnosticText, 'utf8')
}

async function seed(page, options) {
  await page.evaluate(({ persistedState, storageKey }) => {
    localStorage.clear()
    localStorage.setItem(storageKey, JSON.stringify(persistedState))
    localStorage.setItem('language', 'en')
  }, {
    persistedState: buildPersistedEditorState(options),
    storageKey: LOCAL_STORAGE_KEY,
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.cm-content')
  await page.waitForSelector('.markdown-preview [data-source-line]')
}

async function readPreviewTopLine(page) {
  return page.evaluate(() => {
    const preview = document.querySelector('.markdown-preview')
    if (!preview) return null
    const scrollTop = preview.scrollTop
    const elements = preview.querySelectorAll('[data-source-line]')
    let bestLine = null
    let bestDelta = Infinity
    for (const el of elements) {
      const top = el.offsetTop
      if (top > scrollTop + 8) continue // below the viewport top
      const delta = scrollTop - top
      if (delta < bestDelta) {
        bestDelta = delta
        bestLine = Number.parseInt(el.getAttribute('data-source-line') ?? '', 10)
      }
    }
    return {
      scrollTop,
      scrollHeight: preview.scrollHeight,
      clientHeight: preview.clientHeight,
      topLine: bestLine,
    }
  })
}

async function readEditorState(page) {
  return page.evaluate(() => {
    const content = document.querySelector('.cm-content')
    const view = content?.cmTile?.root?.view
    if (!view) return null
    const scroller = view.scrollDOM
    const block = view.lineBlockAtHeight(scroller.scrollTop)
    const line = view.state.doc.lineAt(block.from).number
    return {
      scrollTop: scroller.scrollTop,
      scrollHeight: scroller.scrollHeight,
      clientHeight: scroller.clientHeight,
      topLine: line,
    }
  })
}

async function scrollEditorToLine(page, line) {
  await page.evaluate((targetLine) => {
    const content = document.querySelector('.cm-content')
    const view = content?.cmTile?.root?.view
    if (!view) throw new Error('Cannot resolve editor view')
    const docLine = view.state.doc.line(targetLine)
    const block = view.lineBlockAt(docLine.from)
    view.scrollDOM.scrollTo({ top: block.top, behavior: 'auto' })
  }, line)
}

async function scrollPreviewToLine(page, line) {
  await page.evaluate((targetLine) => {
    const preview = document.querySelector('.markdown-preview')
    if (!preview) throw new Error('Cannot resolve preview container')
    const candidates = preview.querySelectorAll(`[data-source-line]`)
    let target = null
    let bestLine = -1
    for (const el of candidates) {
      const ln = Number.parseInt(el.getAttribute('data-source-line') ?? '', 10)
      if (Number.isFinite(ln) && ln <= targetLine && ln > bestLine) {
        bestLine = ln
        target = el
      }
    }
    if (!target) throw new Error(`No preview element found at or before line ${targetLine}`)
    preview.scrollTo({ top: target.offsetTop, behavior: 'auto' })
  }, line)
}

async function runEditorDrivesPreview(page, diagnostics) {
  await seed(page, { splitScrollSyncEnabled: true })

  const before = await readPreviewTopLine(page)
  diagnostics.editorDrivesBefore = before

  // Scroll editor to ~line 90 (well into the doc)
  await scrollEditorToLine(page, 90)

  await waitForCondition(async () => {
    const previewState = await readPreviewTopLine(page)
    return !!previewState && typeof previewState.topLine === 'number' && previewState.topLine >= 80
  }, 'preview to follow editor scroll past line 80')

  const after = await readPreviewTopLine(page)
  diagnostics.editorDrivesAfter = after

  assert.ok(after, 'preview state should be readable after editor scroll')
  assert.ok(after.topLine !== null && after.topLine >= 80 && after.topLine <= 100,
    `expected preview to land near line 90, got ${after.topLine}`)
}

async function runPreviewDrivesEditor(page, diagnostics) {
  await seed(page, { splitScrollSyncEnabled: true })

  const before = await readEditorState(page)
  diagnostics.previewDrivesBefore = before

  await scrollPreviewToLine(page, 110)

  await waitForCondition(async () => {
    const editorState = await readEditorState(page)
    return !!editorState && editorState.topLine >= 95
  }, 'editor to follow preview scroll past line 95')

  const after = await readEditorState(page)
  diagnostics.previewDrivesAfter = after

  assert.ok(after && after.topLine >= 95 && after.topLine <= 125,
    `expected editor to land near line 110, got ${after?.topLine}`)
}

async function runDisabledIsolatesScroll(page, diagnostics) {
  await seed(page, { splitScrollSyncEnabled: false })

  const previewBefore = await readPreviewTopLine(page)
  diagnostics.disabledPreviewBefore = previewBefore

  await scrollEditorToLine(page, 90)

  // Give any (incorrectly attached) sync handler time to fire
  await new Promise((r) => setTimeout(r, 250))

  const previewAfter = await readPreviewTopLine(page)
  diagnostics.disabledPreviewAfter = previewAfter

  assert.ok(previewBefore && previewAfter, 'preview state should be readable')
  assert.equal(previewAfter.scrollTop, previewBefore.scrollTop,
    `preview must NOT move when sync is disabled (before=${previewBefore.scrollTop}, after=${previewAfter.scrollTop})`)
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
    console.log(`Split scroll sync smoke browser: ${launchResult.browserLabel}`)

    context = await browser.newContext()
    page = await context.newPage()
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })
    page.on('pageerror', (error) => {
      pageErrors.push(error.stack ?? error.message)
    })

    await page.goto(staticServer.origin, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.cm-content')

    await runEditorDrivesPreview(page, diagnostics)
    await runPreviewDrivesEditor(page, diagnostics)
    await runDisabledIsolatesScroll(page, diagnostics)

    assert.equal(pageErrors.length, 0, `Unexpected page errors:\n${pageErrors.join('\n')}`)
    console.log('Split scroll sync smoke test passed.')
  } catch (error) {
    diagnostics.lastUrl = page?.url() ?? ''
    await saveFailureArtifacts(page, error, consoleErrors, pageErrors, diagnostics)
    throw error
  } finally {
    await context?.close()
    await browser?.close()
    await staticServer.close()
  }
}

await main()
