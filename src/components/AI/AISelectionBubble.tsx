import { useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { SelectionBubbleSize } from '../../lib/ai/selectionBubble.ts'
import AppIcon from '../Icons/AppIcon'
import { dispatchEditorAIOpen } from '../../lib/ai/events.ts'
import { createAIQuickActionOpenDetail, type AIQuickAction } from '../../lib/ai/quickActions.ts'

interface Props {
  top: number
  left: number
  onSizeChange?: (size: SelectionBubbleSize) => void
}

const SELECTION_PRIMARY_ACTIONS: AIQuickAction[] = ['ask', 'rewrite', 'translate']
const SELECTION_MORE_ACTIONS: AIQuickAction[] = ['summarize', 'explain']

export default function AISelectionBubble({ top, left, onSizeChange }: Props) {
  const { t } = useTranslation()
  const bubbleRef = useRef<HTMLDivElement | null>(null)
  const [moreOpen, setMoreOpen] = useState(false)

  useLayoutEffect(() => {
    if (!onSizeChange) return

    const element = bubbleRef.current
    if (!element) return

    const reportSize = () => {
      const rect = element.getBoundingClientRect()
      onSizeChange({
        width: rect.width,
        height: rect.height,
      })
    }

    reportSize()

    if (typeof ResizeObserver !== 'function') return

    const observer = new ResizeObserver(reportSize)
    observer.observe(element)
    return () => observer.disconnect()
  }, [onSizeChange])

  const runAction = (action: AIQuickAction) => {
    setMoreOpen(false)
    dispatchEditorAIOpen(createAIQuickActionOpenDetail(action, t))
  }

  const renderActionButton = (action: AIQuickAction, options: { menuItem?: boolean } = {}) => (
    <button
      key={action}
      type="button"
      role={options.menuItem ? 'menuitem' : undefined}
      data-ai-selection-action={action}
      className={
        options.menuItem
          ? 'ai-selection-bubble-menu-action'
          : 'ai-selection-bubble-action rounded-full px-2.5 py-1 text-xs font-medium transition-colors'
      }
      style={{
        color: 'var(--text-secondary)',
        background: 'transparent',
      }}
      onMouseDown={(event) => {
        event.preventDefault()
      }}
      onClick={() => runAction(action)}
    >
      {t(`ai.quickActions.${action}`)}
    </button>
  )

  return (
    <div
      ref={bubbleRef}
      data-ai-selection-bubble="true"
      data-ai-selection-mode="selection"
      className="pointer-events-none absolute z-20"
      style={{
        top,
        left,
        transform: 'translateX(-50%)',
      }}
    >
      <div
        className="pointer-events-auto flex items-center gap-1 rounded-full px-2 py-1 shadow-xl glass-panel"
        style={{
          background: 'color-mix(in srgb, var(--bg-primary) 92%, transparent)',
          borderColor: 'color-mix(in srgb, var(--accent) 14%, var(--border))',
        }}
      >
        <span
          className="flex h-7 w-7 items-center justify-center rounded-full"
          style={{
            background: 'color-mix(in srgb, var(--accent) 14%, transparent)',
            color: 'var(--accent)',
          }}
          aria-hidden="true"
        >
          <AppIcon name="sparkles" size={14} />
        </span>
        {SELECTION_PRIMARY_ACTIONS.map((action) => renderActionButton(action))}
        <div className="relative">
          <button
            type="button"
            data-ai-selection-more="true"
            className="ai-selection-bubble-action inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors"
            style={{
              color: 'var(--text-secondary)',
              background: 'transparent',
            }}
            aria-haspopup="menu"
            aria-expanded={moreOpen}
            onMouseDown={(event) => {
              event.preventDefault()
            }}
            onClick={() => setMoreOpen((open) => !open)}
          >
            <span>{t('ai.quickActions.more')}</span>
            <AppIcon name="chevronDown" size={12} />
          </button>
          {moreOpen ? (
            <div
              role="menu"
              data-ai-selection-more-menu="true"
              className="ai-selection-bubble-menu glass-panel absolute right-0 top-full mt-1 min-w-[7.5rem] rounded-lg p-1 shadow-xl"
            >
              {SELECTION_MORE_ACTIONS.map((action) => renderActionButton(action, { menuItem: true }))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
