import { useCallback } from 'react'
import { IpcChannel } from '@toolman/shared'
import type { PendingAttachment } from './chat-attachments'
import { getClipboardImageFiles, readFileAsBase64 } from './clipboard-images'
import type { TranslateFn } from '../../i18n/I18nProvider'
import type { ClipboardEvent, Dispatch, SetStateAction } from 'react'

type StagedAttachmentResponse = {
  items: Array<{
    path: string
    name: string
    blobHash: string
    mimeType: string
    kind: 'file' | 'image'
  }>
  errors?: Array<{ path: string; message: string }>
}

function mergeStagedAttachments(
  prev: PendingAttachment[],
  staged: StagedAttachmentResponse,
): PendingAttachment[] {
  const next = [...prev]
  const existingPaths = new Set(prev.map((item) => item.path))

  for (const item of staged.items) {
    if (existingPaths.has(item.path)) continue
    existingPaths.add(item.path)
    next.push({
      path: item.path,
      name: item.name,
      blobHash: item.blobHash,
      mimeType: item.mimeType,
      kind: item.kind,
    })
  }

  return next
}

export function useMessageInputAttachments({
  disabled,
  defaultFilePath,
  onError,
  t,
  setPendingAttachments,
}: {
  disabled: boolean
  defaultFilePath?: string | null
  onError?: (message: string | null) => void
  t: TranslateFn
  setPendingAttachments: Dispatch<SetStateAction<PendingAttachment[]>>
}) {
  const applyStagedAttachments = useCallback(
    (staged: StagedAttachmentResponse) => {
      if (staged.errors?.length) {
        onError?.(
          staged.errors
            .map((item) => `${item.path.split(/[/\\]/).pop() ?? item.path}：${item.message}`)
            .join('\n'),
        )
      }
      if (staged.items.length === 0) return false

      setPendingAttachments((prev) => mergeStagedAttachments(prev, staged))
      return true
    },
    [onError, setPendingAttachments],
  )

  const stageAttachments = useCallback(
    async (input: { paths?: string[]; blobs?: Array<{ base64: string; mimeType: string; name?: string }> }) => {
      if (disabled) {
        onError?.(t('chat.input.uploadNeedSession'))
        return false
      }

      onError?.(null)
      try {
        const stageResult = await window.api.invoke(IpcChannel.ChatStageAttachments, input)
        if (!stageResult.ok) {
          onError?.(stageResult.error.message)
          return false
        }

        return applyStagedAttachments(stageResult.data as StagedAttachmentResponse)
      } catch (error) {
        onError?.(error instanceof Error ? error.message : t('chat.input.uploadFailed'))
        return false
      }
    },
    [applyStagedAttachments, disabled, onError, t],
  )

  const stagePathsAsAttachments = useCallback(
    async (paths: string[]) => {
      if (paths.length === 0) return
      await stageAttachments({ paths })
    },
    [stageAttachments],
  )

  const stageClipboardImages = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return false

      const blobs = await Promise.all(
        files.map(async (file) => ({
          base64: await readFileAsBase64(file),
          mimeType: file.type || 'image/png',
          name: file.name?.trim() || undefined,
        })),
      )

      return stageAttachments({ blobs })
    },
    [stageAttachments],
  )

  const handleUploadFiles = async () => {
    onError?.(null)
    try {
      const pickResult = await window.api.invoke(IpcChannel.DialogSelectFiles, {
        multiple: true,
        defaultPath: defaultFilePath ?? undefined,
      })
      if (!pickResult.ok) {
        onError?.(pickResult.error.message)
        return
      }

      const { paths } = pickResult.data as { paths: string[] }
      await stagePathsAsAttachments(paths)
    } catch (error) {
      onError?.(error instanceof Error ? error.message : t('chat.input.uploadFailed'))
    }
  }

  const handleInputPaste = useCallback(
    (event: ClipboardEvent<HTMLTextAreaElement>) => {
      const clipboardData = event.clipboardData
      if (!clipboardData) return

      const imageFiles = getClipboardImageFiles(clipboardData)
      if (imageFiles.length === 0) return

      event.preventDefault()
      void stageClipboardImages(imageFiles)
    },
    [stageClipboardImages],
  )

  return {
    stagePathsAsAttachments,
    stageClipboardImages,
    handleUploadFiles,
    handleInputPaste,
  }
}
