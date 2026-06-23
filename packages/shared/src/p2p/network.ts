import { z } from 'zod'

export const P2pLibp2pDhtModeSchema = z.enum(['off', 'client', 'server'])
export type P2pLibp2pDhtMode = z.infer<typeof P2pLibp2pDhtModeSchema>

export const P2pNetworkPeerTransportSchema = z.enum(['libp2p', 'webrtc'])
export type P2pNetworkPeerTransport = z.infer<typeof P2pNetworkPeerTransportSchema>

export const P2pNetworkPeerSchema = z.object({
  peerId: z.string(),
  deviceId: z.string().nullable().optional(),
  transport: P2pNetworkPeerTransportSchema,
  connectedAt: z.number().int().nonnegative().optional(),
})
export type P2pNetworkPeer = z.infer<typeof P2pNetworkPeerSchema>

export const P2pNetworkDhtHealthSchema = z.object({
  mode: P2pLibp2pDhtModeSchema,
  bootstrapCount: z.number().int().nonnegative(),
  ready: z.boolean(),
  error: z.string().nullable().optional(),
})
export type P2pNetworkDhtHealth = z.infer<typeof P2pNetworkDhtHealthSchema>

export const P2pNetworkSnapshotSchema = z.object({
  collectedAt: z.number().int().positive(),
  libp2pAvailable: z.boolean(),
  libp2pVersion: z.string().nullable(),
  libp2pRunning: z.boolean(),
  localPeerId: z.string().nullable(),
  libp2pPeerCount: z.number().int().nonnegative(),
  webrtcConnectedPeers: z.number().int().nonnegative(),
  peers: z.array(P2pNetworkPeerSchema),
  dht: P2pNetworkDhtHealthSchema,
  error: z.string().nullable().optional(),
})
export type P2pNetworkSnapshot = z.infer<typeof P2pNetworkSnapshotSchema>

export const P2pNetworkGetSnapshotOutputSchema = P2pNetworkSnapshotSchema
export type P2pNetworkGetSnapshotOutput = z.infer<typeof P2pNetworkGetSnapshotOutputSchema>

export const P2pLibp2pConfigSchema = z.object({
  mdnsEnabled: z.boolean().default(true),
  dhtMode: P2pLibp2pDhtModeSchema.default('client'),
  bootstrapMultiaddrs: z.array(z.string()).default([]),
})
export type P2pLibp2pConfig = z.infer<typeof P2pLibp2pConfigSchema>
