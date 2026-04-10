import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { chromium } from '@playwright/test'

const DIST_DIR = resolve('dist')
const HOST = '127.0.0.1'
const LOCAL_STORAGE_KEY = 'editor-settings'
const AI_MOCK_PROVIDER_KEY = 'no1-ai-mock-provider'
const FAILURE_SCREENSHOT_PATH = resolve('output/playwright/ai-keyboard-smoke-failure.png')
const KEYBOARD_SMOKE_FILLER_PARAGRAPHS = Array.from(
  { length: 28 },
  (_, index) => `Filler paragraph ${index + 1} keeps the editor tall enough to verify viewport restoration.`
)
const KEYBOARD_SMOKE_TARGET_PARAGRAPH = 'This paragraph should stay unchanged until apply.'
const KEYBOARD_SMOKE_FINAL_LINE = 'Closing the composer should not yank the editor back to the top.'

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

const KEYBOARD_SMOKE_MARKDOWN = [
  '# Keyboard AI',
  '',
  ...KEYBOARD_SMOKE_FILLER_PARAGRAPHS.flatMap((paragraph) => [paragraph, '']),
  KEYBOARD_SMOKE_TARGET_PARAGRAPH,
  '',
  KEYBOARD_SMOKE_FINAL_LINE,
].join('\n')

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
      aiDefaultWriteTarget: 'at-cursor',
      aiDefaultSelectedTextRole: 'transform-target',
      tabs: [
        {
          id: 'ai-keyboard-smoke-tab',
          path: null,
          name: 'AIKeyboardSmoke.md',
          content: KEYBOARD_SMOKE_MARKDOWN,
          savedContent: KEYBOARD_SMOKE_MARKDOWN,
          isDirty: false,
        },
      ],
      activeTabId: 'ai-keyboard-smoke-tab',
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
    throw new Error('AI keyboard smoke server did not expose a usable TCP port')
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
      'Unable to launch a browser for the AI keyboard smoke test.',
      ...failures.map((failure) => `- ${failure}`),
      'Install Playwright Chromium or ensure a Chrome/Edge channel is available.',
    ].join('\n')
  )
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

  await writeFile(resolve('output/playwright/ai-keyboard-smoke-failure.txt'), diagnosticText, 'utf8')
}

async function waitForCondition(predicate, description, timeoutMs = 15000, stepMs = 50) {
  const start = Date.now()

  while (Date.now() - start < timeoutMs) {
    if (await predicate()) return
    await new Promise((resolveWait) => setTimeout(resolveWait, stepMs))
  }

  throw new Error(`Timed out waiting for ${description}`)
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
    console.log(`AI keyboard smoke browser: ${launchResult.browserLabel}`)

    context = await browser.newContext()
    page = await context.newPage()
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })
    page.on('pageerror', (error) => {
      pageErrors.push(error.stack ?? error.message)
    })

    await page.addInitScript(({ persistedState, storageKey, mockKey }) => {
      localStorage.clear()
      localStorage.setItem(storageKey, JSON.stringify(persistedState))
      localStorage.setItem('language', 'en')
      localStorage.setItem(mockKey, '1')
    }, { persistedState: buildPersistedEditorState(), storageKey: LOCAL_STORAGE_KEY, mockKey: AI_MOCK_PROVIDER_KEY })

    await page.goto(staticServer.origin, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.cm-content')
    await page.waitForTimeout(500)

    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control'

    await placeCodeMirrorCursorAtText(page, KEYBOARD_SMOKE_FINAL_LINE, 8)
    const cursorBeforeClose = await readDomCursorSnapshot(page)
    assert.ok(
      cursorBeforeClose?.lineText === KEYBOARD_SMOKE_FINAL_LINE,
      'cursor should move onto the final document line before opening the composer'
    )
    const viewportBeforeClose = await readEditorViewportSnapshot(page)
    assert.ok(viewportBeforeClose, 'editor viewport should be readable before opening the composer')

    await page.evaluate(() => {
      document.dispatchEvent(
        new CustomEvent('editor:ai-open', {
          detail: { source: 'shortcut', intent: 'generate', outputTarget: 'at-cursor' },
          cancelable: true,
        })
      )
    })

    const composer = page.getByRole('dialog', { name: 'AI Composer' })
    await composer.waitFor()
    await page.keyboard.press('Escape')
    await composer.waitFor({ state: 'hidden' })
    await waitForCondition(
      async () => (await readActiveElementSnapshot(page))?.isInEditor === true,
      'editor focus to return after closing the composer without applying'
    )
    await waitForCondition(
      async () => (await readDomCursorSnapshot(page))?.lineText === cursorBeforeClose.lineText,
      'editor cursor line to restore after closing the composer'
    )
    await waitForCondition(
      async () => {
        const snapshot = await readEditorViewportSnapshot(page)
        return snapshot !== null && snapshot.scrollTop > Math.max(80, viewportBeforeClose.scrollTop * 0.5)
      },
      'editor viewport to return near the previous editing context after closing the composer'
    )
    const cursorAfterClose = await readDomCursorSnapshot(page)
    const viewportAfterClose = await readEditorViewportSnapshot(page)
    assert.equal(
      cursorAfterClose?.lineText,
      cursorBeforeClose.lineText,
      'Closing the AI composer should preserve the editor cursor line'
    )
    assert.ok(viewportAfterClose, 'editor viewport should still be readable after closing the composer')
    assertViewportStayedInContext(viewportBeforeClose, viewportAfterClose, 'Closing the AI composer should preserve the editor viewport context')
    diagnostics.cursorBeforeClose = cursorBeforeClose
    diagnostics.cursorAfterClose = cursorAfterClose
    diagnostics.viewportBeforeClose = viewportBeforeClose
    diagnostics.viewportAfterClose = viewportAfterClose

    await page.keyboard.press(`${modifier}+J`)
    await composer.waitFor()
    const textarea = composer.locator('textarea')
    await textarea.fill('Continue writing the next paragraph in a concise style.')
    await waitForCondition(async () => await composer.locator('[data-ai-action="run"]').isEnabled(), 'AI run button to become enabled')

    const beforeRun = await readEditorMarkdown(page)
    assert.equal(beforeRun, KEYBOARD_SMOKE_MARKDOWN)

    await page.keyboard.press(`${modifier}+Enter`)
    const duringRun = await readEditorMarkdown(page)
    assert.equal(duringRun, KEYBOARD_SMOKE_MARKDOWN)
    await waitForCondition(
      async () =>
        (await readComposerDraftText(composer)) === 'Mock' &&
        (await composer.locator('[data-ai-action="cancel-request"]').count()) === 1,
      'first streamed draft chunk to appear while request is streaming'
    )
    diagnostics.partialDraftDuringStream = await readComposerDraftText(composer)
    diagnostics.contentDuringStream = await readEditorMarkdown(page)
    assert.equal(diagnostics.contentDuringStream, KEYBOARD_SMOKE_MARKDOWN)

    await expectLocatorText(composer, 'Mock continuation paragraph.')
    await assertComposerResultWithinBounds(page)
    const afterDraft = await readEditorMarkdown(page)
    assert.equal(afterDraft, KEYBOARD_SMOKE_MARKDOWN)

    await page.keyboard.press(`${modifier}+Shift+Enter`)

    await waitForCondition(
      async () => (await readEditorMarkdown(page)).includes('Mock continuation paragraph.'),
      'editor content to include the mock continuation after apply'
    )
    await composer.waitFor({ state: 'hidden' })
    await waitForCondition(
      async () => (await readActiveElementSnapshot(page))?.isInEditor === true,
      'editor focus to return after apply'
    )
    diagnostics.contentAfterApply = await readEditorMarkdown(page)
    diagnostics.activeElementAfterApply = await readActiveElementSnapshot(page)

    console.log('AI keyboard smoke test passed.')
  } catch (error) {
    diagnostics.lastUrl = page?.url() ?? ''
    diagnostics.contentOnFailure = page ? await readEditorMarkdown(page).catch(() => null) : null
    diagnostics.activeElementOnFailure = page ? await readActiveElementSnapshot(page).catch(() => null) : null
    await saveFailureArtifacts(page, error, consoleErrors, pageErrors, diagnostics)
    throw error
  } finally {
    await context?.close()
    await browser?.close()
    await staticServer.close()
  }
}

async function readEditorMarkdown(page) {
  return page.evaluate(() => {
    const content = document.querySelector('.cm-content')
    const view = content?.cmTile?.root?.view
    if (!view) return ''
    return view.state.doc.toString().trim()
  })
}

async function expectLocatorText(locator, text) {
  await waitForCondition(
    async () => {
      const content = await locator.textContent()
      return (content ?? '').includes(text)
    },
    `text "${text}" in locator`
  )
}

async function readComposerDraftText(composer) {
  const content = await composer.locator('pre').first().textContent()
  return (content ?? '').trim()
}

async function placeCodeMirrorCursorAtText(page, text, offset) {
  await page.evaluate(({ targetText, targetOffset }) => {
    const content = document.querySelector('.cm-content')
    const view = content?.cmTile?.root?.view
    if (!view) {
      throw new Error('Unable to resolve the CodeMirror editor view from the DOM')
    }

    const docText = view.state.doc.toString()
    const textIndex = docText.indexOf(targetText)
    if (textIndex < 0) {
      throw new Error(`Unable to find target text in the editor document: ${targetText}`)
    }

    const anchor = textIndex + Math.min(targetOffset, targetText.length)
    view.dispatch({
      selection: { anchor },
      scrollIntoView: true,
    })
  }, { targetText: text, targetOffset: offset })

  await waitForCondition(
    async () => (await readActiveElementSnapshot(page))?.isInEditor === true,
    'editor focus after moving the CodeMirror cursor'
  )
}

function assertViewportStayedInContext(before, after, message) {
  assert.ok(
    after.scrollTop > Math.max(80, before.scrollTop * 0.5) &&
      Math.abs(after.scrollLeft - before.scrollLeft) <= 2,
    `${message} (before: ${JSON.stringify(before)}, after: ${JSON.stringify(after)})`
  )
}

async function readEditorViewportSnapshot(page) {
  return page.evaluate(() => {
    const scroller = document.querySelector('.cm-scroller')
    if (!(scroller instanceof HTMLElement)) return null

    return {
      scrollTop: scroller.scrollTop,
      scrollLeft: scroller.scrollLeft,
      scrollHeight: scroller.scrollHeight,
      clientHeight: scroller.clientHeight,
    }
  })
}

async function readDomCursorSnapshot(page) {
  return page.evaluate(() => {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return null

    const anchorNode = selection.anchorNode
    const anchorElement =
      anchorNode instanceof Element
        ? anchorNode
        : anchorNode?.parentElement ?? null
    const line = anchorElement?.closest('.cm-line')

    return {
      lineText: line?.textContent?.trim() ?? '',
      offset: selection.anchorOffset,
    }
  })
}

async function assertComposerResultWithinBounds(page) {
  await waitForCondition(
    async () =>
      page.evaluate(() => {
        const composer = document.querySelector('[data-ai-composer="true"]')
        const resultPanel = document.querySelector('[data-ai-result-panel="true"]')
        const resultBody = document.querySelector('[data-ai-result-body="true"]')

        if (
          !(composer instanceof HTMLElement) ||
          !(resultPanel instanceof HTMLElement) ||
          !(resultBody instanceof HTMLElement)
        ) {
          return false
        }

        const composerRect = composer.getBoundingClientRect()
        const resultRect = resultPanel.getBoundingClientRect()

        return (
          resultRect.top >= composerRect.top - 1 &&
          resultRect.bottom <= composerRect.bottom + 1 &&
          resultBody.scrollWidth <= resultBody.clientWidth + 1
        )
      }),
    'AI result panel to stay within the composer bounds'
  )
}

async function readActiveElementSnapshot(page) {
  return page.evaluate(() => {
    const activeElement = document.activeElement
    if (!(activeElement instanceof HTMLElement)) return null

    return {
      tagName: activeElement.tagName,
      ariaLabel: activeElement.getAttribute('aria-label'),
      className: activeElement.className,
      dataAIAction: activeElement.getAttribute('data-ai-action'),
      isInEditor: !!activeElement.closest('.cm-editor'),
      role: activeElement.getAttribute('role'),
      title: activeElement.getAttribute('title'),
    }
  })
}

await main()
