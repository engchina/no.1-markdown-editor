import { useTranslation } from 'react-i18next'
import { useEditorStore } from '../../store/editor'

export default function StatusBar() {
  const { t } = useTranslation()
  const { cursorPos, wordCount, charCount } = useEditorStore()

  return (
    <div
      className="flex items-center px-6 gap-6 flex-shrink-0 text-[11px] font-medium select-none rounded-full backdrop-blur-md shadow-sm border transition-all mx-auto opacity-70 hover:opacity-100 hover-scale"
      style={{
        height: '28px',
        width: 'fit-content',
        background: 'var(--glass-bg)',
        color: 'var(--text-secondary)',
        borderColor: 'var(--glass-border)'
      }}
    >
      <span>{t('statusbar.lines', { line: cursorPos.line, col: cursorPos.col })}</span>
      <span>{t('statusbar.words', { count: wordCount })}</span>
      <span>{t('statusbar.chars', { count: charCount })}</span>
      <span className="flex-1" />
      <span>{t('statusbar.language')}</span>
      <span>{t('statusbar.encoding')}</span>
    </div>
  )
}
