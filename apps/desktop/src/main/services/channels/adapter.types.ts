import type { ChannelPlatformId, ImChannelConfig } from '@toolman/shared'

export type ChannelRuntimeStatus = 'stopped' | 'connecting' | 'connected' | 'error' | 'unsupported'

export interface ChannelAdapterContext {
  webhookBaseUrl: string
  onInboundMessage: (input: {
    platform: ChannelPlatformId
    chatId: string
    text: string
    config: ImChannelConfig
  }) => Promise<string>
  updateStatus: (status: ChannelRuntimeStatus, message?: string) => void
}

export interface ChannelAdapter {
  readonly platform: ChannelPlatformId
  start(config: ImChannelConfig, ctx: ChannelAdapterContext): Promise<void>
  stop(): Promise<void>
  test(config: ImChannelConfig): Promise<{ ok: boolean; message: string }>
  getStatus(): { status: ChannelRuntimeStatus; message?: string; lastEventAt?: number }
  handleHttpRequest?(
    req: import('node:http').IncomingMessage,
    res: import('node:http').ServerResponse,
    config: ImChannelConfig,
  ): Promise<boolean>
}
