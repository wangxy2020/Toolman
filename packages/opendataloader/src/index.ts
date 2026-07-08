import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { detectJavaRuntime, resolveJavaHeapOptions, sanitizeProcessJavaToolOptions } from './java-runtime.js'
import { runOpenDataLoaderConvert } from './odl-jar-convert.js'
import { parseOpenDataLoaderOutput } from './parse-output.js'
import {
  appendOdlExtraCliArgs,
  appendOdlHybridCliArgs,
  buildProfileConvertOptions,
} from './profiles.js'
import type {
  DocumentParseRequest,
  DocumentParseResult,
  OpenDataLoaderAvailability,
} from './types.js'

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000

export async function getOpenDataLoaderAvailability(): Promise<OpenDataLoaderAvailability> {
  const java = await detectJavaRuntime()
  return {
    npmPackageInstalled: true,
    java,
    ready: java.available,
  }
}

export async function parsePdfWithOpenDataLoader(
  request: DocumentParseRequest,
  options?: { timeoutMs?: number; maxHeapMb?: number },
): Promise<DocumentParseResult> {
  const availability = await getOpenDataLoaderAvailability()
  if (!availability.ready) {
    throw new Error(availability.java.error ?? 'OpenDataLoader 需要 Java 11+')
  }

  const outputDir =
    request.outputDir ??
    (await mkdtemp(join(tmpdir(), 'toolman-odl-')))

  const shouldCleanup = !request.outputDir
  sanitizeProcessJavaToolOptions()
  const env = resolveJavaHeapOptions(options?.maxHeapMb ?? 768)
  const previousJavaOptions = process.env.JAVA_TOOL_OPTIONS
  process.env.JAVA_TOOL_OPTIONS = env.JAVA_TOOL_OPTIONS

  try {
    const convertOptions = buildProfileConvertOptions(request.profile, {
      pageRange: request.pageRange,
      password: request.password,
      convertOverrides: request.convertOverrides,
      odlHybrid: request.odlHybrid,
    })

    const extraCliArgs = appendOdlExtraCliArgs(
      appendOdlHybridCliArgs(request.odlHybrid),
      request.convertOverrides,
    )

    await withTimeout(
      runOpenDataLoaderConvert(
        request.filePath,
        { ...convertOptions, outputDir },
        extraCliArgs,
      ),
      options?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      'OpenDataLoader 解析超时',
    )

    const parsed = parseOpenDataLoaderOutput({
      sourcePath: request.filePath,
      outputDir,
      pageRange: request.pageRange,
    })

    return {
      backend: 'opendataloader',
      ...parsed,
    }
  } finally {
    process.env.JAVA_TOOL_OPTIONS = previousJavaOptions
    if (shouldCleanup) {
      await rm(outputDir, { recursive: true, force: true }).catch(() => undefined)
    }
  }
}

async function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), ms)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export { detectJavaRuntime, normalizeJavaToolOptions, resolveJavaHeapOptions, sanitizeProcessJavaToolOptions } from './java-runtime.js'
export { buildProfileConvertOptions, appendOdlExtraCliArgs, appendOdlHybridCliArgs } from './profiles.js'
export { parseOpenDataLoaderOutput } from './parse-output.js'
export {
  formatPdfPageMarker,
  splitPdfPagesByMarkers,
  formatPageRange,
} from './page-markers.js'
export type {
  DocumentPageText,
  DocumentParseProfile,
  DocumentParseRequest,
  DocumentParseResult,
  JavaRuntimeStatus,
  OdlConvertOverrides,
  OdlHybridConfig,
  OpenDataLoaderAvailability,
  PdfParserBackend,
} from './types.js'
