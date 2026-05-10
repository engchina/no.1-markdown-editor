import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const ROOT = new URL('../', import.meta.url)

async function readSource(relative: string): Promise<string> {
  return readFile(new URL(relative, ROOT), 'utf8')
}

test('useScrollSyncStore exposes editorView and previewContainer registration', async () => {
  const store = await readSource('src/store/scrollSync.ts')

  assert.match(store, /editorView: EditorView \| null/)
  assert.match(store, /previewContainer: HTMLElement \| null/)
  assert.match(store, /setEditorView: \(view: EditorView \| null\) => void/)
  assert.match(store, /setPreviewContainer: \(container: HTMLElement \| null\) => void/)
})

test('useSplitScrollSync only attaches listeners when viewMode is "split"', async () => {
  const hook = await readSource('src/hooks/useSplitScrollSync.ts')

  // Reads viewMode from the editor store
  assert.match(hook, /useEditorStore\(\(state\) => state\.viewMode\)/)
  // Effect early-returns for any other view mode
  assert.match(hook, /viewMode !== 'split'/)
  // Both refs must be present before attaching
  assert.match(hook, /!editorView \|\| !previewContainer/)
})

test('useSplitScrollSync uses a cooldown guard to break sync feedback loops', async () => {
  const hook = await readSource('src/hooks/useSplitScrollSync.ts')

  assert.match(hook, /createScrollSyncGuard/)
  assert.match(hook, /guard\.canDrive\('editor'\)/)
  assert.match(hook, /guard\.canDrive\('preview'\)/)
  assert.match(hook, /guard\.noteDrove\('editor'\)/)
  assert.match(hook, /guard\.noteDrove\('preview'\)/)
})

test('useSplitScrollSync rebuilds the line map on every scroll (no stale-cache class of bugs)', async () => {
  const hook = await readSource('src/hooks/useSplitScrollSync.ts')

  // Both scroll handlers must call buildSourceLineMap right before consulting
  // it, rather than caching across events — caching across mutations was the
  // root cause of preview-scroll snapping the editor to the top.
  const buildCalls = (hook.match(/buildSourceLineMap\(readSourceLineEntries\(previewContainer\)\)/g) ?? []).length
  assert.ok(buildCalls >= 2, `expected at least 2 JIT map rebuilds in scroll handlers, got ${buildCalls}`)
})

test('useSplitScrollSync resolves CM6 positions via screen coords (no documentTop assumption)', async () => {
  const hook = await readSource('src/hooks/useSplitScrollSync.ts')

  // posAtCoords + coordsAtPos let CodeMirror own the document-vs-scroll
  // coordinate translation. Touching `view.documentTop` directly was unsafe.
  assert.match(hook, /view\.posAtCoords\(/)
  assert.match(hook, /view\.coordsAtPos\(/)
  // Comments may still mention `documentTop` historically; what matters is that
  // we never read `view.documentTop` at runtime.
  assert.doesNotMatch(hook, /view\.documentTop/)
  assert.doesNotMatch(hook, /\.documentTop\s*\?\?/)
})

test('CodeMirrorEditor publishes its EditorView to useScrollSyncStore', async () => {
  const editor = await readSource('src/components/Editor/CodeMirrorEditor.tsx')

  assert.match(editor, /useScrollSyncStore\.getState\(\)\.setEditorView\(view\)/)
  // Cleanup must clear the ref to avoid leaking destroyed views into sync
  assert.match(editor, /setEditorView\(null\)/)
})

test('MarkdownPreview publishes its scrolling container to useScrollSyncStore', async () => {
  const preview = await readSource('src/components/Preview/MarkdownPreview.tsx')

  assert.match(preview, /useScrollSyncStore/)
  assert.match(preview, /setPreviewContainer\(previewRef\.current\)/)
  assert.match(preview, /setPreviewContainer\(null\)/)
})

test('App.tsx mounts useSplitScrollSync once per render so split-mode wiring stays active', async () => {
  const app = await readSource('src/App.tsx')

  assert.match(app, /import \{ useSplitScrollSync \} from '\.\/hooks\/useSplitScrollSync'/)
  assert.match(app, /useSplitScrollSync\(\)/)
})
