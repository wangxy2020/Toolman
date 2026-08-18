/**
 * Toolman — Copyright (C) 2024–2026 Toolman Contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Source: https://github.com/wangxy2020/Toolman
 */
import { base64ToBytes, bytesToBase64, type KnowledgeSnapshot, type KnowledgeSnapshotFile } from '@toolman/shared'
import { Linking, Platform } from 'react-native'
import { loadKnowledgeSnapshot, saveKnowledgeSnapshot } from '../storage/knowledgeSnapshot'
import { createReachableMobileSyncClient } from '../sync/mobileSync'
import type { KnowledgeFileItem } from './knowledgeSidebar'
import {
  knowledgeFileMime,
  knowledgeFileUnavailableMessage,
  knowledgeOpenUrl,
} from './openKnowledgeDocument-utils'

export {
  knowledgeFileMime,
  knowledgeFileUnavailableMessage,
  knowledgeOpenUrl,
} from './openKnowledgeDocument-utils'

function findSnapshotFile(
  snapshot: KnowledgeSnapshot,
  documentId: string,
): KnowledgeSnapshotFile | undefined {
  return snapshot.files.find((item) => item.documentId === documentId)
}

async function persistFileBytes(
  snapshot: KnowledgeSnapshot,
  file: KnowledgeSnapshotFile,
  bytes: Uint8Array,
): Promise<void> {
  await saveKnowledgeSnapshot({
    ...snapshot,
    files: snapshot.files.map((item) =>
      item.documentId === file.documentId && item.kbId === file.kbId
        ? {
            ...item,
            contentB64: bytesToBase64(bytes),
            sizeBytes: bytes.byteLength,
            omitted: false,
            omitReason: undefined,
          }
        : item,
    ),
  })
}

async function loadFileBytes(documentId: string): Promise<{
  bytes: Uint8Array
  fileName: string
  mimeType: string
}> {
  const snapshot = await loadKnowledgeSnapshot()
  if (!snapshot) throw new Error('尚未同步到文件内容，请先同步')
  const file = findSnapshotFile(snapshot, documentId)
  const blocked = knowledgeFileUnavailableMessage(file)
  if (blocked) throw new Error(blocked)
  if (file?.contentB64) {
    return {
      bytes: base64ToBytes(file.contentB64),
      fileName: file.fileName,
      mimeType: knowledgeFileMime(file.fileName, file.mimeType),
    }
  }
  const kbId = file?.kbId ?? snapshot.documents.find((doc) => doc.id === documentId)?.kbId
  if (!kbId) throw new Error('找不到这份文件')
  try {
    const client = await createReachableMobileSyncClient()
    const bytes = await client.downloadKnowledgeFile(kbId, documentId)
    try {
      if (file && bytes.byteLength <= 8 * 1024 * 1024) {
        await persistFileBytes(snapshot, file, bytes)
      }
    } catch {
      // Opening should still work if IndexedDB quota is full.
    }
    const fileName = file?.fileName ?? documentId
    return {
      bytes,
      fileName,
      mimeType: knowledgeFileMime(fileName, file?.mimeType),
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    if (/401/.test(detail)) {
      throw new Error('下载未授权，请在「用户信息 → 令牌同步」填写桌面 4 位配对码')
    }
    if (/404/.test(detail)) {
      throw new Error('桌面端找不到该文件，请确认文件仍在同步知识库中')
    }
    if (/无法连接/.test(detail)) throw new Error(detail)
    throw new Error(`无法下载文件：${detail}`)
  }
}

function presentBytes(bytes: Uint8Array, fileName: string, mimeType: string): void {
  if (typeof document === 'undefined' || typeof URL === 'undefined') {
    throw new Error('当前环境无法打开文件')
  }
  const blob = new Blob([bytes], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const tab = typeof window !== 'undefined' ? window.open(url, '_blank', 'noopener,noreferrer') : null
  if (!tab) {
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    link.rel = 'noopener'
    document.body.appendChild(link)
    link.click()
    link.remove()
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export async function openKnowledgeDocument(doc: KnowledgeFileItem): Promise<void> {
  const href = knowledgeOpenUrl(doc)
  if (href) {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.open(href, '_blank', 'noopener,noreferrer')
      return
    }
    await Linking.openURL(href)
    return
  }
  const pendingTab =
    Platform.OS === 'web' && typeof window !== 'undefined'
      ? window.open('about:blank', '_blank')
      : null
  try {
    const { bytes, fileName, mimeType } = await loadFileBytes(doc.id)
    if (pendingTab && typeof URL !== 'undefined') {
      const blob = new Blob([bytes], { type: mimeType })
      const url = URL.createObjectURL(blob)
      pendingTab.location.replace(url)
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
      return
    }
    presentBytes(bytes, fileName, mimeType)
  } catch (error) {
    pendingTab?.close()
    throw error
  }
}
