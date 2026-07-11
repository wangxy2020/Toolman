import { z } from 'zod'
import { UuidSchema } from '../ipc/base.js'
import { PmDomainSchema } from './pm-types.js'

export const PmDomainSettingsSchema = z.object({
  workspaceId: UuidSchema,
  domain: PmDomainSchema,
  p2pAutoSync: z.boolean().default(false),
  linkedP2pWorkspaceIds: z.array(UuidSchema).default([]),
  lastPushedAt: z.number().int().optional(),
})

export type PmDomainSettings = z.infer<typeof PmDomainSettingsSchema>

export const PmDomainSettingsGetInputSchema = z.object({
  workspaceId: UuidSchema,
  domain: PmDomainSchema,
})

export const PmDomainSettingsSetInputSchema = PmDomainSettingsSchema

export const PmDomainSettingsGetOutputSchema = z.object({
  settings: PmDomainSettingsSchema,
})
