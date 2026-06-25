import { Component, type ErrorInfo, type ReactNode } from 'react'
import { useI18n } from '../i18n/useI18n'

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
    console.error('[ui] render error boundary caught', error, info.componentStack)
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
