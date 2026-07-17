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
