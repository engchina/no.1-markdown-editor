import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { EditorState } from '@codemirror/state'
import { collectFencedCodeBlocks } from '../src/components/Editor/fencedCodeRanges.ts'
import { collectWysiwygCodeBlockDecorations } from '../src/components/Editor/wysiwygCodeBlock.ts'

function collectDecorationSpecs(markdown: string, anchor: number) {
  const state = EditorState.create({
    doc: markdown,
    selection: { anchor },
  })
  const blocks = collectFencedCodeBlocks(markdown)
  const decorations = collectWysiwygCodeBlockDecorations(
    {
      state,
      visibleRanges: [{ from: 0, to: markdown.length }],
    },
    blocks
  )
  const entries = decorations.map((decoration) => ({
    from: decoration.from,
    to: decoration.to,
    spec: decoration.value.spec as { attributes?: Record<string, string> },
  }))

  return { blocks, entries }
}

test('collectWysiwygCodeBlockDecorations turns inactive fenced code blocks into block chrome without raw fences', () => {
  const markdown = [
    'Intro',
    '',
    '```ts',
    'const answer = 42',
    '```',
    '',
    'After',
  ].join('\n')

  const { blocks, entries } = collectDecorationSpecs(markdown, 0)
  const [block] = blocks

  assert.ok(block)

  const metaLine = entries.find((entry) => entry.spec.attributes?.class?.includes('cm-wysiwyg-codeblock-meta-line'))
  const bodyLine = entries.find((entry) => entry.spec.attributes?.class?.includes('cm-wysiwyg-codeblock-line'))
  const closeLine = entries.find((entry) => entry.spec.attributes?.class?.includes('cm-wysiwyg-codeblock-close-line'))

  assert.equal(metaLine?.from, block.openingLineFrom)
  assert.equal(metaLine?.spec.attributes?.['data-code-language-label'], 'Code (ts)')
  assert.equal(bodyLine?.from, markdown.indexOf('const answer = 42'))
  assert.equal(closeLine?.from, block.closingLineFrom)
})

test('collectWysiwygCodeBlockDecorations drops code block chrome when the selection enters the fenced block', () => {
  const markdown = [
    'Intro',
    '',
    '```ts',
    'const answer = 42',
    '```',
    '',
    'After',
  ].join('\n')

  const { entries } = collectDecorationSpecs(markdown, markdown.indexOf('answer'))
  const codeBlockEntries = entries.filter((entry) => entry.spec.attributes?.class?.includes('cm-wysiwyg-codeblock'))

  assert.deepEqual(codeBlockEntries, [])
})

test('wysiwyg code block theme keeps preview-like horizontal insets instead of stretching edge to edge', async () => {
  const source = await readFile(new URL('../src/components/Editor/wysiwyg.ts', import.meta.url), 'utf8')

  assert.match(source, /'\.cm-wysiwyg-codeblock-meta-line': \{[\s\S]*?marginLeft: '32px'[\s\S]*?marginRight: '32px'[\s\S]*?padding: '10px 16px 8px !important'/u)
  assert.match(source, /'\.cm-wysiwyg-codeblock-line': \{[\s\S]*?marginLeft: '32px'[\s\S]*?marginRight: '32px'[\s\S]*?padding: '0 16px !important'/u)
  assert.match(source, /'\.cm-wysiwyg-codeblock-close-line': \{[\s\S]*?marginLeft: '32px'[\s\S]*?marginRight: '32px'[\s\S]*?padding: '0 16px 10px !important'/u)
})
