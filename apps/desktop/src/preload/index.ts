import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { IpcChannel, type IpcResult } from '@toolman/shared'

const api = {
  invoke<C extends IpcChannel>(channel: C, input?: unknown): Promise<IpcResult<unknown>> {
    return ipcRenderer.invoke(channel, input)
  },

  subscribe(channel: string, listener: (payload: unknown) => void): () => void {
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
