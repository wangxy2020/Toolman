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
    return (
      '同步未授权。本机/局域网网页请填写与桌面一致的「局域网配对令牌」；' +
      '若已粘贴设备配对码，请确认桌面 Sync Hub 已开启且浏览器能访问（本机预览最稳）。' +
      '托管 HTTPS 网页无法直连局域网 Hub，需桌面在线可达的投递通道。'
    )
  }
  return message
}
