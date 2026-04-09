import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import RecoverableErrorBoundary from './components/ErrorBoundary/RecoverableErrorBoundary'
import ErrorFallback from './components/ErrorBoundary/ErrorFallback'
import { installVitePreloadRecovery } from './lib/vitePreloadRecovery'
import './global.css'
import './i18n'

installVitePreloadRecovery()

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <RecoverableErrorBoundary
      renderFallback={() => <ErrorFallback scope="app" onRetry={() => window.location.reload()} className="h-full" />}
    >
      <App />
    </RecoverableErrorBoundary>
  </React.StrictMode>,
)
