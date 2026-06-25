import type { DiagnosticLogLevel } from '@toolman/shared'
import { recordDiagnosticEvent } from './diagnostics-log'

export type StructuredLogLevel = DiagnosticLogLevel

export function logStructured(
  subsystem: string,
  level: StructuredLogLevel,
  message: string,
  context?: Record<string, unknown>,
): void {
  const suffix =
    context && Object.keys(context).length > 0 ? ` ${JSON.stringify(context)}` : ''
  recordDiagnosticEvent(subsystem, level, `${message}${suffix}`)
}

export const appLog = {
  info: (message: string, context?: Record<string, unknown>) =>
    logStructured('app', 'info', message, context),
  warn: (message: string, context?: Record<string, unknown>) =>
    logStructured('app', 'warn', message, context),
  error: (message: string, context?: Record<string, unknown>) =>
    logStructured('app', 'error', message, context),
}
