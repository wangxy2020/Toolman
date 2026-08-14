import Constants from 'expo-constants'
import { Platform } from 'react-native'
import { hostnameFromHostOrUrl, isLoopbackHostname } from '@toolman/shared'

function locationHost(): string | null {
  if (typeof globalThis === 'undefined' || !('location' in globalThis)) return null
  const location = (globalThis as { location?: { host?: string; hostname?: string } }).location
  return location?.host || location?.hostname || null
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
    if (!host || out.includes(host)) continue
    out.push(host)
  }
  return out
}

/** Loopback is only the desktop when this JS is running on the same computer (Expo web). */
export function shouldProbeLoopbackSyncHub(
  hostnames: string[] = listDesktopDevHostnames(),
): boolean {
  if (Platform.OS === 'web') return true
  if (hostnames.length === 0) return true
  return hostnames.every((host) => isLoopbackHostname(host))
}
