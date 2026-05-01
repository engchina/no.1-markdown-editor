import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { collectFencedCodeBlocks } from '../src/components/Editor/fencedCodeRanges.ts'
import { collectWysiwygRawHtmlBlocks } from '../src/components/Editor/wysiwygRawHtml.ts'

test('collectWysiwygRawHtmlBlocks finds whole-line renderable html embeds', () => {
  const markdown = '<iframe title="1 > 0" src="https://codepen.io/demo/embed/abc"></iframe>\n\nText'

  assert.deepEqual(collectWysiwygRawHtmlBlocks(markdown), [
    {
      from: 0,
      to: markdown.indexOf('\n'),
      html: '<iframe title="1 > 0" src="https://codepen.io/demo/embed/abc"></iframe>',
      editAnchor: 0,
    },
  ])
})

test('collectWysiwygRawHtmlBlocks supports self-closing and multiline html media blocks', () => {
  const video = '<video src="clip.mp4" />'
  const figure = [
    '<figure title="1 > 0">',
    '<img src="cover.png" alt="Cover">',
    '<figcaption>Cover image</figcaption>',
    '</figure>',
  ].join('\n')
  const picture = [
    '<picture>',
    '<source srcset="cover.webp 1x">',
    '<img src="cover.png" alt="Cover">',
    '</picture>',
  ].join('\n')
  const markdown = ['Intro', '', video, '', figure, '', picture].join('\n')

  const blocks = collectWysiwygRawHtmlBlocks(markdown)

  assert.equal(blocks.length, 3)
  assert.equal(blocks[0].html, video)
  assert.equal(blocks[0].from, markdown.indexOf(video))
  assert.equal(blocks[1].html, figure)
  assert.equal(blocks[1].from, markdown.indexOf(figure))
  assert.equal(blocks[1].to, markdown.indexOf(figure) + figure.length)
  assert.equal(blocks[2].html, picture)
})

test('collectWysiwygRawHtmlBlocks ignores escaped and fenced html', () => {
  const markdown = [
    '\\<iframe src="https://example.com"></iframe>',
    '',
    '```html',
    '<iframe src="https://example.com"></iframe>',
    '```',
  ].join('\n')

  assert.deepEqual(collectWysiwygRawHtmlBlocks(markdown, collectFencedCodeBlocks(markdown)), [])
})

test('source-mode WYSIWYG renders block raw html through a safe edit-target widget', async () => {
  const source = await readFile(new URL('../src/components/Editor/wysiwyg.ts', import.meta.url), 'utf8')

  assert.match(source, /import \{[\s\S]*collectInactiveWysiwygRawHtmlBlocks,[\s\S]*collectWysiwygRawHtmlBlocks,[\s\S]*type WysiwygRawHtmlBlock,[\s\S]*\} from '\.\/wysiwygRawHtml\.ts'/u)
  assert.match(source, /class RawHtmlBlockWidget extends WidgetType/u)
  assert.match(source, /syncRawHtmlBlockWidgetDom\(el, this\.rawHtmlBlock, this\.context\)/u)
  assert.match(source, /ignoreEvent\(event: Event\) \{ return isRawHtmlInteractiveMediaTarget\(event\.target\) \}/u)
  assert.match(source, /wrapper\.className = 'cm-wysiwyg-raw-html-block cm-wysiwyg-raw-html-block__edit-target'/u)
  assert.match(source, /wrapper\.innerHTML = renderRawHtmlBlockHtml\(rawHtmlBlock\.html, context\)/u)
  assert.match(source, /rewritePreviewHtmlNoisyExternalEmbeds\(/u)
  assert.match(source, /activatePreviewExternalEmbed\(event\.target\)/u)
  assert.match(source, /const rawHtmlBlocks = collectWysiwygRawHtmlBlocks\(markdown, \[/u)
  assert.match(source, /for \(const rawHtmlBlock of collectInactiveWysiwygRawHtmlBlocks\(view, rawHtmlBlocks\)\) \{/u)
  assert.match(source, /const openingLine = doc\.lineAt\(rawHtmlBlock\.from\)/u)
  assert.match(source, /const closingLine = doc\.lineAt\(rawHtmlBlock\.to\)/u)
  assert.match(source, /Decoration\.replace\(\{ widget: new RawHtmlBlockWidget\(rawHtmlBlock, documentContext\) \}\)/u)
  assert.match(source, /class: 'cm-wysiwyg-raw-html-hidden-line'/u)
  assert.doesNotMatch(source, /rawHtmlBlock\.from,\s*rawHtmlBlock\.to,\s*Decoration\.replace/u)
  assert.match(source, /function isRawHtmlInteractiveMediaTarget\(target: EventTarget \| null\): boolean \{/u)
  assert.match(source, /\.cm-wysiwyg-raw-html-block iframe/u)
  assert.match(source, /\.cm-wysiwyg-raw-html-block \.preview-external-embed/u)
  assert.match(source, /function activateRawHtmlBlockTarget\(view: EditorView, target: EventTarget \| null\): boolean \{/u)
  assert.match(source, /if \(isRawHtmlInteractiveMediaTarget\(target\)\) return false/u)
  assert.match(source, /if \(isRawHtmlInteractiveMediaTarget\(event\.target\)\) return true/u)
  assert.match(source, /'\.cm-wysiwyg-raw-html-hidden-line': \{[\s\S]*?height: '0'[\s\S]*?fontSize: '0'/u)
  assert.match(source, /'\.cm-wysiwyg-raw-html-block iframe': \{[\s\S]*?width: '100%'[\s\S]*?aspectRatio: '16 \/ 9'/u)
  assert.match(source, /'\.cm-wysiwyg-raw-html-block \*': \{[\s\S]*?pointerEvents: 'none'/u)
  assert.match(source, /'\.cm-wysiwyg-raw-html-block audio, \.cm-wysiwyg-raw-html-block video': \{[\s\S]*?pointerEvents: 'auto'/u)
})
