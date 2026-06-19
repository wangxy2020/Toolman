import { IpcChannel } from '@toolman/shared'

export async function saveGroupKnowledgeFileAsCopy(
  sourcePath: string,
  fileName: string,
): Promise<boolean> {
  const result = await window.api.invoke(IpcChannel.DialogSaveFile, {
    sourcePath,
    defaultFileName: fileName,
  })

  if (!result.ok) return false

  const data = result.data as { saved: boolean }
  return data.saved
}
