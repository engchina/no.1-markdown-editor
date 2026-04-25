import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('preview and wysiwyg share the same prose typography tokens', async () => {
  const [css, source] = await Promise.all([
    readFile(new URL('../src/global.css', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/Editor/wysiwyg.ts', import.meta.url), 'utf8'),
  ])

  assert.match(css, /--font-preview:\s*'Inter', system-ui, sans-serif;/u)
  assert.match(css, /\.markdown-preview\s*\{[\s\S]*font-family:\s*var\(--font-preview, Inter, system-ui, sans-serif\);/u)
  assert.match(css, /\.markdown-preview h4\s*\{[\s\S]*font-size:\s*var\(--md-heading-4-size, 1\.1em\);/u)
  assert.match(css, /\.markdown-preview h6\s*\{[\s\S]*font-size:\s*var\(--md-heading-6-size, 0\.95em\);/u)

  assert.match(source, /const PREVIEW_FONT_FAMILY = 'var\(--font-preview, Inter, system-ui, sans-serif\)'/u)
  assert.match(source, /'\.cm-content': \{[\s\S]*fontFamily: PREVIEW_FONT_FAMILY/u)
  assert.match(source, /'\.cm-wysiwyg-h2': \{[\s\S]*fontSize: 'var\(--md-heading-2-size, 1\.5em\)'[\s\S]*fontFamily: PREVIEW_FONT_FAMILY/u)
  assert.match(source, /'\.cm-wysiwyg-h6': \{[\s\S]*fontSize: 'var\(--md-heading-6-size, 0\.95em\)'[\s\S]*color: 'var\(--text-primary\) !important'[\s\S]*fontFamily: PREVIEW_FONT_FAMILY/u)
})

test('preview and wysiwyg share the same inline markdown presentation tokens', async () => {
  const [css, source] = await Promise.all([
    readFile(new URL('../src/global.css', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/Editor/wysiwyg.ts', import.meta.url), 'utf8'),
  ])

  assert.match(css, /--md-inline-script-font-size:\s*0\.75em;/u)
  assert.match(css, /--md-inline-code-padding:\s*0\.125em 0\.375em;/u)
  assert.match(css, /\.markdown-preview a\s*\{[\s\S]*text-decoration:\s*var\(--md-link-text-decoration, none\);/u)
  assert.match(css, /\.markdown-preview a:hover\s*\{[\s\S]*text-decoration:\s*var\(--md-link-hover-text-decoration, underline\);/u)
  assert.match(css, /\.markdown-preview del\s*\{[\s\S]*var\(--md-strikethrough-color/u)
  assert.match(css, /\.markdown-preview sub\s*\{[\s\S]*font-size:\s*var\(--md-inline-script-font-size, 0\.75em\);[\s\S]*line-height:\s*var\(--md-inline-script-line-height, 0\);/u)
  assert.match(css, /\.markdown-preview code\s*\{[\s\S]*padding:\s*var\(--md-inline-code-padding, 0\.125em 0\.375em\);[\s\S]*border-radius:\s*var\(--md-inline-code-radius, 4px\);[\s\S]*font-family:\s*var\(--font-mono, JetBrains Mono, Cascadia Code, Fira Code, Consolas, monospace\);/u)
  assert.match(css, /\.cm-wysiwyg-footnote-ref\s*\{[\s\S]*font-size:\s*var\(--md-inline-script-font-size, 0\.75em\);[\s\S]*text-decoration:\s*var\(--md-link-text-decoration, none\);/u)

  assert.match(source, /const MONO_FONT_FAMILY = 'var\(--font-mono, JetBrains Mono, Cascadia Code, Fira Code, Consolas, monospace\)'/u)
  assert.match(source, /'\.cm-wysiwyg-strikethrough': \{[\s\S]*var\(--md-strikethrough-color/u)
  assert.match(source, /'\.cm-wysiwyg-subscript': \{[\s\S]*fontSize: 'var\(--md-inline-script-font-size, 0\.75em\)'[\s\S]*lineHeight: 'var\(--md-inline-script-line-height, 0\)'/u)
  assert.match(source, /'\.cm-wysiwyg-code': \{[\s\S]*fontFamily: MONO_FONT_FAMILY[\s\S]*fontSize: 'var\(--md-inline-code-font-size, 0\.875em\)'[\s\S]*padding: 'var\(--md-inline-code-padding, 0\.125em 0\.375em\)'/u)
  assert.match(source, /'\.cm-wysiwyg-link': \{[\s\S]*textDecoration: 'var\(--md-link-text-decoration, none\)'/u)
  assert.match(source, /'\.cm-wysiwyg-link:hover': \{[\s\S]*textDecoration: 'var\(--md-link-hover-text-decoration, underline\)'/u)
  assert.match(source, /'\.cm-wysiwyg-inline-fragment a': \{[\s\S]*textDecoration: 'var\(--md-link-text-decoration, none\)'/u)
  assert.match(source, /'\.cm-wysiwyg-inline-fragment:hover a': \{[\s\S]*textDecoration: 'var\(--md-link-hover-text-decoration, underline\)'/u)
})
