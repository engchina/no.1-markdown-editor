import { HighlightStyle } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'

// Vivid syntax highlight for code inside fenced code blocks. Tag colors use
// CSS variables so light/dark themes can be swapped via the `.dark` root class.
// Tags here are produced by nested language parsers wired through
// `resolveMarkdownCodeLanguage` — Markdown source tokens use different tags
// (heading, emphasis, link, …) so this layer does not affect Markdown styling.
export const codeBlockSyntaxHighlight = HighlightStyle.define([
  {
    tag: [
      t.keyword,
      t.controlKeyword,
      t.definitionKeyword,
      t.operatorKeyword,
      t.moduleKeyword,
      t.modifier,
      t.self,
      t.tagName,
    ],
    color: 'var(--code-syntax-keyword)',
  },
  {
    tag: [t.string, t.special(t.string), t.regexp, t.escape, t.character],
    color: 'var(--code-syntax-string)',
  },
  {
    tag: [
      t.number,
      t.integer,
      t.float,
      t.bool,
      t.null,
      t.atom,
      t.literal,
      t.typeName,
      t.className,
    ],
    color: 'var(--code-syntax-number)',
  },
  {
    tag: [t.comment, t.lineComment, t.blockComment, t.docComment],
    color: 'var(--code-syntax-comment)',
    fontStyle: 'italic',
  },
  {
    tag: [t.propertyName, t.attributeName],
    color: 'var(--code-syntax-variable)',
  },
  {
    tag: [
      t.function(t.variableName),
      t.function(t.definition(t.variableName)),
      t.definition(t.variableName),
      t.macroName,
    ],
    color: 'var(--code-syntax-function)',
    fontWeight: '600',
  },
  {
    tag: [t.meta, t.processingInstruction, t.annotation, t.special(t.variableName)],
    color: 'var(--code-syntax-meta)',
  },
])
