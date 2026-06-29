import {
  getWebhookPort,
  listImChannelConfigsPublic,
  upsertImChannelConfig,
} from './channel-config.service'
import { logStructured } from './structured-log.service'
import {
  getChannelWebhookBaseUrl,
  getChannelWebhookInfo,
  listChannelRuntimeStatuses,
  reloadChannelManager,
  startChannelManager,
  stopChannelManager,
  testChannelConnection,
} from './channels/channel-manager.service'

export function bootstrapChannels(): void {
  void startChannelManager().catch((error) => {
    logStructured('channels', 'error', `bootstrap failed:`, { detail: error })
  })
}

export function listImChannels() {
  const configs = listImChannelConfigsPublic()
  return {
    webhookPort: configs.webhookPort,
    webhookBaseUrl: getChannelWebhookBaseUrl(),
    items: configs.items,
  }
}

export async function saveImChannel(input: unknown) {
  const saved = upsertImChannelConfig(input)
  await reloadChannelManager()
  return saved
}

export async function testImChannel(input: unknown) {
  const { platform } = input as { platform: string }
  return testChannelConnection(platform as never)
}

export function listImChannelStatuses() {
  return { items: listChannelRuntimeStatuses() }
}

export function getImChannelWebhookInfo() {
  return getChannelWebhookInfo()
}

export async function shutdownChannels(): Promise<void> {
  await stopChannelManager()
}

export { getWebhookPort }
