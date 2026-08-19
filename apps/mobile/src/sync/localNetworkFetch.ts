/**
 * Toolman — Copyright (C) 2024–2026 Toolman Contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Source: https://github.com/wangxy2020/Toolman
 */
import { hostnameOfBaseUrl, isLoopbackHostname, isPrivateOrLoopbackHostname } from '@toolman/shared'

/** Chrome Local Network Access / mixed-content exemption for public HTTPS → loopback. */
export type FetchTargetAddressSpace = 'loopback' | 'local' | 'public' | 'unknown'

type LocalNetworkRequestInit = RequestInit & {
  targetAddressSpace?: FetchTargetAddressSpace
}

function hrefOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.href
  return input.url
}

function pageHostname(): string {
  if (typeof globalThis === 'undefined' || !('location' in globalThis)) return ''
  return (globalThis as { location?: { hostname?: string } }).location?.hostname ?? ''
}

/** Public HTTPS origin (not localhost). Kept free of react-native so Vitest can import this helper. */
export function isHostedPublicWebPage(hostname: string = pageHostname()): boolean {
  return Boolean(hostname) && !isLoopbackHostname(hostname)
}

/**
 * Public hosted pages (`https://www.toolman.work`) talking to `http://127.0.0.1`
 * need `targetAddressSpace` so Chrome can skip mixed-content blocking and show
 * the Local Network Access permission prompt. Local Expo preview is already
 * loopback→loopback and does not need this.
 */
export function targetAddressSpaceForUrl(raw: string): FetchTargetAddressSpace | undefined {
  const trimmed = raw.trim()
  if (!trimmed) return undefined
  if (trimmed.startsWith('/') || trimmed.startsWith('./') || trimmed.startsWith('../')) {
    return undefined
  }
  if (!/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return undefined
  try {
    const host = hostnameOfBaseUrl(trimmed) || new URL(trimmed).hostname
    if (isLoopbackHostname(host)) return 'loopback'
    if (isPrivateOrLoopbackHostname(host)) return 'local'
    return undefined
  } catch {
    return undefined
  }
}

/** Give the user time to click Allow on Chrome's local-network prompt. */
export function localNetworkRequestTimeoutMs(url: string, fallbackMs = 2500): number {
  if (isHostedPublicWebPage() && targetAddressSpaceForUrl(url)) return 25_000
  return fallbackMs
}

export function fetchWithLocalNetwork(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const space = targetAddressSpaceForUrl(hrefOf(input))
  const next: LocalNetworkRequestInit = { ...init }
  if (space && next.targetAddressSpace == null) next.targetAddressSpace = space
  return globalThis.fetch.call(globalThis, input, next as RequestInit)
}

export const boundFetch: typeof fetch = (input, init) => fetchWithLocalNetwork(input, init)
