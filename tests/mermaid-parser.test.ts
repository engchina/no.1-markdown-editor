import assert from 'node:assert/strict'
import test from 'node:test'
import { parse, warmMermaidParser } from '../src/lib/mermaidParser.ts'
import { getRenderableMermaidSource } from '../src/lib/mermaid.ts'

const pieTitle = '\u958b\u767a\u5de5\u6570\u306e\u5185\u8a33'
const pieSections = [
  ['\u8a2d\u8a08', 15],
  ['\u5b9f\u88c5', 45],
  ['\u30c6\u30b9\u30c8', 25],
  ['\u30c9\u30ad\u30e5\u30e1\u30f3\u30c8', 15],
] as const

const pieSource = `pie title ${pieTitle}
    "${pieSections[0][0]}" : ${pieSections[0][1]}
    "${pieSections[1][0]}" : ${pieSections[1][1]}
    "${pieSections[2][0]}" : ${pieSections[2][1]}
    "${pieSections[3][0]}" : ${pieSections[3][1]}`

const packetSource = [
  'packet',
  '+8: "Version"',
  '+8: "Length"',
  '16-31: "Payload"',
].join('\n')

type ParsedPieDiagram = {
  title: string
  showData: boolean
  sections: Array<{ label: string; value: number }>
}

type ParsedPacketDiagram = {
  blocks: Array<{ start?: number; end?: number; bits?: number; label: string }>
}

type ParsedRadarDiagram = {
  axes: Array<{ name: string; label?: string }>
  curves: Array<{ name: string; label?: string; entries: Array<{ axis?: { $refText?: string }; value: number }> }>
}

type ParsedTreemapDiagram = {
  $type: string
  TreemapRows: Array<{
    indent?: number
    item?: {
      $type: string
      name: string
      value?: number
    }
  }>
}

test('warmMermaidParser prepares pie diagrams without relying on Vite-only glob loaders', async () => {
  await warmMermaidParser('pie')
})

test('warmMermaidParser prepares packet diagrams without relying on Vite-only glob loaders', async () => {
  await warmMermaidParser('packet')
})

test('warmMermaidParser prepares treemap diagrams without relying on Vite-only glob loaders', async () => {
  await warmMermaidParser('treemap')
})

test('parse handles pie charts with localized labels and values', async () => {
  const diagram = await parse('pie', pieSource) as ParsedPieDiagram

  assert.equal(diagram.title, pieTitle)
  assert.equal(diagram.showData, false)
  assert.deepEqual(
    diagram.sections.map((section) => [section.label, section.value]),
    pieSections
  )
})

test('parse handles packet diagrams with relative widths and absolute bit ranges', async () => {
  const diagram = await parse('packet', packetSource) as ParsedPacketDiagram

  assert.deepEqual(
    diagram.blocks.map((block) => [block.start ?? null, block.end ?? null, block.bits ?? null, block.label]),
    [
      [null, null, 8, 'Version'],
      [null, null, 8, 'Length'],
      [16, 31, null, 'Payload'],
    ]
  )
})

test('parse handles radar charts copied from Mermaid docs once placeholder lines are removed', async () => {
  const source = getRenderableMermaidSource([
    'radar-beta',
    'axis A, B, C, D, E',
    'curve c1{1,2,3,4,5}',
    'curve c2{5,4,3,2,1}',
    '... More Fields ...',
  ].join('\n'))

  const diagram = await parse('radar', source) as ParsedRadarDiagram

  assert.deepEqual(diagram.axes.map((axis) => axis.name), ['A', 'B', 'C', 'D', 'E'])
  assert.deepEqual(
    diagram.curves.map((curve) => [curve.name, curve.entries.map((entry) => entry.value)]),
    [
      ['c1', [1, 2, 3, 4, 5]],
      ['c2', [5, 4, 3, 2, 1]],
    ]
  )
})

test('parse handles treemap charts that use nested sections and leaves', async () => {
  const source = [
    'treemap-beta',
    '"Section 1"',
    '  "Leaf 1.1": 12',
    '  "Section 1.2"',
    '    "Leaf 1.2.1": 12',
    '"Section 2"',
    '  "Leaf 2.1": 20',
    '  "Leaf 2.2": 25',
  ].join('\n')

  const diagram = await parse('treemap', source) as ParsedTreemapDiagram

  assert.equal(diagram.$type, 'Treemap')
  assert.deepEqual(
    diagram.TreemapRows.map((row) => [
      row.indent ?? 0,
      row.item?.$type ?? null,
      row.item?.name ?? null,
      row.item?.value ?? null,
    ]),
    [
      [0, 'Section', 'Section 1', null],
      [2, 'Leaf', 'Leaf 1.1', 12],
      [2, 'Section', 'Section 1.2', null],
      [4, 'Leaf', 'Leaf 1.2.1', 12],
      [0, 'Section', 'Section 2', null],
      [2, 'Leaf', 'Leaf 2.1', 20],
      [2, 'Leaf', 'Leaf 2.2', 25],
    ]
  )
})
