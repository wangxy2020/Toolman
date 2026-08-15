import Constants from 'expo-constants'
import { Platform } from 'react-native'
import { hostnameFromHostOrUrl, isLoopbackHostname, isPrivateOrLoopbackHostname } from '@toolman/shared'

function locationHost(): string | null {
  if (typeof globalThis === 'undefined' || !('location' in globalThis)) return null
  const location = (globalThis as { location?: { host?: string; hostname?: string } }).location
  return location?.host || location?.hostname || null
}

export function pageHostname(): string {
  if (typeof globalThis === 'undefined' || !('location' in globalThis)) return ''
  return (globalThis as { location?: { hostname?: string } }).location?.hostname ?? ''
}

/** Hosted HTTPS web (Vercel) is not the desktop under test. */
export function isHostedWebPage(hostname: string = pageHostname()): boolean {
  return Platform.OS === 'web' && Boolean(hostname) && !isLoopbackHostname(hostname)
}

/** Hostnames of the machine serving this Expo bundle — usually the desktop under test. */
export function listDesktopDevHostnames(): string[] {
  const raw = [
    Constants.expoConfig?.hostUri,
    Constants.expoGoConfig?.debuggerHost,
    locationHost(),
    Platform.OS === 'android' ? '10.0.2.2' : null,
  ]
  const out: string[] = []
  for (const value of raw) {
    const host = value ? hostnameFromHostOrUrl(value) : null
    if (!host || out.includes(host) || !isPrivateOrLoopbackHostname(host)) continue
    out.push(host)
  }
  return out
}

export function shouldProbeLoopbackFromHosts(options: {
  platformOs: string
  pageHostname: string
  hostnames: string[]
}): boolean {
  if (options.platformOs === 'web') {
    return isLoopbackHostname(options.pageHostname)
  }
  if (options.hostnames.length === 0) return true
  return options.hostnames.every((host) => isLoopbackHostname(host))
}

/** Loopback is only the desktop when this JS is running on the same computer. */
export function shouldProbeLoopbackSyncHub(
  hostnames: string[] = listDesktopDevHostnames(),
): boolean {
  return shouldProbeLoopbackFromHosts({
    platformOs: Platform.OS,
    pageHostname: pageHostname(),
    hostnames,
  })
}
