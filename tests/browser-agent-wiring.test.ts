import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { DEFAULT_BROWSER_URL } from '../src/lib/browser/defaults.ts'

function getNestedValue(locale: Record<string, unknown>, key: string): unknown {
  return key.split('.').reduce<unknown>((current, segment) => {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined
    return (current as Record<string, unknown>)[segment]
  }, locale)
}

test('browser agent toolbar labels exist across locales so raw i18n keys are never shown', async () => {
  const locales = ['en', 'ja', 'zh']
  const keys = [
    'browser.navigation.back',
    'browser.navigation.forward',
    'browser.navigation.reload',
    'browser.navigation.home',
    'browser.navigation.addressPlaceholder',
    'browser.agent.clip',
    'browser.agent.ask',
    'browser.agent.modeLabel',
    'browser.agent.modes.auto',
    'browser.agent.modes.article',
    'browser.agent.modes.selection',
    'browser.agent.modes.visible',
    'browser.agent.modes.list',
    'browser.agent.working',
    'browser.agent.clipSuccess',
    'browser.agent.clipError',
    'browser.agent.askError',
    'browser.desktopOnly.title',
    'browser.desktopOnly.message',
  ]

  for (const localeName of locales) {
    const locale = JSON.parse(
      await readFile(new URL(`../src/i18n/locales/${localeName}.json`, import.meta.url), 'utf8')
    ) as Record<string, unknown>

    for (const key of keys) {
      const value = getNestedValue(locale, key)
      assert.equal(typeof value, 'string', `${localeName}.json missing ${key}`)
      assert.notEqual(value, key, `${localeName}.json exposes raw key ${key}`)
      assert.notEqual((value as string).trim(), '', `${localeName}.json has empty ${key}`)
    }
  }
})

test('browser toolbar uses localized accessible labels instead of hard-coded English chrome', async () => {
  const source = await readFile(new URL('../src/components/Browser/BrowserContainer.tsx', import.meta.url), 'utf8')

  for (const key of [
    'browser.navigation.back',
    'browser.navigation.forward',
    'browser.navigation.reload',
    'browser.navigation.home',
    'browser.navigation.addressPlaceholder',
    'browser.desktopOnly.title',
    'browser.desktopOnly.message',
    'browser.agent.modeLabel',
  ]) {
    assert.match(source, new RegExp(`t\\('${key.replaceAll('.', '\\.')}\\'\\)`))
  }

  assert.doesNotMatch(source, /title="Back"/)
  assert.doesNotMatch(source, /title="Forward"/)
  assert.doesNotMatch(source, /title="Reload"/)
  assert.doesNotMatch(source, /title="Home"/)
  assert.doesNotMatch(source, /Search or enter website URL\.\.\./)
  assert.doesNotMatch(source, /Tauri Native Webview Placeholder/)
  assert.match(source, /<select/)
  assert.match(source, /BROWSER_EXTRACTION_MODES\.map/)
  assert.match(source, /collectPageContent\(label, \{ extractionMode \}\)/)
})

test('browser agent clip opens a new dirty Markdown draft instead of appending to an existing note', async () => {
  const source = await readFile(new URL('../src/components/Browser/BrowserContainer.tsx', import.meta.url), 'utf8')

  assert.doesNotMatch(source, /appendWebClipToDocument/)
  assert.doesNotMatch(source, /reverse\(\)\.find/)
  assert.match(
    source,
    /addTab\(\{\s*type: 'markdown',\s*content: clip,\s*savedContent: '',\s*isDirty: true,\s*\}\)/u
  )
})

test('new browser surfaces use the shared Google default URL', async () => {
  assert.equal(DEFAULT_BROWSER_URL, 'https://www.google.com/')

  const sources = await Promise.all([
    readFile(new URL('../src/App.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/DocumentTabs/DocumentTabs.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/Toolbar/Toolbar.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/hooks/useCommands.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/Browser/BrowserContainer.tsx', import.meta.url), 'utf8'),
  ])

  for (const source of sources) {
    assert.match(source, /DEFAULT_BROWSER_URL/)
    assert.doesNotMatch(source, /https:\/\/google\.com/)
  }
})

test('browser bridge normalizes clipped link and image URLs against the current page', async () => {
  const bridge = await readFile(new URL('../src-tauri/src/browser_bridge.js', import.meta.url), 'utf8')

  assert.match(bridge, /function normalizeLinkUrl\(rawUrl\)/)
  assert.match(bridge, /function normalizeImageUrl\(rawUrl\)/)
  assert.match(bridge, /new URL\(raw, location\.href\)/)
  assert.match(bridge, /protocol === 'http:' \|\| protocol === 'https:' \|\| protocol === 'mailto:' \|\| protocol === 'tel:'/)
  assert.match(bridge, /var href = normalizeLinkUrl\(child\.getAttribute\('href'\) \|\| ''\)/)
  assert.match(bridge, /var src = normalizeImageUrl\(child\.getAttribute\('src'\) \|\| ''\)/)
  assert.doesNotMatch(bridge, /var href = child\.getAttribute\('href'\) \|\| ''/)
  assert.doesNotMatch(bridge, /var src = child\.getAttribute\('src'\) \|\| ''/)
})

test('browser bridge extracts article list pages as compact markdown lists', async () => {
  const bridge = await readFile(new URL('../src-tauri/src/browser_bridge.js', import.meta.url), 'utf8')

  assert.match(bridge, /function buildArticleListMarkdown\(root\)/)
  assert.match(bridge, /function isLikelyArticleHref\(href\)/)
  assert.match(bridge, /function isLikelyContentHref\(href, title\)/)
  assert.match(bridge, /function cardSignature\(el\)/)
  assert.match(bridge, /function elementFingerprint\(el\)/)
  assert.match(bridge, /function elementFingerprintSimilarity\(left, right\)/)
  assert.match(bridge, /function similarFingerprintCount\(candidate, candidates\)/)
  assert.match(bridge, /function findContentCard\(link, root, title\)/)
  assert.match(bridge, /if \(!fallback && hasGenericCardSignals\(node, title\)\) fallback = node/)
  assert.match(bridge, /function contentCardScore\(candidate, signatureCount, similarCount\)/)
  assert.match(bridge, /\/\\\/items\\\/\[A-Za-z0-9_-\]\+\/\.test\(path\)/)
  assert.match(bridge, /if \(!isLikelyContentHref\(href, title\)\) continue/)
  assert.match(bridge, /signatureCounts\[signature\] = \(signatureCounts\[signature\] \|\| 0\) \+ 1/)
  assert.match(bridge, /fingerprint: elementFingerprint\(card\)/)
  assert.match(bridge, /similarCount = similarFingerprintCount\(candidates\[groupIndex\], candidates\)/)
  assert.match(bridge, /var score = contentCardScore\(candidate, signatureCounts\[candidate\.signature\] \|\| 0, candidate\.similarCount \|\| 1\)/)
  assert.match(bridge, /if \(score < 6\) continue/)
  assert.match(bridge, /function nearestSectionHeading\(card, root\)/)
  assert.match(bridge, /function isArticleCardHeading\(heading\)/)
  assert.match(bridge, /if \(isArticleCardHeading\(heading\)\) continue/)
  assert.match(bridge, /\^@\\s\*\[A-Za-z0-9_-\]\{1,32\}/)
  assert.match(bridge, /return section/)
  assert.match(bridge, /if \(contentLinks >= 8\) break/)
  assert.match(bridge, /function extractArticleAuthor\(card, title\)/)
  assert.match(bridge, /\[class\*="author"\], \[class\*="user"\], \[class\*="byline"\]/)
  assert.match(bridge, /if \(!text \|\| text === title\) continue/)
  assert.match(bridge, /function extractAuthorFromText\(text\)/)
  assert.match(bridge, /var byline = value\.match/)
  assert.match(bridge, /parts\.push\('- ' \+ markdownLink\(record\.title, record\.href\) \+ \(suffix\.length \? ' — ' \+ suffix\.join\('; '\) : ''\)\)/)
  assert.match(bridge, /makeExtractionResult\(buildArticleListMarkdown\(root\), root, root, 'list', 'article-card-list'\)/)
  assert.match(bridge, /makeExtractionResult\(buildFallbackMarkdown\(root\), root, root, 'fallback', 'main-root'\)/)
})

test('browser bridge prefers long-form article content before related link lists', async () => {
  const bridge = await readFile(new URL('../src-tauri/src/browser_bridge.js', import.meta.url), 'utf8')

  assert.match(bridge, /function pickReadabilityRoot\(\)/)
  assert.match(bridge, /function readabilityParagraphScore\(text\)/)
  assert.match(bridge, /function classWeight\(el\)/)
  assert.match(bridge, /function pickArticleRoot\(\)/)
  assert.match(bridge, /function buildArticleMarkdown\(root\)/)
  assert.match(bridge, /function hasLongFormSignals\(el\)/)
  assert.match(bridge, /\[itemprop="articleBody"\]/)
  assert.match(bridge, /\.markdown-body/)
  assert.match(bridge, /articleUrl && matchesContentContainer\(el\) && textLength >= 120 && contentBlocks >= 2 && ratio < 0\.55/)
  assert.match(bridge, /matchesContentContainer\(el\) && textLength >= 180 && headings >= 1/)
  assert.match(bridge, /var articleRoot = pickArticleRoot\(\)/)
  assert.match(bridge, /resolveExtraction\(requestedMode, root, articleRoot\)/)
  assert.match(bridge, /buildArticleMarkdown\(articleRoot\).*buildArticleListMarkdown\(root\).*buildFallbackMarkdown\(root\)/s)
  assert.match(bridge, /var text = textOf\(textRoot\)\.slice\(0, 200000\)/)
})

test('browser bridge supports explicit extraction modes and diagnostics', async () => {
  const bridge = await readFile(new URL('../src-tauri/src/browser_bridge.js', import.meta.url), 'utf8')
  const rust = await readFile(new URL('../src-tauri/src/lib.rs', import.meta.url), 'utf8')
  const agentBridge = await readFile(new URL('../src/lib/browser/agentBridge.ts', import.meta.url), 'utf8')

  assert.match(bridge, /function normalizeExtractionMode\(mode\)/)
  assert.match(bridge, /function shouldSkipTextNode\(node\)/)
  assert.match(bridge, /function shouldSuppressTextElement\(el\)/)
  assert.match(bridge, /var ZERO_WIDTH_RE =/)
  assert.match(bridge, /style\.display === 'none'/)
  assert.match(bridge, /function looksLikeImplementationText\(text\)/)
  assert.match(bridge, /function buildPlainTextMarkdown\(root\)/)
  assert.match(bridge, /function buildFallbackMarkdown\(root\)/)
  assert.match(bridge, /function buildSelectionMarkdown\(\)/)
  assert.match(bridge, /function buildVisibleMarkdown\(root\)/)
  assert.match(bridge, /blockMd\(wrapper, \{ assumeVisible: true \}\)/)
  assert.match(bridge, /function resolveExtraction\(requestedMode, root, articleRoot\)/)
  assert.match(bridge, /window\.__agentCollect = function \(requestId, options\)/)
  assert.match(bridge, /extraction: extractionStats/)
  assert.match(rust, /fn normalize_browser_extraction_mode/)
  assert.match(rust, /window\.__agentCollect && window\.__agentCollect\('\{\}', \{\{ mode: \{\} \}\}\)/)
  assert.match(agentBridge, /export type BrowserExtractionMode = 'auto' \| 'article' \| 'selection' \| 'visible' \| 'list'/)
  assert.match(agentBridge, /await invoke\('browser_collect_content', \{ label, requestId, extractionMode \}\)/)
})

test('browser bridge filters decorative images from clipped markdown', async () => {
  const bridge = await readFile(new URL('../src-tauri/src/browser_bridge.js', import.meta.url), 'utf8')

  assert.match(bridge, /function shouldIncludeImage\(el\)/)
  assert.match(bridge, /avatar\|badge\|icon\|logo\|profile\|user\|thumb\|emoji\|symbol/i)
  assert.match(bridge, /width < 180 \|\| height < 120/)
  assert.match(bridge, /src && shouldIncludeImage\(child\)/)
  assert.match(bridge, /isrc && shouldIncludeImage\(el\)/)
})

test('browser bridge skips navigation and recommendation chrome from readable content', async () => {
  const bridge = await readFile(new URL('../src-tauri/src/browser_bridge.js', import.meta.url), 'utf8')

  assert.match(bridge, /function shouldSkipContentElement\(el\)/)
  assert.match(bridge, /related\|share\|sidebar\|social\|sponsor\|subscribe\|toc\|table-of-contents/)
  assert.match(bridge, /role === 'navigation'/)
  assert.match(bridge, /if \(shouldSkipContentElement\(el\)\) continue/)
})

test('browser bridge preserves common article structures as markdown', async () => {
  const bridge = await readFile(new URL('../src-tauri/src/browser_bridge.js', import.meta.url), 'utf8')

  assert.match(bridge, /function tableMd\(table\)/)
  assert.match(bridge, /function codeLanguage\(el\)/)
  assert.match(bridge, /function figureMd\(el\)/)
  assert.match(bridge, /parts\.push\('```' \+ codeLanguage\(el\)/)
  assert.match(bridge, /var table = tableMd\(el\)/)
  assert.match(bridge, /var figure = figureMd\(el\)/)
})
