import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { collectWysiwygSetextHeadings } from '../src/components/Editor/wysiwygSetextHeading.ts'

function offsetOfLine(markdown: string, lineIndex: number): number {
  let offset = 0
  let current = 0
  while (current < lineIndex) {
    const next = markdown.indexOf('\n', offset)
    if (next === -1) throw new Error(`line ${lineIndex} not found`)
    offset = next + 1
    current += 1
  }
  return offset
}

test('collectWysiwygSetextHeadings recognises a single H1 with === underline', () => {
  const md = 'My Title\n========\nbody text\n'
  const headings = collectWysiwygSetextHeadings(md, [])
  assert.equal(headings.length, 1)
  assert.equal(headings[0].level, 1)
  assert.equal(headings[0].contentFrom, 0)
  assert.equal(headings[0].contentTo, 'My Title'.length)
  assert.equal(headings[0].underlineFrom, offsetOfLine(md, 1))
})

test('collectWysiwygSetextHeadings recognises a single H2 with --- underline', () => {
  const md = 'Sub Title\n---\nbody\n'
  const headings = collectWysiwygSetextHeadings(md, [])
  assert.equal(headings.length, 1)
  assert.equal(headings[0].level, 2)
})

test('collectWysiwygSetextHeadings pulls all paragraph lines above the underline into content', () => {
  // The user's failing case: a decorative === line is sucked into the heading.
  const md = '====\nTitle Text\n====\nbody\n'
  const headings = collectWysiwygSetextHeadings(md, [])
  assert.equal(headings.length, 1)
  assert.equal(headings[0].level, 1)
  assert.equal(headings[0].contentFrom, 0)
  // content spans both the decorative `====` line and the title line
  assert.equal(headings[0].contentTo, offsetOfLine(md, 1) + 'Title Text'.length)
  assert.equal(headings[0].underlineFrom, offsetOfLine(md, 2))
})

test('collectWysiwygSetextHeadings does not treat lonely === at file start as a heading', () => {
  const md = '====\n'
  const headings = collectWysiwygSetextHeadings(md, [])
  assert.equal(headings.length, 0)
})

test('collectWysiwygSetextHeadings does not treat --- as setext when preceded by a blank line', () => {
  const md = 'paragraph\n\n---\nnext\n'
  const headings = collectWysiwygSetextHeadings(md, [])
  assert.equal(headings.length, 0)
})

test('collectWysiwygSetextHeadings handles two stacked setext headings independently', () => {
  const md = 'first\n=====\nsecond\n-----\n'
  const headings = collectWysiwygSetextHeadings(md, [])
  assert.equal(headings.length, 2)
  assert.equal(headings[0].level, 1)
  assert.equal(headings[1].level, 2)
  // Second heading content starts at the 'second' line, not earlier.
  assert.equal(headings[1].contentFrom, offsetOfLine(md, 2))
})

test('collectWysiwygSetextHeadings skips ATX heading lines as content (they are their own block)', () => {
  const md = '## previous heading\n---\n'
  const headings = collectWysiwygSetextHeadings(md, [])
  assert.equal(headings.length, 0)
})

test('collectWysiwygSetextHeadings stops at thematic break boundary above the underline', () => {
  // Setext H1 underline at line 3 cannot reach across the thematic break at line 1.
  const md = '***\ntitle\n=====\n'
  const headings = collectWysiwygSetextHeadings(md, [])
  assert.equal(headings.length, 1)
  // Content must start at line 1 ("title"), not line 0 ("***").
  assert.equal(headings[0].contentFrom, offsetOfLine(md, 1))
})

test('collectWysiwygSetextHeadings respects ignoredRanges (e.g. fenced code, math)', () => {
  // Code block followed immediately by `=====` should NOT be promoted into a heading.
  const md = '```\nfake content\n```\n=====\n'
  const codeFenceFrom = 0
  const codeFenceTo = md.indexOf('```\n=====') + 3
  const headings = collectWysiwygSetextHeadings(md, [{ from: codeFenceFrom, to: codeFenceTo }])
  assert.equal(headings.length, 0)
})

test('wysiwyg editor wires setext heading collector into the decoration pipeline', async () => {
  const source = await readFile(new URL('../src/components/Editor/wysiwyg.ts', import.meta.url), 'utf8')
  assert.match(source, /collectWysiwygSetextHeadings/u)
  assert.match(source, /setextHeadings: WysiwygSetextHeading\[\]/u)
  assert.match(source, /setextUnderlineLineStarts\.get\(lineFrom\)/u)
  assert.match(source, /setextContentLevelByLineStart\.get\(lineFrom\)/u)
  assert.match(source, /cm-wysiwyg-setext-underline-line/u)
  // Gutter pass must also know about setext underlines so `---` underline
  // does not fall through to the thematic-break gutter handler.
  assert.match(source, /setextUnderlineLineStarts\.has\(line\.from\)/u)
})
