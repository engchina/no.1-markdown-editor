import { Decoration, WidgetType, type EditorView } from '@codemirror/view'
import type { FencedCodeBlock } from './fencedCodeRanges.ts'
import type { RangeSpec } from './sortedRangeSet.ts'

export interface WysiwygDecorationView {
  state: Pick<EditorView['state'], 'doc' | 'selection'>
  visibleRanges: readonly { from: number; to: number }[]
}

export type WysiwygCodeBlockDecorationSpec = RangeSpec<Decoration>

type MermaidTheme = 'default' | 'dark'
type MermaidErrorFormatter = (
  error: unknown,
  fallbackMessage: string,
  source: string,
  packetPlaceholderMessage?: string
) => string

const MERMAID_LABEL_FALLBACK = 'Mermaid Diagram'
const MERMAID_RENDERING_FALLBACK = 'Rendering...'
const MERMAID_ERROR_FALLBACK = 'Diagram could not be rendered'
const MERMAID_PACKET_PLACEHOLDER_ERROR_FALLBACK =
  'Packet diagrams require numeric bit positions such as 0-15: "Field" or +8: "Field".'

let wysiwygMermaidRenderSequence = 0
const mermaidThemeObservers = new WeakMap<HTMLElement, MutationObserver>()

function queueDecoration(
  decorations: WysiwygCodeBlockDecorationSpec[],
  from: number,
  to: number,
  value: Decoration
): void {
  decorations.push({ from, to, value })
}

function queueLineDecoration(
  decorations: WysiwygCodeBlockDecorationSpec[],
  at: number,
  attributes: Record<string, string>
): void {
  queueDecoration(decorations, at, at, Decoration.line({ attributes }))
}

function formatCodeBlockLanguageLabel(language: string | null): string {
  return language ? `Code (${language})` : 'Code'
}

export function isRenderableWysiwygMermaidCodeBlock(fencedCodeBlock: FencedCodeBlock): boolean {
  return fencedCodeBlock.closingLineFrom !== null && fencedCodeBlock.language?.toLowerCase() === 'mermaid'
}

function selectionTouchesFencedCodeBlock(
  view: WysiwygDecorationView,
  fencedCodeBlock: FencedCodeBlock
): boolean {
  const { ranges } = view.state.selection
  return ranges.some((range) => range.from <= fencedCodeBlock.to && range.to >= fencedCodeBlock.from)
}

function resolveMermaidTheme(ownerDocument: Document): MermaidTheme {
  return ownerDocument.documentElement.classList.contains('dark') ? 'dark' : 'default'
}

function buildMermaidFallbackError(error: unknown, fallbackMessage: string): string {
  const detail =
    error instanceof Error ? error.message
    : typeof error === 'string' ? error
    : ''

  return detail && detail !== fallbackMessage ? `${fallbackMessage}: ${detail}` : fallbackMessage
}

async function translateWysiwygMermaidText(key: string, fallback: string): Promise<string> {
  try {
    const { default: i18n } = await import('../../i18n/index.ts')
    return i18n.t(key)
  } catch {
    return fallback
  }
}

function localizeWysiwygMermaidLabel(wrapper: HTMLElement): void {
  wrapper.setAttribute('aria-label', MERMAID_LABEL_FALLBACK)
  void translateWysiwygMermaidText('preview.mermaidLabel', MERMAID_LABEL_FALLBACK).then((label) => {
    if (wrapper.isConnected) wrapper.setAttribute('aria-label', label)
  })
}

function syncMermaidStatus(
  wrapper: HTMLElement,
  message: string,
  state: 'loading' | 'error',
  role: 'status' | 'alert'
): void {
  const surface = wrapper.querySelector<HTMLElement>('.cm-wysiwyg-mermaid__surface')
  if (!surface) return

  surface.textContent = ''
  const status = wrapper.ownerDocument.createElement('div')
  status.className = 'cm-wysiwyg-mermaid__status'
  status.setAttribute('role', role)
  status.textContent = message
  surface.appendChild(status)
  wrapper.dataset.mermaidState = state
}

async function renderWysiwygMermaidDiagram(
  wrapper: HTMLElement,
  source: string,
  theme: MermaidTheme
): Promise<void> {
  const token = String(++wysiwygMermaidRenderSequence)
  wrapper.dataset.mermaidRenderToken = token
  wrapper.setAttribute('aria-busy', 'true')
  syncMermaidStatus(wrapper, MERMAID_RENDERING_FALLBACK, 'loading', 'status')
  void translateWysiwygMermaidText('preview.renderingDiagrams', MERMAID_RENDERING_FALLBACK).then((message) => {
    if (wrapper.isConnected && wrapper.dataset.mermaidRenderToken === token && wrapper.dataset.mermaidState === 'loading') {
      syncMermaidStatus(wrapper, message, 'loading', 'status')
    }
  })

  let formatError: MermaidErrorFormatter | null = null

  try {
    const mermaidModule = await import('../../lib/mermaid.ts')
    formatError = mermaidModule.getMermaidRenderErrorMessage
    const svg = await mermaidModule.renderMermaidToSvg(source, theme, 'mermaid-wysiwyg')
    if (!wrapper.isConnected || wrapper.dataset.mermaidRenderToken !== token) return

    const surface = wrapper.querySelector<HTMLElement>('.cm-wysiwyg-mermaid__surface')
    if (!surface) return

    surface.innerHTML = svg
    wrapper.dataset.mermaidState = 'rendered'
    wrapper.removeAttribute('aria-busy')
  } catch (error) {
    if (!wrapper.isConnected || wrapper.dataset.mermaidRenderToken !== token) return

    const [fallbackMessage, packetPlaceholderMessage] = await Promise.all([
      translateWysiwygMermaidText('preview.diagramError', MERMAID_ERROR_FALLBACK),
      translateWysiwygMermaidText('preview.packetPlaceholderError', MERMAID_PACKET_PLACEHOLDER_ERROR_FALLBACK),
    ])
    if (!wrapper.isConnected || wrapper.dataset.mermaidRenderToken !== token) return

    syncMermaidStatus(
      wrapper,
      formatError
        ? formatError(error, fallbackMessage, source, packetPlaceholderMessage)
        : buildMermaidFallbackError(error, fallbackMessage),
      'error',
      'alert'
    )
    wrapper.removeAttribute('aria-busy')
  }
}

class MermaidDiagramWidget extends WidgetType {
  private readonly source: string
  private readonly editAnchor: number

  constructor(source: string, editAnchor: number) {
    super()
    this.source = source
    this.editAnchor = editAnchor
  }

  toDOM() {
    const wrapper = document.createElement('div')
    wrapper.className = 'cm-wysiwyg-mermaid'
    wrapper.dataset.mermaidEditAnchor = String(this.editAnchor)
    localizeWysiwygMermaidLabel(wrapper)
    wrapper.setAttribute('aria-keyshortcuts', 'Enter Space')
    wrapper.setAttribute('role', 'button')
    wrapper.tabIndex = 0

    const surface = document.createElement('div')
    surface.className = 'cm-wysiwyg-mermaid__surface'
    wrapper.appendChild(surface)

    let currentTheme = resolveMermaidTheme(wrapper.ownerDocument)
    void renderWysiwygMermaidDiagram(wrapper, this.source, currentTheme)

    if (typeof MutationObserver !== 'undefined') {
      const observer = new MutationObserver(() => {
        const nextTheme = resolveMermaidTheme(wrapper.ownerDocument)
        if (nextTheme === currentTheme) return
        currentTheme = nextTheme
        void renderWysiwygMermaidDiagram(wrapper, this.source, currentTheme)
      })
      observer.observe(wrapper.ownerDocument.documentElement, {
        attributes: true,
        attributeFilter: ['class'],
      })
      mermaidThemeObservers.set(wrapper, observer)
    }

    return wrapper
  }

  destroy(dom: HTMLElement) {
    mermaidThemeObservers.get(dom)?.disconnect()
    mermaidThemeObservers.delete(dom)
  }

  ignoreEvent() { return false }

  eq(other: MermaidDiagramWidget) {
    return this.source === other.source && this.editAnchor === other.editAnchor
  }
}

function getFencedCodeBlockContent(
  doc: WysiwygDecorationView['state']['doc'],
  fencedCodeBlock: FencedCodeBlock
): { source: string; editAnchor: number } | null {
  if (fencedCodeBlock.closingLineFrom === null) return null

  const editAnchor = Math.min(fencedCodeBlock.openingLineTo + 1, fencedCodeBlock.closingLineFrom)
  return {
    source: doc.sliceString(editAnchor, fencedCodeBlock.closingLineFrom),
    editAnchor,
  }
}

function decorateInactiveMermaidFencedCodeBlockLine(
  decorations: WysiwygCodeBlockDecorationSpec[],
  doc: WysiwygDecorationView['state']['doc'],
  lineFrom: number,
  lineTo: number,
  fencedCodeBlock: FencedCodeBlock
): boolean {
  if (!isRenderableWysiwygMermaidCodeBlock(fencedCodeBlock)) return false

  const content = getFencedCodeBlockContent(doc, fencedCodeBlock)
  if (!content) return false

  if (lineFrom === fencedCodeBlock.openingLineFrom) {
    queueLineDecoration(decorations, lineFrom, {
      class: 'cm-wysiwyg-mermaid-anchor-line',
    })
    queueDecoration(
      decorations,
      lineFrom,
      lineTo,
      Decoration.replace({ widget: new MermaidDiagramWidget(content.source, content.editAnchor) })
    )
    return true
  }

  queueLineDecoration(decorations, lineFrom, {
    class: 'cm-wysiwyg-mermaid-hidden-line',
  })
  queueDecoration(decorations, lineFrom, lineTo, Decoration.replace({}))
  return true
}

function decorateInactiveFencedCodeBlockLine(
  decorations: WysiwygCodeBlockDecorationSpec[],
  lineFrom: number,
  lineTo: number,
  fencedCodeBlock: FencedCodeBlock
): void {
  if (lineFrom === fencedCodeBlock.openingLineFrom) {
    queueLineDecoration(decorations, lineFrom, {
      class: 'cm-wysiwyg-codeblock-meta-line',
      'data-code-language-label': formatCodeBlockLanguageLabel(fencedCodeBlock.language),
    })
    queueDecoration(decorations, lineFrom, lineTo, Decoration.replace({}))
    return
  }

  if (fencedCodeBlock.closingLineFrom !== null && lineFrom === fencedCodeBlock.closingLineFrom) {
    queueLineDecoration(decorations, lineFrom, {
      class: 'cm-wysiwyg-codeblock-close-line',
    })
    queueDecoration(decorations, lineFrom, lineTo, Decoration.replace({}))
    return
  }

  queueLineDecoration(decorations, lineFrom, {
    class: 'cm-wysiwyg-codeblock-line',
  })
}

export function collectWysiwygCodeBlockDecorations(
  view: WysiwygDecorationView,
  fencedCodeBlocks: readonly FencedCodeBlock[]
): WysiwygCodeBlockDecorationSpec[] {
  const decorations: WysiwygCodeBlockDecorationSpec[] = []
  const { doc } = view.state
  let fenceIndex = 0

  for (const { from, to } of view.visibleRanges) {
    let pos = from
    while (pos <= to) {
      const line = doc.lineAt(pos)
      const lineFrom = line.from
      const lineTo = line.to

      while (fenceIndex < fencedCodeBlocks.length && fencedCodeBlocks[fenceIndex].to < lineFrom) {
        fenceIndex += 1
      }

      const fencedCodeBlock = fencedCodeBlocks[fenceIndex]
      if (fencedCodeBlock && lineFrom >= fencedCodeBlock.from && lineFrom <= fencedCodeBlock.to) {
        if (!selectionTouchesFencedCodeBlock(view, fencedCodeBlock)) {
          if (!decorateInactiveMermaidFencedCodeBlockLine(decorations, doc, lineFrom, lineTo, fencedCodeBlock)) {
            decorateInactiveFencedCodeBlockLine(decorations, lineFrom, lineTo, fencedCodeBlock)
          }
        }
      }

      pos = line.to + 1
    }
  }

  return decorations
}
