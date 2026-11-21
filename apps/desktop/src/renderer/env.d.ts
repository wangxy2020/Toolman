import type {
  IpcChannel,
  IpcContractChannel,
  IpcContractInput,
  IpcContractOutput,
  IpcResult,
} from '@toolman/shared'

declare module '*.png' {
  const src: string
  export default src
}

declare module 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url' {
  const workerSrc: string
  export default workerSrc
}

declare global {
  interface Window {
    api: {
      invoke<C extends IpcContractChannel>(
        channel: C,
        input: IpcContractInput<C>,
      ): Promise<IpcResult<IpcContractOutput<C>>>
      invoke(channel: IpcChannel, input?: unknown): Promise<IpcResult<unknown>>
      subscribe(channel: string, listener: (payload: unknown) => void): () => void
      getPathForFile(file: File): string
    }
  }
}

export {}
