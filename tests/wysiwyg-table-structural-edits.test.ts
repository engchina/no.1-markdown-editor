import assert from 'node:assert/strict'
import test from 'node:test'
import { collectMarkdownTableBlocks } from '../src/components/Editor/tableBlockRanges.ts'
import {
  resolveDeleteTableColumn,
  resolveDeleteTableRow,
  resolveInsertTableColumn,
  resolveInsertTableRow,
  resolveSetTableColumnAlignment,
} from '../src/components/Editor/wysiwygTable.ts'

const SAMPLE_TABLE = [
  '| Left | Center | Right |',
  '| --- | :---: | ---: |',
  '| a | b | c |',
  '| d | e | f |',
].join('\n')

function loadTable(markdown: string) {
  const [table] = collectMarkdownTableBlocks(markdown)
  assert.ok(table, 'expected a table block to be parsed')
  return { markdown, table }
}

test('resolveInsertTableRow inserts a body row below the current body cell', () => {
  const { table } = loadTable(SAMPLE_TABLE)

  const plan = resolveInsertTableRow(table, { section: 'body', rowIndex: 0, columnIndex: 1 }, 'below')
  assert.ok(plan)
  assert.equal(plan!.from, table.from)
  assert.equal(plan!.to, table.to)
  assert.deepEqual(plan!.focusLocation, { section: 'body', rowIndex: 1, columnIndex: 1 })
  assert.equal(
    plan!.insert,
    [
      '| Left | Center | Right |',
      '| --- | :---: | ---: |',
      '| a | b | c |',
      '|  |  |  |',
      '| d | e | f |',
    ].join('\n')
  )
})

test('resolveInsertTableRow above a head cell inserts before the first body row', () => {
  const { table } = loadTable(SAMPLE_TABLE)

  const plan = resolveInsertTableRow(table, { section: 'head', rowIndex: 0, columnIndex: 2 }, 'above')
  assert.ok(plan)
  assert.deepEqual(plan!.focusLocation, { section: 'body', rowIndex: 0, columnIndex: 2 })
  assert.equal(
    plan!.insert,
    [
      '| Left | Center | Right |',
      '| --- | :---: | ---: |',
      '|  |  |  |',
      '| a | b | c |',
      '| d | e | f |',
    ].join('\n')
  )
})

test('resolveInsertTableColumn adds an empty column and shifts alignments', () => {
  const { table } = loadTable(SAMPLE_TABLE)

  const plan = resolveInsertTableColumn(table, { section: 'body', rowIndex: 0, columnIndex: 1 }, 'right')
  assert.ok(plan)
  assert.deepEqual(plan!.focusLocation, { section: 'body', rowIndex: 0, columnIndex: 2 })
  assert.equal(
    plan!.insert,
    [
      '| Left | Center |  | Right |',
      '| --- | :---: | --- | ---: |',
      '| a | b |  | c |',
      '| d | e |  | f |',
    ].join('\n')
  )
})

test('resolveDeleteTableRow removes the targeted body row and clamps focus', () => {
  const { table } = loadTable(SAMPLE_TABLE)

  const plan = resolveDeleteTableRow(table, { section: 'body', rowIndex: 1, columnIndex: 2 })
  assert.ok(plan)
  assert.deepEqual(plan!.focusLocation, { section: 'body', rowIndex: 0, columnIndex: 2 })
  assert.equal(
    plan!.insert,
    [
      '| Left | Center | Right |',
      '| --- | :---: | ---: |',
      '| a | b | c |',
    ].join('\n')
  )
})

test('resolveDeleteTableRow refuses to delete the header row', () => {
  const { table } = loadTable(SAMPLE_TABLE)
  assert.equal(resolveDeleteTableRow(table, { section: 'head', rowIndex: 0, columnIndex: 0 }), null)
})

test('resolveDeleteTableColumn removes the targeted column and preserves alignments', () => {
  const { table } = loadTable(SAMPLE_TABLE)

  const plan = resolveDeleteTableColumn(table, { section: 'body', rowIndex: 0, columnIndex: 1 })
  assert.ok(plan)
  assert.deepEqual(plan!.focusLocation, { section: 'body', rowIndex: 0, columnIndex: 1 })
  assert.equal(
    plan!.insert,
    [
      '| Left | Right |',
      '| --- | ---: |',
      '| a | c |',
      '| d | f |',
    ].join('\n')
  )
})

test('resolveDeleteTableColumn refuses to drop a column when only two remain', () => {
  const { table } = loadTable(
    [
      '| Left | Right |',
      '| --- | ---: |',
      '| a | b |',
    ].join('\n')
  )

  assert.equal(resolveDeleteTableColumn(table, { section: 'body', rowIndex: 0, columnIndex: 1 }), null)
})

test('resolveSetTableColumnAlignment rewrites only the separator row', () => {
  const { table } = loadTable(SAMPLE_TABLE)

  const plan = resolveSetTableColumnAlignment(table, 0, 'center')
  assert.ok(plan)
  assert.deepEqual(plan!.focusLocation, { section: 'head', rowIndex: 0, columnIndex: 0 })
  assert.equal(
    plan!.insert,
    [
      '| Left | Center | Right |',
      '| :---: | :---: | ---: |',
      '| a | b | c |',
      '| d | e | f |',
    ].join('\n')
  )
})

test('resolveSetTableColumnAlignment is a noop when alignment already matches', () => {
  const { table } = loadTable(SAMPLE_TABLE)
  assert.equal(resolveSetTableColumnAlignment(table, 1, 'center'), null)
})
