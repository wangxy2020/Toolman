import { toErrorMessage, IpcChannel, ipcOk, ipcErr } from '@toolman/shared'
import {
  P2pMemberListInputSchema,
  P2pMemberListOutputSchema,
  P2pMemberInviteInputSchema,
  P2pMemberInviteOutputSchema,
  P2pMemberJoinInputSchema,
  P2pMemberJoinOutputSchema,
  P2pMemberRemoveInputSchema,
  P2pMemberRemoveOutputSchema,
  P2pMemberUpdateRoleInputSchema,
  P2pMemberUpdateRoleOutputSchema,
  P2pMemberTrustDeviceInputSchema,
  P2pMemberTrustDeviceOutputSchema,
  P2pMemberListPendingTrustPromptsOutputSchema,
} from '@toolman/shared'
import * as p2pInviteService from '../../services/p2p/p2p-invite.service'
import * as p2pMemberService from '../../services/p2p/p2p-member.service'
import { P2pMemberLimitError } from '../../services/p2p/p2p-member-join.service'
import * as p2pPeerService from '../../services/p2p/p2p-peer.service'
import type { P2pIpcHandlerMap } from './types'

export const p2pIpcMemberHandlers: P2pIpcHandlerMap = {
  [IpcChannel.P2pMemberList]: async (input) => {
    try {
      const parsed = P2pMemberListInputSchema.parse(input)
      const members = await p2pMemberService.prepareP2pMemberList(parsed.workspaceId)
      return ipcOk(P2pMemberListOutputSchema.parse({ members }))
    } catch (error) {
      const errMessage = toErrorMessage(error, 'Failed to list members')
      const code = errMessage.includes('无权') ? 'P2P_FORBIDDEN' : 'INTERNAL_ERROR'
      return ipcErr({ code, message: errMessage, retryable: false })
    }
  },

  [IpcChannel.P2pMemberInvite]: async (input) => {
    try {
      const parsed = P2pMemberInviteInputSchema.parse(input)
      const result = await p2pInviteService.createP2pInvite(parsed)
      return ipcOk(P2pMemberInviteOutputSchema.parse(result))
    } catch (error) {
      const errMessage = toErrorMessage(error, 'Failed to create invite')
      const code = errMessage.includes('无权') ? 'P2P_FORBIDDEN' : 'INTERNAL_ERROR'
      return ipcErr({ code, message: errMessage, retryable: false })
    }
  },

  [IpcChannel.P2pMemberJoin]: async (input) => {
    try {
      const parsed = P2pMemberJoinInputSchema.parse(input)
      const result = await p2pMemberService.joinP2pWorkspace(parsed)
      return ipcOk(P2pMemberJoinOutputSchema.parse(result))
    } catch (error) {
      if (error instanceof P2pMemberLimitError) {
        return ipcErr({ code: 'P2P_MEMBER_LIMIT', message: error.message, retryable: false })
      }
      if (error instanceof p2pMemberService.P2pMemberVipRequiredError) {
        return ipcErr({ code: 'P2P_MEMBER_VIP_REQUIRED', message: error.message, retryable: false })
      }
      const errMessage = toErrorMessage(error, 'Failed to join workspace')
      let code: 'P2P_INVITE_EXPIRED' | 'P2P_FORBIDDEN' | 'P2P_MEMBER_LIMIT' | 'INTERNAL_ERROR' =
        'INTERNAL_ERROR'
      if (errMessage.includes('过期')) code = 'P2P_INVITE_EXPIRED'
      else if (errMessage.includes('上限')) code = 'P2P_MEMBER_LIMIT'
      else if (errMessage.includes('签名') || errMessage.includes('已是')) code = 'P2P_FORBIDDEN'
      return ipcErr({ code, message: errMessage, retryable: false })
    }
  },

  [IpcChannel.P2pMemberRemove]: async (input) => {
    try {
      const parsed = P2pMemberRemoveInputSchema.parse(input)
      await p2pMemberService.removeP2pMember(parsed)
      return ipcOk(P2pMemberRemoveOutputSchema.parse({ removed: true }))
    } catch (error) {
      const errMessage = toErrorMessage(error, 'Failed to remove member')
      const code = errMessage.includes('无权') ? 'P2P_FORBIDDEN' : 'INTERNAL_ERROR'
      return ipcErr({ code, message: errMessage, retryable: false })
    }
  },

  [IpcChannel.P2pMemberUpdateRole]: async (input) => {
    try {
      const parsed = P2pMemberUpdateRoleInputSchema.parse(input)
      const member = p2pMemberService.updateP2pMemberRole(parsed)
      return ipcOk(P2pMemberUpdateRoleOutputSchema.parse({ member }))
    } catch (error) {
      const errMessage = toErrorMessage(error, 'Failed to update member role')
      const code = errMessage.includes('群主') ? 'P2P_FORBIDDEN' : 'INTERNAL_ERROR'
      return ipcErr({ code, message: errMessage, retryable: false })
    }
  },

  [IpcChannel.P2pMemberTrustDevice]: async (input) => {
    try {
      const parsed = P2pMemberTrustDeviceInputSchema.parse(input)
      const result = p2pPeerService.trustP2pPeerDevice(parsed)
      return ipcOk(P2pMemberTrustDeviceOutputSchema.parse(result))
    } catch (error) {
      const errMessage = toErrorMessage(error, 'Failed to trust device')
      const code = errMessage.includes('信任') ? 'P2P_TRUST_REQUIRED' : 'INTERNAL_ERROR'
      return ipcErr({ code, message: errMessage, retryable: false })
    }
  },

  [IpcChannel.P2pMemberListPendingTrustPrompts]: async () => {
    try {
      return ipcOk(
        P2pMemberListPendingTrustPromptsOutputSchema.parse({
          prompts: p2pPeerService.listPendingTrustPrompts(),
        }),
      )
    } catch (error) {
      const errMessage = toErrorMessage(error, 'Failed to list pending trust prompts')
      return ipcErr({ code: 'INTERNAL_ERROR', message: errMessage, retryable: true })
    }
  },
}
