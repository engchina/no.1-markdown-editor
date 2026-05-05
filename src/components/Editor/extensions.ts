import {
  Decoration,
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  MatchDecorator,
  ViewPlugin,
  drawSelection,
  dropCursor,
  rectangularSelection,
  crosshairCursor,
  placeholder as placeholderExtension,
  tooltips,
  type DecorationSet,
  type KeyBinding,
  type ViewUpdate,
  WidgetType,
} from '@codemirror/view'
import { countColumn, EditorSelection, EditorState, Prec, type Extension } from '@codemirror/state'
import { history, defaultKeymap, historyKeymap, indentWithTab } from '@codemirror/commands'
import {
  foldGutter,
  indentOnInput,
  syntaxHighlighting,
  defaultHighlightStyle,
  HighlightStyle,
  bracketMatching,
  foldKeymap,
} from '@codemirror/language'
import { tags } from '@lezer/highlight'
import { collectFencedCodeBlocks, type TextRange } from './fencedCodeRanges.ts'
import { collectMathBlocks } from './mathBlockRanges.ts'
import { isThematicBreakLine } from './thematicBreak.ts'
import { collectInlineCodeRanges, findContainingTextRange } from './wysiwygInlineCode.ts'
import { findInlineMathRanges } from './wysiwygInlineMath.ts'
import { findBlockFootnoteRanges, findInlineFootnoteRanges } from './wysiwygFootnote.ts'
import { dispatchKeyboardShortcutsOpen } from '../../lib/keyboardShortcuts.ts'

export const CODEMIRROR_MARKDOWN_COMMENT_SHORTCUTS = new Set(['Mod-/', 'Alt-A'])

export function isCodeMirrorMarkdownCommentShortcut(binding: KeyBinding): boolean {
  return [binding.key, binding.mac, binding.win, binding.linux].some((key) =>
    key ? CODEMIRROR_MARKDOWN_COMMENT_SHORTCUTS.has(key) : false
  )
}

export const sourceEditorDefaultKeymap = defaultKeymap.filter(
  (binding) => !isCodeMirrorMarkdownCommentShortcut(binding)
)

export const lightTheme = EditorView.theme(
  {
    '&': {
      backgroundColor: 'var(--editor-bg)',
      color: 'var(--editor-text)',
    },
    '.cm-content': {
      caretColor: 'var(--editor-cursor)',
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: 'var(--editor-cursor)',
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
      backgroundColor: 'var(--editor-selection)',
    },
    '.cm-panels': { backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' },
    '.cm-searchMatch': {
      backgroundColor: 'rgba(255, 213, 0, 0.3)',
      outline: '1px solid rgba(255, 213, 0, 0.5)',
    },
    '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'rgba(255, 213, 0, 0.6)' },
    '.cm-activeLine': { backgroundColor: 'var(--editor-line-active)' },
    '.cm-selectionMatch': { backgroundColor: 'rgba(59, 130, 246, 0.1)' },
    '.cm-matchingBracket, .cm-nonmatchingBracket': {
      backgroundColor: 'transparent !important',
      outline: 'none !important',
    },
    '.cm-gutters': {
      backgroundColor: 'var(--editor-bg)',
      color: 'var(--text-muted)',
      border: 'none',
      borderRight: '1px solid var(--border)',
    },
    '.cm-activeLineGutter': { backgroundColor: 'var(--editor-line-active)' },
    '.cm-foldPlaceholder': { backgroundColor: 'transparent', border: 'none', color: 'var(--text-muted)' },
    '.cm-tooltip': {
      backgroundColor: 'var(--bg-secondary)',
      border: '1px solid var(--border)',
      borderRadius: '6px',
    },
    '.cm-tooltip-autocomplete': {
      '& > ul > li[aria-selected]': { backgroundColor: 'var(--accent)', color: 'white' },
    },
    '.cm-ai-ghost-text': {
      color: 'color-mix(in srgb, var(--text-muted) 84%, transparent)',
      fontStyle: 'italic',
      opacity: '0.82',
      pointerEvents: 'none',
      whiteSpace: 'pre-wrap',
    },
    '.cm-ai-ghost-text[data-ai-ghost-text="loading"]': {
      opacity: '0.6',
    },
    '.cm-ai-provenance-range': {
      background: 'transparent',
      borderRadius: '0',
      borderBottom: 'none',
      textDecoration: 'none',
    },
  },
  { dark: false }
)

const markdownUnderlineOverride = HighlightStyle.define([
  // CodeMirror's default markdown style underlines links and headings.
  // In the source editor this reads like rendered content, so remove it.
  { tag: [tags.link, tags.heading], textDecoration: 'none' },
])
// Keep ordinary spaces quiet. This mode focuses on Markdown-relevant invisibles:
// tabs, non-breaking/full-width spaces, and line-ending whitespace.
const INVISIBLE_MARKDOWN_SPECIAL_CHARS = /[\t\u00a0\u3000]/g
const trailingSpaceDecorator = createTrailingSpaceDecorator()
const activeLineTrailingSpaceDecorator = createTrailingSpaceDecorator({ activeLineOnly: true })
const specialCharDecorator = createSpecialCharDecorator()
const activeLineSpecialCharDecorator = createSpecialCharDecorator({ activeLineOnly: true })

function createTrailingSpaceDecorator(options: { activeLineOnly?: boolean } = {}): MatchDecorator {
  return new MatchDecorator({
    regexp: / +(?=[\t \u00a0\u3000]*$)/g,
    // Replace each trailing space separately so every visible marker keeps the same text cell.
    decorate(add, from, to, _match, view) {
      if (options.activeLineOnly && !rangeStartsOnFocusedCursorLine(view, from)) return

      for (let pos = from; pos < to; pos += 1) {
        add(pos, pos + 1, Decoration.replace({ widget: new InvisibleSpaceWidget('space') }))
      }
    },
  })
}

function createSpecialCharDecorator(options: { activeLineOnly?: boolean } = {}): MatchDecorator {
  return new MatchDecorator({
    regexp: INVISIBLE_MARKDOWN_SPECIAL_CHARS,
    decorate(add, from, to, match, view) {
      if (options.activeLineOnly && !rangeStartsOnFocusedCursorLine(view, from)) return

      if (match[0] === '\t') {
        const line = view.state.doc.lineAt(from)
        const col = countColumn(line.text, view.state.tabSize, from - line.from)
        const width = (view.state.tabSize - (col % view.state.tabSize)) * view.defaultCharacterWidth / view.scaleX
        add(from, to, Decoration.replace({ widget: new InvisibleTabWidget(width) }))
        return
      }

      add(from, to, Decoration.replace({
        widget: new InvisibleSpaceWidget(match[0] === '\u3000' ? 'ideographic' : 'non-breaking'),
      }))
    },
  })
}

function rangeStartsOnFocusedCursorLine(view: EditorView, from: number): boolean {
  if (!view.hasFocus) return false

  const lineNumber = view.state.doc.lineAt(from).number
  return view.state.selection.ranges.some((range) => {
    const cursorLine = view.state.doc.lineAt(range.head).number
    return lineNumber === cursorLine
  })
}

class InvisibleTabWidget extends WidgetType {
  private readonly width: number

  constructor(width: number) {
    super()
    this.width = width
  }

  eq(other: InvisibleTabWidget) {
    return this.width === other.width
  }

  toDOM() {
    const span = document.createElement('span')
    span.textContent = '\t'
    span.className = 'cm-tab'
    span.style.width = `${this.width}px`
    return span
  }

  ignoreEvent() { return false }
}

class InvisibleSpaceWidget extends WidgetType {
  private readonly kind: 'space' | 'non-breaking' | 'ideographic'

  constructor(kind: 'space' | 'non-breaking' | 'ideographic') {
    super()
    this.kind = kind
  }

  eq(other: InvisibleSpaceWidget) {
    return this.kind === other.kind
  }

  toDOM() {
    const span = document.createElement('span')
    const label =
      this.kind === 'space'
        ? 'Trailing space'
        : this.kind === 'ideographic'
          ? 'Full-width space'
          : 'Non-breaking space'

    span.title = label
    span.setAttribute('aria-label', label)
    span.className = this.kind === 'space'
      ? 'cm-invisibleSpace cm-trailingSpace'
      : 'cm-invisibleSpace cm-specialChar'
    return span
  }

  ignoreEvent() { return false }
}

export const markdownHighlight = [
  syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
  syntaxHighlighting(markdownUnderlineOverride),
]

export const MARKDOWN_HARD_LINE_BREAK = '<br />\n'
export const MARKDOWN_PLAIN_LINE_BREAK = '\n'
const ATX_HEADING_PATTERN = /^(#{1,6})\s/
const SETEXT_HEADING_UNDERLINE_PATTERN = /^[ ]{0,3}(?:=+|-+)[ \t]*$/
const INDENTATION_ONLY_LINE_PATTERN = /^[\t ]+$/
const LEADING_INDENT_PATTERN = /^[\t ]+/
const STRUCTURAL_MARKDOWN_LINE_PATTERN = /^[ ]{0,3}(?:#{1,6}\s|(?:[-*+]|\d+[.)])\s+|>\s?|`{3,}|~{3,}|\$\$\s*$)/

function collectShiftEnterLiteralBlocks(markdown: string): readonly TextRange[] {
  const fencedCodeBlocks = collectFencedCodeBlocks(markdown)
  return [...fencedCodeBlocks, ...collectMathBlocks(markdown, fencedCodeBlocks)]
}

function isPositionInsideTextRanges(position: number, ranges: readonly TextRange[]): boolean {
  return ranges.some((range) => position >= range.from && position <= range.to)
}

function isSetextHeadingUnderlineLine(text: string): boolean {
  return SETEXT_HEADING_UNDERLINE_PATTERN.test(text)
}

function isStructuralMarkdownLine(text: string): boolean {
  return STRUCTURAL_MARKDOWN_LINE_PATTERN.test(text) ||
    isThematicBreakLine(text) ||
    isSetextHeadingUnderlineLine(text)
}

function isNonSemanticIndentNewlineCandidate(state: EditorState, position: number): boolean {
  const line = state.doc.lineAt(position)
  if (INDENTATION_ONLY_LINE_PATTERN.test(line.text)) return true
  if (isStructuralMarkdownLine(line.text)) return false

  const indent = line.text.match(LEADING_INDENT_PATTERN)?.[0] ?? ''
  if (!indent) return false
  if (line.text.trim().length === 0) return false

  const indentColumn = countColumn(indent, state.tabSize, indent.length)
  return indentColumn > 0 && indentColumn < 4
}

function shouldInsertPlainNewlineForNonSemanticIndent(
  state: EditorState,
  position: number,
  literalBlocks: readonly TextRange[]
): boolean {
  return isNonSemanticIndentNewlineCandidate(state, position) &&
    !isPositionInsideTextRanges(position, literalBlocks)
}

function shouldInsertPlainLineBreakInLine(
  doc: Pick<EditorState['doc'], 'line' | 'lines'>,
  line: Pick<ReturnType<EditorState['doc']['lineAt']>, 'text' | 'number'>,
  lineOffset: number
): boolean {
  if (ATX_HEADING_PATTERN.test(line.text) || isThematicBreakLine(line.text) || isSetextHeadingUnderlineLine(line.text)) {
    return true
  }

  if (line.number < doc.lines && line.text.trim().length > 0) {
    const nextLine = doc.line(line.number + 1)
    if (isSetextHeadingUnderlineLine(nextLine.text)) {
      return true
    }
  }

  const inlineCodeRanges = collectInlineCodeRanges(line.text)
  if (findContainingTextRange(lineOffset, inlineCodeRanges)) return true

  if (findInlineMathRanges(line.text).some((range) => lineOffset >= range.from && lineOffset < range.to)) {
    return true
  }

  if (findInlineFootnoteRanges(line.text, inlineCodeRanges).some((range) => lineOffset >= range.from && lineOffset < range.to)) {
    return true
  }

  if (findBlockFootnoteRanges(line.text, inlineCodeRanges).some((range) => lineOffset >= range.from && lineOffset < range.to)) {
    return true
  }

  return false
}

export function insertMarkdownHardLineBreak(
  view: Pick<EditorView, 'state' | 'dispatch'>
): boolean {
  const markdown = view.state.doc.toString()
  const literalBlocks = collectShiftEnterLiteralBlocks(markdown)

  view.dispatch({
    ...view.state.changeByRange((range) => {
      const line = view.state.doc.lineAt(range.from)
      const insert = isPositionInsideTextRanges(range.from, literalBlocks) ||
        shouldInsertPlainLineBreakInLine(view.state.doc, line, range.from - line.from)
        ? MARKDOWN_PLAIN_LINE_BREAK
        : MARKDOWN_HARD_LINE_BREAK

      return {
        changes: {
          from: range.from,
          to: range.to,
          insert,
        },
        range: EditorSelection.cursor(range.from + insert.length),
      }
    }),
    scrollIntoView: true,
    userEvent: 'input.type',
  })
  return true
}

export function insertPlainNewlineForNonSemanticIndent(
  view: Pick<EditorView, 'state' | 'dispatch'>
): boolean {
  const ranges = view.state.selection.ranges
  if (!ranges.every((range) => range.empty)) return false
  if (!ranges.every((range) => isNonSemanticIndentNewlineCandidate(view.state, range.from))) return false

  const literalBlocks = collectShiftEnterLiteralBlocks(view.state.doc.toString())
  const shouldInsertPlainNewline = ranges.every((range) =>
    shouldInsertPlainNewlineForNonSemanticIndent(view.state, range.from, literalBlocks)
  )
  if (!shouldInsertPlainNewline) return false

  view.dispatch({
    ...view.state.changeByRange((range) => ({
      changes: { from: range.from, to: range.to, insert: MARKDOWN_PLAIN_LINE_BREAK },
      range: EditorSelection.cursor(range.from + MARKDOWN_PLAIN_LINE_BREAK.length),
    })),
    scrollIntoView: true,
    userEvent: 'input.type',
  })
  return true
}

export function openKeyboardShortcutsFromEditor(): boolean {
  dispatchKeyboardShortcutsOpen()
  return true
}

export function buildCoreExtensions(options: {
  onChange: (content: string) => void
  onCursorChange: (line: number, col: number) => void
  onSelectionChange?: (view: EditorView, update: ViewUpdate) => void
}): Extension[] {
  return [
    history(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    rectangularSelection(),
    crosshairCursor(),
    highlightActiveLine(),
    markdownHighlight,
    indentOnInput(),
    bracketMatching(),
    tooltips({ position: 'fixed' }),
    Prec.highest(
      keymap.of([
        {
          key: 'Mod-/',
          run: openKeyboardShortcutsFromEditor,
          preventDefault: true,
        },
        {
          key: 'Enter',
          run: insertPlainNewlineForNonSemanticIndent,
        },
      ])
    ),
    keymap.of([
      {
        key: 'Shift-Enter',
        run: insertMarkdownHardLineBreak,
      },
      ...sourceEditorDefaultKeymap,
      ...historyKeymap,
      ...foldKeymap,
      indentWithTab,
    ]),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        options.onChange(update.state.doc.toString())
      }
      if (update.selectionSet) {
        const selection = update.state.selection.main.head
        const line = update.state.doc.lineAt(selection)
        options.onCursorChange(line.number, selection - line.from + 1)
      }
      if (update.selectionSet || update.docChanged) {
        options.onSelectionChange?.(update.view, update)
      }
    }),
    lightTheme,
  ]
}

export function buildLineNumberExtensions(): Extension[] {
  return [lineNumbers(), highlightActiveLineGutter(), foldGutter()]
}

export function buildWordWrapExtensions(enabled: boolean): Extension[] {
  return enabled ? [EditorView.lineWrapping] : []
}

function buildMatchDecoratorExtension(
  decorator: MatchDecorator,
  options: { refreshOnSelectionSet?: boolean } = {}
): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet

      constructor(view: EditorView) {
        this.decorations = decorator.createDeco(view)
      }

      update(update: ViewUpdate) {
        this.decorations = options.refreshOnSelectionSet && (update.selectionSet || update.focusChanged)
          ? decorator.createDeco(update.view)
          : decorator.updateDeco(update, this.decorations)
      }
    },
    {
      decorations: (value): DecorationSet => value.decorations,
    }
  )
}

export function buildInvisibleCharacterExtensions(
  enabled: boolean,
  options: { activeLineOnly?: boolean } = {}
): Extension[] {
  if (!enabled) return []

  return [
    buildMatchDecoratorExtension(
      options.activeLineOnly ? activeLineTrailingSpaceDecorator : trailingSpaceDecorator,
      { refreshOnSelectionSet: options.activeLineOnly }
    ),
    options.activeLineOnly
      ? buildMatchDecoratorExtension(activeLineSpecialCharDecorator, { refreshOnSelectionSet: true })
      : buildMatchDecoratorExtension(specialCharDecorator),
  ]
}

export function buildPlaceholderExtensions(placeholder?: string): Extension[] {
  return placeholder ? [placeholderExtension(placeholder)] : []
}
