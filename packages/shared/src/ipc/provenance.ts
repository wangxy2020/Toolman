import { z } from 'zod'

export const ToolmanBuildProvenanceSchema = z.object({
  product: z.literal('Toolman'),
  version: z.string(),
  copyrightNotice: z.string(),
  license: z.string(),
  repository: z.string().url(),
  gitCommit: z.string(),
  gitDirty: z.boolean(),
  builtAt: z.string(),
  buildId: z.string().min(8),
  buildFingerprint: z.string().length(64),
})
export type ToolmanBuildProvenance = z.infer<typeof ToolmanBuildProvenanceSchema>

export const ProvenanceBeaconEventSchema = z.enum([
  'app.start',
  'app.renderer.ready',
  'app.session.heartbeat',
  'app.diagnostics.view',
  'app.about.view',
])
export type ProvenanceBeaconEvent = z.infer<typeof ProvenanceBeaconEventSchema>

export const AppProvenanceBeaconInputSchema = z.object({
  event: ProvenanceBeaconEventSchema,
})
export type AppProvenanceBeaconInput = z.infer<typeof AppProvenanceBeaconInputSchema>

export const AppProvenanceBeaconOutputSchema = z.object({
  recorded: z.literal(true),
  buildId: z.string(),
})
export type AppProvenanceBeaconOutput = z.infer<typeof AppProvenanceBeaconOutputSchema>

export const AppDiagnosticsProvenanceSchema = ToolmanBuildProvenanceSchema.extend({
  sessionStartedAt: z.number().int().positive(),
  beaconCount: z.number().int().nonnegative(),
  lastBeaconAt: z.number().int().positive().nullable(),
  lastBeaconEvent: ProvenanceBeaconEventSchema.nullable(),
})
export type AppDiagnosticsProvenance = z.infer<typeof AppDiagnosticsProvenanceSchema>
