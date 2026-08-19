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
    return true
  }
  if (options.hostnames.length === 0) return true
  return options.hostnames.every((host) => isLoopbackHostname(host))
}

/** Loopback is the desktop when this JS runs on the same computer, including hosted web. */
export function shouldProbeLoopbackSyncHub(
  hostnames: string[] = listDesktopDevHostnames(),
): boolean {
  return shouldProbeLoopbackFromHosts({
    platformOs: Platform.OS,
    pageHostname: pageHostname(),
    hostnames,
  })
}

/** Public catalog: hosted pages try the official Hub first, then this computer's desktop sidecar. */
export function communityHubProbeFlags(): {
  packagerHostnames: string[]
  includeLoopback: boolean
  includeOfficialHub: boolean
  officialHubFirst: boolean
} {
  const packagerHostnames = listDesktopDevHostnames()
  const hosted = isHostedWebPage()
  return {
    packagerHostnames,
    includeLoopback: shouldProbeLoopbackSyncHub(packagerHostnames),
    includeOfficialHub: true,
    officialHubFirst: hosted,
  }
}
