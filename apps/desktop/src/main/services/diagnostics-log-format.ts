import type { DiagnosticLogEntry, DiagnosticLogLevel } from '@toolman/shared'

const PROVENANCE_EVENT_LABELS: Record<string, string> = {
  'app.start': 'App started',
  'app.renderer.ready': 'Renderer UI ready',
  'app.session.heartbeat': 'Session heartbeat',
  'app.diagnostics.view': 'Diagnostics panel opened',
  'app.about.view': 'About panel opened',
}

const LEVEL_PREFIX: Record<DiagnosticLogLevel, string> = {
  info: '',
  warn: 'WARN ',
  error: 'ERROR ',
}

function parseStructuredMessage(message: string): {
  headline: string
  context?: Record<string, unknown>
} {
  const jsonStart = message.indexOf(' {')
  if (jsonStart === -1) {
    return { headline: message }
  }
  const headline = message.slice(0, jsonStart).trim()
  try {
    const context = JSON.parse(message.slice(jsonStart + 1)) as Record<string, unknown>
    return { headline, context }
  } catch {
    return { headline: message }
  }
}

function formatBuildSummary(context: Record<string, unknown>): string {
  const parts: string[] = []
  if (typeof context.version === 'string') {
    parts.push(`v${context.version}`)
  }
  if (typeof context.gitCommit === 'string') {
    parts.push(`commit ${context.gitCommit}`)
  }
  return parts.length > 0 ? ` (${parts.join(', ')})` : ''
}

function formatContextSummary(context: Record<string, unknown>): string {
  const { buildFingerprint: _bf, buildId: _bi, ...rest } = context
  const keys = Object.keys(rest)
  if (keys.length === 0) return ''
  if (keys.length <= 4) {
    return keys.map((key) => `${key}=${String(rest[key])}`).join(', ')
  }
  return JSON.stringify(rest)
}

function formatSubsystemLabel(subsystem: string): string {
  if (subsystem === 'community.hub') return 'community'
  return subsystem
}

/** Human-readable line for dev terminal; persistent logs stay JSON. */
export function formatDiagnosticForConsole(entry: DiagnosticLogEntry): string {
  const levelPrefix = LEVEL_PREFIX[entry.level]
  const tag = formatSubsystemLabel(entry.subsystem)
  const { headline, context } = parseStructuredMessage(entry.message)

  if (entry.subsystem === 'provenance' && PROVENANCE_EVENT_LABELS[headline]) {
    const label = PROVENANCE_EVENT_LABELS[headline]
    const build = context ? formatBuildSummary(context) : ''
    return `[${tag}] ${levelPrefix}${label}${build}`
  }

  if (entry.subsystem === 'community.hub' && headline.startsWith('ready at ')) {
    return `[${tag}] ${levelPrefix}Hub ready at ${headline.slice('ready at '.length)}`
  }

  if (entry.subsystem === 'p2p' && headline.startsWith('peer trust prompt:')) {
    return `[${tag}] ${levelPrefix}Peer trust prompt: ${headline.slice('peer trust prompt:'.length).trim()}`
  }

  if (context && Object.keys(context).length > 0) {
    const summary = formatContextSummary(context)
    if (summary) {
      return `[${tag}] ${levelPrefix}${headline} — ${summary}`
    }
  }

  return `[${tag}] ${levelPrefix}${entry.message}`
}

export function consoleDedupKey(entry: DiagnosticLogEntry): string {
  return `${entry.subsystem}\0${entry.level}\0${entry.message}`
}
