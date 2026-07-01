type EpcLogger = {
  info: (message: string, meta?: Record<string, unknown>) => void
  warn: (message: string, meta?: Record<string, unknown>) => void
  error: (message: string, meta?: Record<string, unknown>) => void
}

export const loggerService = {
  withContext(context: string): EpcLogger {
    return {
      info(message, meta) {
        console.info(`[${context}] ${message}`, meta ?? '')
      },
      warn(message, meta) {
        console.warn(`[${context}] ${message}`, meta ?? '')
      },
      error(message, meta) {
        console.error(`[${context}] ${message}`, meta ?? '')
      },
    }
  },
}
