import assert from 'node:assert/strict'
import test from 'node:test'
import { findEditorLinkAtLinePosition } from '../src/lib/editorLinkAtPosition.ts'

test('detects [text](url) at any position inside the span', () => {
  const line = 'See [docs](https://example.com/x) here.'
  const start = line.indexOf('[')
  const end = line.indexOf(')') + 1

  const atStart = findEditorLinkAtLinePosition(line, start)
  assert.ok(atStart)
  assert.equal(atStart?.url, 'https://example.com/x')
  assert.equal(atStart?.label, 'example.com')
  assert.equal(atStart?.from, start)
  assert.equal(atStart?.to, end)

  // Click inside the link text resolves the same URL.
  assert.equal(findEditorLinkAtLinePosition(line, start + 6)?.url, 'https://example.com/x')
})

test('skips images even though syntax overlaps with links', () => {
  const line = '![alt](https://example.com/img.png) plain'
  // any position inside ![...](...) must NOT resolve a link
  assert.equal(findEditorLinkAtLinePosition(line, 3), null)
  assert.equal(findEditorLinkAtLinePosition(line, line.indexOf('https')), null)
})

test('handles inline link with title and angle-bracketed url', () => {
  const titled = 'check [site](https://example.com "Home") now'
  assert.equal(
    findEditorLinkAtLinePosition(titled, titled.indexOf('site'))?.url,
    'https://example.com/'
  )

  const angled = 'wrapped [s](<https://example.com/with space>) ok'
  assert.equal(
    findEditorLinkAtLinePosition(angled, angled.indexOf('s]') + 1)?.url,
    'https://example.com/with%20space'
  )
})

test('detects angle-bracket autolinks for http and mailto', () => {
  const http = 'see <https://example.com/foo> later'
  const inAuto = http.indexOf('<') + 5
  assert.equal(findEditorLinkAtLinePosition(http, inAuto)?.url, 'https://example.com/foo')

  const mail = 'email <mailto:user@example.com> please'
  assert.equal(
    findEditorLinkAtLinePosition(mail, mail.indexOf('mailto'))?.url,
    'mailto:user@example.com'
  )
})

test('detects <a href> HTML anchors', () => {
  const line = 'go to <a href="https://example.com/q?x=1">there</a> ok'
  const inLabel = line.indexOf('there')
  const detected = findEditorLinkAtLinePosition(line, inLabel)
  assert.ok(detected)
  assert.equal(detected?.url, 'https://example.com/q?x=1')
})

test('detects bare GFM-style URLs in body text', () => {
  const line = 'visit https://example.com/path soon'
  const inUrl = line.indexOf('example')
  assert.equal(findEditorLinkAtLinePosition(line, inUrl)?.url, 'https://example.com/path')
})

test('strips trailing sentence punctuation from bare URLs', () => {
  const line = 'see https://example.com/page.'
  const detected = findEditorLinkAtLinePosition(line, line.indexOf('example'))
  assert.equal(detected?.url, 'https://example.com/page')
  // The trailing period must not be inside the detected span.
  assert.equal(line[detected!.to], '.')
})

test('rejects dangerous protocols and unknown schemes', () => {
  const js = '[click](javascript:alert(1))'
  assert.equal(findEditorLinkAtLinePosition(js, 3), null)

  const data = '[x](data:text/html,evil)'
  assert.equal(findEditorLinkAtLinePosition(data, 3), null)

  const file = '[home](file:///etc/passwd)'
  assert.equal(findEditorLinkAtLinePosition(file, 3), null)
})

test('returns null for relative paths and bare fragments', () => {
  assert.equal(findEditorLinkAtLinePosition('[guide](./guide.md)', 3), null)
  assert.equal(findEditorLinkAtLinePosition('[top](#overview)', 3), null)
})

test('returns null when position is outside any link span', () => {
  const line = 'before [docs](https://example.com) after'
  assert.equal(findEditorLinkAtLinePosition(line, 0), null)
  assert.equal(findEditorLinkAtLinePosition(line, line.indexOf(')') + 1), null)
  assert.equal(findEditorLinkAtLinePosition(line, line.length - 1), null)
})
