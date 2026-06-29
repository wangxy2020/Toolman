import {
  IpcChannel,
  type CommunityModeratorUser,
  type CommunityUserMeUpdateInput,
  type CommunityUserProfile,
  type CommunityUserSearchInput,
} from '@toolman/shared'
import { invokeIpc } from './community-api-ipc'

export async function getCommunityUserMe(): Promise<CommunityUserProfile> {
  return invokeIpc(IpcChannel.CommunityUserMe)
}

export async function updateCommunityUserMe(
  input: CommunityUserMeUpdateInput,
): Promise<CommunityUserProfile> {
  return invokeIpc(IpcChannel.CommunityUserMeUpdate, input)
}

export async function listCommunityAdmins(): Promise<{ items: CommunityModeratorUser[] }> {
  return invokeIpc(IpcChannel.CommunityAdminList)
}

export async function searchCommunityUsers(
  input: CommunityUserSearchInput,
): Promise<{ items: CommunityModeratorUser[] }> {
  return invokeIpc(IpcChannel.CommunityAdminSearch, input)
}

export async function appointCommunityAdmin(
  userId: string,
): Promise<CommunityModeratorUser> {
  return invokeIpc(IpcChannel.CommunityAdminAppoint, { userId })
}

export async function revokeCommunityAdmin(
  userId: string,
): Promise<CommunityModeratorUser> {
  return invokeIpc(IpcChannel.CommunityAdminRevoke, { userId })
}
