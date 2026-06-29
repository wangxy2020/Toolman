/**
 * Toolman desktop renderer
 * Copyright (C) 2024–2026 Toolman Contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Source: https://github.com/wangxy2020/Toolman
 */
import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { AuthSessionProvider } from './features/user/AuthSessionProvider'
import { MuiProvider } from './theme/MuiProvider'
import { reportRendererError } from './lib/report-renderer-error'
import { recordProvenanceBeacon } from './lib/record-provenance-beacon'
import './index.css'

function ProvenanceBootstrap() {
  useEffect(() => {
    recordProvenanceBeacon('app.renderer.ready')

    const onError = (event: ErrorEvent) => {
      reportRendererError({
        message: event.message,
        stack: event.error instanceof Error ? event.error.stack : undefined,
      })
    }
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason
      reportRendererError({
        message: reason instanceof Error ? reason.message : String(reason),
        stack: reason instanceof Error ? reason.stack : undefined,
      })
    }
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onUnhandledRejection)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onUnhandledRejection)
    }
  }, [])
  return null
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MuiProvider>
      <AuthSessionProvider>
        <ProvenanceBootstrap />
        <App />
      </AuthSessionProvider>
    </MuiProvider>
  </StrictMode>,
)
