import { useCallback } from 'react'
import { IpcChannel } from '@toolman/shared'
import type { PendingAttachment } from './chat-attachments'
import type { TranslateFn } from '../../i18n/I18nProvider'
import type { Dispatch, SetStateAction } from 'react'

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
  const stagePathsAsAttachments = useCallback(
    async (paths: string[]) => {
      if (paths.length === 0) return

      if (disabled) {
        onError?.(t('chat.input.uploadNeedSession'))
        return
      }

      onError?.(null)
      try {
        const stageResult = await window.api.invoke(IpcChannel.ChatStageAttachments, { paths })
        if (!stageResult.ok) {
          onError?.(stageResult.error.message)
          return
        }

        const staged = stageResult.data as {
          items: Array<{
            path: string
            name: string
            blobHash: string
            mimeType: string
            kind: 'file' | 'image'
          }>
          errors?: Array<{ path: string; message: string }>
        }

        if (staged.errors?.length) {
          onError?.(
            staged.errors
              .map((item) => `${item.path.split(/[/\\]/).pop() ?? item.path}：${item.message}`)
              .join('\n'),
          )
        }
        if (staged.items.length === 0) return

        setPendingAttachments((prev) => {
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
        })
      } catch (error) {
        onError?.(error instanceof Error ? error.message : t('chat.input.uploadFailed'))
      }
    },
    [disabled, onError, setPendingAttachments, t],
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

  return { stagePathsAsAttachments, handleUploadFiles }
}
