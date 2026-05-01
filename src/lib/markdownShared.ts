import { defaultSchema } from 'rehype-sanitize'
import type { Schema } from 'hast-util-sanitize'
import { containsLikelyMath } from './markdownMath.ts'
import { rewriteRenderedHtmlImageSources } from './renderedImageSources.ts'

export type FrontMatterMeta = Record<string, string>
type PropertyDefinition = NonNullable<NonNullable<Schema['attributes']>[string]>[number]

function unique<T>(values: readonly T[]): T[] {
  return Array.from(new Set(values))
}

function mergeAttributeList(tagName: string, additions: readonly PropertyDefinition[]): PropertyDefinition[] {
  return unique([...(defaultSchema.attributes?.[tagName] ?? []), ...additions])
}

export const sanitizeSchema: Schema = {
  ...defaultSchema,
  tagNames: unique([
    ...(defaultSchema.tagNames ?? []),
    'abbr',
    'audio',
    'cite',
    'dfn',
    'figcaption',
    'figure',
    'iframe',
    'mark',
    'time',
    'track',
    'u',
    'video',
  ]),
  attributes: {
    ...defaultSchema.attributes,
    '*': mergeAttributeList('*', ['className', 'class']), // To allow standard classes
    'a': mergeAttributeList('a', ['dataFootnoteRef', 'dataFootnoteBackref', 'ariaDescribedBy', 'ariaDescribedby', 'ariaLabel']),
    'abbr': ['title', 'className', 'class'],
    'audio': ['ariaDescribedBy', 'ariaLabel', 'ariaLabelledBy', 'className', 'class', 'controls', 'loop', 'muted', 'preload', 'src', 'title'],
    'cite': ['className', 'class'],
    'details': mergeAttributeList('details', ['open', 'className', 'class']),
    'dfn': ['title', 'className', 'class'],
    'figcaption': ['className', 'class'],
    'figure': ['className', 'class'],
    'h2': mergeAttributeList('h2', ['id', 'className', 'class']),
    'iframe': [
      'allow',
      'allowFullScreen',
      'allowfullscreen',
      'ariaDescribedBy',
      'ariaLabel',
      'ariaLabelledBy',
      'className',
      'class',
      'height',
      'loading',
      'referrerPolicy',
      'sandbox',
      'src',
      'title',
      'width',
    ],
    'li': mergeAttributeList('li', ['id']),
    'section': mergeAttributeList('section', ['dataFootnotes', 'className', 'class']),
    'source': mergeAttributeList('source', ['media', 'sizes', 'src', 'type']),
    'sub': mergeAttributeList('sub', ['id']),
    'summary': mergeAttributeList('summary', ['className', 'class']),
    'sup': mergeAttributeList('sup', ['id']),
    'time': ['dateTime', 'className', 'class'],
    'track': ['default', 'kind', 'label', 'src', 'srcLang', 'srclang'],
    'video': [
      'ariaDescribedBy',
      'ariaLabel',
      'ariaLabelledBy',
      'className',
      'class',
      'controls',
      'height',
      'loop',
      'muted',
      'playsInline',
      'playsinline',
      'poster',
      'preload',
      'src',
      'title',
      'width',
    ],
  },
  protocols: {
    ...defaultSchema.protocols,
    href: unique([...(defaultSchema.protocols?.href ?? []), 'tel']),
    poster: unique([...(defaultSchema.protocols?.poster ?? []), 'http', 'https', 'data', 'file']),
    src: unique([...(defaultSchema.protocols?.src ?? []), 'data', 'file']),
  },
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function stripFrontMatter(markdown: string): { meta: FrontMatterMeta; body: string } {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
  if (!match) return { meta: {}, body: markdown }

  const meta: FrontMatterMeta = {}
  for (const line of match[1].split(/\r?\n/)) {
    const dividerIndex = line.indexOf(':')
    if (dividerIndex <= 0) continue

    const key = line.slice(0, dividerIndex).trim()
    const value = line.slice(dividerIndex + 1).trim().replace(/^['"]|['"]$/g, '')
    if (key) meta[key] = value
  }

  return {
    meta,
    body: markdown.slice(match[0].length).replace(/^\r?\n/, ''),
  }
}

export function buildFrontMatterHtml(meta: FrontMatterMeta): string {
  if (Object.keys(meta).length === 0) return ''

  const rows = Object.entries(meta)
    .map(
      ([key, value]) =>
        `<tr><td class="fm-key">${escapeHtml(key)}</td><td class="fm-val">${escapeHtml(value)}</td></tr>`
    )
    .join('')

  return `<div class="front-matter"><table>${rows}</table></div>`
}

export { containsLikelyMath }

export function normalizeSelfClosingRawHtmlBlocks(markdown: string): string {
  if (!markdown || !/<(?:audio|video|iframe)\b/i.test(markdown)) return markdown

  const parts = markdown.split(/(\r\n|\n|\r)/)
  let inFence: { marker: '`' | '~'; length: number } | null = null

  for (let index = 0; index < parts.length; index += 2) {
    const line = parts[index]
    const fence = /^ {0,3}(`{3,}|~{3,})/u.exec(line)
    if (fence) {
      const marker = fence[1][0] as '`' | '~'
      const length = fence[1].length
      if (!inFence) {
        inFence = { marker, length }
      } else if (inFence.marker === marker && length >= inFence.length) {
        inFence = null
      }
      continue
    }

    if (inFence) continue

    parts[index] = line.replace(
      /^(\s*)<(audio|video|iframe)\b((?:\s(?:[^<>"']+|"[^"]*"|'[^']*')*)?)\s*\/>\s*$/iu,
      (_, indent: string, tagName: string, attributes: string) =>
        `${indent}<${tagName}${attributes.replace(/\s+$/u, '')}></${tagName.toLowerCase()}>`
    )
  }

  return parts.join('')
}

export function finalizeRenderedMarkdownHtml(meta: FrontMatterMeta, bodyHtml: string): string {
  return buildFrontMatterHtml(meta) + rewriteRenderedHtmlImageSources(bodyHtml, { frontMatter: meta })
}

export function buildStandaloneHtml(
  title: string,
  bodyHtml: string,
  options: {
    inlineKatexCss?: string
  } = {}
): string {
  const normalizedTitle = (title ?? '').toString().trim() || 'Untitled'
  const safeTitle = escapeHtml(normalizedTitle)
  const includesMath = bodyHtml.includes('class="katex"')
  const katexCssBlock = options.inlineKatexCss
    ? `<style data-katex-inline="true">\n${options.inlineKatexCss}\n</style>`
    : '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16/dist/katex.min.css" />'
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${safeTitle}</title>
  ${includesMath ? katexCssBlock : ''}
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
      font-size: 16px;
      line-height: var(--md-prose-line-height, 1.8);
      color: #1a1a1a;
      background: #fff;
      max-width: 800px;
      margin: 0 auto;
      padding: 48px 32px;
      --md-prose-line-height: 1.8;
      --md-heading-line-height: 1.3;
      --md-block-space: 0.75em;
      --md-quote-space: 0.9em;
      --md-quote-pad-block: 0.15em;
      --md-quote-pad-inline-end: 0.15em;
      --md-quote-pad-inline-start: 1.1em;
      --md-quote-line-width: 4px;
      --md-quote-rule-color: rgba(161, 161, 170, 0.42);
      --md-list-indent: 1.75em;
      --md-list-item-space: 0.2em;
      --md-list-nested-space: 0.2em;
      --md-list-marker-color: #1a1a1a;
      --md-list-marker-font-weight: 400;
      --md-code-block-radius: 10px;
      --md-code-block-padding-inline: 16px;
      --md-code-block-padding-block: 16px;
    }
    h1, h2, h3, h4, h5, h6 {
      line-height: var(--md-heading-line-height, 1.3);
      margin: 0;
    }
    h1, h2 { font-weight: 700; }
    h3, h4, h5, h6 { font-weight: 600; }
    h1 { font-size: 2em; }
    h2 { font-size: 1.5em; }
    h3 { font-size: 1.25em; }
    a { color: #2563eb; text-decoration: none; }
    a:hover { text-decoration: underline; }
    mark {
      color: inherit;
      background: rgba(250, 204, 21, 0.35);
      border-radius: 0.25em;
      padding: 0 0.18em;
      box-decoration-break: clone;
      -webkit-box-decoration-break: clone;
    }
    sup {
      font-size: 0.75em;
      line-height: 0;
      vertical-align: super;
    }
    sub {
      font-size: 0.75em;
      line-height: 0;
      vertical-align: sub;
    }
    p { margin: 0; }
    code {
      font-family: 'JetBrains Mono', 'Cascadia Code', Consolas, monospace;
      font-variant-ligatures: none;
      font-feature-settings: "liga" 0, "calt" 0;
      font-size: 0.875em;
      background: #f4f4f5;
      border-radius: 4px;
      padding: 0.125em 0.375em;
    }
    pre {
      background: #18181b;
      color: #d4d4d8;
      border-radius: var(--md-code-block-radius, 10px);
      margin: 0;
      padding: var(--md-code-block-padding-block, 16px) var(--md-code-block-padding-inline, 16px);
      overflow-x: auto;
    }
    pre code { background: none; padding: 0; color: inherit; }
    .hljs { color: inherit; background: transparent; }
    .hljs-comment, .hljs-quote { color: #94a3b8; font-style: italic; }
    .hljs-keyword, .hljs-selector-tag, .hljs-literal, .hljs-name, .hljs-tag { color: #f97316; }
    .hljs-string, .hljs-attr, .hljs-template-tag, .hljs-template-variable { color: #4ade80; }
    .hljs-number, .hljs-symbol, .hljs-bullet, .hljs-variable, .hljs-variable.constant_ { color: #38bdf8; }
    .hljs-title, .hljs-title.class_, .hljs-title.function_ { color: #c084fc; }
    .hljs-meta, .hljs-built_in, .hljs-type { color: #facc15; }
    .hljs-section, .hljs-addition { color: #4ade80; }
    .hljs-deletion { color: #f87171; }
    .hljs-emphasis { font-style: italic; }
    .hljs-strong { font-weight: 700; }
    blockquote {
      padding: 0 var(--md-quote-pad-inline-end) 0 var(--md-quote-pad-inline-start);
      color: #4b5563;
      font-style: normal;
      background: none;
      border-left: var(--md-quote-line-width) solid var(--md-quote-rule-color);
    }
    blockquote > * { margin-top: 0; margin-bottom: 0; }
    blockquote > * + * { margin-top: var(--md-quote-space); }
    blockquote > blockquote { margin-top: 0; }
    table { border-collapse: collapse; width: 100%; margin: 0; }
    th, td { border: 1px solid #e5e7eb; padding: 8px 16px; text-align: left; }
    th:empty::before, td:empty::before { content: '\\00a0'; display: block; visibility: hidden; }
    th[align="left"], td[align="left"] { text-align: left; }
    th[align="center"], td[align="center"] { text-align: center; }
    th[align="right"], td[align="right"] { text-align: right; }
    th { background: #f9fafb; font-weight: 600; }
    tr:nth-child(even) td { background: #f9fafb; }
    img { max-width: 100%; border-radius: 4px; }
    figure { margin: 0; }
    figcaption {
      color: #6b7280;
      font-size: 0.875em;
      line-height: 1.5;
      margin-top: 0.5em;
      text-align: center;
    }
    kbd {
      display: inline-block;
      min-width: 1.5em;
      border: 1px solid #d4d4d8;
      border-radius: 4px;
      background: #f4f4f5;
      box-shadow: inset 0 -1px 0 #d4d4d8;
      color: #27272a;
      font-family: 'JetBrains Mono', 'Cascadia Code', Consolas, monospace;
      font-size: 0.8125em;
      line-height: 1.45;
      padding: 0 0.35em;
      text-align: center;
      white-space: nowrap;
    }
    audio, video, iframe {
      display: block;
      max-width: 100%;
      border-radius: 6px;
    }
    audio { width: 100%; }
    video { height: auto; }
    iframe {
      width: 100%;
      height: auto;
      aspect-ratio: 16 / 9;
      border: 1px solid #e5e7eb;
      background: #f9fafb;
    }
    hr { border: none; border-top: 1px solid #e5e7eb; margin: 0; }
    details { margin: 0; }
    summary { cursor: pointer; color: #1a1a1a; font-weight: 500; }
    summary:focus-visible { outline: 2px solid #2563eb; outline-offset: 3px; border-radius: 3px; }
    details > summary + * { margin-top: var(--md-block-space); }
    ul, ol { padding-left: var(--md-list-indent, 1.75em); margin: 0; }
    li { margin: 0; }
    li + li { margin-top: var(--md-list-item-space, 0.2em); }
    li > ul, li > ol { margin-top: var(--md-list-nested-space, 0.2em); margin-bottom: 0; }
    li::marker { color: var(--md-list-marker-color, #1a1a1a); font-weight: var(--md-list-marker-font-weight, 400); }
    input[type="checkbox"] { margin-right: 8px; }
    a[data-footnote-ref] {
      color: #2563eb;
      text-decoration: none;
      font-size: 1em;
      font-weight: 600;
    }
    a[data-footnote-backref] { color: #6b7280; }
    .front-matter {
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 12px 16px;
      margin: 0;
      font-size: 0.8em;
    }
    .front-matter table { border: none; margin: 0; width: 100%; }
    .front-matter td { border: none; padding: 2px 8px 2px 0; }
    .fm-key { font-weight: 600; color: #2563eb; white-space: nowrap; padding-right: 16px; }
    .fm-val { color: #4b5563; }
    body > :is(p, h1, h2, h3, h4, h5, h6, blockquote, details, figure, ul, ol, pre, table, hr, img, audio, video, iframe, .front-matter) {
      margin-top: 0;
      margin-bottom: 0;
    }
    body > :is(p, h1, h2, h3, h4, h5, h6, blockquote, details, figure, ul, ol, pre, table, hr, img, audio, video, iframe, .front-matter)
      + :is(p, h1, h2, h3, h4, h5, h6, blockquote, details, figure, ul, ol, pre, table, hr, img, audio, video, iframe, .front-matter) {
      margin-top: var(--md-block-space);
    }
    @page { size: A4; margin: 18mm 16mm; }
    @media print {
      html, body { background: #fff; }
      body {
        max-width: 100%;
        margin: 0;
        padding: 0;
        font-size: 12pt;
        line-height: 1.6;
      }
      a { color: inherit; text-decoration: underline; }
      pre, blockquote, table, img { break-inside: avoid; page-break-inside: avoid; }
      h1, h2, h3, h4, h5, h6 { break-after: avoid; page-break-after: avoid; }
    }
  </style>
</head>
<body>
${bodyHtml}
</body>
</html>`
}
