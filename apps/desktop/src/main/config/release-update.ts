/**
 * Build-time release update defaults (injected by electron-vite `define`).
 */
declare const __TOOLMAN_UPDATE_FEED_URL__: string | undefined
declare const __TOOLMAN_UPDATE_CHANNEL__: string | undefined

export function getBakedUpdateFeedUrl(): string {
  return typeof __TOOLMAN_UPDATE_FEED_URL__ === 'string' ? __TOOLMAN_UPDATE_FEED_URL__ : ''
}

export function getBakedUpdateChannel(): string {
  return typeof __TOOLMAN_UPDATE_CHANNEL__ === 'string' ? __TOOLMAN_UPDATE_CHANNEL__ : ''
}
