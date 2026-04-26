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
    spec: decoration.value.spec as { attributes?: Record<string, string>; widget?: unknown },
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

test('collectWysiwygCodeBlockDecorations renders inactive Mermaid fences as one editable diagram widget', () => {
  const markdown = [
    'Intro',
    '',
    '```mermaid',
    'flowchart TD',
    'A --> B',
    '```',
    '',
    'After',
  ].join('\n')

  const { blocks, entries } = collectDecorationSpecs(markdown, 0)
  const [block] = blocks

  assert.ok(block)

  const widgetEntry = entries.find((entry) => entry.spec.widget)
  const widget = widgetEntry?.spec.widget as { constructor?: { name?: string } } | undefined
  const hiddenLineStarts = entries
    .filter((entry) => entry.spec.attributes?.class?.includes('cm-wysiwyg-mermaid-hidden-line'))
    .map((entry) => entry.from)

  assert.equal(widgetEntry?.from, block.openingLineFrom)
  assert.equal(widgetEntry?.to, block.openingLineTo)
  assert.equal(widget?.constructor?.name, 'MermaidDiagramWidget')
  assert.equal(
    entries.find((entry) => entry.spec.attributes?.class?.includes('cm-wysiwyg-mermaid-anchor-line'))?.from,
    block.openingLineFrom
  )
  assert.deepEqual(hiddenLineStarts, [
    markdown.indexOf('flowchart TD'),
    markdown.indexOf('A --> B'),
    block.closingLineFrom,
  ])
})

test('collectWysiwygCodeBlockDecorations reveals Mermaid source when the selection enters the fence', () => {
  const markdown = [
    'Intro',
    '',
    '```mermaid',
    'flowchart TD',
    'A --> B',
    '```',
    '',
    'After',
  ].join('\n')

  const { entries } = collectDecorationSpecs(markdown, markdown.indexOf('A --> B'))
  const mermaidEntries = entries.filter(
    (entry) => entry.spec.widget || entry.spec.attributes?.class?.includes('cm-wysiwyg-mermaid')
  )

  assert.deepEqual(mermaidEntries, [])
})

test('wysiwyg code block theme keeps preview-like horizontal insets instead of stretching edge to edge', async () => {
  const [source, codeBlockSource] = await Promise.all([
    readFile(new URL('../src/components/Editor/wysiwyg.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/Editor/wysiwygCodeBlock.ts', import.meta.url), 'utf8'),
  ])

  assert.match(source, /const PROSE_BLOCK_INSET = 'var\(--md-block-shell-inset, 32px\)'/u)
  assert.match(source, /const CODE_BLOCK_PADDING_INLINE = 'var\(--md-code-block-padding-inline, 16px\)'/u)
  assert.match(source, /const CODE_BLOCK_RADIUS = 'var\(--md-code-block-radius, 10px\)'/u)
  assert.match(source, /'\.cm-wysiwyg-codeblock-meta-line': \{[\s\S]*?marginLeft: PROSE_BLOCK_INSET[\s\S]*?marginRight: PROSE_BLOCK_INSET[\s\S]*?padding: `10px \$\{CODE_BLOCK_PADDING_INLINE\} 8px !important`[\s\S]*?borderTopLeftRadius: CODE_BLOCK_RADIUS[\s\S]*?cursor: 'text'/u)
  assert.match(source, /'\.cm-wysiwyg-codeblock-line': \{[\s\S]*?fontFamily: MONO_FONT_FAMILY[\s\S]*?marginLeft: PROSE_BLOCK_INSET[\s\S]*?marginRight: PROSE_BLOCK_INSET[\s\S]*?cursor: 'text'[\s\S]*?padding: `0 \$\{CODE_BLOCK_PADDING_INLINE\} !important`/u)
  assert.match(source, /'\.cm-wysiwyg-codeblock-close-line': \{[\s\S]*?marginLeft: PROSE_BLOCK_INSET[\s\S]*?marginRight: PROSE_BLOCK_INSET[\s\S]*?padding: `0 \$\{CODE_BLOCK_PADDING_INLINE\} 10px !important`[\s\S]*?borderBottomRightRadius: CODE_BLOCK_RADIUS[\s\S]*?cursor: 'text'/u)
  assert.match(codeBlockSource, /if \(!selectionTouchesFencedCodeBlock\(view, fencedCodeBlock\)\) \{/u)
  assert.match(codeBlockSource, /class MermaidDiagramWidget extends WidgetType/u)
  assert.match(codeBlockSource, /isRenderableWysiwygMermaidCodeBlock\(fencedCodeBlock\)/u)
  assert.match(codeBlockSource, /Decoration\.replace\(\{ widget: new MermaidDiagramWidget\(content\.source, content\.editAnchor\) \}\)/u)
})

test('Mermaid diagrams are centered in WYSIWYG and preview render surfaces', async () => {
  const [source, css] = await Promise.all([
    readFile(new URL('../src/components/Editor/wysiwyg.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/global.css', import.meta.url), 'utf8'),
  ])

  assert.match(source, /'\.cm-wysiwyg-mermaid__surface': \{[\s\S]*?margin: `0\.5em \$\{PROSE_BLOCK_INSET\}`[\s\S]*?overflowX: 'auto'[\s\S]*?textAlign: 'center'/u)
  assert.match(source, /'\.cm-wysiwyg-mermaid__surface svg': \{[\s\S]*?display: 'inline-block'[\s\S]*?maxWidth: '100%'[\s\S]*?height: 'auto'/u)
  assert.match(css, /\.markdown-preview \.mermaid-render-surface\s*\{[\s\S]*padding:\s*16px;[\s\S]*overflow-x:\s*auto;[\s\S]*text-align:\s*center;/u)
  assert.match(css, /\.markdown-preview \.mermaid-render-surface svg\s*\{[\s\S]*display:\s*inline-block;[\s\S]*max-width:\s*100%;[\s\S]*height:\s*auto;/u)
})

test('wysiwyg code block closing fence keeps gutter height while hiding its line number', async () => {
  const [source, css] = await Promise.all([
    readFile(new URL('../src/components/Editor/wysiwyg.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/global.css', import.meta.url), 'utf8'),
  ])

  assert.match(source, /class ReservedHiddenGutterMarker extends GutterMarker/u)
  assert.match(source, /elementClass = 'cm-wysiwyg-gutter-hidden-reserved'/u)
  assert.match(source, /markers\.set\(doc\.lineAt\(closingFrom\)\.from, reservedHiddenGutterMarker\)/u)
  assert.match(css, /\.cm-gutterElement\.cm-wysiwyg-gutter-hidden-reserved\s*\{[\s\S]*visibility:\s*hidden;[\s\S]*pointer-events:\s*none;/u)
  assert.doesNotMatch(css, /\.cm-gutterElement\.cm-wysiwyg-gutter-hidden-reserved\s*\{[\s\S]*height:\s*0\s*!important;/u)
})
