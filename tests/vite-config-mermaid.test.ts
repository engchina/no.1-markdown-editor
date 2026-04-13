import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const viteConfigSource = readFileSync(resolve('vite.config.ts'), 'utf8')
const mermaidParserSource = readFileSync(resolve('src/lib/mermaidParser.ts'), 'utf8')

test('vite keeps Mermaid on the shim while exposing the upstream parser package for prebundling', () => {
  assert.match(viteConfigSource, /find:\s*\/\^@mermaid-js\\\/parser\$\//u)
  assert.match(viteConfigSource, /find:\s*\/\^@mermaid-js\\\/parser-upstream\$\//u)
  assert.match(
    viteConfigSource,
    /include:\s*\['mermaid', '@mermaid-js\/parser-upstream', '@mermaid-js\/mermaid-zenuml', '@zenuml\/core', 'langium'\]/u
  )
  assert.match(viteConfigSource, /OPTIONAL_PREVIEW_CHUNK_PATTERN[\s\S]*zenuml/u)
})

test('the Mermaid parser shim imports the upstream package through the dedicated alias', () => {
  assert.match(mermaidParserSource, /import\('@mermaid-js\/parser-upstream'\)/u)
  assert.match(mermaidParserSource, /const nodeMermaidParserSpecifier = '@mermaid-js\/parser'/u)
  assert.match(mermaidParserSource, /import\(nodeMermaidParserSpecifier\)/u)
  assert.doesNotMatch(mermaidParserSource, /import\('\.\.\/\.\.\/node_modules\/@mermaid-js\/parser/u)
})

test('treemap parser leaves stay on the Mermaid parser chunk and are exposed by the shim', () => {
  assert.match(viteConfigSource, /const isMermaidParserLeafModule =[\s\S]*treemap/u)
  assert.match(mermaidParserSource, /createTreemapServices/u)
  assert.match(mermaidParserSource, /treemap:\s*\{\s*create:\s*'createTreemapServices',\s*service:\s*'Treemap'/u)
})
