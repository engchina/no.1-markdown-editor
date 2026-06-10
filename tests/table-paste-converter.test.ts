import assert from 'node:assert/strict'
import test from 'node:test'
import {
  convertClipboardToMarkdownTable,
  convertHtmlTableToMarkdown,
  convertTsvToMarkdownTable,
  planClipboardTablePaste,
} from '../src/components/Editor/tablePasteConverter.ts'

test('convertTsvToMarkdownTable converts tab-separated rows into a GFM table', () => {
  const tsv = 'Name\tAge\nAlice\t30\nBob\t25'
  const expected = [
    '| Name | Age |',
    '| --- | --- |',
    '| Alice | 30 |',
    '| Bob | 25 |',
  ].join('\n')

  assert.equal(convertTsvToMarkdownTable(tsv), expected)
})

test('convertTsvToMarkdownTable pads short rows and escapes pipes', () => {
  const tsv = 'A\tB\tC\n1 | one\t2\n3\t4\t5'
  const expected = [
    '| A | B | C |',
    '| --- | --- | --- |',
    '| 1 \\| one | 2 |  |',
    '| 3 | 4 | 5 |',
  ].join('\n')

  assert.equal(convertTsvToMarkdownTable(tsv), expected)
})

test('convertTsvToMarkdownTable rejects plain text without tabs', () => {
  assert.equal(convertTsvToMarkdownTable('hello world'), null)
  assert.equal(convertTsvToMarkdownTable('line one\nline two'), null)
})

test('convertHtmlTableToMarkdown extracts the first table and decodes entities', () => {
  const html = `
    <div>
      <table>
        <thead><tr><th>Name</th><th>Notes</th></tr></thead>
        <tbody>
          <tr><td>Alice&nbsp;A.</td><td>Hello<br>World</td></tr>
          <tr><td>Bob</td><td>&lt;ok&gt;</td></tr>
        </tbody>
      </table>
    </div>
  `
  const expected = [
    '| Name | Notes |',
    '| --- | --- |',
    '| Alice A. | Hello<br />World |',
    '| Bob | <ok> |',
  ].join('\n')

  assert.equal(convertHtmlTableToMarkdown(html), expected)
})

test('convertHtmlTableToMarkdown returns null when no table is present', () => {
  assert.equal(convertHtmlTableToMarkdown('<p>no table</p>'), null)
})

test('convertClipboardToMarkdownTable prefers HTML table over TSV text', () => {
  const html = '<table><tr><th>a</th><th>b</th></tr><tr><td>1</td><td>2</td></tr></table>'
  const text = 'a\tb\n1\t2'
  const result = convertClipboardToMarkdownTable({ html, text })
  assert.ok(result)
  assert.match(result!, /^\| a \| b \|/u)
})

test('convertClipboardToMarkdownTable returns null when neither source contains a table', () => {
  assert.equal(convertClipboardToMarkdownTable({ text: 'hello', html: '<p>hi</p>' }), null)
  assert.equal(convertClipboardToMarkdownTable({}), null)
})

test('planClipboardTablePaste returns an insertion plan with surrounding blank lines', () => {
  const docText = 'before text\nafter'
  // Caret mid-line ("before |text") needs a leading blank line; "text\nafter"
  // follows without a blank line, so a trailing one is added too.
  const plan = planClipboardTablePaste({
    docText,
    selectionFrom: 7,
    selectionTo: 7,
    clipboard: { text: 'a\tb\n1\t2' },
  })

  assert.ok(plan)
  assert.equal(plan!.from, 7)
  assert.equal(plan!.to, 7)
  assert.match(plan!.insert, /^\n\n\| a \| b \|/u)
  assert.match(plan!.insert, /\| 1 \| 2 \|\n\n$/u)
})

test('planClipboardTablePaste skips leading/trailing padding at line boundaries', () => {
  const docText = 'line one\n\nline three'
  // Caret at the start of the blank line 2; the next char is "\n".
  const plan = planClipboardTablePaste({
    docText,
    selectionFrom: 9,
    selectionTo: 9,
    clipboard: { text: 'a\tb\n1\t2' },
  })

  assert.ok(plan)
  assert.match(plan!.insert, /^\| a \| b \|/u)
  assert.match(plan!.insert, /\| 1 \| 2 \|\n$/u)
})

test('planClipboardTablePaste returns null for non-table clipboard content', () => {
  assert.equal(
    planClipboardTablePaste({
      docText: 'doc',
      selectionFrom: 0,
      selectionTo: 0,
      clipboard: { text: 'plain text' },
    }),
    null
  )
})

test('planClipboardTablePaste returns null when the selection sits inside an existing table', () => {
  const docText = '| h1 | h2 |\n| --- | --- |\n| a | b |\n'
  const plan = planClipboardTablePaste({
    docText,
    selectionFrom: 2,
    selectionTo: 2,
    clipboard: { text: 'a\tb\n1\t2' },
    tableRanges: [{ from: 0, to: docText.length - 1 }],
  })

  assert.equal(plan, null)
})
