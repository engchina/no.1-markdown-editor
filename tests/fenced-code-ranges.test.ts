import assert from 'node:assert/strict'
import test from 'node:test'
import { collectFencedCodeRanges } from '../src/components/Editor/fencedCodeRanges.ts'

test('collectFencedCodeRanges captures fenced blocks including opening and closing markers', () => {
  const markdown = [
    '# Intro',
    '',
    '```md',
    '# Not a heading',
    '```',
    '',
    '~~~js',
    'const value = 1',
    '~~~~',
  ].join('\n')

  const ranges = collectFencedCodeRanges(markdown)

  assert.equal(ranges.length, 2)
  assert.deepEqual(
    ranges.map((range) => markdown.slice(range.from, range.to)),
    [
      '```md\n# Not a heading\n```',
      '~~~js\nconst value = 1\n~~~~',
    ]
  )
})

test('collectFencedCodeRanges keeps an unclosed fence open until the end of the document', () => {
  const markdown = [
    'Paragraph',
    '',
    '  ```ts',
    '  # Still code',
  ].join('\n')

  const ranges = collectFencedCodeRanges(markdown)

  assert.equal(ranges.length, 1)
  assert.equal(markdown.slice(ranges[0].from, ranges[0].to), '  ```ts\n  # Still code')
})

test('collectFencedCodeRanges ignores inline triple backticks that are not standalone fences', () => {
  const markdown = 'Paragraph with ```inline``` code'

  assert.deepEqual(collectFencedCodeRanges(markdown), [])
})
