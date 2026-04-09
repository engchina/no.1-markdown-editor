import { useTranslation } from 'react-i18next'

interface ErrorFallbackProps {
  scope: 'app' | 'surface'
  onRetry: () => void
  className?: string
}

export default function ErrorFallback({ scope, onRetry, className = '' }: ErrorFallbackProps) {
  const { t } = useTranslation()
  const isApp = scope === 'app'

  return (
    <div
      className={`flex min-h-0 items-center justify-center px-6 py-8 ${className}`.trim()}
      style={{
        background: isApp ? 'var(--bg-primary, #ffffff)' : 'var(--editor-bg, var(--bg-primary, #ffffff))',
        color: 'var(--text-primary, #111827)',
      }}
    >
      <div
        className="w-full max-w-md rounded-2xl px-6 py-5"
        style={{
          background: 'color-mix(in srgb, var(--bg-secondary, #f8fafc) 92%, transparent)',
          border: '1px solid var(--border, #e5e7eb)',
          boxShadow: 'var(--shadow-elegant)',
        }}
      >
        <p
          className="mb-2 text-xs font-semibold uppercase tracking-[0.18em]"
          style={{ color: 'var(--text-muted, #6b7280)' }}
        >
          {t(isApp ? 'runtimeError.appEyebrow' : 'runtimeError.surfaceEyebrow')}
        </p>
        <h2 className="text-lg font-semibold">
          {t(isApp ? 'runtimeError.appTitle' : 'runtimeError.surfaceTitle')}
        </h2>
        <p className="mt-2 text-sm leading-6" style={{ color: 'var(--text-secondary, #4b5563)' }}>
          {t(isApp ? 'runtimeError.appDescription' : 'runtimeError.surfaceDescription')}
        </p>
        <button
          type="button"
          className="mt-5 rounded-xl px-4 py-2 text-sm font-medium transition-colors"
          style={{
            background: 'var(--accent, #2563eb)',
            color: '#ffffff',
          }}
          onClick={onRetry}
        >
          {t(isApp ? 'runtimeError.reload' : 'runtimeError.retry')}
        </button>
      </div>
    </div>
  )
}
