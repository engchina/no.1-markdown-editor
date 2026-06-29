import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import RecoverableErrorBoundary from './components/ErrorBoundary/RecoverableErrorBoundary'
import ErrorFallback from './components/ErrorBoundary/ErrorFallback'
import ScreenshotOverlay from './components/Screenshot/ScreenshotOverlay'
import { installVitePreloadRecovery } from './lib/vitePreloadRecovery'
import './global.css'
import './i18n'

installVitePreloadRecovery()

const isScreenshotOverlay = new URLSearchParams(window.location.search).get('screenshotOverlay') === '1'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <RecoverableErrorBoundary
      renderFallback={() => <ErrorFallback scope="app" onRetry={() => window.location.reload()} className="h-full" />}
    >
      {isScreenshotOverlay ? <ScreenshotOverlay /> : <App />}
    </RecoverableErrorBoundary>
  </React.StrictMode>,
)
