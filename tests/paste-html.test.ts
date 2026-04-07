import assert from 'node:assert/strict'
import test from 'node:test'
import { parseFragment } from 'parse5'
import { renderMarkdown } from '../src/lib/markdown.ts'
import { renderClipboardHtmlAstToMarkdown, type ClipboardHtmlAstNode } from '../src/lib/pasteHtml.ts'

interface Parse5Node {
  nodeName: string
  tagName?: string
  value?: string
  attrs?: Array<{ name: string; value: string }>
  childNodes?: Parse5Node[]
}

test('renderClipboardHtmlAstToMarkdown keeps article copy structure and linked images', async () => {
  const root = parseHtml(`
    <p>Oracle AI Database 26ai では、Automatic In-Memory(AIM) がさらに強化されました。</p>
    <p>今回は、<strong>Automatic In-Memory Sizing</strong> と <strong>Database-native In-Memory Advisor</strong> を使って、AIM の設定と確認手順を実際に試してみます。</p>
    <p>
      <a href="https://qiita-user-contents.imgix.net/full.png">
        <img src="https://qiita-user-contents.imgix.net/thumb.png" alt="in_memoryイメージ.png" />
      </a>
    </p>
    <p>
      <strong><a href="https://docs.oracle.com/inmemory">Automatic In-Memory: 自動インメモリ</a></strong>
      および
      <strong><a href="https://www.oracle.com/jp/ado.pdf">Automatic Data Optimization(ADO): 自動データ最適化</a></strong>
      は、ユーザーの介入なしに動的管理します。
    </p>
  `)

  const markdown = renderClipboardHtmlAstToMarkdown(root)
  const html = await renderMarkdown(markdown)

  assert.match(markdown, /\*\*Automatic In-Memory Sizing\*\*/)
  assert.match(markdown, /\[!\[in_memoryイメージ\.png]\(https:\/\/qiita-user-contents\.imgix\.net\/thumb\.png\)]\(https:\/\/qiita-user-contents\.imgix\.net\/full\.png\)/)
  assert.match(markdown, /\*\*\[Automatic In-Memory: 自動インメモリ]\(https:\/\/docs\.oracle\.com\/inmemory\)\*\*/)
  assert.match(html, /<a href="https:\/\/qiita-user-contents\.imgix\.net\/full\.png"><img/)
  assert.match(html, /src="https:\/\/qiita-user-contents\.imgix\.net\/thumb\.png"/)
})

test('renderClipboardHtmlAstToMarkdown prefers lazy image sources over tracking placeholders', () => {
  const root = parseHtml(`
    <p>
      <img
        src="data:image/gif;base64,R0lGODlhAQAB"
        data-src="https://cdn.example.com/hero.png"
        alt="Hero image"
      />
    </p>
  `)

  const markdown = renderClipboardHtmlAstToMarkdown(root)

  assert.equal(markdown, '![Hero image](https://cdn.example.com/hero.png)')
})

function parseHtml(html: string): ClipboardHtmlAstNode {
  const fragment = parseFragment(html) as Parse5Node

  return {
    type: 'root',
    children: (fragment.childNodes ?? [])
      .map((node) => parse5NodeToAst(node))
      .filter((node): node is ClipboardHtmlAstNode => node !== null),
  }
}

function parse5NodeToAst(node: Parse5Node): ClipboardHtmlAstNode | null {
  if (node.nodeName === '#text') {
    return {
      type: 'text',
      textContent: node.value ?? '',
      children: [],
    }
  }

  if (node.nodeName.startsWith('#')) {
    return null
  }

  return {
    type: 'element',
    tagName: (node.tagName ?? '').toLowerCase(),
    attributes: Object.fromEntries((node.attrs ?? []).map((attribute) => [attribute.name.toLowerCase(), attribute.value])),
    children: (node.childNodes ?? [])
      .map((child) => parse5NodeToAst(child))
      .filter((child): child is ClipboardHtmlAstNode => child !== null),
  }
}
