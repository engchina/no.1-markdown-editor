import assert from 'node:assert/strict'
import test from 'node:test'
import { parseFrontMatter } from '../src/lib/frontMatter.ts'
import { buildFrontMatterHtml, stripFrontMatter } from '../src/lib/markdownShared.ts'

const BIGQUERY_DOCUMENT = `---
type: BigQuery Table
title: Customer Orders
description: One row per completed customer order across all channels.
resource: https://console.cloud.google.com/bigquery?p=acme&d=sales&t=orders
tags: [sales, orders, revenue]
timestamp: 2026-05-28T14:30:00Z
---

# Schema
`

test('parseFrontMatter parses the OKF example with typed YAML values', () => {
  const parsed = parseFrontMatter(BIGQUERY_DOCUMENT)
  assert.equal(parsed.status, 'valid')
  assert.equal(parsed.data.type, 'BigQuery Table')
  assert.deepEqual(parsed.data.tags, ['sales', 'orders', 'revenue'])
  assert.equal(parsed.data.timestamp, '2026-05-28T14:30:00Z')
  assert.equal(parsed.body, '# Schema\n')
  assert.equal(parsed.bodyLineOffset, 9)
  assert.equal(parsed.closingMarker, '---')
})

test('parseFrontMatter preserves nested, multiline, unknown, and CRLF YAML source', () => {
  const source = [
    '---',
    'custom:',
    '  nested: true',
    'items:',
    '  - one',
    '  - two',
    'notes: |',
    '  first',
    '  second',
    '---',
    '',
    '# Body',
  ].join('\r\n')
  const parsed = parseFrontMatter(source)
  assert.equal(parsed.status, 'valid')
  assert.deepEqual(parsed.data.custom, { nested: true })
  assert.deepEqual(parsed.data.items, ['one', 'two'])
  assert.equal(parsed.data.notes, 'first\nsecond\n')
  assert.equal(parsed.raw, source.slice(0, source.indexOf('\r\n\r\n')))
  assert.equal(stripFrontMatter(source).body, '# Body')
})

test('parseFrontMatter accepts the generic YAML document end marker', () => {
  const parsed = parseFrontMatter('---\ntype: Example\n...\n\nBody')
  assert.equal(parsed.status, 'valid')
  assert.equal(parsed.closingMarker, '...')
  assert.equal(parsed.body, 'Body')
})

test('parseFrontMatter reports duplicate keys, malformed YAML, and non-mapping roots', () => {
  const duplicate = parseFrontMatter('---\ntype: A\ntype: B\n---\n')
  assert.equal(duplicate.status, 'invalid')
  assert.ok(duplicate.diagnostics.some((entry) => entry.code === 'DUPLICATE_KEY'))

  const malformed = parseFrontMatter('---\nitems: [one, two\n---\n')
  assert.equal(malformed.status, 'invalid')
  assert.ok(malformed.diagnostics[0]?.line)

  const sequence = parseFrontMatter('---\n- one\n- two\n---\n')
  assert.equal(sequence.status, 'invalid')
  assert.equal(sequence.diagnostics[0]?.code, 'frontmatter-non-mapping-root')
})

test('parseFrontMatter distinguishes absent, empty, and unclosed blocks without rewriting source', () => {
  assert.equal(parseFrontMatter('# Body').status, 'absent')
  assert.equal(parseFrontMatter('---\n---\nBody').status, 'empty')
  const unclosed = parseFrontMatter('---\ntype: Example\n# Body')
  assert.equal(unclosed.status, 'unclosed')
  assert.equal(unclosed.body, '---\ntype: Example\n# Body')
  assert.equal(unclosed.raw, unclosed.body)
})

test('buildFrontMatterHtml uses tags, type, safe resources, and generic complex values', () => {
  const html = buildFrontMatterHtml(parseFrontMatter(BIGQUERY_DOCUMENT))
  assert.match(html, /class="fm-type"/u)
  assert.equal(html.match(/class="fm-tag"/gu)?.length, 3)
  assert.match(html, /class="fm-resource" href="https:\/\/console\.cloud\.google\.com/u)

  const complex = buildFrontMatterHtml(parseFrontMatter('---\ncustom:\n  nested: true\n---\n'))
  assert.match(complex, /<pre><code>/u)
})
