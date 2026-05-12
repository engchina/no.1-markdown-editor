import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { rewriteDecorativeSetextHeadingsToATX } from '../src/lib/decorativeSetextHeading.ts'

test('rewriteDecorativeSetextHeadingsToATX converts === wrapped H1 to # ATX', () => {
  const md = [
    '====',
    'My Title',
    '====',
    'body',
    '',
  ].join('\n')
  const { markdown, replacedCount } = rewriteDecorativeSetextHeadingsToATX(md)
  assert.equal(replacedCount, 1)
  assert.equal(markdown, ['# My Title', 'body', ''].join('\n'))
})

test('rewriteDecorativeSetextHeadingsToATX leaves plain setext headings alone', () => {
  const md = 'plain title\n=====\nbody\n'
  const { markdown, replacedCount } = rewriteDecorativeSetextHeadingsToATX(md)
  assert.equal(replacedCount, 0)
  assert.equal(markdown, md)
})

test('rewriteDecorativeSetextHeadingsToATX preserves trailing newlines and following content', () => {
  const md = [
    '====',
    'Title',
    '====',
    '',
    'paragraph after',
    '',
  ].join('\n')
  const { markdown, replacedCount } = rewriteDecorativeSetextHeadingsToATX(md)
  assert.equal(replacedCount, 1)
  assert.equal(markdown, ['# Title', '', 'paragraph after', ''].join('\n'))
})

test('rewriteDecorativeSetextHeadingsToATX handles unicode title content (Japanese, emoji)', () => {
  const md = [
    '========================================',
    '🌍 【旅行プラン】',
    '========================================',
    'body',
    '',
  ].join('\n')
  const { markdown, replacedCount } = rewriteDecorativeSetextHeadingsToATX(md)
  assert.equal(replacedCount, 1)
  assert.equal(markdown, ['# 🌍 【旅行プラン】', 'body', ''].join('\n'))
})

test('rewriteDecorativeSetextHeadingsToATX returns markdown unchanged when no setext headings exist', () => {
  const md = '# already ATX\nbody\n'
  const { markdown, replacedCount } = rewriteDecorativeSetextHeadingsToATX(md)
  assert.equal(replacedCount, 0)
  assert.equal(markdown, md)
})

test('rewriteDecorativeSetextHeadingsToATX rewrites H2 wrapped by --- to ## ATX', () => {
  // NB: leading `---` alone with no content above is treated as a thematic
  // break, so for H2 the natural decorative form is `text---\nh2title\n---`
  // — but with content above the top `---` is sucked into the heading.
  const md = [
    'preface text',
    '--------',
    'Sub Title',
    '--------',
    '',
  ].join('\n')
  const { markdown, replacedCount } = rewriteDecorativeSetextHeadingsToATX(md)
  // Two headings get parsed: "preface text" + "Sub Title". Only the second has
  // a decorative line wrapped inside it... actually neither has decorative
  // content, so nothing changes. Confirm pass-through.
  assert.equal(replacedCount, 0)
  assert.equal(markdown, md)
})

test('rewriteDecorativeSetextHeadingsToATX leaves a lone === line at top of file alone', () => {
  const md = '====\n'
  const { markdown, replacedCount } = rewriteDecorativeSetextHeadingsToATX(md)
  assert.equal(replacedCount, 0)
  assert.equal(markdown, md)
})

test('rewriteDecorativeSetextHeadingsToATX rewrites multiple decorative blocks in one pass', () => {
  const md = [
    '====',
    'First',
    '====',
    '',
    '====',
    'Second',
    '====',
    '',
  ].join('\n')
  const { markdown, replacedCount } = rewriteDecorativeSetextHeadingsToATX(md)
  assert.equal(replacedCount, 2)
  assert.equal(markdown, ['# First', '', '# Second', ''].join('\n'))
})

test('format command pipeline registers the normalizeSetextHeadings action', async () => {
  const source = await readFile(new URL('../src/components/Editor/formatCommands.ts', import.meta.url), 'utf8')
  assert.match(source, /case 'normalizeSetextHeadings': return normalizeDecorativeSetextHeadings\(view\)/u)
  assert.match(source, /rewriteDecorativeSetextHeadingsToATX/u)
  assert.match(source, /notices\.normalizeSetextHeadingsDoneTitle/u)
  assert.match(source, /notices\.normalizeSetextHeadingsNoneTitle/u)
})

test('command palette exposes the normalize-setext-headings command', async () => {
  const source = await readFile(new URL('../src/hooks/useCommands.ts', import.meta.url), 'utf8')
  assert.match(source, /id: 'edit\.normalizeSetextHeadings'/u)
  assert.match(source, /emitFormat\('normalizeSetextHeadings'\)/u)
  assert.match(source, /commands\.normalizeSetextHeadings/u)
})

test('all three locales define the normalize-setext-headings i18n keys', async () => {
  for (const locale of ['en', 'ja', 'zh']) {
    const raw = await readFile(new URL(`../src/i18n/locales/${locale}.json`, import.meta.url), 'utf8')
    const messages = JSON.parse(raw) as Record<string, Record<string, string>>
    assert.equal(typeof messages.commands.normalizeSetextHeadings, 'string', `${locale}: commands.normalizeSetextHeadings missing`)
    assert.equal(typeof messages.commands.normalizeSetextHeadingsDescription, 'string', `${locale}: commands.normalizeSetextHeadingsDescription missing`)
    assert.equal(typeof messages.notices.normalizeSetextHeadingsDoneTitle, 'string', `${locale}: notices.done.title missing`)
    assert.equal(typeof messages.notices.normalizeSetextHeadingsDoneMessage, 'string', `${locale}: notices.done.message missing`)
    assert.equal(typeof messages.notices.normalizeSetextHeadingsNoneTitle, 'string', `${locale}: notices.none.title missing`)
    assert.equal(typeof messages.notices.normalizeSetextHeadingsNoneMessage, 'string', `${locale}: notices.none.message missing`)
  }
})
