import {
  peekInviteTokenFields,
  unpackWanInviteBundle,
  type P2pIceServer,
  type P2pJoinRegisterOutput,
} from '@toolman/shared'
import type { PendingP2pInvite } from './inviteParse'

export type ResolvedJoinSession = {
  inviteToken: string
  workspaceId: string
  offerSdp?: string
  workspaceKeyB64?: string
  iceServers?: P2pIceServer[]
}

export async function resolveJoinSession(input: {
  invite: PendingP2pInvite
  register: P2pJoinRegisterOutput
}): Promise<ResolvedJoinSession> {
  let offerSdp = input.register.offerSdp
  let token = input.invite.token
  let workspaceKeyB64 = input.register.workspaceKeyB64

  if ((!offerSdp || !token || !workspaceKeyB64) && input.invite.bundled) {
    try {
      const unpacked = await unpackWanInviteBundle(input.invite.bundled)
      token = token || unpacked.t
      offerSdp = offerSdp || unpacked.d
      if (!workspaceKeyB64) {
        workspaceKeyB64 = peekInviteTokenFields(unpacked.t)?.workspaceKeyB64
      }
    } catch {
      // Register extras are enough when the bundle cannot be inflated.
    }
  }

  if (!workspaceKeyB64 && token) {
    workspaceKeyB64 = peekInviteTokenFields(token)?.workspaceKeyB64
  }

  return {
    inviteToken: input.invite.raw || token,
    workspaceId: input.register.workspaceId,
    offerSdp,
    workspaceKeyB64,
    iceServers: input.register.iceServers,
  }
}
