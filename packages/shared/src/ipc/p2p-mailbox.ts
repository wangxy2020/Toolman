import { z } from 'zod'
import { UuidSchema } from './base.js'
import { NoteIdSchema } from './notes.js'
import { WorkspaceEventSchema } from '../p2p/events.js'
import { P2pSharedResourceSchema } from '../p2p/workspace.js'
import { P2pConnectionStateSchema } from '../p2p/types.js'
import { P2pSharedResourceIdSchema } from './p2p-network.js'

// --- Note ---

export const P2pNoteShareInputSchema = z.object({
  workspaceId: UuidSchema,
  noteId: NoteIdSchema,
  permission: z.enum(['read', 'write']).optional(),
})

export const P2pNoteShareOutputSchema = z.object({
  sharedResource: P2pSharedResourceSchema,
})

export const P2pNotePushUpdateInputSchema = z.object({
  workspaceId: UuidSchema,
  noteId: NoteIdSchema,
  content: z.string(),
})

export const P2pNotePushUpdateOutputSchema = z.object({
  event: WorkspaceEventSchema,
})

export const P2pNoteSetPermissionInputSchema = z.object({
  workspaceId: UuidSchema,
  resourceId: P2pSharedResourceIdSchema,
  permission: z.enum(['read', 'write']),
})

export const P2pNoteSetPermissionOutputSchema = z.object({
  sharedResource: P2pSharedResourceSchema,
})

export const P2pNoteListShareTargetsInputSchema = z.object({
  noteId: NoteIdSchema,
})

export const P2pNoteListShareTargetsOutputSchema = z.object({
  workspaceIds: z.array(UuidSchema),
})

// --- Workflow ---

export const P2pWorkflowShareInputSchema = z.object({
  workspaceId: UuidSchema,
  workflowId: z.string().min(1).max(64),
  sourceWorkspaceId: UuidSchema.optional(),
  permission: z.enum(['read', 'write']).optional(),
})

export const P2pWorkflowShareOutputSchema = z.object({
  sharedResource: P2pSharedResourceSchema,
})

export const P2pWorkflowListLocalOutputSchema = z.object({
  workflows: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      description: z.string().optional(),
    }),
  ),
})

// --- Push event payloads (subscribe) ---

export const P2pDiscoveryNodeOfflinePayloadSchema = z.object({
  deviceId: z.string().min(1),
})

export const P2pConnectionStateChangePayloadSchema = z.object({
  peerDeviceId: z.string().min(1),
  state: P2pConnectionStateSchema,
  workspaceId: UuidSchema.optional(),
})

export const P2pConnectionErrorPayloadSchema = z.object({
  peerDeviceId: z.string().min(1),
  code: z.string().min(1),
  message: z.string().min(1),
})

export const P2pSyncProgressPayloadSchema = z.object({
  workspaceId: UuidSchema,
  phase: z.string().min(1),
  current: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
})

export const P2pSyncCompletedPayloadSchema = z.object({
  workspaceId: UuidSchema,
  eventsApplied: z.number().int().nonnegative(),
  filesFetched: z.number().int().nonnegative(),
})

export const P2pSyncErrorPayloadSchema = z.object({
  workspaceId: UuidSchema,
  code: z.string().min(1),
  message: z.string().min(1),
})
