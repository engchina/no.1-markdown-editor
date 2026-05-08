import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

test('App keeps oversized split previews opt-in so restored drafts do not block startup', async () => {
  const source = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')

  assert.match(source, /const AUTO_PREVIEW_MAX_MARKDOWN_LENGTH = 160_000/u)
  assert.match(
    source,
    /const canAutoActivatePreview = \(activeTab\?\.content\.length \?\? 0\) <= AUTO_PREVIEW_MAX_MARKDOWN_LENGTH/u
  )
  assert.match(source, /type PreviewActivation = 'auto' \| 'manual'/u)
  assert.match(source, /useState<Map<string, PreviewActivation>>/u)
  assert.match(source, /currentTabPreviewActivation === 'manual'/u)
  assert.match(source, /currentTabPreviewActivation === 'auto' && canAutoActivatePreview/u)
  assert.match(source, /if \(viewMode !== 'preview' && !canAutoActivatePreview\) return/u)
  assert.match(source, /activatePreview\('auto'\)/u)
  assert.match(source, /activatePreview\('manual'\)/u)
  assert.match(source, /onActivate=\{\(\) => activatePreview\('manual'\)\}/u)
})
