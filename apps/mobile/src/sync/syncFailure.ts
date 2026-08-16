export function classifySyncFailure(error: unknown): 'offline' | 'error' {
  const message = error instanceof Error ? error.message : String(error)
  const name = error instanceof Error ? error.name : ''
  if (
    name === 'ForeignSyncHubError' ||
    /无法连接|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|Network request failed|Failed to fetch|NetworkError|Load failed|unreachable|401|unauthorized|未授权|配对令牌|SYNC_HUB_FOREIGN_IDENTITY|identity mismatch|同步身份/i.test(
      message,
    )
  ) {
    return 'offline'
  }
  return 'error'
}

export function formatSyncFailureMessage(error: unknown): string {
  const name = error instanceof Error ? error.name : ''
  const message = error instanceof Error ? error.message : String(error)
  if (name === 'ForeignSyncHubError' || /SYNC_HUB_FOREIGN_IDENTITY/i.test(message)) {
    return '检测到其他账号的同步节点，已跳过。请确认手机与桌面登录同一账号，并开启桌面「与移动端同步」。'
  }
  if (/403|identity mismatch|同步身份/i.test(message)) {
    return '同步身份不匹配。请重启桌面端后再试（需加载最新 Sync Hub）；局域网请开启「允许局域网访问」并填写配对令牌。'
  }
  if (/401|unauthorized|未授权|配对令牌/i.test(message)) {
    return '同步未授权。请在「用户信息 → 令牌同步」填写与桌面一致的配对令牌，并开启桌面局域网同步。'
  }
  return message
}
