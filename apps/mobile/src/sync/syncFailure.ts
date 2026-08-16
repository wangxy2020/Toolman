export function classifySyncFailure(error: unknown): 'offline' | 'error' {
  const message = error instanceof Error ? error.message : String(error)
  if (
    /无法连接|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|Network request failed|Failed to fetch|NetworkError|Load failed|unreachable|401|unauthorized|未授权|配对令牌|SYNC_HUB_FOREIGN_IDENTITY|identity mismatch/i.test(
      message,
    )
  ) {
    return 'offline'
  }
  return 'error'
}

export function formatSyncFailureMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
