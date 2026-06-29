import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdir, readFile, stat } from 'node:fs/promises'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { chromium } from '@playwright/test'

const DIST_DIR = resolve('dist')
const HOST = '127.0.0.1'
const FAILURE_PATH = resolve('output/playwright/screenshot-smoke-failure.png')
const ANNOTATION_PATH = resolve('output/playwright/screenshot-annotation-toolbar.png')

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

function within(root, candidate) {
  const normalizedRoot = normalize(root.endsWith(sep) ? root : `${root}${sep}`)
  const normalizedCandidate = normalize(candidate)
  return normalizedCandidate === normalize(root) || normalizedCandidate.startsWith(normalizedRoot)
}

async function staticServer() {
  await stat(join(DIST_DIR, 'index.html'))
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent((request.url ?? '/').split('?')[0])
      const target = resolve(DIST_DIR, pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, ''))
      if (!within(DIST_DIR, target)) return response.writeHead(403).end()
      const body = await readFile(target)
      response.writeHead(200, { 'Content-Type': MIME_TYPES[extname(target)] ?? 'application/octet-stream' })
      response.end(body)
    } catch {
      response.writeHead(404).end('Not found')
    }
  })
  await new Promise((resolveListen, reject) => {
    server.once('error', reject)
    server.listen(0, HOST, resolveListen)
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Screenshot smoke server has no port')
  return {
    origin: `http://${HOST}:${address.port}`,
    close: () => new Promise((resolveClose) => server.close(resolveClose)),
  }
}

async function launchBrowser() {
  const attempts = [
    { label: 'bundled Chromium', options: { headless: true } },
    ...(process.platform === 'win32' ? [{ label: 'Microsoft Edge', options: { channel: 'msedge', headless: true } }] : []),
    { label: 'Google Chrome', options: { channel: 'chrome', headless: true } },
  ]
  const failures = []
  for (const attempt of attempts) {
    try {
      return { browser: await chromium.launch(attempt.options), label: attempt.label }
    } catch (error) {
      failures.push(`${attempt.label}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  throw new Error(`Unable to launch screenshot smoke browser:\n${failures.join('\n')}`)
}

const persistedState = {
  state: {
    viewMode: 'source',
    sidebarOpen: false,
    editorRatio: 0.5,
    lineNumbers: true,
    wordWrap: true,
    fontSize: 14,
    wysiwygMode: false,
    activeThemeId: 'default-light',
    tabs: [{
      id: 'screenshot-smoke-tab',
      path: null,
      name: 'ScreenshotSmoke.md',
      content: '# Screenshot smoke\n\nCursor target',
      savedContent: '# Screenshot smoke\n\nCursor target',
      isDirty: false,
    }],
    activeTabId: 'screenshot-smoke-tab',
  },
  version: 0,
}

let server
let browser
let page
try {
  server = await staticServer()
  const launched = await launchBrowser()
  browser = launched.browser
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await context.addInitScript((state) => {
    localStorage.setItem('language', 'en')
    localStorage.setItem('editor-settings', JSON.stringify(state))
  }, persistedState)
  page = await context.newPage()
  await page.goto(`${server.origin}/?screenshotTest=1`, { waitUntil: 'networkidle' })
  await page.locator('.cm-content').waitFor()
  await page.locator('[data-toolbar-action="capture-screenshot"]').waitFor()

  await page.locator('[data-toolbar-action="command-palette"]').click()
  await page.locator('#command-palette-input').fill('Capture screenshot')
  await page.getByText('Capture screenshot', { exact: true }).waitFor()
  await page.keyboard.press('Escape')

  const fixture = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 320
    canvas.height = 180
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Fixture canvas unavailable')
    const gradient = context.createLinearGradient(0, 0, 320, 180)
    gradient.addColorStop(0, '#2563eb')
    gradient.addColorStop(1, '#14b8a6')
    context.fillStyle = gradient
    context.fillRect(0, 0, 320, 180)
    context.fillStyle = '#ffffff'
    context.font = 'bold 24px sans-serif'
    context.fillText('Screenshot fixture', 52, 96)
    return context.canvas.toDataURL('image/png')
  })

  const openFixture = () => page.evaluate((imageUrl) => {
    document.dispatchEvent(new CustomEvent('app:screenshot-fixture', {
      detail: { imageUrl, width: 320, height: 180, selection: { x: 12, y: 10, width: 296, height: 160 } },
    }))
  }, fixture)

  await openFixture()
  await page.getByRole('dialog', { name: 'Annotate screenshot' }).waitFor()
  const annotationToolbar = page.getByRole('toolbar', { name: 'Screenshot tools' })
  await annotationToolbar.waitFor()
  for (const label of ['Select', 'Crop', 'Arrow', 'Rectangle', 'Text', 'Mosaic']) {
    const button = annotationToolbar.getByRole('button', { name: label })
    await button.waitFor()
    assert.equal((await button.textContent())?.trim(), '')
  }
  assert.equal(await page.getByRole('button', { name: 'Annotate' }).count(), 0)
  assert.equal(await page.locator('svg[aria-label="Screenshot annotation canvas"] circle').count(), 8)
  await mkdir(resolve('output/playwright'), { recursive: true })
  await page.waitForTimeout(150)
  await page.screenshot({ path: ANNOTATION_PATH, fullPage: true })
  for (const key of ['A', 'R', 'M']) {
    await page.keyboard.press(key)
    await page.keyboard.press('Space')
  }
  await annotationToolbar.getByRole('button', { name: 'Text' }).click()
  await page.getByRole('application', { name: 'Screenshot annotation canvas' }).click({ position: { x: 160, y: 90 } })
  const textInput = page.getByRole('textbox', { name: 'Annotation text' })
  await textInput.click()
  await textInput.type('Smoke')
  assert.equal(await textInput.inputValue(), 'Smoke')
  await textInput.press('Enter')
  await page.keyboard.press('V')
  await page.getByRole('button', { name: 'Edit text' }).waitFor()
  await page.keyboard.press('Space')
  await page.getByRole('textbox', { name: 'Annotation text' }).fill('Edited smoke')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')

  await page.getByRole('dialog', { name: 'Annotate screenshot' }).waitFor({ state: 'detached' })
  const markdown = await page.locator('.cm-content').innerText()
  assert.match(markdown, /!\[screenshot\]\(data:image\/png;base64,/)

  await page.locator('[data-view-mode="split"]').click()
  await page.locator('img[src^="data:image/png;base64,"]').waitFor()
  await page.locator('[data-view-mode="preview"]').click()
  await page.locator('img[src^="data:image/png;base64,"]').waitFor()
  await page.locator('[data-view-mode="source"]').click()
  await page.locator('.cm-content').click()
  await page.keyboard.press('Control+End')
  const wysiwygButton = page.getByRole('button', { name: /WYSIWYG/i })
  await wysiwygButton.click()
  await page.locator('img[src^="data:image/png;base64,"]').waitFor()
  await wysiwygButton.click()

  const readStoredContent = () => page.evaluate(() => {
    const stored = JSON.parse(localStorage.getItem('editor-settings') ?? '{}')
    const activeTabId = stored.state?.activeTabId
    return stored.state?.tabs?.find((tab) => tab.id === activeTabId)?.content ?? ''
  })
  await page.waitForTimeout(350)
  const beforeCancel = await readStoredContent()
  await openFixture()
  await page.getByRole('dialog', { name: 'Annotate screenshot' }).waitFor()
  await page.keyboard.press('R')
  await page.keyboard.press('Space')
  await page.keyboard.press('Escape')
  await page.getByRole('dialog', { name: 'Annotate screenshot' }).waitFor({ state: 'detached' })
  await page.waitForTimeout(350)
  assert.equal(await readStoredContent(), beforeCancel)
  assert.equal(await page.evaluate(() => document.activeElement?.closest('.cm-editor') !== null), true)

  console.log(`Screenshot smoke passed with ${launched.label}`)
} catch (error) {
  await mkdir(resolve('output/playwright'), { recursive: true })
  if (page) await page.screenshot({ path: FAILURE_PATH, fullPage: true }).catch(() => undefined)
  throw error
} finally {
  if (browser) await browser.close()
  if (server) await server.close()
}
