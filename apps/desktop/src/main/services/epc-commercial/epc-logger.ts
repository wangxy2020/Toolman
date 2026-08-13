import { logStructured } from '../structured-log.service'

type EpcLogger = {
  info: (message: string, meta?: Record<string, unknown>) => void
  warn: (message: string, meta?: Record<string, unknown>) => void
  error: (message: string, meta?: Record<string, unknown>) => void
}

export const loggerService = {
  withContext(context: string): EpcLogger {
    return {
      info(message, meta) {
        logStructured(context, 'info', message, meta)
      },
      warn(message, meta) {
        logStructured(context, 'warn', message, meta)
      },
      error(message, meta) {
        logStructured(context, 'error', message, meta)
      },
    }
  },
}
