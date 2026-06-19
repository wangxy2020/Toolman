import { useEffect, useState } from 'react'
import { IpcChannel } from '@toolman/shared'

interface Props {
  blobHash: string
  mimeType: string
  alt?: string
  path?: string
}

async function openImagePath(path: string) {
  const result = await window.api.invoke(IpcChannel.AppShellOpenPath, { path })
  if (!result.ok) return
  const data = result.data as { opened: boolean; error?: string }
  if (!data.opened && data.error) {
    throw new Error(data.error)
  }
}

export function MessageImageBlock({ blobHash, mimeType, alt, path }: Props) {
  const [src, setSrc] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [openError, setOpenError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void window.api.invoke(IpcChannel.BlobGetDataUrl, { hash: blobHash }).then((result) => {
      if (cancelled) return
      if (!result.ok) {
        setError(result.error.message)
        return
      }
      const data = result.data as { dataUrl: string }
      setSrc(data.dataUrl)
    })
    return () => {
      cancelled = true
    }
  }, [blobHash])

  const handleOpen = async () => {
    if (!path) return
    setOpenError(null)
    try {
      await openImagePath(path)
    } catch (err) {
      setOpenError(err instanceof Error ? err.message : '无法打开图片')
    }
  }

  if (error) {
    return <div className="tm-message-image-error">图片加载失败：{error}</div>
  }

  if (!src) {
    return <div className="tm-message-image-loading">加载图片…</div>
  }

  const image = (
    <img
      className="tm-message-image"
      src={src}
      alt={alt ?? '图片'}
      title={path ? `点击打开：${alt ?? path}` : alt ?? mimeType}
    />
  )

  if (!path) {
    return image
  }

  return (
    <div className="tm-message-image-wrap">
      <button
        type="button"
        className="tm-message-image-open-btn"
        onClick={() => void handleOpen()}
        title={`打开 ${alt ?? '图片'}`}
      >
        {image}
      </button>
      {openError ? <div className="tm-message-image-error">{openError}</div> : null}
    </div>
  )
}
