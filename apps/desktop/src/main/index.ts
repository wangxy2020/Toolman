/**
 * Toolman desktop main process
 * Copyright (C) 2024–2026 Toolman Contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Source: https://github.com/wangxy2020/Toolman
 */
import { loadWorkspaceEnvFiles } from './bootstrap/load-env'
import { logStructured } from './services/structured-log.service'

loadWorkspaceEnvFiles()

import { app, BrowserWindow } from 'electron'
import { registerIpcHandlers } from './ipc/register-handlers'
import {
  bootstrapLocalOperations,
  registerProcessCrashHandlers,
} from './services/local-operations.service'
import { assertProductionAuthProfile } from './services/auth/auth-dev-guard'
import { ELECTRON_CHROME_USER_AGENT, createWindow, showMainWindow } from './index-window'
import { bootstrapCommunityHubAsync, bootstrapMainProcessServices } from './index-bootstrap'
import { runGracefulShutdown } from './index-shutdown'

registerProcessCrashHandlers()
assertProductionAuthProfile()

app.commandLine.appendSwitch('lang', 'zh-CN')
app.userAgentFallback = ELECTRON_CHROME_USER_AGENT

const e2eUserDataDir = process.env.TOOLMAN_E2E_USER_DATA_DIR
if (e2eUserDataDir) {
  app.setPath('userData', e2eUserDataDir)
}

app.whenReady().then(() => {
  bootstrapLocalOperations()

  if (process.platform === 'win32') {
    app.setAppUserModelId('dev.toolman.app')
  }

  registerIpcHandlers()
  createWindow()

  bootstrapMainProcessServices()
  bootstrapCommunityHubAsync()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    } else {
      showMainWindow()
    }
  })
}).catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error)
  logStructured('app', 'error', `whenReady failed: ${message}`)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

let shutdownPromise: Promise<void> | null = null

app.on('before-quit', (event) => {
  if (shutdownPromise) return
  event.preventDefault()
  shutdownPromise = runGracefulShutdown().finally(() => {
    shutdownPromise = null
    app.exit(0)
  })
})
