import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { EditorState } from '@codemirror/state'
import { buildWysiwygDecorations } from '../src/components/Editor/wysiwyg.ts'

const source = readFileSync(new URL('../src/components/Editor/wysiwyg.ts', import.meta.url), 'utf8')

test('WYSIWYG front matter uses the shared parser and compact shared HTML', () => {
  assert.match(source, /parseFrontMatter\(docText\)/u)
  assert.match(source, /buildFrontMatterHtml\(this\.parsed\)/u)
  assert.match(source, /className = 'cm-wysiwyg-front-matter'/u)
})

test('WYSIWYG front matter skips ordinary Markdown decoration while source is visible', () => {
  const frontMatterBranch = source.indexOf('if (frontMatterRange && lineFrom >= frontMatterRange.from')
  const headingBranch = source.indexOf('// ── Headings', frontMatterBranch)
  const horizontalRuleBranch = source.indexOf('// ── Horizontal rule', frontMatterBranch)
  assert.ok(frontMatterBranch >= 0)
  assert.ok(frontMatterBranch < headingBranch)
  assert.ok(frontMatterBranch < horizontalRuleBranch)
  assert.match(source, /frontMatter\.status !== 'unclosed'/u)
})

test('WYSIWYG front matter card supports keyboard editing without hijacking resource links', () => {
  assert.match(source, /aria-keyshortcuts', 'Enter Space'/u)
  assert.match(source, /getFrontMatterResourceTarget/u)
  assert.match(source, /openFrontMatterResource/u)
  assert.match(source, /activateFrontMatterTarget/u)
})

test('WYSIWYG decoration builder replaces inactive front matter with one card', () => {
  const markdown = '---\ntype: Example\ntags: [one, two]\n---\n\n# Body\n'
  const state = EditorState.create({
    doc: markdown,
    selection: { anchor: markdown.length },
  })
  const decorations = buildWysiwygDecorations(
    { state, visibleRanges: [{ from: 0, to: markdown.length }] },
    [],
    [],
    [],
    [],
    [],
    [],
    new Map()
  )
  const widgetNames: string[] = []
  decorations.between(0, markdown.length, (_from, _to, value) => {
    const widget = value.spec.widget as { constructor?: { name?: string } } | undefined
    if (widget?.constructor?.name) widgetNames.push(widget.constructor.name)
  })
  assert.deepEqual(widgetNames, ['FrontMatterWidget'])
})
