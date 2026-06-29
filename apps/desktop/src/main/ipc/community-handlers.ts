import type { IpcChannel } from '@toolman/shared'
import { communityBridgeHandlers } from './community-handlers/community-handlers-bridge'
import { communityHubHandlers } from './community-handlers/community-handlers-hub'
import { communitySocialHandlers } from './community-handlers/community-handlers-social'
import { communityTasksHandlers } from './community-handlers/community-handlers-tasks'
import type { HandlerFn } from './community-handlers/community-handlers-utils'

export const communityHandlers: Partial<Record<IpcChannel, HandlerFn>> = {
  ...communityHubHandlers,
  ...communitySocialHandlers,
  ...communityTasksHandlers,
  ...communityBridgeHandlers,
}
