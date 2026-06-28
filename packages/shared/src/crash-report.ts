import { z } from 'zod'

export const CrashReportKindSchema = z.enum([
  'uncaughtException',
  'unhandledRejection',
  'renderProcessGone',
  'rendererError',
])
export type CrashReportKind = z.infer<typeof CrashReportKindSchema>

export const CrashReportPayloadSchema = z.object({
  at: z.number().int().positive(),
  appVersion: z.string(),
  platform: z.string(),
  arch: z.string(),
  kind: CrashReportKindSchema,
  message: z.string(),
  stack: z.string().optional(),
  deviceId: z.string().optional(),
  buildId: z.string().optional(),
  buildFingerprint: z.string().optional(),
})
export type CrashReportPayload = z.infer<typeof CrashReportPayloadSchema>

export const CrashReportUploadStatusSchema = z.object({
  uploadEnabled: z.boolean(),
  ingestUrl: z.string().nullable(),
  pendingCount: z.number().int().nonnegative(),
  lastUploadAt: z.number().int().positive().nullable(),
  lastUploadError: z.string().nullable(),
})
export type CrashReportUploadStatus = z.infer<typeof CrashReportUploadStatusSchema>

export const RendererErrorReportInputSchema = z.object({
  message: z.string().min(1),
  stack: z.string().optional(),
  componentStack: z.string().optional(),
})
export type RendererErrorReportInput = z.infer<typeof RendererErrorReportInputSchema>

export const CrashReportSetUploadInputSchema = z.object({
  uploadEnabled: z.boolean(),
})

export const CrashReportUploadResultSchema = z.object({
  uploaded: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  remaining: z.number().int().nonnegative(),
})
export type CrashReportUploadResult = z.infer<typeof CrashReportUploadResultSchema>

const SENSITIVE_PATTERNS: RegExp[] = [
  /sk-[a-zA-Z0-9]{20,}/g,
  /Bearer\s+[A-Za-z0-9._-]+/gi,
  /(api[_-]?key|token|secret|password)\s*[:=]\s*\S+/gi,
]

export function redactCrashReportText(text: string, homePath?: string): string {
  let out = text
  if (homePath) {
    out = out.split(homePath).join('~')
  }
  for (const pattern of SENSITIVE_PATTERNS) {
    out = out.replace(pattern, '[REDACTED]')
  }
  return out.slice(0, 32_000)
}
