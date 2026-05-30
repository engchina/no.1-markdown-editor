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
    'browser.agent.clip',
    'browser.agent.ask',
    'browser.agent.working',
    'browser.agent.clipSuccess',
    'browser.agent.clipError',
    'browser.agent.askError',
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
