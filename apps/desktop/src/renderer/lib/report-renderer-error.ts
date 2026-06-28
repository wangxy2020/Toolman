import { IpcChannel } from '@toolman/shared'

export function reportRendererError(input: {
  message: string
  stack?: string
  componentStack?: string
}): void {
  void window.api
    .invoke(IpcChannel.AppReportRendererError, input)
    .catch(() => undefined)
}
