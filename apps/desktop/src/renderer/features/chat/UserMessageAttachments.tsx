import { IpcChannel, type ContentBlock } from '@toolman/shared'
import { IconPaperclip } from '../../components/icons'
import { MessageImageBlock } from './MessageImageBlock'

interface Props {
  blocks: ContentBlock[]
}

async function openAttachment(path: string) {
  await window.api.invoke(IpcChannel.AppShellOpenPath, { path })
}

export function UserMessageAttachments({ blocks }: Props) {
  const files = blocks.filter((block) => block.type === 'file')
  const images = blocks.filter((block) => block.type === 'image')

  if (files.length === 0 && images.length === 0) return null

  return (
    <div className="tm-user-message-attachments">
      {files.map((file, index) => (
        <button
          key={`${file.path}-${index}`}
          type="button"
          className="tm-user-message-attachment-link"
          title={file.path}
          onClick={() => void openAttachment(file.path)}
        >
          <IconPaperclip size={14} />
          <span>附件：{file.name}</span>
        </button>
      ))}
      {images.map((image, index) =>
        image.blobHash?.trim() ? (
          <div key={`${image.blobHash}-${index}`} className="tm-user-message-attachment-image">
            <MessageImageBlock
              blobHash={image.blobHash}
              mimeType={image.mimeType}
              alt={image.alt}
              path={image.path}
            />
          </div>
        ) : null,
      )}
    </div>
  )
}
