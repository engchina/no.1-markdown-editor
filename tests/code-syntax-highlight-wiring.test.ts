import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const codeSyntaxHighlightSource = readFileSync(
  resolve('src/components/Editor/codeSyntaxHighlight.ts'),
  'utf8'
)
const extensionsSource = readFileSync(resolve('src/components/Editor/extensions.ts'), 'utf8')
const globalCssSource = readFileSync(resolve('src/global.css'), 'utf8')

test('codeBlockSyntaxHighlight maps lezer tags to CSS variables', () => {
  assert.match(codeSyntaxHighlightSource, /import \{ HighlightStyle \} from '@codemirror\/language'/u)
  assert.match(codeSyntaxHighlightSource, /import \{ tags as t \} from '@lezer\/highlight'/u)
  assert.match(codeSyntaxHighlightSource, /export const codeBlockSyntaxHighlight = HighlightStyle\.define\(/u)
  assert.match(codeSyntaxHighlightSource, /color: 'var\(--code-syntax-keyword\)'/u)
  assert.match(codeSyntaxHighlightSource, /color: 'var\(--code-syntax-string\)'/u)
  assert.match(codeSyntaxHighlightSource, /color: 'var\(--code-syntax-number\)'/u)
  assert.match(codeSyntaxHighlightSource, /color: 'var\(--code-syntax-comment\)'/u)
  assert.match(codeSyntaxHighlightSource, /color: 'var\(--code-syntax-function\)'/u)
  assert.match(codeSyntaxHighlightSource, /color: 'var\(--code-syntax-meta\)'/u)
})

test('markdownHighlight wires codeBlockSyntaxHighlight after the default highlight style', () => {
  assert.match(
    extensionsSource,
    /import \{ codeBlockSyntaxHighlight \} from '\.\/codeSyntaxHighlight\.ts'/u
  )
  assert.match(
    extensionsSource,
    /export const markdownHighlight = \[\s*syntaxHighlighting\(defaultHighlightStyle[^)]*\),\s*syntaxHighlighting\(codeBlockSyntaxHighlight\)/u
  )
})

test('global.css defines code-syntax variables for light and dark themes', () => {
  assert.match(globalCssSource, /--code-syntax-keyword:\s*#7C3AED/u)
  assert.match(globalCssSource, /--code-syntax-string:\s*#0369A1/u)
  assert.match(globalCssSource, /--code-syntax-keyword:\s*#CBA6F7/u)
  assert.match(globalCssSource, /--code-syntax-string:\s*#89DCEB/u)
})

test('global.css extends .hljs-* color rules to the details body', () => {
  assert.match(
    globalCssSource,
    /:is\(\.markdown-preview, \.cm-wysiwyg-details__body\) \.hljs-keyword/u
  )
  assert.match(
    globalCssSource,
    /\.dark :is\(\.markdown-preview, \.cm-wysiwyg-details__body\) \.hljs-keyword/u
  )
})
