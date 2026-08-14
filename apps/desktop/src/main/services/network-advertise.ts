import { networkInterfaces } from 'node:os'

function isIPv4(addr: { family: string | number; internal: boolean }): boolean {
  return !addr.internal && (addr.family === 'IPv4' || addr.family === 4)
}

/** Non-loopback IPv4 addresses (LAN + Tailscale CGNAT 100.x). */
export function listNonInternalIPv4Addresses(): string[] {
  const out: string[] = []
  for (const addrs of Object.values(networkInterfaces())) {
    for (const addr of addrs ?? []) {
      if (!isIPv4(addr)) continue
      if (!out.includes(addr.address)) out.push(addr.address)
    }
  }
  return out
}

export function advertisedHttpUrls(port: number): string[] {
  const hosts = ['127.0.0.1', ...listNonInternalIPv4Addresses()]
  return hosts.map((host) => `http://${host}:${port}`)
}
