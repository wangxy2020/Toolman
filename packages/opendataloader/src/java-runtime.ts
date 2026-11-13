import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { JavaRuntimeStatus } from './types.js'

const execFileAsync = promisify(execFile)

const JAVA_VERSION_RE = /version "([^"]+)"/
const INVALID_JAVA_TOOL_OPTIONS = new Set(['undefined', 'null'])

/** Drop placeholder env values that break `java` (e.g. JAVA_TOOL_OPTIONS=undefined). */
export function normalizeJavaToolOptions(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  if (!trimmed) return undefined
  if (INVALID_JAVA_TOOL_OPTIONS.has(trimmed.toLowerCase())) return undefined
  return trimmed
}

export function sanitizeProcessJavaToolOptions(): void {
  const normalized = normalizeJavaToolOptions(process.env.JAVA_TOOL_OPTIONS)
  if (normalized) {
    process.env.JAVA_TOOL_OPTIONS = normalized
    return
  }
  if (process.env.JAVA_TOOL_OPTIONS !== undefined) {
    delete process.env.JAVA_TOOL_OPTIONS
  }
}

function buildJavaExecEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env }
  const normalized = normalizeJavaToolOptions(process.env.JAVA_TOOL_OPTIONS)
  if (normalized) {
    env.JAVA_TOOL_OPTIONS = normalized
  } else {
    delete env.JAVA_TOOL_OPTIONS
  }
  return env
}

const javaRuntimeCache = new Map<string, { at: number; status: JavaRuntimeStatus }>()
const JAVA_RUNTIME_CACHE_MS = 10 * 60 * 1000

export async function detectJavaRuntime(
  javaCommand = 'java',
  timeoutMs = 5_000,
): Promise<JavaRuntimeStatus> {
  sanitizeProcessJavaToolOptions()
  const cached = javaRuntimeCache.get(javaCommand)
  if (cached && Date.now() - cached.at < JAVA_RUNTIME_CACHE_MS) {
    return cached.status
  }
  try {
    const { stdout, stderr } = await execFileAsync(javaCommand, ['-version'], {
      timeout: timeoutMs,
      env: buildJavaExecEnv(),
    })
    const combined = `${stdout}\n${stderr}`
    const match = combined.match(JAVA_VERSION_RE)
    if (!match?.[1]) {
      const status = { available: false as const, error: '无法解析 Java 版本' }
      javaRuntimeCache.set(javaCommand, { at: Date.now(), status })
      return status
    }
    const status = { available: true as const, version: match[1] }
    javaRuntimeCache.set(javaCommand, { at: Date.now(), status })
    return status
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Java 不可用'
    const status =
      message.includes('ENOENT')
        ? { available: false as const, error: '未找到 java 命令，请安装 Java 11+' }
        : { available: false as const, error: message }
    // Cache failures briefly so a missing java does not spam -version on every page batch.
    javaRuntimeCache.set(javaCommand, { at: Date.now(), status })
    return status
  }
}

/** Test helper — drop cached java -version probes. */
export function clearJavaRuntimeCache(): void {
  javaRuntimeCache.clear()
}

export function resolveJavaHeapOptions(maxHeapMb = 768): NodeJS.ProcessEnv {
  const flag = `-Xmx${maxHeapMb}m`
  const existing = normalizeJavaToolOptions(process.env.JAVA_TOOL_OPTIONS)
  if (!existing) {
    return { JAVA_TOOL_OPTIONS: flag }
  }
  if (existing.includes('-Xmx')) {
    return { JAVA_TOOL_OPTIONS: existing }
  }
  return { JAVA_TOOL_OPTIONS: `${existing} ${flag}` }
}
