import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  buildPmCostCatalogPatchFingerprint,
  parsePmCostCatalogPatchesFromText,
  type Message,
  type PmCostCatalogPatch,
} from '@toolman/shared'

import { useI18n } from '../../i18n/useI18n'
import { getMessageText } from '../chat/message-utils'
import { pmApi } from './pm-api'
import {
  isPmAgentApplyDiscarded,
  markPmAgentApplyDiscarded,
} from './pm-agent-apply-discard'
import {
  readSharedCostCatalog,
  writeSharedCostCatalog,
  type PmCostRow,
} from './views/cost/pm-cost-catalog'

function storageKey(workspaceId: string): string {
  return `tm-pm-cost-catalog-patch-applied:${workspaceId}`
}

function readAppliedSet(workspaceId: string): Set<string> {
  try {
    const raw = sessionStorage.getItem(storageKey(workspaceId))
    if (!raw) return new Set()
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((entry): entry is string => typeof entry === 'string'))
  } catch {
    return new Set()
  }
}

function writeAppliedSet(workspaceId: string, set: Set<string>): void {
  try {
    sessionStorage.setItem(storageKey(workspaceId), JSON.stringify([...set]))
  } catch {
    // ignore quota / private mode
  }
}

function patchOpCount(patches: readonly PmCostCatalogPatch[]): number {
  return patches.reduce((sum, patch) => sum + patch.upserts.length + patch.removes.length, 0)
}

interface Props {
  workspaceId: string
  messages: Message[]
  onApplied?: () => void | Promise<void>
  onProjectsChange?: () => void | Promise<void>
}

/** Confirm costCatalogPatches JSON into「全部项目」or project price lists. */
export function ProjectCostCatalogApplyBar({
  workspaceId,
  messages,
  onApplied,
  onProjectsChange,
}: Props) {
  const { t } = useI18n()
  const [applying, setApplying] = useState(false)
  const [localApplied, setLocalApplied] = useState(false)
  const [discarded, setDiscarded] = useState(false)
  const applyingRef = useRef(false)

  const lastAssistant = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index]
      if (message?.role === 'assistant') return message
    }
    return null
  }, [messages])

  const lastAssistantText = lastAssistant ? getMessageText(lastAssistant) : ''
  const patches = useMemo(
    () => parsePmCostCatalogPatchesFromText(lastAssistantText).patches,
    [lastAssistantText],
  )
  const hasSuggestion = patches.length > 0
  const fingerprint = useMemo(
    () => (hasSuggestion ? buildPmCostCatalogPatchFingerprint(patches) : ''),
    [hasSuggestion, patches],
  )

  useEffect(() => {
    if (!workspaceId || !fingerprint) {
      setLocalApplied(false)
      setDiscarded(false)
      return
    }
    setLocalApplied(readAppliedSet(workspaceId).has(fingerprint))
    setDiscarded(isPmAgentApplyDiscarded(workspaceId, 'costCatalog', fingerprint))
  }, [fingerprint, workspaceId])

  const handleDiscard = useCallback(() => {
    if (!fingerprint) return
    markPmAgentApplyDiscarded(workspaceId, 'costCatalog', fingerprint)
    setDiscarded(true)
  }, [fingerprint, workspaceId])

  const syncSharedLocal = useCallback(async () => {
    try {
      const remote = await pmApi.getSharedCostCatalog(workspaceId)
      writeSharedCostCatalog(
        workspaceId,
        remote.rows.map(
          (row): PmCostRow => ({
            id: row.id,
            type: row.type,
            code: row.code ?? '',
            name: row.name,
            featureDescription: row.featureDescription ?? '',
            unit: row.unit,
            quantity: row.quantity,
            unitPrice: row.unitPrice,
            applicable: row.applicable,
            note: row.note ?? '',
            sectionalWork: row.sectionalWork ?? '',
            sectionCode: row.sectionCode ?? '',
            sectionNote: row.sectionNote ?? '',
            sortOrder: row.sortOrder,
            parentId: row.parentId ?? null,
          }),
        ),
      )
    } catch {
      // Keep whatever localStorage already has.
      void readSharedCostCatalog(workspaceId)
    }
  }, [workspaceId])

  const handleApply = useCallback(async () => {
    if (!hasSuggestion || applyingRef.current) return
    applyingRef.current = true
    setApplying(true)
    try {
      const result = await pmApi.applyCostCatalogPatches({
        workspaceId,
        patches: patches.map((patch) => ({
          target: String(patch.target),
          upserts: patch.upserts,
          removes: patch.removes.map((entry) => ({
            type: entry.type,
            name: entry.name,
          })),
        })),
      })
      if (result.sharedChanged) {
        await syncSharedLocal()
      }
      const next = readAppliedSet(workspaceId)
      next.add(fingerprint)
      writeAppliedSet(workspaceId, next)
      setLocalApplied(true)
      await onProjectsChange?.()
      await onApplied?.()
      window.alert(
        t('projectManagerPage.agent.applyCostCatalogSuccess', {
          count: String(result.changedCount),
        }),
      )
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err))
    } finally {
      applyingRef.current = false
      setApplying(false)
    }
  }, [
    fingerprint,
    hasSuggestion,
    onApplied,
    onProjectsChange,
    patches,
    syncSharedLocal,
    t,
    workspaceId,
  ])

  if (!lastAssistant || !hasSuggestion) return null

  if (discarded) return null

  if (localApplied) {
    return (
      <span className="tm-pm-agent-apply-actions">
        <span className="tm-pm-agent-apply-text-btn tm-pm-agent-apply-text-btn--done">
          {t('projectManagerPage.agent.applyCostCatalogDone')}
        </span>
        <button
          type="button"
          className="tm-pm-agent-apply-text-btn tm-pm-agent-apply-text-btn--muted"
          title={t('projectManagerPage.agent.applyDiscard')}
          onClick={handleDiscard}
        >
          {t('projectManagerPage.agent.applyDiscard')}
        </button>
      </span>
    )
  }

  const count = patchOpCount(patches)
  return (
    <span className="tm-pm-agent-apply-actions">
      <button
        type="button"
        className="tm-pm-agent-apply-text-btn"
        title={t('projectManagerPage.agent.applyCostCatalog', { count: String(count) })}
        disabled={applying}
        onClick={() => void handleApply()}
      >
        {applying ? '…' : t('projectManagerPage.agent.applyConfirm')}
      </button>
      <button
        type="button"
        className="tm-pm-agent-apply-text-btn tm-pm-agent-apply-text-btn--muted"
        title={t('projectManagerPage.agent.applyDiscard')}
        disabled={applying}
        onClick={handleDiscard}
      >
        {t('projectManagerPage.agent.applyDiscard')}
      </button>
    </span>
  )
}
