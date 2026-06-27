/** Baked at release build time (`TOOLMAN_RELEASE_BUILD=1`). */
export function isReleaseDesktopBuild(): boolean {
  return typeof __TOOLMAN_RELEASE_BUILD__ !== 'undefined' && __TOOLMAN_RELEASE_BUILD__ === '1'
}

/** Show `.env.local` / TOOLMAN_* developer hints instead of end-user messaging. */
export function shouldShowAuthDevHints(isPackagedApp = false): boolean {
  return !isReleaseDesktopBuild() && !isPackagedApp
}
