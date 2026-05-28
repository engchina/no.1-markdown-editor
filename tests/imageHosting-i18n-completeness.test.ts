import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

function collectNestedKeys(value: unknown, prefix = ''): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []

  const entries = Object.entries(value as Record<string, unknown>)
  return entries.flatMap(([key, child]) => {
    const next = prefix ? `${prefix}.${key}` : key
    const nested = collectNestedKeys(child, next)
    return nested.length > 0 ? nested : [next]
  })
}

function getNestedValue(locale: Record<string, unknown>, key: string): unknown {
  return key.split('.').reduce<unknown>((current, segment) => {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined
    return (current as Record<string, unknown>)[segment]
  }, locale)
}

function pickImageHostingSubset(locale: Record<string, unknown>) {
  return {
    imageHosting: locale.imageHosting,
    toolbar: {
      imageHosting: (locale.toolbar as Record<string, unknown> | undefined)?.imageHosting,
    },
    commands: {
      uploadLocalImagesToHosting: (locale.commands as Record<string, unknown> | undefined)
        ?.uploadLocalImagesToHosting,
    },
  }
}

test('image hosting copy is structurally complete across en, ja, and zh locales', async () => {
  const [enRaw, jaRaw, zhRaw] = await Promise.all([
    readFile(new URL('../src/i18n/locales/en.json', import.meta.url), 'utf8'),
    readFile(new URL('../src/i18n/locales/ja.json', import.meta.url), 'utf8'),
    readFile(new URL('../src/i18n/locales/zh.json', import.meta.url), 'utf8'),
  ])

  const en = pickImageHostingSubset(JSON.parse(enRaw))
  const ja = pickImageHostingSubset(JSON.parse(jaRaw))
  const zh = pickImageHostingSubset(JSON.parse(zhRaw))

  const enKeys = collectNestedKeys(en).sort()
  const jaKeys = collectNestedKeys(ja).sort()
  const zhKeys = collectNestedKeys(zh).sort()

  assert.deepEqual(jaKeys, enKeys)
  assert.deepEqual(zhKeys, enKeys)
})

test('all image hosting notice and instruction keys are non-empty strings', async () => {
  const [enRaw, jaRaw, zhRaw] = await Promise.all([
    readFile(new URL('../src/i18n/locales/en.json', import.meta.url), 'utf8'),
    readFile(new URL('../src/i18n/locales/ja.json', import.meta.url), 'utf8'),
    readFile(new URL('../src/i18n/locales/zh.json', import.meta.url), 'utf8'),
  ])

  const requiredKeys = [
    'toolbar.imageHosting',
    'commands.uploadLocalImagesToHosting',
    'imageHosting.sectionLabel',
    'imageHosting.panelTitle',
    'imageHosting.title',
    'imageHosting.description',
    'imageHosting.desktopOnly',
    'imageHosting.enableToggle',
    'imageHosting.fields.owner',
    'imageHosting.fields.repo',
    'imageHosting.fields.branch',
    'imageHosting.fields.directory',
    'imageHosting.fields.commitMessage',
    'imageHosting.fields.commitMessageHint',
    'imageHosting.placeholders.owner',
    'imageHosting.placeholders.repo',
    'imageHosting.placeholders.commitMessage',
    'imageHosting.actions.saveConfig',
    'imageHosting.actions.saving',
    'imageHosting.actions.verify',
    'imageHosting.actions.verifying',
    'imageHosting.pat.title',
    'imageHosting.pat.savedDescription',
    'imageHosting.pat.missingDescription',
    'imageHosting.pat.inputPlaceholder',
    'imageHosting.pat.save',
    'imageHosting.pat.clear',
    'imageHosting.pat.openGithubNewRepo',
    'imageHosting.pat.openGithubPatPage',
    'imageHosting.instructions.show',
    'imageHosting.instructions.hide',
    'imageHosting.instructions.step1',
    'imageHosting.instructions.step2',
    'imageHosting.instructions.step3',
    'imageHosting.instructions.step4',
    'imageHosting.instructions.step5',
    'imageHosting.instructions.step6',
    'imageHosting.instructions.step7',
    'imageHosting.instructions.step8',
    'imageHosting.notices.configSavedTitle',
    'imageHosting.notices.configSavedMessage',
    'imageHosting.notices.patSavedTitle',
    'imageHosting.notices.verifyOkTitle',
    'imageHosting.notices.verifyFailedTitle',
    'imageHosting.notices.unsavedDocumentTitle',
    'imageHosting.notices.notConfiguredTitle',
    'imageHosting.notices.noLocalImagesTitle',
    'imageHosting.notices.uploadCompletedTitle',
    'imageHosting.notices.uploadPartialTitle',
    'imageHosting.notices.uploadFailedTitle',
  ]

  for (const [name, raw] of [
    ['en', enRaw],
    ['ja', jaRaw],
    ['zh', zhRaw],
  ] as const) {
    const locale = JSON.parse(raw) as Record<string, unknown>
    for (const key of requiredKeys) {
      const value = getNestedValue(locale, key)
      assert.equal(
        typeof value,
        'string',
        `${name}.json missing key: ${key}`
      )
      assert.ok(
        ((value as string) ?? '').trim().length > 0,
        `${name}.json has empty value for: ${key}`
      )
    }
  }
})
