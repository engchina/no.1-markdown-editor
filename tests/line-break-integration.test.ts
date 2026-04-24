import assert from 'node:assert/strict'
import test from 'node:test'
import { EditorSelection, EditorState } from '@codemirror/state'
import {
  insertMarkdownHardLineBreak,
  MARKDOWN_HARD_LINE_BREAK,
} from '../src/components/Editor/extensions.ts'
import { buildRichClipboardPayload } from '../src/lib/clipboardHtml.ts'
import { buildStandaloneHtml, renderMarkdown } from '../src/lib/markdown.ts'
import { renderInlineMarkdownFragment } from '../src/components/Editor/wysiwygInlineMarkdown.ts'

function applyShiftEnter(doc: string, anchor: number): string {
  const state = EditorState.create({
    doc,
    selection: EditorSelection.cursor(anchor),
  })

  let dispatched: Record<string, unknown> | null = null
  const view = {
    state,
    dispatch(spec: Record<string, unknown>) {
      dispatched = spec
    },
  }

  assert.equal(insertMarkdownHardLineBreak(view), true)
  assert.ok(dispatched)
  return state.update(dispatched).state.doc.toString()
}

test('source hard breaks round-trip consistently across preview, rich clipboard, export wrapper, and WYSIWYG inline rendering', async () => {
  const markdown = applyShiftEnter('Line 1Line 2', 'Line 1'.length)
  const previewHtml = await renderMarkdown(markdown)
  const clipboard = await buildRichClipboardPayload(markdown)
  const inlineHtml = renderInlineMarkdownFragment(markdown)
  const standaloneHtml = buildStandaloneHtml('Doc', previewHtml)

  assert.equal(markdown, `Line 1${MARKDOWN_HARD_LINE_BREAK}Line 2`)
  assert.equal(clipboard.plainText, markdown)
  assert.match(previewHtml, /<p>Line 1<br\s*\/?>\s*Line 2<\/p>/)
  assert.match(clipboard.html, /<p>Line 1<br\s*\/?>\s*Line 2<\/p>/)
  assert.match(inlineHtml, /Line 1<br\s*\/?>\s*Line 2/u)
  assert.match(standaloneHtml, /<p>Line 1<br\s*\/?>\s*Line 2<\/p>/)
})

test('backslash and trailing-space hard breaks round-trip consistently across preview, rich clipboard, export wrapper, and WYSIWYG inline rendering', async () => {
  const cases = [
    'Line 1\\\nLine 2',
    'Line 1  \nLine 2',
  ] as const

  for (const markdown of cases) {
    const previewHtml = await renderMarkdown(markdown)
    const clipboard = await buildRichClipboardPayload(markdown)
    const inlineHtml = renderInlineMarkdownFragment(markdown)
    const standaloneHtml = buildStandaloneHtml('Doc', previewHtml)

    assert.equal(clipboard.plainText, markdown)
    assert.match(previewHtml, /<p>Line 1<br\s*\/?>\s*Line 2<\/p>/)
    assert.match(clipboard.html, /<p>Line 1<br\s*\/?>\s*Line 2<\/p>/)
    assert.match(inlineHtml, /Line 1<br\s*\/?>\s*Line 2/u)
    assert.match(standaloneHtml, /<p>Line 1<br\s*\/?>\s*Line 2<\/p>/)
  }
})

test('soft line breaks stay soft across preview, rich clipboard, export wrapper, and WYSIWYG inline rendering', async () => {
  const markdown = 'Line 1\nLine 2'
  const previewHtml = await renderMarkdown(markdown)
  const clipboard = await buildRichClipboardPayload(markdown)
  const inlineHtml = renderInlineMarkdownFragment(markdown)
  const standaloneHtml = buildStandaloneHtml('Doc', previewHtml)

  assert.doesNotMatch(previewHtml, /<br\s*\/?>/)
  assert.doesNotMatch(clipboard.html, /<br\s*\/?>/)
  assert.doesNotMatch(standaloneHtml, /<br\s*\/?>/)
  assert.doesNotMatch(inlineHtml, /<br\s*\/?>/)
  assert.match(previewHtml, /<p>Line 1\s*Line 2<\/p>/)
  assert.match(clipboard.html, /<p>Line 1\s*Line 2<\/p>/)
})

test('source Shift+Enter fallback inside fenced code blocks remains plain code content across preview and rich clipboard', async () => {
  const original = ['```ts', 'const answer = 42', '```'].join('\n')
  const markdown = applyShiftEnter(original, original.indexOf('answer') + 'answer'.length)
  const previewHtml = await renderMarkdown(markdown)
  const clipboard = await buildRichClipboardPayload(markdown)

  assert.equal(markdown.includes(MARKDOWN_HARD_LINE_BREAK), false)
  assert.match(previewHtml, /<pre><code[^>]*>/)
  assert.match(clipboard.html, /<pre><code[^>]*>/)
  assert.doesNotMatch(previewHtml, /<br\s*\/?>/)
  assert.doesNotMatch(clipboard.html, /<br\s*\/?>/)
  assert.equal(clipboard.plainText, markdown)
})
