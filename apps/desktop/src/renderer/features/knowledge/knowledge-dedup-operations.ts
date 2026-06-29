import { IpcChannel } from '@toolman/shared'
import type { PendingDedupDelete } from './knowledge-dedup-types'
import type { TranslateFn } from '../../i18n/I18nProvider'

export async function openDedupPath(path: string): Promise<void> {
  await window.api.invoke(IpcChannel.AppShellOpenPath, { path })
}

export async function openDedupParentFolder(path: string): Promise<void> {
  const normalized = path.replace(/[/\\]+$/, '')
  const index = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'))
  if (index <= 0) return
  await openDedupPath(normalized.slice(0, index))
}

export async function deleteDedupFiles(
  workspaceId: string,
  pendingDelete: PendingDedupDelete,
  t: TranslateFn,
): Promise<{ ok: true; clearSelection: boolean } | { ok: false; error: string }> {
  const filePaths = pendingDelete.kind === 'selected' ? pendingDelete.paths : [pendingDelete.path]

  const result = await window.api.invoke(IpcChannel.KnowledgeFileDedupDelete, {
    workspaceId,
    filePaths,
  })

  if (!result.ok) {
    return { ok: false, error: result.error.message }
  }

  if (pendingDelete.kind === 'selected') {
    const data = result.data as { deleted: number; failed: Array<{ path: string; message: string }> }
    if (data.failed.length > 0) {
      return {
        ok: false,
        error: t('knowledgePage.dedup.deletePartialResult', {
          deleted: data.deleted,
          failed: data.failed.length,
        }),
      }
    }
  }

  return { ok: true, clearSelection: pendingDelete.kind === 'selected' }
}
