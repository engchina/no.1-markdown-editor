import assert from 'node:assert/strict'
import test from 'node:test'
import { parseFragment } from 'parse5'
import {
  convertPreviewSelectionHtmlToMarkdown,
  shouldExpandClosedDetailsSelection,
} from '../src/lib/previewClipboard.ts'

interface Parse5Node {
  nodeName: string
  tagName?: string
  value?: string
  attrs?: Array<{ name: string; value: string }>
  childNodes?: Parse5Node[]
}

test('convertPreviewSelectionHtmlToMarkdown preserves footnotes and in-document links from preview html', () => {
  const originalDomParser = globalThis.DOMParser
  globalThis.DOMParser = FakeDOMParser as unknown as typeof DOMParser

  try {
    const markdown = convertPreviewSelectionHtmlToMarkdown(
      [
        '<p>一个具有注脚的文本。<sup><a href="#user-content-fn-1" data-footnote-ref>1</a></sup></p>',
        '<h2 id="overview">Overview</h2>',
        '<p><a href="#overview">Jump</a></p>',
        '<p><a href="./guide.md">Doc</a></p>',
        '<p><a href="https://example.com/docs">Site</a></p>',
        '<section data-footnotes class="footnotes">',
        '  <ol>',
        '    <li id="user-content-fn-1">',
        '      <p>注脚的解释 <a href="#user-content-fnref-1" data-footnote-backref>↩</a></p>',
        '    </li>',
        '  </ol>',
        '</section>',
      ].join(''),
      '一个具有注脚的文本。1\nOverview\nJump\n注脚的解释 ↩'
    )

    assert.equal(
      markdown,
      [
        '一个具有注脚的文本。[^1]',
        '',
        '## Overview',
        '',
        '[Jump](#overview)',
        '',
        '[Doc](./guide.md)',
        '',
        '[Site](https://example.com/docs)',
        '',
        '[^1]: 注脚的解释',
      ].join('\n')
    )
  } finally {
    globalThis.DOMParser = originalDomParser
  }
})

test('convertPreviewSelectionHtmlToMarkdown prefers preview image source metadata over placeholder urls', () => {
  const originalDomParser = globalThis.DOMParser
  globalThis.DOMParser = FakeDOMParser as unknown as typeof DOMParser

  try {
    const markdown = convertPreviewSelectionHtmlToMarkdown(
      [
        '<p><img src="data:image/svg+xml;charset=UTF-8,placeholder" data-local-src="./images/hero.png" alt="Hero" /></p>',
        '<p><img src="data:image/svg+xml;charset=UTF-8,placeholder" data-external-src="https://example.com/cover.png" alt="Cover" /></p>',
      ].join(''),
      'Hero\nCover'
    )

    assert.equal(
      markdown,
      [
        '![Hero](./images/hero.png)',
        '',
        '![Cover](https://example.com/cover.png)',
      ].join('\n')
    )
  } finally {
    globalThis.DOMParser = originalDomParser
  }
})

test('convertPreviewSelectionHtmlToMarkdown preserves a collapsed details body copied from its summary', () => {
  const originalDomParser = globalThis.DOMParser
  globalThis.DOMParser = FakeDOMParser as unknown as typeof DOMParser

  try {
    const markdown = convertPreviewSelectionHtmlToMarkdown(
      [
        '<details>',
        '<summary>営業フォロー候補の顧客</summary>',
        '<div>',
        '<p>「キャンペーンに反応していて、口座残高も高いが、売上がまだ低め」の顧客を探します。</p>',
        '<div class="code-frame" data-lang="sql">',
        '<div class="code-copy"><button class="code-copy__button" style="display: none;">copy</button></div>',
        '<pre><code>SELECT CUSTOMER_NAME\nFROM V_CUSTOMER_360;</code></pre>',
        '</div>',
        '</div>',
        '</details>',
      ].join(''),
      '営業フォロー候補の顧客'
    )

    assert.equal(
      markdown,
      [
        '<details>',
        '<summary>営業フォロー候補の顧客</summary>',
        '',
        '「キャンペーンに反応していて、口座残高も高いが、売上がまだ低め」の顧客を探します。',
        '',
        '```sql',
        'SELECT CUSTOMER_NAME',
        'FROM V_CUSTOMER_360;',
        '```',
        '',
        '</details>',
      ].join('\n')
    )
  } finally {
    globalThis.DOMParser = originalDomParser
  }
})

test('shouldExpandClosedDetailsSelection only expands closed details when the summary intersects selection', () => {
  const summary = {}
  const range = {
    intersectsNode: (node: Node) => node === summary,
  } as unknown as Range
  const closedDetails = {
    open: false,
    querySelector: (selector: string) => (selector === ':scope > summary' ? summary : null),
  } as unknown as HTMLDetailsElement
  const openDetails = {
    open: true,
    querySelector: (selector: string) => (selector === ':scope > summary' ? summary : null),
  } as unknown as HTMLDetailsElement
  const closedDetailsWithoutSummary = {
    open: false,
    querySelector: () => null,
  } as unknown as HTMLDetailsElement

  assert.equal(shouldExpandClosedDetailsSelection(range, closedDetails), true)
  assert.equal(shouldExpandClosedDetailsSelection(range, openDetails), false)
  assert.equal(shouldExpandClosedDetailsSelection(range, closedDetailsWithoutSummary), false)
})

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
