/**
 * Toolman desktop preload
 * Copyright (C) 2024–2026 Toolman Contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Source: https://github.com/wangxy2020/Toolman
 */
import { contextBridge, ipcRenderer, webUtils } from 'electron'
import {
  isIpcInvokeChannel,
  isIpcSubscribeChannel,
  type IpcChannel,
  type IpcResult,
} from '@toolman/shared'

/**
 * Channel allowlists are bundled into preload (see electron.vite.config.ts
 * `externalizeDepsPlugin({ exclude: ['@toolman/shared'] })`). Sandboxed preload
 * cannot `require('@toolman/shared')` at runtime.
 */
function blockedInvoke(channel: string): Promise<IpcResult<unknown>> {
  return Promise.resolve({
    ok: false,
    error: {
      code: 'PERMISSION_DENIED',
      message: `Blocked IPC channel: ${channel}`,
      retryable: false,
    },
  })
}

const api = {
  invoke<C extends IpcChannel>(channel: C, input?: unknown): Promise<IpcResult<unknown>> {
    if (typeof channel !== 'string' || !isIpcInvokeChannel(channel)) {
      return blockedInvoke(String(channel))
    }
    return ipcRenderer.invoke(channel, input)
  },

  subscribe(channel: string, listener: (payload: unknown) => void): () => void {
    if (typeof channel !== 'string' || !isIpcSubscribeChannel(channel)) {
      return () => {}
    }
    const handler = (_event: Electron.IpcRendererEvent, payload: unknown) => listener(payload)
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  },

  getPathForFile(file: File): string {
    return webUtils.getPathForFile(file)
  },
}

contextBridge.exposeInMainWorld('api', api)

export type ToolmanApi = typeof api
