import assert from 'node:assert/strict'
import test from 'node:test'
import { parseFragment } from 'parse5'
import { renderMarkdown } from '../src/lib/markdown.ts'
import {
  convertClipboardHtmlToMarkdown,
  renderClipboardHtmlAstToMarkdown,
  type ClipboardHtmlAstNode,
} from '../src/lib/pasteHtml.ts'

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

test('renderClipboardHtmlAstToMarkdown keeps semantic inline tags, task lists, footnotes, and table alignment', async () => {
  const root = parseHtml(`
    <p><u>Underline</u>, <mark>highlight</mark>, H<sub>2</sub>O, X<sup>2</sup>.</p>
    <ul class="contains-task-list">
      <li class="task-list-item"><input type="checkbox" disabled /> list syntax required</li>
      <li class="task-list-item"><input type="checkbox" checked disabled /> completed</li>
    </ul>
    <table>
      <thead>
        <tr>
          <th style="text-align: left;">Left-Aligned</th>
          <th style="text-align: center;">Center Aligned</th>
          <th style="text-align: right;">Right Aligned</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>col 3 is</td>
          <td>some wordy text</td>
          <td>$1600</td>
        </tr>
      </tbody>
    </table>
    <p>You can create reference footnotes like this<sup><a href="#fn1" data-footnote-ref>1</a></sup>.</p>
    <section data-footnotes class="footnotes">
      <ol>
        <li id="fn1">
          <p>Here is the <em>text</em> of the first <strong>footnote</strong>. <a href="#fnref1" data-footnote-backref>↩</a></p>
        </li>
      </ol>
    </section>
  `)

  const markdown = renderClipboardHtmlAstToMarkdown(root)
  const html = await renderMarkdown(markdown)

  assert.match(markdown, /<u>Underline<\/u>/)
  assert.match(markdown, /<mark>highlight<\/mark>/)
  assert.match(markdown, /H<sub>2<\/sub>O/)
  assert.match(markdown, /X<sup>2<\/sup>/)
  assert.match(markdown, /- \[ ] list syntax required/)
  assert.match(markdown, /- \[x] completed/)
  assert.match(markdown, /\| :--- \| :---: \| ---: \|/)
  assert.match(markdown, /\[\^1]/)
  assert.match(markdown, /\[\^1]: Here is the \*text\* of the first \*\*footnote\*\*\./)
  assert.match(html, /<u>Underline<\/u>/)
  assert.match(html, /<mark>highlight<\/mark>/)
  assert.match(html, /contains-task-list/)
  assert.match(html, /data-footnotes/)
})

test('renderClipboardHtmlAstToMarkdown preserves heading, links, and nested list structure for a table of contents', () => {
  const root = parseHtml(`
    <h1>Markdown Reference</h1>
    <h2>Overview</h2>
    <p>Table of Contents</p>
    <ul>
      <li><a href="#overview">Overview</a></li>
      <li>
        Block Elements
        <ul>
          <li><a href="#paragraph-and-line-breaks">Paragraph and line breaks</a></li>
          <li><a href="#headings">Headings</a></li>
        </ul>
      </li>
    </ul>
  `)

  const markdown = renderClipboardHtmlAstToMarkdown(root)

  assert.equal(
    markdown,
    [
      '# Markdown Reference',
      '',
      '## Overview',
      '',
      'Table of Contents',
      '',
      '- [Overview](#overview)',
      '- Block Elements',
      '',
      '  - [Paragraph and line breaks](#paragraph-and-line-breaks)',
      '  - [Headings](#headings)',
    ].join('\n')
  )
})

test('convertClipboardHtmlToMarkdown does not fall back to plain text for semantic html tags', () => {
  const originalDomParser = globalThis.DOMParser
  globalThis.DOMParser = FakeDOMParser as unknown as typeof DOMParser

  try {
    const markdown = convertClipboardHtmlToMarkdown('<p><u>Underline</u></p>', 'Underline')
    assert.equal(markdown, '<u>Underline</u>')
  } finally {
    globalThis.DOMParser = originalDomParser
  }
})

test('convertClipboardHtmlToMarkdown extracts clipboard html fragments and prefers rich html over flattened list text', () => {
  const originalDomParser = globalThis.DOMParser
  globalThis.DOMParser = FakeDOMParser as unknown as typeof DOMParser

  try {
    const fragment = [
      '<!--StartFragment-->',
      '<h1>Markdown Reference</h1>',
      '<h2>Overview</h2>',
      '<ul>',
      '  <li><a href="#overview">Overview</a></li>',
      '  <li>Block Elements',
      '    <ul>',
      '      <li><a href="#paragraph-and-line-breaks">Paragraph and line breaks</a></li>',
      '    </ul>',
      '  </li>',
      '</ul>',
      '<!--EndFragment-->',
    ].join('')
    const clipboardHtml = `Version:1.0\r\nStartHTML:00000097\r\nEndHTML:00000365\r\nStartFragment:00000129\r\nEndFragment:00000333\r\n<html><body>${fragment}</body></html>`
    const plainText = ['Markdown Reference', 'Overview', '- Overview', '- Block Elements', '  - Paragraph and line breaks'].join('\n')

    const markdown = convertClipboardHtmlToMarkdown(clipboardHtml, plainText)

    assert.equal(
      markdown,
      [
        '# Markdown Reference',
        '',
        '## Overview',
        '',
        '- [Overview](#overview)',
        '- Block Elements',
        '',
        '  - [Paragraph and line breaks](#paragraph-and-line-breaks)',
      ].join('\n')
    )
  } finally {
    globalThis.DOMParser = originalDomParser
  }
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

class FakeDOMParser {
  parseFromString(html: string): { body: { childNodes: FakeDomNode[] } } {
    const fragment = parseFragment(html) as Parse5Node

    return {
      body: {
        childNodes: (fragment.childNodes ?? [])
          .map((node) => parse5NodeToFakeDomNode(node))
          .filter((node): node is FakeDomNode => node !== null),
      },
    }
  }
}

interface FakeDomAttribute {
  name: string
  value: string
}

interface FakeDomNode {
  nodeType: number
  textContent?: string
  tagName?: string
  attributes?: FakeDomAttribute[]
  childNodes: FakeDomNode[]
}

function parse5NodeToFakeDomNode(node: Parse5Node): FakeDomNode | null {
  if (node.nodeName === '#text') {
    return {
      nodeType: 3,
      textContent: node.value ?? '',
      childNodes: [],
    }
  }

  if (node.nodeName.startsWith('#')) {
    return {
      nodeType: 8,
      textContent: node.value ?? '',
      childNodes: [],
    }
  }

  return {
    nodeType: 1,
    tagName: (node.tagName ?? '').toUpperCase(),
    attributes: (node.attrs ?? []).map((attribute) => ({ name: attribute.name, value: attribute.value })),
    childNodes: (node.childNodes ?? [])
      .map((child) => parse5NodeToFakeDomNode(child))
      .filter((child): child is FakeDomNode => child !== null),
  }
}
