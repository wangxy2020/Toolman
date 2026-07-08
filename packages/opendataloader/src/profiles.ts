import type { ConvertOptions } from '@opendataloader/pdf'
import type { DocumentParseProfile, OdlConvertOverrides, OdlHybridConfig } from './types.js'
import { buildTextPageSeparator, formatPageRange } from './page-markers.js'

export function buildProfileConvertOptions(
  profile: DocumentParseProfile,
  options?: {
    pageRange?: { start: number; end: number }
    password?: string
    quiet?: boolean
    convertOverrides?: OdlConvertOverrides
    odlHybrid?: OdlHybridConfig
  },
): ConvertOptions {
  const pageSeparator = buildTextPageSeparator()
  const pages = formatPageRange(options?.pageRange)
  const overrides = options?.convertOverrides
  const shared: ConvertOptions = {
    quiet: options?.quiet ?? true,
    readingOrder: 'xycut',
    imageOutput: 'off',
    textPageSeparator: pageSeparator,
    markdownPageSeparator: pageSeparator,
    password: options?.password,
    pages,
    ...(overrides?.enableContentSafety === false
      ? { contentSafetyOff: 'all' }
      : {}),
  }

  let convertOptions: ConvertOptions
  switch (profile) {
    case 'metadata':
      convertOptions = {
        ...shared,
        format: 'json',
        pages: pages ?? '1',
      }
      break
    case 'translation':
      convertOptions = {
        ...shared,
        format: 'text,markdown',
        keepLineBreaks: true,
      }
      break
    case 'chat':
      convertOptions = {
        ...shared,
        format: 'text',
      }
      break
    case 'knowledge':
    default:
      convertOptions = {
        ...shared,
        format: 'text,markdown-with-html,json',
      }
      break
  }

  return applyOdlHybridOptions(convertOptions, options?.odlHybrid)
}

function applyOdlHybridOptions(
  options: ConvertOptions,
  hybrid?: OdlHybridConfig,
): ConvertOptions {
  if (!hybrid) return options

  const next: ConvertOptions = {
    ...options,
    hybrid: hybrid.backend,
    hybridMode: hybrid.mode ?? 'auto',
    hybridFallback: true,
  }

  const url = hybrid.url?.trim()
  if (url) next.hybridUrl = url
  if (hybrid.timeoutMs && hybrid.timeoutMs > 0) {
    next.hybridTimeout = String(hybrid.timeoutMs)
  }

  return next
}

/** CLI flags not yet exposed on vendored ConvertOptions typings. */
export function appendOdlHybridCliArgs(odlHybrid?: OdlHybridConfig): string[] {
  if (!odlHybrid) return []
  const args: string[] = []
  if (odlHybrid.backend === 'hancom-ai' && odlHybrid.hancomAiOcrStrategy) {
    args.push('--hybrid-hancom-ai-ocr-strategy', odlHybrid.hancomAiOcrStrategy)
  }
  return args
}

/** Append undocumented CLI flags for retry passes (e.g. det-threshold). */
export function appendOdlExtraCliArgs(
  args: string[],
  overrides?: OdlConvertOverrides,
): string[] {
  if (!overrides?.detThreshold || overrides.detThreshold < 0.8) return args
  return [...args, '--det-threshold', String(overrides.detThreshold)]
}
