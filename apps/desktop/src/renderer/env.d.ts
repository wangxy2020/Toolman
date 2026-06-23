import type { IpcChannel, IpcResult } from '@toolman/shared'

declare module '*.png' {
  const src: string
  export default src
}

declare global {
  interface Window {
    api: {
      invoke<C extends IpcChannel>(channel: C, input?: unknown): Promise<IpcResult<unknown>>
      subscribe(channel: string, listener: (payload: unknown) => void): () => void
      getPathForFile(file: File): string
    }
  }
}
