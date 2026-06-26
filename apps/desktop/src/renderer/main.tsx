/**
 * Toolman desktop renderer
 * Copyright (C) 2024–2026 Toolman Contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Source: https://github.com/wangxy2020/Toolman
 */
import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { IpcChannel } from '@toolman/shared'
import App from './App'
import { AuthSessionProvider } from './features/user/AuthSessionProvider'
import { MuiProvider } from './theme/MuiProvider'
import './index.css'

function ProvenanceBootstrap() {
  useEffect(() => {
    void window.api.invoke(IpcChannel.AppProvenanceBeacon, { event: 'app.renderer.ready' })
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
