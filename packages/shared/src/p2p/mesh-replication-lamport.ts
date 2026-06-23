export const LAMPORT_PAYLOAD_KEY = '_lamport'

export function extractLamportFromPayload(payload: Record<string, unknown>): number | undefined {
  const raw = payload[LAMPORT_PAYLOAD_KEY]
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : undefined
}
