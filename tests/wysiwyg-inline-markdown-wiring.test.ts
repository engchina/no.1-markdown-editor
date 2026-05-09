import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { rewritePreviewHtmlLocalImages } from '../src/lib/previewLocalImages.ts'
import { renderInlineMarkdownFragment } from '../src/components/Editor/wysiwygInlineMarkdown.ts'

test('wysiwyg inline markdown uses the shared sanitized raw-html policy', async () => {
  const source = await readFile(new URL('../src/components/Editor/wysiwygInlineMarkdown.ts', import.meta.url), 'utf8')

  assert.match(source, /import rehypeRaw from 'rehype-raw'/u)
  assert.match(source, /import \{ rehypeHardenRawHtml, rehypePrepareRawHtmlForSanitize \} from '\.\.\/\.\.\/lib\/rehypeHardenRawHtml\.ts'/u)
  assert.match(source, /import \{ buildReferenceAwareMarkdownSource \} from '\.\/wysiwygReferenceLinks\.ts'/u)
  assert.match(source, /import \{ rehypeNormalizeImageSources \} from '\.\.\/\.\.\/lib\/rehypeNormalizeImageSources\.ts'/u)
  assert.match(source, /\.use\(remarkRehype, \{ allowDangerousHtml: true \}\)/u)
  assert.match(source, /\.use\(rehypeRaw\)/u)
  assert.match(source, /\.use\(rehypeNormalizeImageSources\)/u)
  assert.match(
    source,
    /\.use\(rehypePrepareRawHtmlForSanitize\)[\s\S]*\.use\(rehypeSanitize, sanitizeSchema\)[\s\S]*\.use\(rehypeHardenRawHtml\)/u
  )
  assert.match(source, /referenceDefinitionsMarkdown\?: string/u)
  assert.match(source, /normalizeSelfClosingRawHtmlBlocks\(source\)/u)
  assert.match(source, /buildReferenceAwareMarkdownSource\(normalizeSelfClosingRawHtmlBlocks\(source\), referenceDefinitionsMarkdown\)/u)
})

test('wysiwyg inline markdown preserves Windows absolute images for local image hydration', () => {
  const html = renderInlineMarkdownFragment(
    '![image](C:/Users/thinkpad/AppData/Roaming/com.no1.markdown-editor/draft-images/i3vmzt3w/image-1777290424717.png)'
  )

  assert.match(
    html,
    /src="file:\/\/\/C:\/Users\/thinkpad\/AppData\/Roaming\/com\.no1\.markdown-editor\/draft-images\/i3vmzt3w\/image-1777290424717\.png"/u
  )

  const previewHtml = rewritePreviewHtmlLocalImages(html, { documentPath: null })

  assert.match(previewHtml, /data-local-image="pending"/u)
  assert.match(
    previewHtml,
    /data-local-src="file:\/\/\/C:\/Users\/thinkpad\/AppData\/Roaming\/com\.no1\.markdown-editor\/draft-images\/i3vmzt3w\/image-1777290424717\.png"/u
  )
})

test('source-mode WYSIWYG maps common raw inline html tags to preview-matching marks', async () => {
  const source = await readFile(new URL('../src/components/Editor/wysiwyg.ts', import.meta.url), 'utf8')

  assert.match(source, /function processInlineHtmlTags\(/u)
  assert.match(source, /import \{ collectInlineHtmlTagRanges \} from '\.\/wysiwygInlineHtml\.ts'/u)
  assert.match(source, /processInlineHtmlTags\(decorations, text, lineFrom, inlineLiteralExcludedRanges\)/u)
  assert.match(
    source,
    /const inlineLiteralExcludedRanges = \[[\s\S]*?\.\.\.inlineCodeRanges,[\s\S]*?findInlineMathRanges\(text\)\.map/u
  )
  assert.match(source, /processHtmlTagPattern\(decorations, text, lineFrom, \['b', 'strong'\], 'cm-wysiwyg-bold'/u)
  assert.match(source, /processHtmlTagPattern\(decorations, text, lineFrom, \['em', 'i'\], 'cm-wysiwyg-italic'/u)
  assert.match(source, /processHtmlTagPattern\(decorations, text, lineFrom, \['u'\], 'cm-wysiwyg-underline'/u)
  assert.match(source, /processHtmlTagPattern\(decorations, text, lineFrom, \['mark'\], 'cm-wysiwyg-highlight'/u)
  assert.match(source, /processHtmlTagPattern\(decorations, text, lineFrom, \['sub'\], 'cm-wysiwyg-subscript'/u)
  assert.match(source, /processHtmlTagPattern\(decorations, text, lineFrom, \['sup'\], 'cm-wysiwyg-superscript'/u)
  assert.match(source, /processHtmlTagPattern\(decorations, text, lineFrom, \['kbd'\], 'cm-wysiwyg-kbd'/u)
  assert.match(source, /processHtmlTagPattern\(decorations, text, lineFrom, \['span'\], 'cm-wysiwyg-html-inline'/u)
  assert.match(source, /'\.cm-wysiwyg-kbd': \{[\s\S]*?fontFamily: MONO_FONT_FAMILY/u)
})
