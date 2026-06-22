import assert from 'node:assert/strict'
import test from 'node:test'
import { applyEol, detectEol, stripBom, toLf } from '../src/lib/textFormat.ts'

test('detectEol reports CRLF only when a carriage-return/newline pair is present', () => {
  assert.equal(detectEol('a\r\nb'), '\r\n')
  assert.equal(detectEol('a\nb'), '\n')
  assert.equal(detectEol('single line'), '\n')
  // A lone CR (legacy Mac) is treated as LF — we only round-trip CRLF vs LF.
  assert.equal(detectEol('a\rb'), '\n')
})

test('toLf normalizes CRLF and lone CR to LF', () => {
  assert.equal(toLf('a\r\nb\rc\nd'), 'a\nb\nc\nd')
})

test('applyEol restores CRLF from LF content and leaves LF untouched', () => {
  assert.equal(applyEol('a\nb\nc', '\r\n'), 'a\r\nb\r\nc')
  assert.equal(applyEol('a\nb\nc', '\n'), 'a\nb\nc')
})

test('detect + toLf + applyEol round-trips a CRLF document losslessly', () => {
  const original = '# Title\r\n\r\nBody\r\n'
  const eol = detectEol(original)
  const inMemory = toLf(original)
  assert.equal(inMemory, '# Title\n\nBody\n')
  assert.equal(applyEol(inMemory, eol), original)
})

test('stripBom removes a single leading BOM but preserves interior U+FEFF', () => {
  assert.equal(stripBom('﻿# heading'), '# heading')
  assert.equal(stripBom('# heading'), '# heading')
  assert.equal(stripBom('a﻿b'), 'a﻿b')
  assert.equal(stripBom('﻿﻿x'), '﻿x')
})

test('applyEol does not double carriage returns when given already-LF content', () => {
  // Guards the invariant that in-memory content is LF before applyEol runs.
  const lf = toLf('x\r\ny')
  assert.equal(applyEol(lf, '\r\n'), 'x\r\ny')
})
