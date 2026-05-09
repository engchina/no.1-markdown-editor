import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { EditorState } from '@codemirror/state'
import { collectFencedCodeBlocks } from '../src/components/Editor/fencedCodeRanges.ts'
import { collectMarkdownTableBlocks } from '../src/components/Editor/tableBlockRanges.ts'
import {
  collectInactiveWysiwygDetailsBlocks,
  collectWysiwygDetailsBlocks,
  renderWysiwygDetailsMarkdown,
} from '../src/components/Editor/wysiwygDetails.ts'

function collectVisibleDetails(markdown: string, anchor: number) {
  const state = EditorState.create({
    doc: markdown,
    selection: { anchor },
  })

  return collectInactiveWysiwygDetailsBlocks(
    {
      state,
      visibleRanges: [{ from: 0, to: markdown.length }],
    },
    collectWysiwygDetailsBlocks(markdown, collectFencedCodeBlocks(markdown))
  )
}

test('collectWysiwygDetailsBlocks finds complete block-level details disclosures', () => {
  const markdown = [
    'Before',
    '',
    '<details open="">',
    '<summary>Campaign follow-up</summary>',
    '',
    '**Responded** but sales are low.',
    '',
    '</details>',
    '',
    'After',
  ].join('\n')

  const [details] = collectWysiwygDetailsBlocks(markdown)

  assert.ok(details)
  assert.equal(details.open, true)
  assert.equal(details.summaryMarkdown, 'Campaign follow-up')
  assert.match(details.bodyMarkdown, /\*\*Responded\*\* but sales are low\./u)
  assert.equal(details.from, markdown.indexOf('<details'))
  assert.equal(details.closingLineFrom, markdown.indexOf('</details>'))
  assert.equal(details.editAnchor, markdown.indexOf('Campaign follow-up'))
})

test('collectWysiwygDetailsBlocks keeps quoted angle brackets inside details attributes', () => {
  const markdown = [
    '<details title="1 > 0" open>',
    '<summary title="Use > key">Campaign follow-up</summary>',
    '',
    'Hidden body',
    '</details >',
  ].join('\n')

  const [details] = collectWysiwygDetailsBlocks(markdown)

  assert.ok(details)
  assert.equal(details.open, true)
  assert.equal(details.summaryMarkdown, 'Campaign follow-up')
  assert.equal(details.bodyMarkdown, 'Hidden body')
  assert.equal(details.editAnchor, markdown.indexOf('Campaign follow-up'))
})

test('collectWysiwygDetailsBlocks ignores details-looking text inside fenced code blocks', () => {
  const markdown = [
    '```html',
    '<details>',
    '<summary>Not a widget</summary>',
    '</details>',
    '```',
  ].join('\n')

  assert.deepEqual(
    collectWysiwygDetailsBlocks(markdown, collectFencedCodeBlocks(markdown)),
    []
  )
})

test('collectInactiveWysiwygDetailsBlocks renders only when selection is outside the disclosure source', () => {
  const markdown = [
    '<details>',
    '<summary>Source-sensitive</summary>',
    '',
    'Hidden body',
    '</details>',
    '',
    'After',
  ].join('\n')

  assert.equal(collectVisibleDetails(markdown, markdown.indexOf('After')).length, 1)
  assert.deepEqual(collectVisibleDetails(markdown, markdown.indexOf('Hidden body')), [])
})

test('renderWysiwygDetailsMarkdown renders markdown while sanitizing unsafe html', () => {
  const html = renderWysiwygDetailsMarkdown([
    '**Bold**',
    '',
    '<script>bad()</script>',
    '',
    '| Left | Right |',
    '| --- | --- |',
    '| a | b |',
  ].join('\n'))

  assert.match(html, /<strong>Bold<\/strong>/u)
  assert.match(html, /<table>/u)
  assert.doesNotMatch(html, /<script/iu)
  assert.doesNotMatch(html, /bad\(\)/u)
})

test('renderWysiwygDetailsMarkdown hardens raw html media like preview', () => {
  const html = renderWysiwygDetailsMarkdown([
    '<kbd>Ctrl</kbd>',
    '',
    '<iframe src="https://example.com/embed" allow="autoplay"></iframe>',
    '',
    '<iframe src="javascript:bad()"></iframe>',
  ].join('\n'))

  assert.match(html, /<kbd>Ctrl<\/kbd>/u)
  assert.match(html, /<iframe src="https:\/\/example\.com\/embed"/u)
  assert.match(html, /sandbox="allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation allow-same-origin allow-scripts"/u)
  assert.match(html, /allow="fullscreen; picture-in-picture"/u)
  assert.match(html, /referrerpolicy="strict-origin-when-cross-origin"/u)
  assert.doesNotMatch(html, /javascript:bad/u)
  assert.equal((html.match(/<iframe/gu) ?? []).length, 1)
})

test('details ranges can suppress nested table widgets in the editor source layer', () => {
  const markdown = [
    '<details open>',
    '<summary>Table body</summary>',
    '',
    '| Left | Right |',
    '| --- | --- |',
    '| a | b |',
    '</details>',
  ].join('\n')
  const detailsBlocks = collectWysiwygDetailsBlocks(markdown)

  assert.equal(collectMarkdownTableBlocks(markdown, detailsBlocks).length, 0)
})

test('wysiwyg details widget is wired as a source-activating disclosure block', async () => {
  const source = await readFile(new URL('../src/components/Editor/wysiwyg.ts', import.meta.url), 'utf8')

  assert.match(source, /import \{[\s\S]*collectWysiwygDetailsBlocks[\s\S]*renderWysiwygDetailsMarkdown[\s\S]*\} from '\.\/wysiwygDetails\.ts'/u)
  assert.match(source, /'\.cm-wysiwyg-details__body iframe': \{[\s\S]*?height: 'auto'[\s\S]*?aspectRatio: '16 \/ 9'/u)
  assert.match(source, /class DetailsWidget extends WidgetType/u)
  assert.match(source, /const details = document\.createElement\('div'\)/u)
  assert.match(source, /details\.className = 'cm-wysiwyg-details'/u)
  assert.match(source, /details\.dataset\.detailsEditAnchor = String\(detailsBlock\.editAnchor\)/u)
  assert.match(source, /details\.dataset\.detailsSourceOpen = nextSourceOpen/u)
  assert.match(source, /details\.setAttribute\('role', 'group'\)/u)
  assert.match(source, /toggle\.className = 'cm-wysiwyg-details__toggle'/u)
  assert.match(source, /summaryContent\.className = 'cm-wysiwyg-details__summary-content cm-wysiwyg-details__edit-target'/u)
  assert.match(source, /function setDetailsWidgetOpen\(details: HTMLElement, open: boolean\): void \{/u)
  assert.match(source, /details\.dataset\.detailsOpen = String\(open\)/u)
  assert.match(source, /Decoration\.replace\(\{ widget: new DetailsWidget\(detailsBlock, documentContext\) \}\)/u)
  assert.doesNotMatch(source, /new DetailsWidget\(detailsBlock, documentContext\), block: true/u)
  assert.match(source, /const detailsGapLineStarts = new Set<number>\(\)/u)
  assert.match(source, /queueDetailsGapLineDecoration\(decorations, view, openingLine\.number - 1, detailsGapLineStarts\)/u)
  assert.match(source, /queueDetailsGapLineDecoration\(decorations, view, closingLine\.number \+ 1, detailsGapLineStarts\)/u)
  assert.match(source, /function markDetailsGapGutterLine\(/u)
  assert.match(source, /function getDetailsToggleButton\(target: EventTarget \| null\): HTMLButtonElement \| null \{/u)
  assert.match(source, /function toggleDetailsDisclosureTarget\(target: EventTarget \| null\): boolean \{/u)
  assert.match(source, /setDetailsWidgetOpen\(details, details\.dataset\.detailsOpen !== 'true'\)/u)
  assert.match(source, /function activateDetailsTarget\(view: EditorView, target: EventTarget \| null\): boolean \{/u)
  assert.match(source, /if \(getDetailsToggleButton\(target\)\) return false/u)
  assert.match(source, /closest<HTMLElement>\('\.cm-wysiwyg-details'\)/u)
  assert.match(source, /selection: \{ anchor: editAnchor \}/u)
  assert.match(source, /collectWysiwygStructuralBlocks\(markdown\)/u)
  assert.match(source, /collectMarkdownTableBlocks\(markdown, ignoredTableRanges\)/u)
  assert.match(source, /'\.cm-wysiwyg-details-hidden-line': \{[\s\S]*?height: '0'[\s\S]*?fontSize: '0'/u)
  assert.match(source, /'\.cm-wysiwyg-details-gap-line': \{[\s\S]*?height: 'var\(--md-block-space, 0\.75em\)'[\s\S]*?fontSize: 'inherit'/u)
  assert.match(source, /'\.cm-wysiwyg-details': \{[\s\S]*?display: 'inline-block'[\s\S]*?border: '0 solid transparent'[\s\S]*?whiteSpace: 'normal'[\s\S]*?cursor: 'text'[\s\S]*?userSelect: 'none'/u)
  assert.match(source, /'\.cm-wysiwyg-details\[data-details-open="false"\] \.cm-wysiwyg-details__body': \{[\s\S]*?display: 'none'/u)
  assert.match(source, /'\.cm-wysiwyg-details__summary': \{[\s\S]*?display: 'flex'[\s\S]*?cursor: 'text'[\s\S]*?fontWeight: '500'[\s\S]*?whiteSpace: 'normal'/u)
  assert.match(source, /'\.cm-wysiwyg-details__toggle': \{[\s\S]*?appearance: 'none'[\s\S]*?cursor: 'pointer'/u)
  assert.match(source, /'\.cm-wysiwyg-details\[data-details-open="true"\] \.cm-wysiwyg-details__toggle-icon': \{[\s\S]*?transform: 'rotate\(90deg\)'/u)
  assert.match(source, /'\.cm-wysiwyg-details__body': \{[\s\S]*?whiteSpace: 'normal'/u)
  assert.match(source, /'\.cm-wysiwyg-details__body p': \{[\s\S]*?whiteSpace: 'pre-line'/u)
  assert.match(source, /'\.cm-wysiwyg-details__body ul, \.cm-wysiwyg-details__body ol': \{[\s\S]*?paddingLeft: 'var\(--md-list-indent, 1\.75em\)'[\s\S]*?margin: '0'/u)
  assert.match(source, /'\.cm-wysiwyg-details__body li \+ li': \{[\s\S]*?marginTop: 'var\(--md-list-item-space, 0\.2em\)'/u)
  assert.match(source, /'\.cm-wysiwyg-details__body pre': \{[\s\S]*?whiteSpace: 'pre'/u)
  assert.match(source, /'\.cm-wysiwyg-details__body th, \.cm-wysiwyg-details__body td': \{[\s\S]*?whiteSpace: 'pre-line'/u)
})
