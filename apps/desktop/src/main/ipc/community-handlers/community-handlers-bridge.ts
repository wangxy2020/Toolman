import {
  CommunityCidSetEnabledInputSchema,
  CommunityYjsSetEnabledInputSchema,
  IpcChannel,
  ipcErr,
  ipcOk,
} from '@toolman/shared'
import { toErrorMessage } from '@toolman/shared'
import { getCommunityCidProviderStatus, setCommunityCidDistributionEnabled } from '../../services/community/community-cid-provider.service'
import { getCommunityYjsStatus, setCommunityYjsEnabled } from '../../services/community/community-yjs-bridge.service'
import { communityHandler } from './community-handlers-utils'
import type { HandlerFn } from './community-handlers-utils'

export const communityBridgeHandlers: Partial<Record<IpcChannel, HandlerFn>> = {
  [IpcChannel.CommunityYjsGetStatus]: async () => {
    try {
      return ipcOk(getCommunityYjsStatus())
    } catch (error) {
      const errMessage = toErrorMessage(error, 'Failed to read Yjs status')
      return ipcErr({ code: 'INTERNAL_ERROR', message: errMessage, retryable: true })
    }
  },

  [IpcChannel.CommunityYjsSetEnabled]: communityHandler(async (input) => {
    const parsed = CommunityYjsSetEnabledInputSchema.parse(input)
    return setCommunityYjsEnabled(parsed.enabled)
  }),

  [IpcChannel.CommunityCidGetStatus]: async () => {
    try {
      return ipcOk(getCommunityCidProviderStatus())
    } catch (error) {
      const errMessage = toErrorMessage(error, 'Failed to read CID status')
      return ipcErr({ code: 'INTERNAL_ERROR', message: errMessage, retryable: true })
    }
  },

  [IpcChannel.CommunityCidSetEnabled]: communityHandler(async (input) => {
    const parsed = CommunityCidSetEnabledInputSchema.parse(input)
    return setCommunityCidDistributionEnabled(parsed.enabled)
  }),
}
