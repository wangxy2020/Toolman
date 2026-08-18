/**
 * Toolman — Copyright (C) 2024–2026 Toolman Contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Source: https://github.com/wangxy2020/Toolman
 */
export const SHORT_PAIRING_CODE_LENGTH = 4
/** Skip 0/O/1/I/L so the four characters stay easy to read aloud. */
const SHORT_PAIRING_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

export function normalizePairingCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function isShortPairingCode(raw: string): boolean {
  const code = normalizePairingCode(raw)
  if (code.length !== SHORT_PAIRING_CODE_LENGTH) return false
  return [...code].every((ch) => SHORT_PAIRING_ALPHABET.includes(ch))
}

export function generateShortPairingCode(): string {
  const bytes = new Uint8Array(SHORT_PAIRING_CODE_LENGTH)
  globalThis.crypto.getRandomValues(bytes)
  let out = ''
  for (const value of bytes) {
    out += SHORT_PAIRING_ALPHABET[value % SHORT_PAIRING_ALPHABET.length]
  }
  return out
}

export function isLegacyDevicePairingOfferCode(raw: string): boolean {
  return raw.trim().startsWith('tm1.')
}

/** Hosted product pages that may talk to a same-computer desktop loopback hub. */
export function isToolmanPublicWebHostname(hostname: string): boolean {
  const host = hostname.trim().toLowerCase()
  return host === 'toolman.work' || host.endsWith('.toolman.work')
}
