import { emptyP2pPathCounters, formatP2pPathMetrics } from '@toolman/shared'
import { logStructured } from '../structured-log.service'

const counters = emptyP2pPathCounters()

export function recordP2pPathMetric(
  kind: 'meshSend' | 'mailboxPut' | 'mailboxPullApplied' | 'joinDirectOk' | 'joinFailed',
  catchUpMs?: number,
): void {
  if (kind === 'meshSend') counters.meshSends += 1
  if (kind === 'mailboxPut') counters.mailboxPuts += 1
  if (kind === 'mailboxPullApplied') counters.mailboxPullApplied += 1
  if (kind === 'joinDirectOk') counters.joinDirectOk += 1
  if (kind === 'joinFailed') counters.joinFailed += 1
  if (catchUpMs != null && Number.isFinite(catchUpMs)) {
    counters.lastCatchUpMs = Math.max(0, Math.round(catchUpMs))
  }
}

export function logP2pPathMetrics(): void {
  logStructured('p2p', 'info', `path metrics ${formatP2pPathMetrics(counters)}`)
}
