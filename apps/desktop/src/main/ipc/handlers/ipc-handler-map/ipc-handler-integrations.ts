import { toErrorMessage, IpcChannel, ipcOk, ipcErr } from '@toolman/shared'
import { ProviderError } from '@toolman/model-gateway'
import * as mcpStatusService from '../../../services/mcp-status.service'
import * as mcpService from '../../../services/mcp.service'
import * as skillsFacade from '../../../services/skills-facade.service'
import * as imChannelFacade from '../../../services/im-channel.facade.service'
import * as providerService from '../../../services/provider.service'
import type { HandlerFn } from './types'

export const integrationsIpcHandlers: Partial<Record<IpcChannel, HandlerFn>> = {
  [IpcChannel.McpStatusList]: async (input) => ipcOk(await mcpStatusService.listMcpStatus(input)),

  [IpcChannel.McpServerList]: async () => ipcOk(mcpService.listServers()),
  [IpcChannel.McpServerUpsert]: async (input) => {
    try {
      const server = mcpService.upsertServer(input)
      return ipcOk(server)
    } catch (error) {
      const message = toErrorMessage(error, 'Save failed')
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },
  [IpcChannel.McpServerDelete]: async (input) => {
    try {
      return ipcOk(mcpService.removeServer(input))
    } catch (error) {
      const message = toErrorMessage(error, 'Delete failed')
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },
  [IpcChannel.McpServerTest]: async (input) => ipcOk(await mcpService.testServer(input)),
  [IpcChannel.McpToolsList]: async (input) => ipcOk(await mcpService.listTools(input)),
  [IpcChannel.McpServerInspect]: async (input) => ipcOk(await mcpService.inspectServer(input)),

  [IpcChannel.SkillList]: async () => ipcOk(skillsFacade.listInstalledSkills()),
  [IpcChannel.SkillInstall]: async (input) => {
    try {
      return ipcOk(skillsFacade.installSkill(input))
    } catch (error) {
      const message = toErrorMessage(error, 'Install failed')
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },
  [IpcChannel.SkillDelete]: async (input) => {
    try {
      return ipcOk(skillsFacade.removeSkill(input))
    } catch (error) {
      const message = toErrorMessage(error, 'Delete failed')
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },

  [IpcChannel.ImChannelList]: async () => ipcOk(imChannelFacade.listImChannels()),
  [IpcChannel.ImChannelUpsert]: async (input) => {
    try {
      return ipcOk(await imChannelFacade.saveImChannel(input))
    } catch (error) {
      const message = toErrorMessage(error, 'Save failed')
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },
  [IpcChannel.ImChannelTest]: async (input) => {
    try {
      return ipcOk(await imChannelFacade.testImChannel(input))
    } catch (error) {
      const message = toErrorMessage(error, 'Test failed')
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },
  [IpcChannel.ImChannelStatusList]: async () => ipcOk(imChannelFacade.listImChannelStatuses()),
  [IpcChannel.ImChannelWebhookInfo]: async () => ipcOk(imChannelFacade.getImChannelWebhookInfo()),

  [IpcChannel.ProviderList]: async (input) => ipcOk(providerService.listProviders(input)),
  [IpcChannel.ProviderCreate]: async (input) => ipcOk(providerService.createProvider(input)),
  [IpcChannel.ProviderUpdate]: async (input) => {
    const provider = providerService.updateProvider(input)
    if (!provider) return ipcErr({ code: 'NOT_FOUND', message: 'Provider not found', retryable: false })
    return ipcOk(provider)
  },
  [IpcChannel.ProviderTest]: async (input) => {
    try {
      return ipcOk(await providerService.testProvider(input))
    } catch (error) {
      const message = toErrorMessage(error, 'Test failed')
      return ipcErr({ code: 'PROVIDER_ERROR', message, retryable: false })
    }
  },
  [IpcChannel.ProviderFetchModels]: async (input) => {
    try {
      return ipcOk(await providerService.fetchProviderModels(input))
    } catch (error) {
      const message = toErrorMessage(error, 'Fetch models failed')
      return ipcErr({
        code: 'PROVIDER_ERROR',
        message,
        retryable: error instanceof ProviderError ? error.retryable : false,
      })
    }
  },
  [IpcChannel.ProviderPullModel]: async (input) => {
    try {
      return ipcOk(await providerService.pullOllamaModel(input))
    } catch (error) {
      const message = toErrorMessage(error, 'Pull model failed')
      return ipcErr({ code: 'PROVIDER_ERROR', message, retryable: false })
    }
  },
  [IpcChannel.ProviderDelete]: async (input) => {
    try {
      return ipcOk({ deleted: providerService.deleteProvider(input) })
    } catch (error) {
      const message = toErrorMessage(error, 'Delete failed')
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },
}
