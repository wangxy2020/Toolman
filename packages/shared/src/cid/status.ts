import { z } from 'zod'

export const CidDistributionStatusSchema = z.object({
  enabled: z.boolean(),
  running: z.boolean(),
  indexedPackages: z.number().int().nonnegative(),
  indexedChunks: z.number().int().nonnegative(),
  providedRootCids: z.number().int().nonnegative(),
  dhtProvides: z.number().int().nonnegative(),
  dhtProviderLookups: z.number().int().nonnegative(),
  fetchedPackages: z.number().int().nonnegative(),
  verifyFailures: z.number().int().nonnegative(),
  lastError: z.string().nullable().optional(),
})
export type CidDistributionStatus = z.infer<typeof CidDistributionStatusSchema>
