export class AuthLoginError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message)
    this.name = 'AuthLoginError'
  }
}

function readNestedErrorMessage(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) {
    return value.trim()
  }

  if (typeof value !== 'object' || value === null) {
    return null
  }

  const record = value as Record<string, unknown>
  const directMessage = readNestedErrorMessage(record.message)
  if (directMessage) return directMessage

  if (Array.isArray(record.errors)) {
    for (const item of record.errors) {
      const nested = readNestedErrorMessage(item)
      if (nested) return nested
    }
  }

  return null
}

export function readAuthServiceErrorMessage(error: unknown): string | null {
  if (error instanceof AuthLoginError) {
    return error.message
  }

  if (error instanceof Error) {
    return error.message.trim() || null
  }

  return readNestedErrorMessage(error)
}
