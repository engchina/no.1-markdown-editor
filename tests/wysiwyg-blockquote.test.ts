import assert from 'node:assert/strict'
import test from 'node:test'
import { parseWysiwygBlockquoteLine } from '../src/components/Editor/wysiwygBlockquote.ts'

test('parseWysiwygBlockquoteLine recognizes canonical blockquote lines', () => {
  assert.deepEqual(parseWysiwygBlockquoteLine('> quoted text'), {
    prefix: '> ',
    content: 'quoted text',
    depth: 1,
    isEmpty: false,
  })
})

test('parseWysiwygBlockquoteLine keeps empty quoted continuation lines inside the blockquote', () => {
  assert.deepEqual(parseWysiwygBlockquoteLine('>'), {
    prefix: '>',
    content: '',
    depth: 1,
    isEmpty: true,
  })
})

test('parseWysiwygBlockquoteLine treats whitespace-only quoted lines as empty', () => {
  assert.deepEqual(parseWysiwygBlockquoteLine('>   '), {
    prefix: '>   ',
    content: '',
    depth: 1,
    isEmpty: true,
  })
})

test('parseWysiwygBlockquoteLine accepts compact blockquote syntax without a separating space', () => {
  assert.deepEqual(parseWysiwygBlockquoteLine('>quoted text'), {
    prefix: '>',
    content: 'quoted text',
    depth: 1,
    isEmpty: false,
  })
})

test('parseWysiwygBlockquoteLine preserves nested quote prefixes', () => {
  assert.deepEqual(parseWysiwygBlockquoteLine('> > nested quote'), {
    prefix: '> > ',
    content: 'nested quote',
    depth: 2,
    isEmpty: false,
  })
})
