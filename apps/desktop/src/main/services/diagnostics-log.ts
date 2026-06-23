import type { DiagnosticLogEntry, DiagnosticLogLevel } from '@toolman/shared'

const MAX_ENTRIES = 80

const buffer: DiagnosticLogEntry[] = []

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
  if (level === 'error') {
    console.error(payload)
  } else if (level === 'warn') {
    console.warn(payload)
  } else {
    console.info(payload)
  }
}

export function listDiagnosticEvents(limit = 30): DiagnosticLogEntry[] {
  const safeLimit = Math.max(1, Math.min(limit, MAX_ENTRIES))
  return buffer.slice(-safeLimit)
}

export function clearDiagnosticEvents(): void {
  buffer.length = 0
}
