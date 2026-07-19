import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  buildPmResourceCatalogPatchFingerprint,
  parsePmResourceCatalogPatchesFromText,
  type Message,
  type PmResourceCatalogPatch,
} from '@toolman/shared'

import { useI18n } from '../../i18n/useI18n'
import { getMessageText } from '../chat/message-utils'
import { pmApi } from './pm-api'
import {
  readSharedResourceCatalog,
  writeSharedResourceCatalog,
  type PmResourceRow,
} from './views/resource/pm-resource-catalog'

function storageKey(workspaceId: string): string {
  return `tm-pm-resource-catalog-patch-applied:${workspaceId}`
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

function patchOpCount(patches: readonly PmResourceCatalogPatch[]): number {
  return patches.reduce((sum, patch) => sum + patch.upserts.length + patch.removes.length, 0)
}

interface Props {
  workspaceId: string
  messages: Message[]
  onApplied?: () => void | Promise<void>
  onProjectsChange?: () => void | Promise<void>
}

/** Confirm resourceCatalogPatches JSON into「全部项目」or project catalogs. */
export function ProjectResourceCatalogApplyBar({
  workspaceId,
  messages,
  onApplied,
  onProjectsChange,
}: Props) {
  const { t } = useI18n()
  const [applying, setApplying] = useState(false)
  const [localApplied, setLocalApplied] = useState(false)
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
    () => parsePmResourceCatalogPatchesFromText(lastAssistantText).patches,
    [lastAssistantText],
  )
  const hasSuggestion = patches.length > 0
  const fingerprint = useMemo(
    () => (hasSuggestion ? buildPmResourceCatalogPatchFingerprint(patches) : ''),
    [hasSuggestion, patches],
  )

  useEffect(() => {
    if (!workspaceId || !fingerprint) {
      setLocalApplied(false)
      return
    }
    setLocalApplied(readAppliedSet(workspaceId).has(fingerprint))
  }, [fingerprint, workspaceId])

  const syncSharedLocal = useCallback(async () => {
    try {
      const remote = await pmApi.getSharedResourceCatalog(workspaceId)
      writeSharedResourceCatalog(
        workspaceId,
        remote.rows.map(
          (row): PmResourceRow => ({
            id: row.id,
            type: row.type,
            name: row.name,
            spec: row.spec ?? '',
            unit: row.unit,
            pricingUnit: row.pricingUnit?.trim() ? row.pricingUnit : row.unit,
            unitPrice: row.unitPrice,
            applicable: row.applicable,
            note: row.note ?? '',
            sortOrder: row.sortOrder,
            parentId: row.parentId ?? null,
          }),
        ),
      )
    } catch {
      // Keep whatever localStorage already has.
      void readSharedResourceCatalog(workspaceId)
    }
  }, [workspaceId])

  const handleApply = useCallback(async () => {
    if (!hasSuggestion || applyingRef.current) return
    applyingRef.current = true
    setApplying(true)
    try {
      const result = await pmApi.applyResourceCatalogPatches({
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
        t('projectManagerPage.agent.applyResourceCatalogSuccess', {
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

  if (localApplied) {
    return (
      <span className="tm-pm-agent-apply-text-btn tm-pm-agent-apply-text-btn--done">
        {t('projectManagerPage.agent.applyResourceCatalogDone')}
      </span>
    )
  }

  const count = patchOpCount(patches)
  return (
    <button
      type="button"
      className="tm-pm-agent-apply-text-btn"
      title={t('projectManagerPage.agent.applyResourceCatalog', { count: String(count) })}
      disabled={applying}
      onClick={() => void handleApply()}>
      {applying ? '…' : t('projectManagerPage.agent.applyConfirm')}
    </button>
  )
}
