import type { z } from 'zod'
import { IpcChannel } from './channels.js'
import { SessionListInputSchema, SessionListOutputSchema } from './agent.js'
import {
  P2pEventListInputSchema,
  P2pEventListOutputSchema,
  P2pWorkspaceGetInputSchema,
  P2pWorkspaceGetOutputSchema,
} from './p2p.js'

/** IPC channels with typed input/output Zod schemas for renderer invoke helpers. */
export const IPC_CHANNEL_CONTRACT = {
  [IpcChannel.SessionList]: {
    input: SessionListInputSchema,
    output: SessionListOutputSchema,
  },
  [IpcChannel.P2pEventList]: {
    input: P2pEventListInputSchema,
    output: P2pEventListOutputSchema,
  },
  [IpcChannel.P2pWorkspaceGet]: {
    input: P2pWorkspaceGetInputSchema,
    output: P2pWorkspaceGetOutputSchema,
  },
} as const satisfies Partial<
  Record<IpcChannel, { input: z.ZodTypeAny; output: z.ZodTypeAny }>
>

export type IpcContractChannel = keyof typeof IPC_CHANNEL_CONTRACT

export type IpcContractInput<C extends IpcContractChannel> = z.infer<
  (typeof IPC_CHANNEL_CONTRACT)[C]['input']
>

export type IpcContractOutput<C extends IpcContractChannel> = z.infer<
  (typeof IPC_CHANNEL_CONTRACT)[C]['output']
>
