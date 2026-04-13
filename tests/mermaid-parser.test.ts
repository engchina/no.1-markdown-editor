import assert from 'node:assert/strict'
import test from 'node:test'
import { parse, warmMermaidParser } from '../src/lib/mermaidParser.ts'

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

type ParsedPieDiagram = {
  title: string
  showData: boolean
  sections: Array<{ label: string; value: number }>
}

test('warmMermaidParser prepares pie diagrams without relying on Vite-only glob loaders', async () => {
  await warmMermaidParser('pie')
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
