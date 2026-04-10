import { useTranslation } from 'react-i18next'
import { useEditorStore } from '../../store/editor'

interface Props {
  saving?: boolean
}

export default function StatusBar({ saving }: Props) {
  const { t } = useTranslation()
  const { cursorPos, wordCount, charCount } = useEditorStore()

  return (
    <div
      className="flex flex-shrink-0 select-none items-center gap-3 px-3 text-[11px]"
      style={{
        height: '24px',
        background: 'var(--statusbar-bg)',
        color: 'var(--statusbar-text)',
      }}
    >
      <span style={{ opacity: 0.85 }}>
        {t('statusbar.lines', { line: cursorPos.line, col: cursorPos.col })}
      </span>
      <span style={{ opacity: 0.7 }}>
        {t('statusbar.words', { count: wordCount })}
      </span>
      <span style={{ opacity: 0.7 }}>
        {t('statusbar.chars', { count: charCount })}
      </span>
      <div className="flex-1" />
      {saving && (
        <span className="flex items-center gap-1" style={{ opacity: 0.8 }}>
          <span className="inline-block w-2 h-2 rounded-full animate-pulse" style={{ background: 'currentColor' }} />
          {t('statusbar.saving')}
        </span>
      )}
      <span style={{ opacity: 0.7 }}>{t('statusbar.language')}</span>
      <span style={{ opacity: 0.7 }}>{t('statusbar.encoding')}</span>
    </div>
  )
}
