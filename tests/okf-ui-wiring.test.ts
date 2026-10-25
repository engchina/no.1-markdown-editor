import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { getOkfWorkspaceMode } from '../src/store/fileTree.ts'

const fileTreeSource = readFileSync(new URL('../src/components/Sidebar/FileTree.tsx', import.meta.url), 'utf8')
const storeSource = readFileSync(new URL('../src/store/fileTree.ts', import.meta.url), 'utf8')

test('OKF workspace mode defaults to auto and normalizes Windows workspace keys', () => {
  assert.equal(getOkfWorkspaceMode({}, 'C:\\Catalog'), 'auto')
  assert.equal(getOkfWorkspaceMode({ 'c:/catalog': 'enabled' }, 'C:\\Catalog\\'), 'enabled')
})

test('file tree persists OKF mode and exposes an accessible compact status popover', () => {
  assert.match(storeSource, /okfWorkspaceModes: state\.okfWorkspaceModes/u)
  assert.match(fileTreeSource, /aria-haspopup="dialog"/u)
  assert.match(fileTreeSource, /role="radiogroup"/u)
  assert.match(fileTreeSource, /role="radio"/u)
  assert.match(fileTreeSource, /openDocumentLocation\(issue\.path, issue\.line, 1\)/u)
  assert.match(fileTreeSource, /okfIssueCounts/u)
})

test('OKF and front matter UI copy is complete in English, Japanese, and Chinese', () => {
  for (const locale of ['en', 'ja', 'zh']) {
    const messages = JSON.parse(
      readFileSync(new URL(`../src/i18n/locales/${locale}.json`, import.meta.url), 'utf8')
    ) as Record<string, unknown>
    const okf = messages.okf as Record<string, unknown>
    const frontMatter = messages.frontMatter as Record<string, unknown>
    assert.equal(typeof okf.panelTitle, 'string')
    assert.equal(typeof okf.modeLabel, 'string')
    assert.equal(typeof okf.issue, 'object')
    assert.equal(typeof frontMatter.edit, 'string')
  }
})
