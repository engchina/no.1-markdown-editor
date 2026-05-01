import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  isNoisyExternalEmbedSource,
  rewritePreviewHtmlNoisyExternalEmbeds,
} from '../src/lib/previewExternalEmbeds.ts'

const copy = {
  blockedLabel: 'External embed blocked',
  clickLabel: 'Click to load from the original host',
}

test('rewritePreviewHtmlNoisyExternalEmbeds defers CodePen iframes before they can log browser warnings', () => {
  const html = [
    '<p>Before</p>',
    '<iframe src="https://codepen.io/jeangonti/embed/demo?default-tab=result" title="CodePen demo" allow="accelerometer; ambient-light-sensor; vr; fullscreen; picture-in-picture" allowpaymentrequest></iframe>',
    '<p>After</p>',
  ].join('')

  const rewritten = rewritePreviewHtmlNoisyExternalEmbeds(html, copy, 'http://localhost:5173')

  assert.match(rewritten, /<p>Before<\/p>/u)
  assert.match(rewritten, /<p>After<\/p>/u)
  assert.match(rewritten, /<button type="button" class="preview-external-embed"/u)
  assert.match(rewritten, /data-external-embed-src="https:\/\/codepen\.io\/jeangonti\/embed\/demo\?default-tab=result"/u)
  assert.match(rewritten, /data-external-embed-host="codepen\.io"/u)
  assert.match(rewritten, /data-external-embed-title="CodePen demo"/u)
  assert.match(rewritten, /External embed blocked/u)
  assert.match(rewritten, /Click to load from the original host/u)
  assert.doesNotMatch(rewritten, /<iframe/iu)
  assert.doesNotMatch(rewritten, /ambient-light-sensor/iu)
  assert.doesNotMatch(rewritten, /\bvr\b/iu)
  assert.doesNotMatch(rewritten, /allowpaymentrequest/iu)
})

test('rewritePreviewHtmlNoisyExternalEmbeds leaves ordinary trusted iframe embeds intact', () => {
  const html = '<iframe src="https://www.youtube.com/embed/demo" allow="fullscreen; picture-in-picture"></iframe>'

  assert.equal(rewritePreviewHtmlNoisyExternalEmbeds(html, copy, 'http://localhost:5173'), html)
})

test('isNoisyExternalEmbedSource only flags cross-origin CodePen embed pages', () => {
  assert.equal(isNoisyExternalEmbedSource('https://codepen.io/jeangonti/embed/demo', 'http://localhost:5173'), true)
  assert.equal(isNoisyExternalEmbedSource('https://www.codepen.io/jeangonti/embed/demo', 'http://localhost:5173'), true)
  assert.equal(isNoisyExternalEmbedSource('/local/embed.html', 'http://localhost:5173'), false)
  assert.equal(isNoisyExternalEmbedSource('https://www.youtube.com/embed/demo', 'http://localhost:5173'), false)
})

test('MarkdownPreview rewrites and activates noisy external embeds in the preview layer', async () => {
  const source = await readFile(new URL('../src/components/Preview/MarkdownPreview.tsx', import.meta.url), 'utf8')

  assert.match(source, /rewritePreviewHtmlNoisyExternalEmbeds\(/u)
  assert.match(source, /blockedLabel: t\('preview\.externalEmbedBlocked'\)/u)
  assert.match(source, /clickLabel: t\('preview\.externalEmbedClickToLoad'\)/u)
  assert.match(source, /if \(activatePreviewExternalEmbed\(event\.target\)\) \{/u)
})
