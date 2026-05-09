import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const ROOT = new URL('../', import.meta.url)

async function readSource(relative: string): Promise<string> {
  return readFile(new URL(relative, ROOT), 'utf8')
}

function getNestedValue(locale: Record<string, unknown>, key: string): unknown {
  return key.split('.').reduce<unknown>((current, segment) => {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined
    return (current as Record<string, unknown>)[segment]
  }, locale)
}

test('editor store declares splitScrollSyncEnabled with a setter', async () => {
  const store = await readSource('src/store/editor.ts')

  assert.match(store, /splitScrollSyncEnabled: boolean/)
  assert.match(store, /setSplitScrollSyncEnabled: \(enabled: boolean\) => void/)
  assert.match(
    store,
    /setSplitScrollSyncEnabled: \(splitScrollSyncEnabled\) => set\(\{ splitScrollSyncEnabled \}\)/
  )
})

test('splitScrollSyncEnabled defaults to true and is persisted with default-true rehydration', async () => {
  const store = await readSource('src/store/editor.ts')

  // Initial state
  assert.match(store, /splitScrollSyncEnabled: true/)
  // Persisted via partialize
  assert.match(store, /splitScrollSyncEnabled: s\.splitScrollSyncEnabled/)
  // Rehydration uses the `!== false` idiom so missing/older state defaults to true
  assert.match(
    store,
    /splitScrollSyncEnabled: persistedState\?\.splitScrollSyncEnabled !== false/
  )
})

test('useSplitScrollSync gates on the persisted toggle', async () => {
  const hook = await readSource('src/hooks/useSplitScrollSync.ts')

  assert.match(hook, /useEditorStore\(\(state\) => state\.splitScrollSyncEnabled\)/)
  assert.match(hook, /if \(!enabled \|\| viewMode !== 'split'/)
})

test('theme panel exposes the split scroll sync toggle next to other preview options', async () => {
  const panel = await readSource('src/components/ThemePanel/ThemePanel.tsx')

  assert.match(panel, /splitScrollSyncEnabled/)
  assert.match(panel, /setSplitScrollSyncEnabled/)
  assert.match(panel, /t\('themePanel\.splitScrollSync'\)/)
  assert.match(panel, /t\('themePanel\.splitScrollSyncHint'\)/)
  // Toggle uses the same aria-pressed switch pattern as previewAutoRenderMermaid
  assert.match(panel, /aria-pressed=\{splitScrollSyncEnabled\}/)
})

test('split scroll sync locale copy exists across en, ja, and zh', async () => {
  const [enRaw, jaRaw, zhRaw] = await Promise.all([
    readSource('src/i18n/locales/en.json'),
    readSource('src/i18n/locales/ja.json'),
    readSource('src/i18n/locales/zh.json'),
  ])

  const locales = [JSON.parse(enRaw), JSON.parse(jaRaw), JSON.parse(zhRaw)] as Array<Record<string, unknown>>
  const keys = ['themePanel.splitScrollSync', 'themePanel.splitScrollSyncHint']

  for (const locale of locales) {
    for (const key of keys) {
      const value = getNestedValue(locale, key)
      assert.equal(typeof value, 'string', `${key} missing or non-string`)
      assert.ok((value as string).length > 0, `${key} empty`)
    }
  }
})
