import { Component, type ErrorInfo, type ReactNode } from 'react'
import { useI18n } from '../i18n/useI18n'
import { clientLog } from '../lib/client-log'
import { reportRendererError } from '../lib/report-renderer-error'

interface ErrorBoundaryProps {
  children: ReactNode
  title?: string
  message?: string
  retryLabel?: string
  onReset?: () => void
}

interface ErrorBoundaryState {
  error: Error | null
}

class ErrorBoundaryInner extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    clientLog.error('[ui] render error boundary caught', error)
    reportRendererError({
      message: error.message,
      stack: error.stack,
      componentStack: info.componentStack ?? undefined,
    })
    // Vite Fast Refresh can orphan AuthSession context; a full reload restores the tree.
    // Rapid session writes can also leave the DOM out of sync (removeChild → blank window).
    if (
      import.meta.hot &&
      (error.message.includes('useAuthSession must be used within AuthSessionProvider') ||
        error.message.includes('removeChild') ||
        error.name === 'NotFoundError')
    ) {
      window.setTimeout(() => window.location.reload(), 0)
    }
  }

  private handleReset = (): void => {
    this.setState({ error: null })
    this.props.onReset?.()
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="tm-error-boundary" role="alert">
          <h2 className="tm-error-boundary-title">{this.props.title}</h2>
          <p className="tm-error-boundary-message">
            {this.state.error.message || this.props.message}
          </p>
          <button type="button" className="tm-error-boundary-retry" onClick={this.handleReset}>
            {this.props.retryLabel}
          </button>
        </div>
      )
    }

    return this.props.children
  }
}

export function ErrorBoundary({ title, message, retryLabel, children, onReset }: ErrorBoundaryProps) {
  const { t } = useI18n()

  return (
    <ErrorBoundaryInner
      title={title ?? t('errors.pageLoad')}
      message={message ?? t('errors.unknown')}
      retryLabel={retryLabel ?? t('common.retry')}
      onReset={onReset}
    >
      {children}
    </ErrorBoundaryInner>
  )
}
