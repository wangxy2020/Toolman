const OAUTH_POPUP_HOSTS = new Set([
  'accounts.google.com',
  'appleid.apple.com',
  'www.googleapis.com',
  'securetoken.googleapis.com',
  'identitytoolkit.googleapis.com',
  'open.weixin.qq.com',
  'wx.qq.com',
  'long.open.weixin.qq.com',
])

export function isAuthOAuthPopupUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false
    if (OAUTH_POPUP_HOSTS.has(parsed.hostname)) return true
    if (parsed.hostname.endsWith('.firebaseapp.com')) return true
    if (parsed.hostname.endsWith('.google.com')) return true
    if (parsed.hostname.endsWith('.apple.com')) return true
    if (parsed.hostname.endsWith('.weixin.qq.com')) return true
    return false
  } catch {
    return false
  }
}
