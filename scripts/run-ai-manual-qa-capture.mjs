import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { chromium } from '@playwright/test'

const DIST_DIR = resolve('dist')
const HOST = '127.0.0.1'
const LOCAL_STORAGE_KEY = 'editor-settings'
const AI_MOCK_PROVIDER_KEY = 'no1-ai-mock-provider'
const OUTPUT_DIR = resolve('output/playwright/ai-manual-qa')
const VIEWPORT = { width: 1440, height: 960 }

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
  '.png': 'image/png',
}

const MANUAL_QA_MARKDOWN = [
  '---',
  'title: AI Manual QA',
  'tags: [ai, markdown, qa]',
  '---',
  '',
  '# AI Manual QA',
  '',
  'The quick brown fox jumps over the lazy dog.',
  '',
  '| Name | Value |',
  '| --- | --- |',
  '| Locale | Mixed |',
  '',
  '```mermaid',
  'flowchart LR',
  'A-->B',
  '```',
  '',
  '$$',
  'E = mc^2',
  '$$',
].join('\n')

const LOCALE_LABELS = {
  en: 'English',
  ja: 'Japanese',
  zh: 'Chinese',
}

const MODE_CONFIGS = [
  { id: 'source', viewMode: 'source', focusMode: false, wysiwygMode: false, intent: 'generate', outputTarget: 'at-cursor' },
  { id: 'split', viewMode: 'split', focusMode: false, wysiwygMode: false, intent: 'generate', outputTarget: 'at-cursor' },
  { id: 'preview', viewMode: 'preview', focusMode: false, wysiwygMode: false, intent: 'ask', outputTarget: 'chat-only' },
  { id: 'focus', viewMode: 'source', focusMode: true, wysiwygMode: false, intent: 'generate', outputTarget: 'at-cursor' },
  { id: 'wysiwyg', viewMode: 'source', focusMode: false, wysiwygMode: true, intent: 'generate', outputTarget: 'at-cursor' },
]

function buildPersistedEditorState({ locale, mode }) {
  void locale
  return {
    state: {
      viewMode: mode.viewMode,
      focusMode: mode.focusMode,
      sidebarWidth: 220,
      sidebarOpen: true,
      sidebarTab: 'outline',
      editorRatio: 0.5,
      lineNumbers: true,
      wordWrap: true,
      fontSize: 14,
      typewriterMode: false,
      wysiwygMode: mode.wysiwygMode,
      activeThemeId: 'default-light',
      aiDefaultWriteTarget: mode.outputTarget,
      aiDefaultSelectedTextRole: 'transform-target',
      tabs: [
        {
          id: 'ai-manual-qa-tab',
          path: null,
          name: 'AIManualQA.md',
          content: MANUAL_QA_MARKDOWN,
          savedContent: MANUAL_QA_MARKDOWN,
          isDirty: false,
        },
      ],
      activeTabId: 'ai-manual-qa-tab',
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
    throw new Error('AI manual QA server did not expose a usable TCP port')
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

async function launchBrowser() {
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
      'Unable to launch a browser for the AI manual QA capture.',
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

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true })

  const staticServer = await createStaticDistServer(DIST_DIR)
  let browser
  const qaResults = []

  try {
    const launchResult = await launchBrowser()
    browser = launchResult.browser
    console.log(`AI manual QA browser: ${launchResult.browserLabel}`)

    for (const locale of /** @type {const} */ (['en', 'ja', 'zh'])) {
      for (const mode of MODE_CONFIGS) {
        const result = await captureLocaleMode(browser, staticServer.origin, locale, mode)
        qaResults.push(result)
      }

      await renderLocaleReport(browser, locale, qaResults.filter((result) => result.locale === locale))
    }

    await writeFile(resolve(OUTPUT_DIR, 'report.json'), JSON.stringify(qaResults, null, 2), 'utf8')
    console.log('AI manual QA capture complete.')
  } finally {
    await browser?.close()
    await staticServer.close()
  }
}

async function captureLocaleMode(browser, origin, locale, mode) {
  const context = await browser.newContext({ viewport: VIEWPORT })
  const page = await context.newPage()

  await page.addInitScript(({ persistedState, storageKey, language, mockKey }) => {
    localStorage.clear()
    localStorage.setItem(storageKey, JSON.stringify(persistedState))
    localStorage.setItem('language', language)
    localStorage.setItem(mockKey, '1')
  }, {
    persistedState: buildPersistedEditorState({ locale, mode }),
    storageKey: LOCAL_STORAGE_KEY,
    language: locale,
    mockKey: AI_MOCK_PROVIDER_KEY,
  })

  try {
    await page.goto(origin, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.cm-content, .markdown-preview')

    await page.evaluate((detail) => {
      document.dispatchEvent(
        new CustomEvent('editor:ai-open', {
          detail,
          cancelable: true,
        })
      )
    }, {
      source: 'shortcut',
      intent: mode.intent,
      outputTarget: mode.outputTarget,
      prompt: 'Continue writing the next paragraph in a concise style.',
    })

    const composer = page.getByRole('dialog', { name: 'AI Composer' })
    await composer.waitFor()
    await waitForCondition(
      async () => await composer.locator('[data-ai-action="run"]').isEnabled(),
      `${locale}/${mode.id} AI run button to become enabled`
    )

    await composer.locator('[data-ai-action="run"]').click()
    await waitForCondition(
      async () =>
        (await readComposerDraftText(composer)).length > 0 &&
        (await composer.locator('[data-ai-action="cancel-request"]').count()) === 0,
      `${locale}/${mode.id} AI draft text to finish rendering`
    )

    const screenshotPath = resolve(OUTPUT_DIR, `${locale}-${mode.id}.png`)
    await page.screenshot({ path: screenshotPath, fullPage: true })

    const summary = await page.evaluate(() => {
      const composer = document.querySelector('[data-ai-composer="true"]')
      const preview = document.querySelector('.markdown-preview')
      const editor = document.querySelector('.cm-content')
      const sourceSurface = document.querySelector('[data-source-editor-surface="true"]')
      const bodyWidth = document.documentElement.scrollWidth
      const viewportWidth = window.innerWidth
      const composerWithinSourceBounds =
        composer instanceof HTMLElement && sourceSurface instanceof HTMLElement
          ? (() => {
              const composerRect = composer.getBoundingClientRect()
              const sourceRect = sourceSurface.getBoundingClientRect()
              const minimumGap = 10

              return (
                composerRect.top >= sourceRect.top + minimumGap &&
                composerRect.bottom <= sourceRect.bottom - minimumGap
              )
            })()
          : null

      return {
        composerOpen: !!composer,
        editorVisible: !!editor,
        previewVisible: !!preview,
        horizontalOverflow: bodyWidth > viewportWidth,
        composerWithinSourceBounds,
      }
    })

    const replaceVisible = (await composer.locator('[data-ai-action="replace"]').count()) > 0
    const insertVisible = (await composer.locator('[data-ai-action="insert"]').count()) > 0
    const newNoteVisible = (await composer.locator('[data-ai-action="new-note"]').count()) > 0
    const hasResultTargets = replaceVisible || insertVisible || newNoteVisible
    const applyVisible = hasResultTargets
    const languageLabel = await composer.locator('text=/Document Language:|文書言語:|文档语言:/').count().catch(() => 0)
    const promptText = await composer.locator('textarea').inputValue()
    const draftText = await readComposerDraftText(composer)

    if (mode.id === 'preview') {
      assert.equal(hasResultTargets, false)
      assert.equal(summary.editorVisible, false)
      assert.equal(summary.previewVisible, true)
    } else if (mode.id === 'split') {
      assert.equal(summary.editorVisible, true)
      assert.equal(summary.previewVisible, true)
      assert.equal(hasResultTargets, true)
      assert.equal(summary.composerWithinSourceBounds, true)
    } else {
      assert.equal(summary.editorVisible, true)
      assert.equal(hasResultTargets, true)
      assert.equal(summary.composerWithinSourceBounds, true)
    }

    assert.equal(summary.composerOpen, true)
    assert.equal(summary.horizontalOverflow, false)
    assert.match(promptText, /Continue writing/u)
    assert.ok(draftText.length > 0)
    assert.equal(languageLabel, 0)

    return {
      locale,
      localeLabel: LOCALE_LABELS[locale],
      mode: mode.id,
      screenshotPath,
      applyVisible,
      draftText,
      promptText,
      ...summary,
    }
  } finally {
    await context.close()
  }
}

async function renderLocaleReport(browser, locale, results) {
  const reportPath = resolve(OUTPUT_DIR, `${locale}-report.html`)
  const screenshotPath = resolve(OUTPUT_DIR, `${locale}-report.png`)
  const cards = results
    .map((result) => {
      const imageName = normalize(result.screenshotPath).split(sep).pop()
      return `
        <article class="card">
          <div class="meta">
            <span class="locale">${result.localeLabel}</span>
            <h2>${result.mode}</h2>
            <p>Apply visible: <strong>${result.applyVisible ? 'yes' : 'no'}</strong></p>
            <p>Editor visible: <strong>${result.editorVisible ? 'yes' : 'no'}</strong></p>
            <p>Preview visible: <strong>${result.previewVisible ? 'yes' : 'no'}</strong></p>
          </div>
          <img src="./${imageName}" alt="${result.localeLabel} ${result.mode}" />
        </article>
      `
    })
    .join('\n')

  const html = `<!doctype html>
<html lang="${locale}">
  <head>
    <meta charset="utf-8" />
    <title>AI Manual QA ${locale.toUpperCase()}</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f8fafc;
        --panel: #ffffff;
        --border: #cbd5e1;
        --text: #0f172a;
        --muted: #475569;
        --accent: #2563eb;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "Fira Sans", "Segoe UI", sans-serif;
        background: linear-gradient(180deg, #eff6ff 0%, var(--bg) 100%);
        color: var(--text);
      }
      main {
        max-width: 1480px;
        margin: 0 auto;
        padding: 32px 24px 48px;
      }
      header {
        margin-bottom: 24px;
      }
      h1 {
        margin: 0 0 8px;
        font-size: 32px;
        line-height: 1;
      }
      p {
        margin: 0;
        color: var(--muted);
      }
      .grid {
        display: grid;
        gap: 20px;
      }
      .card {
        background: color-mix(in srgb, var(--panel) 92%, transparent);
        border: 1px solid var(--border);
        border-radius: 20px;
        overflow: hidden;
        box-shadow: 0 16px 44px rgba(15, 23, 42, 0.08);
      }
      .meta {
        padding: 16px 18px;
        border-bottom: 1px solid var(--border);
        background: linear-gradient(135deg, rgba(37, 99, 235, 0.08), rgba(255, 255, 255, 0.92));
      }
      .locale {
        display: inline-flex;
        padding: 4px 10px;
        border-radius: 999px;
        background: rgba(37, 99, 235, 0.12);
        color: var(--accent);
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      h2 {
        margin: 12px 0 8px;
        font-size: 20px;
        text-transform: capitalize;
      }
      .meta p + p {
        margin-top: 4px;
      }
      img {
        display: block;
        width: 100%;
        height: auto;
        background: #e2e8f0;
      }
    </style>
  </head>
  <body>
    <main>
      <header>
        <h1>AI Manual QA: ${LOCALE_LABELS[locale]}</h1>
        <p>Captured on 2026-04-09 for source, split, preview, focus, and wysiwyg AI compatibility review.</p>
      </header>
      <section class="grid">
        ${cards}
      </section>
    </main>
  </body>
</html>`

  await writeFile(reportPath, html, 'utf8')

  const context = await browser.newContext({ viewport: { width: 1520, height: 1800 } })
  const page = await context.newPage()
  await page.goto(`file:///${reportPath.replace(/\\/gu, '/')}`)
  await page.screenshot({ path: screenshotPath, fullPage: true })
  await context.close()
}

async function readComposerDraftText(composer) {
  const content = await composer.locator('pre').first().textContent()
  return (content ?? '').trim()
}

await main()
