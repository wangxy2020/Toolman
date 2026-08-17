import { z } from 'zod'
import { TimestampSchema, UuidSchema } from './base.js'
import { DiscoveredNodeSchema, P2pConnectionInfoSchema } from '../p2p/workspace.js'
import { P2pConnectionStateSchema } from '../p2p/types.js'

/** Shared resource row id (UUID for files/KB, `note-<uuid>` for notes, etc.) */
export const P2pSharedResourceIdSchema = z.string().min(1).max(200)

// --- Health ---

export const P2pPingOutputSchema = z.object({
  pong: z.literal(true),
  message: z.string(),
  nativeVersion: z.string(),
})

export type P2pPingOutput = z.infer<typeof P2pPingOutputSchema>

// --- Discovery ---

export const P2pDiscoveryStartOutputSchema = z.object({
  started: z.literal(true),
})

export const P2pDiscoveryListNodesInputSchema = z.object({
  onlineOnly: z.boolean().optional(),
})

export const P2pDiscoveryListNodesOutputSchema = z.object({
  nodes: z.array(DiscoveredNodeSchema),
})

// --- Device identity ---

export const P2pDeviceGetInfoOutputSchema = z.object({
  deviceId: z.string().min(1),
  /** Local UUID, Authing `ag-…`, or Firebase `fb-…`. */
  identityId: z.string().min(1),
  publicKey: z.string().min(1),
  publicKeyFingerprint: z.string().min(1),
  privateKeyRef: z.string().min(1),
  createdAt: TimestampSchema,
})

export type P2pDeviceGetInfoOutput = z.infer<typeof P2pDeviceGetInfoOutputSchema>

export const P2pWanReadinessReasonCodeSchema = z.enum([
  'turn_not_configured',
  'turn_missing_credentials',
])

export const P2pWanReadinessSchema = z.object({
  ready: z.boolean(),
  summary: z.string(),
  reason: z.string().optional(),
  reasonCode: P2pWanReadinessReasonCodeSchema.optional(),
})

export const P2pNetworkGetConfigOutputSchema = z.object({
  stunServers: z.array(z.string().min(1)),
  iceServers: z.array(
    z.object({
      urls: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
      username: z.string().min(1).optional(),
      credential: z.string().min(1).optional(),
    }),
  ),
  wanReadiness: P2pWanReadinessSchema,
})

export const P2pNetworkRestartLibp2pOutputSchema = z.object({
  restarted: z.literal(true),
})

export const P2pNetworkSetStunServersInputSchema = z.object({
  stunServers: z.array(z.string().min(1)),
})

export const P2pNetworkSetIceServersInputSchema = z.object({
  iceServers: z.array(
    z.object({
      urls: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
      username: z.string().min(1).optional(),
      credential: z.string().min(1).optional(),
    }),
  ),
})

export const P2pNetworkSetStunServersOutputSchema = z.object({
  stunServers: z.array(z.string().min(1)),
  iceServers: P2pNetworkGetConfigOutputSchema.shape.iceServers,
})

export const P2pNetworkSetIceServersOutputSchema = P2pNetworkGetConfigOutputSchema

// --- Connection ---

export const P2pConnectionConnectInputSchema = z.object({
  peerDeviceId: z.string().min(1),
  workspaceId: UuidSchema.optional(),
})

export const P2pConnectionConnectOutputSchema = z.object({
  state: P2pConnectionStateSchema,
})

export const P2pConnectionDisconnectInputSchema = z.object({
  peerDeviceId: z.string().min(1),
})

export const P2pConnectionDisconnectOutputSchema = z.object({
  state: z.literal('closed'),
})

export const P2pConnectionListOutputSchema = z.object({
  connections: z.array(P2pConnectionInfoSchema),
})

// --- Workspace ---
