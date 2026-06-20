import { IpcChannel } from './ipc/channels.js'
import type { AuthSession } from './ipc/auth.js'
import {
  canBrowseCommunityReadOnly,
  canUseCommunityWrite,
  canUseGroupFeatures,
} from './ipc/auth.js'

export type AuthFeature = 'group' | 'community_write' | 'community_read'

export const AUTH_REGISTRATION_REQUIRED_MESSAGE =
  '此功能需要注册并登录账户。请点击左下角头像进行注册或登录。'

export const COMMUNITY_READ_IPC_CHANNELS = new Set<IpcChannel>([
  IpcChannel.CommunityHubHealth,
  IpcChannel.CommunityHubStatus,
  IpcChannel.CommunityResourceList,
  IpcChannel.CommunityResourceGet,
  IpcChannel.CommunityReviewList,
  IpcChannel.CommunityNewsSourceList,
  IpcChannel.CommunityNewsList,
  IpcChannel.CommunityNewsGet,
  IpcChannel.CommunityNewsRecommended,
  IpcChannel.CommunityNewsCommentList,
  IpcChannel.CommunityCommentList,
  IpcChannel.CommunityCommentCount,
  IpcChannel.CommunityBoardMessageList,
  IpcChannel.CommunityTaskList,
  IpcChannel.CommunityTaskGet,
])

export const P2P_GUEST_ALLOWED_IPC_CHANNELS = new Set<IpcChannel>([
  IpcChannel.P2pDeviceGetInfo,
  IpcChannel.P2pPing,
])

export function isCommunityChannel(channel: IpcChannel): boolean {
  return channel.startsWith('community:')
}

export function isP2pChannel(channel: IpcChannel): boolean {
  return channel.startsWith('p2p:')
}

export function isCommunityReadChannel(channel: IpcChannel): boolean {
  return COMMUNITY_READ_IPC_CHANNELS.has(channel)
}

export function isCommunityWriteChannel(channel: IpcChannel): boolean {
  return isCommunityChannel(channel) && !isCommunityReadChannel(channel)
}

export function isP2pGuestAllowedChannel(channel: IpcChannel): boolean {
  return P2P_GUEST_ALLOWED_IPC_CHANNELS.has(channel)
}

export function isP2pGatedChannel(channel: IpcChannel): boolean {
  return isP2pChannel(channel) && !isP2pGuestAllowedChannel(channel)
}

export function checkAuthFeatureAccess(
  session: AuthSession | null | undefined,
  feature: AuthFeature,
): { allowed: boolean; code?: 'AUTH_REGISTRATION_REQUIRED'; message?: string } {
  if (feature === 'community_read') {
    return { allowed: canBrowseCommunityReadOnly(session ?? undefined) }
  }

  if (!session) {
    return {
      allowed: false,
      code: 'AUTH_REGISTRATION_REQUIRED',
      message: AUTH_REGISTRATION_REQUIRED_MESSAGE,
    }
  }

  if (feature === 'community_write') {
    if (canUseCommunityWrite(session)) return { allowed: true }
    return {
      allowed: false,
      code: 'AUTH_REGISTRATION_REQUIRED',
      message: AUTH_REGISTRATION_REQUIRED_MESSAGE,
    }
  }

  if (feature === 'group') {
    if (canUseGroupFeatures(session)) return { allowed: true }
    return {
      allowed: false,
      code: 'AUTH_REGISTRATION_REQUIRED',
      message: AUTH_REGISTRATION_REQUIRED_MESSAGE,
    }
  }

  return { allowed: false, code: 'AUTH_REGISTRATION_REQUIRED', message: AUTH_REGISTRATION_REQUIRED_MESSAGE }
}

export function resolveIpcAuthFeature(channel: IpcChannel): AuthFeature | null {
  if (isCommunityWriteChannel(channel)) return 'community_write'
  if (isP2pGatedChannel(channel)) return 'group'
  return null
}
