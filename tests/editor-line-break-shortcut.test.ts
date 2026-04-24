import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { EditorSelection, EditorState } from '@codemirror/state'
import {
  insertMarkdownHardLineBreak,
  MARKDOWN_HARD_LINE_BREAK,
  MARKDOWN_PLAIN_LINE_BREAK,
} from '../src/components/Editor/extensions.ts'

test('insertMarkdownHardLineBreak inserts explicit br markup and places the caret after it', () => {
  const state = EditorState.create({
    doc: 'Line 1',
    selection: EditorSelection.cursor(6),
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
  assert.equal(dispatched.userEvent, 'input.type')

  const nextState = state.update(dispatched).state
  const expectedDoc = `Line 1${MARKDOWN_HARD_LINE_BREAK}`

  assert.equal(nextState.doc.toString(), expectedDoc)
  assert.equal(nextState.selection.main.head, expectedDoc.length)
})

test('editor core extensions wire Shift+Enter to the hard line break command', async () => {
  const source = await readFile(new URL('../src/components/Editor/extensions.ts', import.meta.url), 'utf8')

  assert.match(source, /key:\s*'Shift-Enter'/)
  assert.match(source, /run:\s*insertMarkdownHardLineBreak/)
})

test('insertMarkdownHardLineBreak falls back to a plain newline inside fenced code blocks', () => {
  const doc = ['```ts', 'const answer = 42', '```'].join('\n')
  const anchor = doc.indexOf('answer') + 'answer'.length
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

  const nextState = state.update(dispatched).state
  const expectedDoc = `${doc.slice(0, anchor)}${MARKDOWN_PLAIN_LINE_BREAK}${doc.slice(anchor)}`

  assert.equal(nextState.doc.toString(), expectedDoc)
  assert.equal(nextState.selection.main.head, anchor + MARKDOWN_PLAIN_LINE_BREAK.length)
})

test('insertMarkdownHardLineBreak falls back to a plain newline inside display math blocks', () => {
  const doc = ['$$', 'x + y', '$$'].join('\n')
  const anchor = doc.indexOf('x + y') + 1
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

  const nextState = state.update(dispatched).state
  const expectedDoc = `${doc.slice(0, anchor)}${MARKDOWN_PLAIN_LINE_BREAK}${doc.slice(anchor)}`

  assert.equal(nextState.doc.toString(), expectedDoc)
  assert.equal(nextState.selection.main.head, anchor + MARKDOWN_PLAIN_LINE_BREAK.length)
})

test('insertMarkdownHardLineBreak falls back to a plain newline inside inline code, inline math, and footnote tokens', () => {
  const cases = [
    { doc: 'Use `inline` token', anchor: 'Use `'.length },
    { doc: 'Inline $E=mc^2$ example', anchor: 'Inline $'.length },
    { doc: 'Text with [^note] ref', anchor: 'Text with [^'.length },
    { doc: '[^note]: definition', anchor: '[^'.length },
  ] as const

  for (const entry of cases) {
    const state = EditorState.create({
      doc: entry.doc,
      selection: EditorSelection.cursor(entry.anchor),
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

    const nextState = state.update(dispatched).state
    const expectedDoc = `${entry.doc.slice(0, entry.anchor)}${MARKDOWN_PLAIN_LINE_BREAK}${entry.doc.slice(entry.anchor)}`

    assert.equal(nextState.doc.toString(), expectedDoc)
    assert.equal(nextState.selection.main.head, entry.anchor + MARKDOWN_PLAIN_LINE_BREAK.length)
  }
})

test('insertMarkdownHardLineBreak falls back to a plain newline on heading and thematic-break lines', () => {
  const cases = [
    { doc: '# Heading', anchor: '# He'.length },
    { doc: ['Title', '-----'].join('\n'), anchor: 'Tit'.length },
    { doc: ['Title', '====='].join('\n'), anchor: 'Tit'.length },
    { doc: '---', anchor: 1 },
  ] as const

  for (const entry of cases) {
    const state = EditorState.create({
      doc: entry.doc,
      selection: EditorSelection.cursor(entry.anchor),
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

    const nextState = state.update(dispatched).state
    const expectedDoc = `${entry.doc.slice(0, entry.anchor)}${MARKDOWN_PLAIN_LINE_BREAK}${entry.doc.slice(entry.anchor)}`

    assert.equal(nextState.doc.toString(), expectedDoc)
    assert.equal(nextState.selection.main.head, entry.anchor + MARKDOWN_PLAIN_LINE_BREAK.length)
  }
})

test('insertMarkdownHardLineBreak keeps multi-cursor insertions context-aware across plain text and literal markdown regions', () => {
  const doc = [
    'PlainLine',
    'Use `inline` token',
    '```ts',
    'const answer = 42',
    '```',
  ].join('\n')

  const plainAnchor = 'Plain'.length
  const inlineCodeAnchor = doc.indexOf('inline')
  const fencedCodeAnchor = doc.indexOf('answer') + 'answer'.length

  const state = EditorState.create({
    doc,
    selection: EditorSelection.create([
      EditorSelection.cursor(plainAnchor),
      EditorSelection.cursor(inlineCodeAnchor),
      EditorSelection.cursor(fencedCodeAnchor),
    ]),
    extensions: [EditorState.allowMultipleSelections.of(true)],
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

  const nextState = state.update(dispatched).state
  const expectedDoc = `Plain${MARKDOWN_HARD_LINE_BREAK}Line\nUse \`${MARKDOWN_PLAIN_LINE_BREAK}inline\` token\n\`\`\`ts\nconst answer${MARKDOWN_PLAIN_LINE_BREAK} = 42\n\`\`\``

  assert.equal(nextState.doc.toString(), expectedDoc)
  assert.deepEqual(
    nextState.selection.ranges.map((range) => range.head),
    [
      plainAnchor + MARKDOWN_HARD_LINE_BREAK.length,
      inlineCodeAnchor + MARKDOWN_HARD_LINE_BREAK.length + MARKDOWN_PLAIN_LINE_BREAK.length,
      fencedCodeAnchor + MARKDOWN_HARD_LINE_BREAK.length + (MARKDOWN_PLAIN_LINE_BREAK.length * 2),
    ]
  )
})
