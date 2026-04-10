import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildMarkdownPreviewLines,
  getMarkdownPreviewLineBadge,
} from '../src/lib/ai/diffPresentation.ts'

test('buildMarkdownPreviewLines classifies headings, lists, quotes, and tables', () => {
  const lines = buildMarkdownPreviewLines([
    '# Heading\n',
    '- list item\n',
    '> quoted text\n',
    '| Name | Value |\n',
    '| --- | --- |\n',
    '| Foo | Bar |\n',
  ])

  assert.deepEqual(
    lines.map((line) => line.kind),
    ['heading', 'list', 'quote', 'table', 'table', 'table']
  )
})

test('buildMarkdownPreviewLines keeps fenced code blocks readable line by line', () => {
  const lines = buildMarkdownPreviewLines([
    '```ts\n',
    'const value = 42\n',
    'console.log(value)\n',
    '```\n',
    '\n',
    'Paragraph text\n',
  ])

  assert.deepEqual(
    lines.map((line) => line.kind),
    ['fence', 'code', 'code', 'fence', 'empty', 'paragraph']
  )
  assert.equal(lines[0].lineNumber, 1)
  assert.equal(lines[5].lineNumber, 6)
})

test('getMarkdownPreviewLineBadge exposes stable compact labels for diff rows', () => {
  assert.equal(getMarkdownPreviewLineBadge('heading'), 'HDR')
  assert.equal(getMarkdownPreviewLineBadge('list'), 'LST')
  assert.equal(getMarkdownPreviewLineBadge('table'), 'TBL')
  assert.equal(getMarkdownPreviewLineBadge('fence'), 'FNC')
  assert.equal(getMarkdownPreviewLineBadge('code'), 'COD')
  assert.equal(getMarkdownPreviewLineBadge('paragraph'), 'TXT')
})
