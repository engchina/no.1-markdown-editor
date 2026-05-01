import assert from 'node:assert/strict'
import test from 'node:test'
import { collectInlineCodeRanges } from '../src/components/Editor/wysiwygInlineCode.ts'
import { collectInlineHtmlTagRanges } from '../src/components/Editor/wysiwygInlineHtml.ts'
import { findInlineMathRanges } from '../src/components/Editor/wysiwygInlineMath.ts'

test('collectInlineHtmlTagRanges keeps quoted angle brackets inside opening tag attributes', () => {
  const html = '<a title="1 > 0" aria-label=\'>\'>Link</a>'
  const contentFrom = html.indexOf('Link')
  const contentTo = html.indexOf('</a>')

  assert.deepEqual(collectInlineHtmlTagRanges(html, ['a']), [
    {
      from: 0,
      to: html.length,
      contentFrom,
      contentTo,
    },
  ])
})

test('collectInlineHtmlTagRanges keeps closing-tag text inside quoted attributes literal', () => {
  const html = '<span data-x="</span>">Text</span>'
  const contentFrom = html.indexOf('Text')
  const contentTo = html.indexOf('</span>', contentFrom)

  assert.deepEqual(collectInlineHtmlTagRanges(html, ['span']), [
    {
      from: 0,
      to: html.length,
      contentFrom,
      contentTo,
    },
  ])
})

test('collectInlineHtmlTagRanges matches nested tags of the same name with a stack', () => {
  const html = '<span><span>x</span></span>'

  assert.deepEqual(collectInlineHtmlTagRanges(html, ['span']), [
    {
      from: 0,
      to: html.length,
      contentFrom: '<span>'.length,
      contentTo: html.lastIndexOf('</span>'),
    },
    {
      from: '<span>'.length,
      to: html.indexOf('</span>') + '</span>'.length,
      contentFrom: '<span><span>'.length,
      contentTo: html.indexOf('</span>'),
    },
  ])
})

test('collectInlineHtmlTagRanges ignores raw html tag pairs inside inline code', () => {
  const html = '`<kbd>Ctrl</kbd>` <kbd>Alt</kbd>'
  const contentFrom = html.indexOf('Alt')
  const contentTo = html.indexOf('</kbd>', contentFrom)

  assert.deepEqual(collectInlineHtmlTagRanges(html, ['kbd'], collectInlineCodeRanges(html)), [
    {
      from: html.indexOf('<kbd>', html.indexOf('` ')),
      to: html.length,
      contentFrom,
      contentTo,
    },
  ])
})

test('collectInlineHtmlTagRanges ignores raw html tag pairs inside inline math', () => {
  const html = '$<kbd>Ctrl</kbd>$ <kbd>Alt</kbd>'
  const contentFrom = html.indexOf('Alt')
  const contentTo = html.indexOf('</kbd>', contentFrom)

  const mathRanges = findInlineMathRanges(html).map((range) => ({ from: range.from, to: range.to }))

  assert.deepEqual(collectInlineHtmlTagRanges(html, ['kbd'], mathRanges), [
    {
      from: html.indexOf('<kbd>', html.indexOf('$ ')),
      to: html.length,
      contentFrom,
      contentTo,
    },
  ])
})
