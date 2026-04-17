import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

test('useExternalFileChanges surfaces a toast when the fs.watch registration fails', async () => {
  const source = await readFile(new URL('../src/hooks/useExternalFileChanges.ts', import.meta.url), 'utf8')

  assert.match(source, /import\s*\{[^}]*pushErrorNotice[^}]*\}\s*from\s*'\.\.\/lib\/notices'/)
  assert.match(
    source,
    /catch \(error\) \{[\s\S]*console\.error\('External file watch registration error:'[\s\S]*if \(!disposed\)[\s\S]*pushErrorNotice\(\s*'notices\.externalFileWatchErrorTitle',\s*'notices\.externalFileWatchErrorMessage'/
  )
})

test('externalFileWatch and openMultipleFiles notice keys exist in all locales', async () => {
  const locales = ['en', 'zh', 'ja']
  for (const locale of locales) {
    const text = await readFile(
      new URL(`../src/i18n/locales/${locale}.json`, import.meta.url),
      'utf8'
    )
    const json = JSON.parse(text) as { notices: Record<string, string> }
    assert.ok(json.notices.externalFileWatchErrorTitle, `${locale}: externalFileWatchErrorTitle`)
    assert.ok(json.notices.externalFileWatchErrorMessage, `${locale}: externalFileWatchErrorMessage`)
    assert.ok(json.notices.openMultipleFilesErrorTitle, `${locale}: openMultipleFilesErrorTitle`)
    assert.ok(json.notices.openMultipleFilesErrorMessage, `${locale}: openMultipleFilesErrorMessage`)
  }
})
