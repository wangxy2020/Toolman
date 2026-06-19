import type { ChannelPlatformId, ImChannelConfig } from '@toolman/shared'
import type { ChannelAdapter, ChannelAdapterContext, ChannelRuntimeStatus } from './adapter.types'

const UNSUPPORTED_PLATFORMS: ChannelPlatformId[] = ['qq', 'slack']

export class UnsupportedChannelAdapter implements ChannelAdapter {
  readonly platform: ChannelPlatformId

  private status: ChannelRuntimeStatus = 'unsupported'
  private statusMessage = '该平台适配器即将推出'

  constructor(platform: ChannelPlatformId) {
    this.platform = platform
    if (!UNSUPPORTED_PLATFORMS.includes(platform)) {
      throw new Error(`UnsupportedChannelAdapter 不适用于 ${platform}`)
    }
  }

  async start(_config: ImChannelConfig, _ctx: ChannelAdapterContext): Promise<void> {
    this.status = 'unsupported'
    this.statusMessage = '该平台适配器即将推出，可先保存配置'
  }

  async stop(): Promise<void> {
    this.status = 'unsupported'
  }

  async test(config: ImChannelConfig): Promise<{ ok: boolean; message: string }> {
    if (!config.appId.trim() && !config.appSecret.trim()) {
      return { ok: false, message: '请至少填写应用 ID 或密钥' }
    }
    return { ok: true, message: '配置已保存，运行时适配即将推出' }
  }

  getStatus() {
    return {
      status: this.status,
      message: this.statusMessage,
    }
  }
}

export function createUnsupportedAdapters(): ChannelAdapter[] {
  return UNSUPPORTED_PLATFORMS.map((platform) => new UnsupportedChannelAdapter(platform))
}
