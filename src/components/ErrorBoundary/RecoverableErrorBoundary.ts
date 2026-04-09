import React from 'react'

interface RecoverableErrorBoundaryProps {
  children: React.ReactNode
  resetKeys?: readonly unknown[]
  renderFallback: (controls: { reset: () => void }) => React.ReactNode
}

interface RecoverableErrorBoundaryState {
  hasError: boolean
}

export default class RecoverableErrorBoundary extends React.Component<
  RecoverableErrorBoundaryProps,
  RecoverableErrorBoundaryState
> {
  state: RecoverableErrorBoundaryState = {
    hasError: false,
  }

  static getDerivedStateFromError(): RecoverableErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Recoverable error boundary caught a runtime error:', error, info.componentStack)
  }

  componentDidUpdate(prevProps: RecoverableErrorBoundaryProps) {
    if (!this.state.hasError) return
    if (areResetKeysEqual(prevProps.resetKeys, this.props.resetKeys)) return
    this.setState({ hasError: false })
  }

  private reset = () => {
    this.setState({ hasError: false })
  }

  render() {
    if (this.state.hasError) {
      return this.props.renderFallback({ reset: this.reset })
    }

    return this.props.children
  }
}

export function areResetKeysEqual(previous: readonly unknown[] = [], next: readonly unknown[] = []): boolean {
  if (previous.length !== next.length) return false

  for (let index = 0; index < previous.length; index += 1) {
    if (!Object.is(previous[index], next[index])) {
      return false
    }
  }

  return true
}
