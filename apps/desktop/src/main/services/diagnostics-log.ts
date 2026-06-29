import type { DiagnosticLogEntry, DiagnosticLogLevel } from '@toolman/shared'
import {
  consoleDedupKey,
  formatDiagnosticForConsole,
} from './diagnostics-log-format'
import { appendPersistentDiagnosticLine } from './local-operations.service'

const MAX_ENTRIES = 80

const LEVEL_RANK: Record<DiagnosticLogLevel, number> = {
  info: 0,
  warn: 1,
  error: 2,
}

/** info 级别中仍需打印到终端的子系统（其余 info 仅写入诊断缓冲） */
const INFO_CONSOLE_ALLOWLIST: Array<{
  subsystem: string
  matches: (message: string) => boolean
}> = [
  {
    subsystem: 'provenance',
    matches: (message) => !message.startsWith('app.session.heartbeat'),
  },
  { subsystem: 'community.hub', matches: (message) => message.startsWith('ready at') },
  { subsystem: 'p2p', matches: (message) => message.startsWith('peer trust prompt:') },
]

const buffer: DiagnosticLogEntry[] = []
let lastConsolePayload = ''
let lastConsoleAt = 0

function resolveConsoleMinLevel(): DiagnosticLogLevel {
  const raw = process.env.TOOLMAN_CONSOLE_LOG_LEVEL?.trim().toLowerCase()
  if (raw === 'info' || raw === 'warn' || raw === 'error') {
    return raw
  }
  return 'warn'
}

function shouldEmitInfoToConsole(subsystem: string, message: string): boolean {
  return INFO_CONSOLE_ALLOWLIST.some(
    (rule) => rule.subsystem === subsystem && rule.matches(message),
  )
}

function shouldEmitToConsole(entry: DiagnosticLogEntry): boolean {
  if (entry.level === 'error' || entry.level === 'warn') {
    return true
  }
  const minLevel = resolveConsoleMinLevel()
  if (LEVEL_RANK[entry.level] >= LEVEL_RANK[minLevel]) {
    return true
  }
  return shouldEmitInfoToConsole(entry.subsystem, entry.message)
}

function emitToConsole(entry: DiagnosticLogEntry): void {
  const line = formatDiagnosticForConsole(entry)
  const dedupKey = consoleDedupKey(entry)
  const now = Date.now()
  if (dedupKey === lastConsolePayload && now - lastConsoleAt < 1500) {
    return
  }
  lastConsolePayload = dedupKey
  lastConsoleAt = now

  if (entry.level === 'error') {
    console.error(line)
  } else if (entry.level === 'warn') {
    console.warn(line)
  } else {
    console.info(line)
  }
}

export function recordDiagnosticEvent(
  subsystem: string,
  level: DiagnosticLogLevel,
  message: string,
): void {
  const entry: DiagnosticLogEntry = {
    at: Date.now(),
    subsystem,
    level,
    message,
  }
  buffer.push(entry)
  if (buffer.length > MAX_ENTRIES) {
    buffer.shift()
  }

  const payload = JSON.stringify({ type: 'toolman.diagnostic', ...entry })
  appendPersistentDiagnosticLine(payload)
  if (shouldEmitToConsole(entry)) {
    emitToConsole(entry)
  }
}

export function listDiagnosticEvents(limit = 30): DiagnosticLogEntry[] {
  const safeLimit = Math.max(1, Math.min(limit, MAX_ENTRIES))
  return buffer.slice(-safeLimit)
}

export function clearDiagnosticEvents(): void {
  buffer.length = 0
  lastConsolePayload = ''
  lastConsoleAt = 0
}
