import assert from 'node:assert/strict'
import test from 'node:test'
import { collectFencedCodeBlocks } from '../src/components/Editor/fencedCodeRanges.ts'
import { collectMathBlocks } from '../src/components/Editor/mathBlockRanges.ts'

test('collectMathBlocks captures multiline $$ blocks and preserves inner lines for rendering', () => {
  const markdown = [
    'Before',
    '',
    '$$',
    '\\mathbf{v}_1 + \\mathbf{v}_2',
    '\\begin{vmatrix}',
    'a & b \\\\',
    'c & d',
    '\\end{vmatrix}',
    '$$',
    '',
    'After',
  ].join('\n')

  const blocks = collectMathBlocks(markdown)

  assert.equal(blocks.length, 1)
  assert.equal(
    blocks[0].latex,
    [
      '\\mathbf{v}_1 + \\mathbf{v}_2',
      '\\begin{vmatrix}',
      'a & b \\\\',
      'c & d',
      '\\end{vmatrix}',
    ].join('\n')
  )
  assert.equal(
    markdown.slice(blocks[0].from, blocks[0].to),
    [
      '$$',
      '\\mathbf{v}_1 + \\mathbf{v}_2',
      '\\begin{vmatrix}',
      'a & b \\\\',
      'c & d',
      '\\end{vmatrix}',
      '$$',
    ].join('\n')
  )
  assert.equal(blocks[0].editAnchor, markdown.indexOf('\\mathbf{v}_1'))
})

test('collectMathBlocks captures single-line display math while leaving inline math alone', () => {
  const singleLine = collectMathBlocks('$$E=mc^2$$')
  assert.equal(singleLine.length, 1)
  assert.equal(singleLine[0].latex, 'E=mc^2')
  assert.equal(singleLine[0].editAnchor, 2)
  assert.deepEqual(collectMathBlocks('Inline $E=mc^2$ example'), [])
})

test('collectMathBlocks ignores $$ markers inside fenced code blocks', () => {
  const markdown = [
    '```md',
    '$$',
    'x^2 + y^2',
    '$$',
    '```',
    '',
    '$$',
    'z^2',
    '$$',
  ].join('\n')

  const blocks = collectMathBlocks(markdown, collectFencedCodeBlocks(markdown))

  assert.equal(blocks.length, 1)
  assert.equal(blocks[0].latex, 'z^2')
})

test('collectMathBlocks leaves incomplete $$ blocks as raw source while editing', () => {
  const markdown = [
    '$$',
    '\\frac{a}{b}',
  ].join('\n')

  assert.deepEqual(collectMathBlocks(markdown), [])
})
