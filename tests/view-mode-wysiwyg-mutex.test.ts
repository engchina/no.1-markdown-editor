import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

function getNestedValue(locale: Record<string, unknown>, key: string): unknown {
  return key.split('.').reduce<unknown>((current, segment) => {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined
    return (current as Record<string, unknown>)[segment]
  }, locale)
}

test('setViewMode disables WYSIWYG when switching into split view and notifies the user', async () => {
  const store = await readFile(new URL('../src/store/editor.ts', import.meta.url), 'utf8')

  assert.match(
    store,
    /setViewMode: \(viewMode\) => set\(\(s\) => \{\s*if \(viewMode === 'split' && s\.wysiwygMode\) \{\s*pushInfoNotice\(\s*'notices\.viewWysiwygSplitTitle',\s*'notices\.viewWysiwygSplitDisabledWysiwyg',\s*\)\s*return \{ viewMode, wysiwygMode: false \}\s*\}\s*return \{ viewMode \}\s*\}\)/,
  )
})

test('setWysiwygMode forces source view when enabling on top of split and notifies the user', async () => {
  const store = await readFile(new URL('../src/store/editor.ts', import.meta.url), 'utf8')

  assert.match(
    store,
    /setWysiwygMode: \(wysiwygMode\) => set\(\(s\) => \{\s*if \(wysiwygMode && s\.viewMode === 'split'\) \{\s*pushInfoNotice\(\s*'notices\.viewWysiwygSplitTitle',\s*'notices\.viewWysiwygSplitDisabledSplit',\s*\)\s*return \{ wysiwygMode, viewMode: 'source' as const \}\s*\}\s*return \{ wysiwygMode \}\s*\}\)/,
  )
})

test('persistence merge sanitizes the illegal {wysiwyg=true, view=split} combination silently', async () => {
  const store = await readFile(new URL('../src/store/editor.ts', import.meta.url), 'utf8')

  assert.match(store, /const wysiwygModeMerged = mergedState\.wysiwygMode === true/)
  assert.match(
    store,
    /const viewModeSanitized: ViewMode =\s*wysiwygModeMerged && mergedState\.viewMode === 'split' \? 'source' : mergedState\.viewMode/,
  )
  assert.match(store, /viewMode: viewModeSanitized,/)
})

test('view-mode + WYSIWYG mutex toast keys exist in en, ja, and zh', async () => {
  const [enRaw, jaRaw, zhRaw] = await Promise.all([
    readFile(new URL('../src/i18n/locales/en.json', import.meta.url), 'utf8'),
    readFile(new URL('../src/i18n/locales/ja.json', import.meta.url), 'utf8'),
    readFile(new URL('../src/i18n/locales/zh.json', import.meta.url), 'utf8'),
  ])

  const locales = [JSON.parse(enRaw), JSON.parse(jaRaw), JSON.parse(zhRaw)] as Array<Record<string, unknown>>
  const keys = [
    'notices.viewWysiwygSplitTitle',
    'notices.viewWysiwygSplitDisabledWysiwyg',
    'notices.viewWysiwygSplitDisabledSplit',
  ]

  for (const locale of locales) {
    for (const key of keys) {
      assert.equal(typeof getNestedValue(locale, key), 'string', key)
    }
  }
})
