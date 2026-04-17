import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('wysiwyg gutter hides secondary source lines for inactive block renderers', async () => {
  const source = await readFile(new URL('../src/components/Editor/wysiwyg.ts', import.meta.url), 'utf8')
  const css = await readFile(new URL('../src/global.css', import.meta.url), 'utf8')

  assert.match(source, /class HiddenGutterMarker extends GutterMarker/u)
  assert.match(source, /elementClass = 'cm-wysiwyg-gutter-hidden'/u)
  assert.match(source, /function buildWysiwygGutterClasses\(state: CodeMirrorState\): RangeSet<GutterMarker> \{/u)
  assert.match(source, /const fencedCodeBlocks = collectFencedCodeBlocks\(markdown\)/u)
  assert.match(source, /const mathBlocks = collectMathBlocks\(markdown, fencedCodeBlocks\)/u)
  assert.match(source, /const tables = collectMarkdownTableBlocks\(markdown, \[\.\.\.fencedCodeBlocks, \.\.\.mathBlocks\]\)/u)
  assert.match(source, /for \(const fence of fencedCodeBlocks\) \{[\s\S]*?starts\.add\(doc\.lineAt\(closingFrom\)\.from\)/u)
  assert.match(source, /for \(const mathBlock of mathBlocks\) \{[\s\S]*?starts\.add\(hiddenLine\.from\)/u)
  assert.match(source, /for \(const table of tables\) \{[\s\S]*?starts\.add\(hiddenLine\.from\)/u)
  assert.match(source, /const wysiwygGutterClassField = StateField\.define<RangeSet<GutterMarker>>\(/u)
  assert.match(source, /provide: \(field\) => gutterLineClass\.from\(field\)/u)
  assert.match(source, /export const wysiwygTableDecorations = \[wysiwygTableDecorationField, wysiwygGutterClassField\]/u)

  assert.match(css, /\.cm-gutterElement\.cm-wysiwyg-gutter-hidden\s*\{[\s\S]*height:\s*0\s*!important;[\s\S]*padding:\s*0\s*!important;[\s\S]*pointer-events:\s*none;/u)
})
