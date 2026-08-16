import { z } from 'zod'
import { UuidSchema } from './base.js'
import { P2pWorkspaceSchema } from '../p2p/workspace.js'
import { P2pWorkspaceListFilterSchema } from '../p2p/types.js'

export const P2pWorkspaceCreateInputSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  maxMembers: z.number().int().min(1).max(50).optional(),
})

export const P2pWorkspaceCreateOutputSchema = z.object({
  workspace: P2pWorkspaceSchema,
  inviteToken: z.string().min(1),
})

export const P2pWorkspaceListInputSchema = z.object({
  filter: P2pWorkspaceListFilterSchema.optional(),
})

export const P2pWorkspaceListOutputSchema = z.object({
  workspaces: z.array(P2pWorkspaceSchema),
  pendingJoinIds: z.array(UuidSchema),
})

export const P2pWorkspaceGetInputSchema = z.object({
  id: UuidSchema,
})

export const P2pWorkspaceGetOutputSchema = z.object({
  workspace: P2pWorkspaceSchema,
})

export const P2pWorkspaceUpdateInputSchema = z.object({
  id: UuidSchema,
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  settings: z.record(z.unknown()).optional(),
})

export const P2pWorkspaceUpdateOutputSchema = z.object({
  workspace: P2pWorkspaceSchema,
})

export const P2pWorkspaceDeleteInputSchema = z.object({
  id: UuidSchema,
})

export const P2pWorkspaceDeleteOutputSchema = z.object({
  deleted: z.literal(true),
})

export const P2pWorkspaceLeaveInputSchema = z.object({
  id: UuidSchema,
})

export const P2pWorkspaceLeaveOutputSchema = z.object({
  left: z.literal(true),
})

export const P2pWorkspaceGetStoragePathInputSchema = z.object({
  id: UuidSchema,
})

export const P2pWorkspaceGetStoragePathOutputSchema = z.object({
  storagePath: z.string().min(1),
})

// --- Member ---
