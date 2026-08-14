import type { z } from 'zod'
import { IpcChannel } from './channels.js'
import { AppGetInfoOutputSchema, IpcEmptyInputSchema } from './base.js'
import {
  AssistantListInputSchema,
  AssistantListOutputSchema,
  MessageListInputSchema,
  MessageListOutputSchema,
  SessionCreateInputSchema,
  SessionGetInputSchema,
  SessionListInputSchema,
  SessionListOutputSchema,
  SessionSchema,
} from './agent.js'
import {
  AppDiagnosticsMobileSyncSchema,
  AppGetDiagnosticsOutputSchema,
  ClassroomSyncSetEnabledInputSchema,
  MobileAgentHostSetEnabledInputSchema,
  MobileSyncSetEnabledInputSchema,
} from './diagnostics.js'
import { KnowledgeBaseListInputSchema, KnowledgeBaseListOutputSchema } from './knowledge.js'
import { NotesDataLoadOutputSchema } from './notes.js'
import {
  P2pDeviceGetInfoOutputSchema,
  P2pEventListInputSchema,
  P2pEventListOutputSchema,
  P2pWorkspaceGetInputSchema,
  P2pWorkspaceGetOutputSchema,
  P2pWorkspaceListInputSchema,
  P2pWorkspaceListOutputSchema,
} from './p2p.js'
import {
  CommunityHubHealthOutputSchema,
  CommunityHubStatusOutputSchema,
  CommunityResourceDetailSchema,
  CommunityResourceGetInputSchema,
  CommunityResourceListInputSchema,
  CommunityResourceListOutputSchema,
  CommunityTaskGetInputSchema,
  CommunityTaskItemSchema,
  CommunityTaskListInputSchema,
  CommunityTaskListOutputSchema,
  CommunityUserProfileSchema,
} from './community.js'

type IpcContractEntry = { input: z.ZodTypeAny; output: z.ZodTypeAny }

/**
 * IPC channels with typed input/output Zod schemas for renderer invoke helpers
 * and main-process register-handlers validation.
 * Expand deliberately — prefer schemas that already exist in shared/ipc.
 */
export const IPC_CHANNEL_CONTRACT = {
  [IpcChannel.AppGetInfo]: {
    input: IpcEmptyInputSchema,
    output: AppGetInfoOutputSchema,
  },
  [IpcChannel.AppGetDiagnostics]: {
    input: IpcEmptyInputSchema,
    output: AppGetDiagnosticsOutputSchema,
  },
  [IpcChannel.MobileSyncSetEnabled]: {
    input: MobileSyncSetEnabledInputSchema,
    output: AppDiagnosticsMobileSyncSchema,
  },
  [IpcChannel.MobileAgentHostSetEnabled]: {
    input: MobileAgentHostSetEnabledInputSchema,
    output: AppDiagnosticsMobileSyncSchema,
  },
  [IpcChannel.ClassroomSyncSetEnabled]: {
    input: ClassroomSyncSetEnabledInputSchema,
    output: AppDiagnosticsMobileSyncSchema,
  },
  [IpcChannel.SessionList]: {
    input: SessionListInputSchema,
    output: SessionListOutputSchema,
  },
  [IpcChannel.SessionGet]: {
    input: SessionGetInputSchema,
    output: SessionSchema,
  },
  [IpcChannel.SessionCreate]: {
    input: SessionCreateInputSchema,
    output: SessionSchema,
  },
  [IpcChannel.MessageList]: {
    input: MessageListInputSchema,
    output: MessageListOutputSchema,
  },
  [IpcChannel.AssistantList]: {
    input: AssistantListInputSchema,
    output: AssistantListOutputSchema,
  },
  [IpcChannel.KnowledgeBaseList]: {
    input: KnowledgeBaseListInputSchema,
    output: KnowledgeBaseListOutputSchema,
  },
  [IpcChannel.NotesDataLoad]: {
    input: IpcEmptyInputSchema,
    output: NotesDataLoadOutputSchema,
  },
  [IpcChannel.P2pEventList]: {
    input: P2pEventListInputSchema,
    output: P2pEventListOutputSchema,
  },
  [IpcChannel.P2pWorkspaceGet]: {
    input: P2pWorkspaceGetInputSchema,
    output: P2pWorkspaceGetOutputSchema,
  },
  [IpcChannel.P2pWorkspaceList]: {
    input: P2pWorkspaceListInputSchema,
    output: P2pWorkspaceListOutputSchema,
  },
  [IpcChannel.P2pDeviceGetInfo]: {
    input: IpcEmptyInputSchema,
    output: P2pDeviceGetInfoOutputSchema,
  },
  [IpcChannel.CommunityHubStatus]: {
    input: IpcEmptyInputSchema,
    output: CommunityHubStatusOutputSchema,
  },
  [IpcChannel.CommunityHubHealth]: {
    input: IpcEmptyInputSchema,
    output: CommunityHubHealthOutputSchema,
  },
  [IpcChannel.CommunityUserMe]: {
    input: IpcEmptyInputSchema,
    output: CommunityUserProfileSchema,
  },
  [IpcChannel.CommunityTaskList]: {
    input: CommunityTaskListInputSchema,
    output: CommunityTaskListOutputSchema,
  },
  [IpcChannel.CommunityTaskGet]: {
    input: CommunityTaskGetInputSchema,
    output: CommunityTaskItemSchema,
  },
  [IpcChannel.CommunityResourceList]: {
    input: CommunityResourceListInputSchema,
    output: CommunityResourceListOutputSchema,
  },
  [IpcChannel.CommunityResourceGet]: {
    input: CommunityResourceGetInputSchema,
    output: CommunityResourceDetailSchema,
  },
} as const satisfies Partial<Record<IpcChannel, IpcContractEntry>>

export type IpcContractChannel = keyof typeof IPC_CHANNEL_CONTRACT

export type IpcContractInput<C extends IpcContractChannel> = z.input<
  (typeof IPC_CHANNEL_CONTRACT)[C]['input']
>

export type IpcContractOutput<C extends IpcContractChannel> = z.infer<
  (typeof IPC_CHANNEL_CONTRACT)[C]['output']
>

export function isIpcContractChannel(channel: string): channel is IpcContractChannel {
  return Object.prototype.hasOwnProperty.call(IPC_CHANNEL_CONTRACT, channel)
}

export function getIpcChannelContract(channel: string): IpcContractEntry | undefined {
  if (!isIpcContractChannel(channel)) return undefined
  return IPC_CHANNEL_CONTRACT[channel]
}
