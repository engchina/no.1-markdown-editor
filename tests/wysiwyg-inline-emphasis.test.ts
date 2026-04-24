import assert from 'node:assert/strict'
import test from 'node:test'
import {
  findInlineBoldItalicRanges,
  findInlineItalicRanges,
} from '../src/components/Editor/wysiwygInlineEmphasis.ts'

test('findInlineItalicRanges detects single underscore emphasis', () => {
  assert.deepEqual(findInlineItalicRanges('_single underscores_'), [
    {
      from: 0,
      to: 20,
      contentFrom: 1,
      contentTo: 19,
    },
  ])
})

test('findInlineItalicRanges keeps intra-word underscores literal', () => {
  assert.deepEqual(findInlineItalicRanges('DBMS_CLOUD'), [])
})

test('findInlineItalicRanges keeps single-asterisk emphasis working', () => {
  assert.deepEqual(findInlineItalicRanges('*single asterisks*'), [
    {
      from: 0,
      to: 18,
      contentFrom: 1,
      contentTo: 17,
    },
  ])
})

test('findInlineItalicRanges ignores italic markers inside inline code spans', () => {
  assert.deepEqual(findInlineItalicRanges('`*literal*`'), [])
})

test('findInlineItalicRanges still supports outer emphasis that contains inline code spans', () => {
  assert.deepEqual(findInlineItalicRanges('*before `code` after*'), [
    {
      from: 0,
      to: 21,
      contentFrom: 1,
      contentTo: 20,
    },
  ])
})

test('findInlineItalicRanges keeps escaped asterisks literal', () => {
  assert.deepEqual(findInlineItalicRanges(String.raw`\*this text is surrounded by literal asterisks\*`), [])
})

test('findInlineItalicRanges keeps thematic breaks out of italic rendering', () => {
  assert.deepEqual(findInlineItalicRanges('***'), [])
  assert.deepEqual(findInlineItalicRanges('* * *'), [])
  assert.deepEqual(findInlineItalicRanges('  * * *'), [])
})

test('findInlineBoldItalicRanges detects triple-asterisk emphasis', () => {
  assert.deepEqual(findInlineBoldItalicRanges('***triple emphasis***'), [
    {
      from: 0,
      to: 21,
      contentFrom: 3,
      contentTo: 18,
    },
  ])
})

test('findInlineBoldItalicRanges detects triple-asterisk emphasis wrapped around highlight markers', () => {
  assert.deepEqual(findInlineBoldItalicRanges('***==abc==***'), [
    {
      from: 0,
      to: 13,
      contentFrom: 3,
      contentTo: 10,
    },
  ])
})

test('findInlineBoldItalicRanges detects triple-underscore emphasis', () => {
  assert.deepEqual(findInlineBoldItalicRanges('___triple emphasis___'), [
    {
      from: 0,
      to: 21,
      contentFrom: 3,
      contentTo: 18,
    },
  ])
})

test('findInlineBoldItalicRanges keeps mixed nested markers on their regular paths', () => {
  assert.deepEqual(findInlineBoldItalicRanges('*__triple emphasis__*'), [])
})

test('findInlineBoldItalicRanges ignores inline code and inline math', () => {
  assert.deepEqual(findInlineBoldItalicRanges('`***literal***`'), [])
  assert.deepEqual(findInlineBoldItalicRanges('$***literal***$'), [])
})
