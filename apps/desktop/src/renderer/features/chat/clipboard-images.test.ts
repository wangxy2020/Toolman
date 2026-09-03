import { describe, expect, it } from 'vitest'

import { getClipboardImageFiles, shouldStageClipboardImages } from './clipboard-images'

function mockClipboard(options: { text?: string; images?: File[]; files?: File[] }): DataTransfer {
  const images = options.images ?? []
  return {
    items: images.map((file) => ({ type: file.type, getAsFile: () => file })),
    files: options.files ?? [],
    getData: (format: string) => (format === 'text/plain' ? (options.text ?? '') : ''),
  } as unknown as DataTransfer
}

describe('getClipboardImageFiles', () => {
  it('reads image items from clipboard data', () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'shot.png', { type: 'image/png' })
    expect(getClipboardImageFiles(mockClipboard({ images: [file] }))).toEqual([file])
  })

  it('falls back to clipboard files when items are empty', () => {
    const file = new File([new Uint8Array([4, 5, 6])], 'paste.jpg', { type: 'image/jpeg' })
    const clipboardData = {
      items: [],
      files: [file],
      getData: () => '',
    } as unknown as DataTransfer

    expect(getClipboardImageFiles(clipboardData)).toEqual([file])
  })
})

describe('shouldStageClipboardImages', () => {
  it('stages a screenshot that has no text', () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'shot.png', { type: 'image/png' })
    expect(shouldStageClipboardImages(mockClipboard({ images: [file] }))).toBe(true)
  })

  it('prefers Word/Excel text over the companion bitmap', () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'word.png', { type: 'image/png' })
    expect(
      shouldStageClipboardImages(
        mockClipboard({ text: 'Your outfit is stunning. No notes.', images: [file] }),
      ),
    ).toBe(false)
  })

  it('ignores whitespace-only text next to an image', () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'shot.png', { type: 'image/png' })
    expect(shouldStageClipboardImages(mockClipboard({ text: ' \n', images: [file] }))).toBe(true)
  })

  it('does not stage when the clipboard is text-only', () => {
    expect(shouldStageClipboardImages(mockClipboard({ text: 'hello' }))).toBe(false)
  })
})
