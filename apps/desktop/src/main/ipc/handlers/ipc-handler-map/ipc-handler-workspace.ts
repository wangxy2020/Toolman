import { toErrorMessage, IpcChannel, ipcOk, ipcErr } from '@toolman/shared'
import * as workspaceService from '../../../services/workspace.service'
import * as identityService from '../../../services/identity.service'
import { authIpcHandlers } from '../../auth-ipc-handlers'
import type { HandlerFn } from './types'

export const workspaceIpcHandlers: Partial<Record<IpcChannel, HandlerFn>> = {
  [IpcChannel.WorkspaceList]: async () => ipcOk(workspaceService.listWorkspaces()),

  [IpcChannel.WorkspaceGetDefault]: async () => {
    const workspace = workspaceService.getDefaultWorkspace()
    if (!workspace) {
      return ipcErr({ code: 'NOT_FOUND', message: 'Default workspace not found', retryable: false })
    }
    return ipcOk(workspace)
  },

  [IpcChannel.WorkspaceGet]: async (input) => {
    const workspace = workspaceService.getWorkspace(input)
    if (!workspace) return ipcErr({ code: 'NOT_FOUND', message: 'Workspace not found', retryable: false })
    return ipcOk(workspace)
  },

  [IpcChannel.WorkspaceUpdate]: async (input) => {
    const workspace = workspaceService.updateWorkspace(input)
    if (!workspace) return ipcErr({ code: 'NOT_FOUND', message: 'Workspace not found', retryable: false })
    return ipcOk(workspace)
  },

  [IpcChannel.IdentityGet]: async () => {
    try {
      return ipcOk(identityService.getIdentityProfile())
    } catch (error) {
      const message = toErrorMessage(error, 'Failed to load identity')
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },

  [IpcChannel.IdentityUpdate]: async (input) => {
    try {
      return ipcOk(identityService.updateIdentityProfile(input))
    } catch (error) {
      const message = toErrorMessage(error, 'Failed to update identity')
      return ipcErr({ code: 'VALIDATION_ERROR', message, retryable: false })
    }
  },

  ...authIpcHandlers,
}
